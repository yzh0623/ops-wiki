#!/usr/bin/env python3
'''
把 wiki.sqlite 中的文章批量编码为向量并写入 sqlite-vec。
Bulk-encode articles from wiki.sqlite into vectors and store them in sqlite-vec.

用法（在 conda wiki 环境执行）/ Usage (run inside the conda "wiki" env):
    python scripts/build_vectors.py                 # 增量：只处理新增/修改的文章
    python scripts/build_vectors.py --rebuild       # 清空后全量重建
    python scripts/build_vectors.py --node-id 10    # 只重建某一篇（试跑/验证）
    python scripts/build_vectors.py --prune         # 顺带清理已删除节点的残留向量

说明 / Notes:
    - 密文（node.encrypted_key 非空）用所有者 RSA 私钥解密后再编码
      Encrypted content is decrypted with the owner's RSA key before encoding
    - 跳过正文为空的节点，以及 is_locked=1 的文章（避免锁定内容以向量/片段泄露）
      Empty nodes and locked articles are skipped so locked text cannot leak
    - 日常编辑由保存后的异步任务处理，脚本只用于首建与手工重建
      Daily edits are handled by the async worker; this script is for first builds
    - CPU 推理实测约 0.55 块/秒，作者的数据量（约 800 块）首建约 20-30 分钟
      CPU throughput is ~0.55 chunks/s; ~800 chunks take roughly 20-30 minutes
'''
from __future__ import annotations

import argparse
import os
import sys
import time

# 让脚本能直接 import src 下的包
# Make the src/ package importable when running this script directly
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'src')))

from ops_wiki.core.config import Config  # noqa: E402
from ops_wiki.services import vector_store as vs  # noqa: E402
from ops_wiki.services.chunker import chunk_document  # noqa: E402
from ops_wiki.services.embedding import embed_documents  # noqa: E402
from ops_wiki.services.indexer import (  # noqa: E402
    model_tag,
    node_plaintext,
    source_hash,
    touch_meta,
)


# 查询待处理的节点（连同所有者的私钥）
# Fetch the nodes to process, together with their owner's private key
def fetch_nodes(conn, node_id: int | None) -> list:
    sql = '''
        SELECT n.id AS id, n.title AS title, n.content AS content,
               n.encrypted_key AS encrypted_key, n.type AS type,
               n.is_locked AS is_locked, n.owner_id AS owner_id,
               u.rsa_private_key AS owner_private_key
        FROM node n
        LEFT JOIN user u ON u.id = n.owner_id
    '''
    params: tuple = ()
    if node_id is not None:
        sql += ' WHERE n.id = ?'
        params = (node_id,)
    sql += ' ORDER BY n.id'
    return conn.execute(sql, params).fetchall()


# 清理索引里已不存在于 node 表的残留分块
# Drop chunks whose node no longer exists
def prune(conn) -> int:
    rows = conn.execute(
        'SELECT DISTINCT node_id FROM node_chunk '
        'WHERE node_id NOT IN (SELECT id FROM node)'
    ).fetchall()
    for row in rows:
        vs.delete_node_chunks(conn, row['node_id'])
    if rows:
        conn.commit()
    return len(rows)


def main() -> int:
    parser = argparse.ArgumentParser(description='把文章编码为向量并写入 sqlite-vec')
    parser.add_argument('--rebuild', action='store_true', help='清空全部向量后全量重建')
    parser.add_argument('--force', action='store_true', help='忽略内容指纹，强制重算')
    parser.add_argument('--node-id', type=int, default=None, help='只处理指定节点')
    parser.add_argument('--prune', action='store_true', help='清理已删除节点的残留向量')
    parser.add_argument('--batch-size', type=int, default=Config.EMBED_BATCH_SIZE)
    parser.add_argument('--max-length', type=int, default=Config.EMBED_MAX_TOKENS)
    parser.add_argument('--db', default=Config.DB_PATH, help='数据库文件路径')
    args = parser.parse_args()

    tag = model_tag()
    conn = vs.connect(args.db)
    vs.ensure_schema(conn)

    if args.rebuild:
        print('[重建] 清空已有向量数据 ...', flush=True)
        conn.execute('DELETE FROM vec_node_chunk')
        conn.execute('DELETE FROM node_chunk')
        conn.execute('DELETE FROM vec_index_state')
        conn.commit()

    # --rebuild / --force 时不做增量跳过
    # Skip the incremental shortcuts when rebuilding or forcing
    state = {} if (args.rebuild or args.force) else vs.load_state(conn)
    nodes = fetch_nodes(conn, args.node_id)

    total = len(nodes)
    indexed_nodes = 0
    indexed_chunks = 0
    skipped = 0
    failed = 0
    started = time.time()

    print(f'[开始] 待处理节点 {total} 个，模型 {tag}，设备 {Config.EMBED_DEVICE}', flush=True)

    # ── 阶段一：解密 + 分块，收集待编码文本 ──
    # Phase 1: decrypt and chunk, collecting the texts to encode
    pending: list[tuple[int, str, str, list[dict]]] = []
    for row in nodes:
        node_id = row['id']
        title = row['title'] or ''

        if row['is_locked']:
            skipped += 1
            continue

        try:
            plaintext = node_plaintext(row)
        except Exception as exc:  # 解密失败不中断整批 / one bad node must not abort the run
            failed += 1
            print(f'  node {node_id} 解密失败: {exc}', flush=True)
            continue

        if not plaintext.strip():
            skipped += 1
            continue

        digest = source_hash(title, plaintext)
        if state.get(node_id) == digest:
            skipped += 1
            continue

        chunks = chunk_document(
            title,
            plaintext,
            target_tokens=Config.EMBED_CHUNK_TOKENS,
            overlap_ratio=Config.EMBED_CHUNK_OVERLAP,
            max_tokens=args.max_length,
        )
        if not chunks:
            skipped += 1
            continue

        pending.append((node_id, title, digest, chunks))

    all_texts = [c['text'] for _, _, _, chunks in pending for c in chunks]
    print(
        f'[解析完成] {len(pending)} 篇文章待索引（跳过 {skipped}，失败 {failed}），'
        f'共 {len(all_texts)} 个分块',
        flush=True,
    )

    # ── 阶段二：跨文章大 batch 编码，摊薄逐篇小 batch 的开销 ──
    # Phase 2: encode in large cross-article batches to amortise per-call overhead
    vectors: list[list[float]] = []
    if all_texts:
        enc_started = time.time()
        progress_step = max(args.batch_size * 4, 32)
        next_report = progress_step
        for start in range(0, len(all_texts), args.batch_size):
            batch = all_texts[start:start + args.batch_size]
            vectors.extend(
                embed_documents(batch, batch_size=args.batch_size, max_tokens=args.max_length)
            )
            done = min(start + args.batch_size, len(all_texts))
            if done >= next_report or done == len(all_texts):
                elapsed = time.time() - enc_started
                rate = done / elapsed if elapsed > 0 else 0
                eta = (len(all_texts) - done) / rate if rate > 0 else 0
                print(
                    f'  编码 {done}/{len(all_texts)} ({rate:.2f} chunk/s, '
                    f'预计剩余 {eta / 60:.1f} 分钟)',
                    flush=True,
                )
                next_report = done + progress_step

    # ── 阶段三：写库（按文章幂等覆盖）──
    # Phase 3: persist, overwriting each article's chunks idempotently
    cursor = 0
    for node_id, title, digest, chunks in pending:
        node_vectors = vectors[cursor:cursor + len(chunks)]
        cursor += len(chunks)

        vs.delete_node_chunks(conn, node_id)
        for idx, (chunk, vec) in enumerate(zip(chunks, node_vectors)):
            vs.insert_chunk(
                conn, node_id, idx, title, chunk['text'], chunk['token_count'], vec
            )
        vs.upsert_state(conn, node_id, digest, len(chunks), tag)
        conn.commit()

        indexed_nodes += 1
        indexed_chunks += len(chunks)
        print(f'  写入 node {node_id} 《{title[:20]}》 -> {len(chunks)} 块', flush=True)

    if args.prune:
        removed = prune(conn)
        if removed:
            print(f'[清理] 移除 {removed} 个已删除节点的残留分块', flush=True)

    touch_meta(conn)
    conn.commit()

    info = vs.stats(conn)
    print(
        f'[完成] 处理节点 {indexed_nodes} 个，新增/更新分块 {indexed_chunks}，'
        f'跳过 {skipped}，失败 {failed}，耗时 {time.time() - started:.1f}s',
        flush=True,
    )
    print(f'[索引] 当前库内共 {info["nodes"]} 个节点 / {info["chunks"]} 个分块', flush=True)
    conn.close()
    return 0 if failed == 0 else 1


if __name__ == '__main__':
    raise SystemExit(main())

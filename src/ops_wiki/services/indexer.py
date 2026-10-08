'''
单篇文章的向量索引：解密 -> 分块 -> CPU 编码 -> 写入 sqlite-vec。
Vector indexing for a single article: decrypt, chunk, encode on CPU, store.

被两处复用 / Reused by two callers:
    - scripts/build_vectors.py 批量首建 / 重建 (bulk first build or rebuild)
    - services/index_queue.py  保存后的异步重建 (async rebuild after save)
共用同一套逻辑，保证命令行与运行时行为一致。
Sharing one implementation keeps the CLI and the runtime behaviour identical.
'''
from __future__ import annotations

import hashlib
import os
import time

from ..core.config import Config
from . import vector_store as vs
from .chunker import chunk_document
from .crypto import decrypt_content
from .embedding import embed_documents


# 当前索引使用的模型标识（写入 vec_meta 与 vec_index_state）
# Model tag for the current index (stored in vec_meta and vec_index_state)
def model_tag() -> str:
    return f"{os.path.basename(Config.EMBED_MODEL_PATH.rstrip('/'))}:{Config.EMBED_DTYPE}"


# 取节点明文内容：密文用所有者私钥解密，明文直接返回
# Return the node's plaintext: decrypt with the owner's private key when needed
def node_plaintext(row) -> str:
    content = row['content'] or ''
    if not content:
        return ''
    if row['encrypted_key']:
        private_key = row['owner_private_key']
        if not private_key:
            raise RuntimeError(f'node {row["id"]} 为密文但缺少所有者私钥 / encrypted without owner key')
        return decrypt_content(content, row['encrypted_key'], private_key)
    return content


# 内容指纹：标题 + 明文正文，用于判断是否需要重建
# Content fingerprint (title + plaintext) used to decide whether to rebuild
def source_hash(title: str, plaintext: str) -> str:
    h = hashlib.sha256()
    h.update((title or '').encode('utf-8'))
    h.update(b'\x00')
    h.update((plaintext or '').encode('utf-8'))
    return h.hexdigest()


# 查询单个节点（连同所有者的私钥）
# Fetch one node together with its owner's private key
def fetch_node(conn, node_id: int):
    return conn.execute(
        '''SELECT n.id AS id, n.title AS title, n.content AS content,
                  n.encrypted_key AS encrypted_key, n.type AS type,
                  n.is_locked AS is_locked, n.owner_id AS owner_id,
                  u.rsa_private_key AS owner_private_key
           FROM node n LEFT JOIN user u ON u.id = n.owner_id
           WHERE n.id = ?''',
        (node_id,),
    ).fetchone()


# 记录索引元信息（模型、维度、构建时间）
# Record index metadata: model, dimension, build time
def touch_meta(conn) -> None:
    vs.set_meta(conn, 'model', model_tag())
    vs.set_meta(conn, 'dim', str(vs.VECTOR_DIM))
    vs.set_meta(conn, 'built_at', time.strftime('%Y-%m-%d %H:%M:%S'))


# 索引单篇文章：整篇重新分块并覆盖旧向量
# Index one article: re-chunk it as a whole and overwrite the previous vectors
# 返回 {'status': 'ok'|'skipped'|'failed', 'title', 'chunks', 'reason'}
def index_node(node_id: int, db_path: str | None = None) -> dict:
    conn = vs.connect(db_path)
    try:
        vs.ensure_schema(conn)
        row = fetch_node(conn, node_id)

        # 节点已被删除：清掉残留索引
        # Node is gone: drop any leftover index rows
        if row is None:
            vs.delete_node_chunks(conn, node_id)
            conn.commit()
            return {'status': 'skipped', 'reason': '节点不存在 / node missing', 'chunks': 0}

        title = row['title'] or ''
        if row['is_locked']:
            return {'status': 'skipped', 'title': title, 'chunks': 0, 'reason': '已锁定 / locked'}

        try:
            plaintext = node_plaintext(row)
        except Exception as exc:
            return {'status': 'failed', 'title': title, 'chunks': 0,
                    'reason': f'解密失败 / decrypt failed: {exc}'}

        # 正文被清空：移除旧向量，避免还能搜到空内容
        # Body cleared: drop old vectors so the empty article is not searchable
        if not plaintext.strip():
            vs.delete_node_chunks(conn, node_id)
            conn.commit()
            return {'status': 'skipped', 'title': title, 'chunks': 0, 'reason': '正文为空 / empty'}

        chunks = chunk_document(
            title,
            plaintext,
            target_tokens=Config.EMBED_CHUNK_TOKENS,
            overlap_ratio=Config.EMBED_CHUNK_OVERLAP,
            max_tokens=Config.EMBED_MAX_TOKENS,
        )
        if not chunks:
            return {'status': 'skipped', 'title': title, 'chunks': 0,
                    'reason': '无可索引内容 / nothing to index'}

        vectors = embed_documents(
            [c['text'] for c in chunks],
            batch_size=Config.EMBED_BATCH_SIZE,
            max_tokens=Config.EMBED_MAX_TOKENS,
        )

        # 整篇覆盖：先删旧块再写新块
        # Whole-article overwrite: delete first, then insert
        vs.delete_node_chunks(conn, node_id)
        for idx, (chunk, vec) in enumerate(zip(chunks, vectors)):
            vs.insert_chunk(
                conn, node_id, idx, title, chunk['text'], chunk['token_count'], vec
            )
        vs.upsert_state(conn, node_id, source_hash(title, plaintext), len(chunks), model_tag())
        touch_meta(conn)
        conn.commit()
        return {'status': 'ok', 'title': title, 'chunks': len(chunks)}
    finally:
        conn.close()


# 删除某篇文章的索引（节点被删除时调用）
# Remove one article's index (called when the node is deleted)
def remove_node_index(node_id: int, db_path: str | None = None) -> None:
    conn = vs.connect(db_path)
    try:
        vs.ensure_schema(conn)
        vs.delete_node_chunks(conn, node_id)
        conn.commit()
    finally:
        conn.close()

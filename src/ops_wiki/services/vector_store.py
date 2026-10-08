'''
sqlite-vec 向量存储：扩展加载、建表、KNN 检索。
sqlite-vec storage: extension loading, schema setup and KNN search.

数据库结构（与业务表同库 wiki.sqlite）/ Schema (same database as the business data):
    node_chunk       分块元数据，rowid 与向量表一一对应 (chunk metadata)
    vec_node_chunk   vec0 虚拟表，存 1024 维归一化向量 (vec0 table of 1024-d vectors)
    vec_index_state  每个节点的索引状态，source_hash 用于增量判断 (per-node index state)
    vec_meta         索引元信息：模型、维度、构建时间 (index metadata)
'''
from __future__ import annotations

import sqlite3

from ..core.config import Config

# 向量维度，需与模型 hidden_size 及 vec0 表声明一致
# Vector dimension; must match the model hidden_size and the vec0 declaration
VECTOR_DIM = Config.EMBED_DIM


# 在给定连接上加载 sqlite-vec 扩展
# Load the sqlite-vec extension on an existing connection
def load_extension(conn: sqlite3.Connection) -> None:
    import sqlite_vec
    conn.enable_load_extension(True)
    try:
        sqlite_vec.load(conn)
    finally:
        conn.enable_load_extension(False)


# 打开一个已加载 sqlite-vec 的独立连接（WAL 下可与业务连接并存）
# Open a standalone connection with sqlite-vec loaded (fine alongside WAL writers)
def connect(db_path: str | None = None) -> sqlite3.Connection:
    conn = sqlite3.connect(db_path or Config.DB_PATH)
    conn.row_factory = sqlite3.Row
    load_extension(conn)
    return conn


# 把 float 列表序列化为 sqlite-vec 需要的二进制格式
# Serialise a float list into the binary layout sqlite-vec expects
def serialize(vector: list[float]) -> bytes:
    import sqlite_vec
    return sqlite_vec.serialize_float32(vector)


# 幂等建表（应用启动与批量脚本都会调用）
# Idempotent schema creation, called from app startup and the bulk script
def ensure_schema(conn: sqlite3.Connection) -> None:
    conn.executescript(
        f'''
        CREATE TABLE IF NOT EXISTS node_chunk (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            node_id INTEGER NOT NULL,
            chunk_index INTEGER NOT NULL,
            title TEXT,
            text TEXT NOT NULL,
            token_count INTEGER DEFAULT 0,
            created_at TEXT DEFAULT (datetime('now'))
        );
        CREATE INDEX IF NOT EXISTS ix_node_chunk_node ON node_chunk(node_id);

        CREATE TABLE IF NOT EXISTS vec_index_state (
            node_id INTEGER PRIMARY KEY,
            source_hash TEXT NOT NULL,
            chunk_count INTEGER NOT NULL DEFAULT 0,
            model TEXT,
            updated_at TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS vec_meta (
            key TEXT PRIMARY KEY,
            value TEXT
        );

        CREATE VIRTUAL TABLE IF NOT EXISTS vec_node_chunk
            USING vec0(embedding float[{VECTOR_DIM}]);
        '''
    )
    conn.commit()


# 写入索引元信息
# Write one index metadata entry
def set_meta(conn: sqlite3.Connection, key: str, value: str) -> None:
    conn.execute(
        'INSERT INTO vec_meta(key, value) VALUES(?, ?) '
        'ON CONFLICT(key) DO UPDATE SET value=excluded.value',
        (key, value),
    )


# 删除某个节点的全部分块（含对应向量行）
# Delete all chunks of a node, including their vector rows
def delete_node_chunks(conn: sqlite3.Connection, node_id: int) -> None:
    ids = [
        r['id'] for r in
        conn.execute('SELECT id FROM node_chunk WHERE node_id=?', (node_id,)).fetchall()
    ]
    for chunk_id in ids:
        conn.execute('DELETE FROM vec_node_chunk WHERE rowid=?', (chunk_id,))
    conn.execute('DELETE FROM node_chunk WHERE node_id=?', (node_id,))
    conn.execute('DELETE FROM vec_index_state WHERE node_id=?', (node_id,))


# 插入一条分块及其向量
# Insert one chunk and its vector
def insert_chunk(
    conn: sqlite3.Connection,
    node_id: int,
    chunk_index: int,
    title: str,
    text: str,
    token_count: int,
    vector: list[float],
) -> int:
    cur = conn.execute(
        'INSERT INTO node_chunk(node_id, chunk_index, title, text, token_count) '
        'VALUES(?, ?, ?, ?, ?)',
        (node_id, chunk_index, title, text, token_count),
    )
    chunk_id = cur.lastrowid
    conn.execute(
        'INSERT INTO vec_node_chunk(rowid, embedding) VALUES(?, ?)',
        (chunk_id, serialize(vector)),
    )
    return chunk_id


# 记录 / 更新节点的索引状态
# Insert or update a node's index state
def upsert_state(
    conn: sqlite3.Connection,
    node_id: int,
    source_hash: str,
    chunk_count: int,
    model: str,
) -> None:
    conn.execute(
        '''INSERT INTO vec_index_state(node_id, source_hash, chunk_count, model, updated_at)
           VALUES(?, ?, ?, ?, datetime('now'))
           ON CONFLICT(node_id) DO UPDATE SET
               source_hash=excluded.source_hash,
               chunk_count=excluded.chunk_count,
               model=excluded.model,
               updated_at=excluded.updated_at''',
        (node_id, source_hash, chunk_count, model),
    )


# 已索引节点的状态映射：node_id -> source_hash
# Indexed-node state map: node_id -> source_hash
def load_state(conn: sqlite3.Connection) -> dict[int, str]:
    return {
        r['node_id']: r['source_hash']
        for r in conn.execute('SELECT node_id, source_hash FROM vec_index_state').fetchall()
    }


# 读取索引统计（节点数、分块数）
# Read index stats (node count, chunk count)
def stats(conn: sqlite3.Connection) -> dict:
    chunks = conn.execute('SELECT COUNT(*) AS c FROM node_chunk').fetchone()['c']
    nodes = conn.execute('SELECT COUNT(DISTINCT node_id) AS c FROM node_chunk').fetchone()['c']
    return {'nodes': nodes, 'chunks': chunks}


# 向量近邻检索：按权限过滤、排除锁定文章，每个节点只保留最佳命中
# KNN search: filter by permission, skip locked articles, keep one hit per node
# 返回 [{node_id, chunk_index, text, distance}]
def search(
    conn: sqlite3.Connection,
    query_vector: list[float],
    user_id: int,
    limit: int = 10,
    candidate_limit: int | None = None,
) -> list[dict]:
    # 候选池取大一些：长文档分块多，池子太小会被单个文档占满，去重后只剩一两个节点
    # Use a generous candidate pool: a single long article could otherwise fill it
    candidate_limit = candidate_limit or max(limit * 40, 200)
    rows = conn.execute(
        '''
        SELECT vc.node_id AS node_id,
               vc.chunk_index AS chunk_index,
               vc.text AS text,
               k.distance AS distance
        FROM (
            SELECT rowid, distance
            FROM vec_node_chunk
            WHERE embedding MATCH ?
            ORDER BY distance
            LIMIT ?
        ) k
        JOIN node_chunk vc ON vc.id = k.rowid
        JOIN node n ON n.id = vc.node_id
        WHERE n.is_locked = 0
          AND (
              n.owner_id = ?
              OR EXISTS (
                  SELECT 1 FROM node_permission p
                  WHERE p.node_id = n.id AND p.grantee_id = ? AND p.is_active = 1
              )
          )
        ORDER BY k.distance
        ''',
        (serialize(query_vector), candidate_limit, user_id, user_id),
    ).fetchall()

    # 每个节点只保留距离最小（最相关）的那一块
    # Keep only the nearest (most relevant) chunk per node
    best: dict[int, dict] = {}
    for row in rows:
        node_id = row['node_id']
        if node_id not in best:
            best[node_id] = {
                'node_id': node_id,
                'chunk_index': row['chunk_index'],
                'text': row['text'],
                'distance': row['distance'],
            }
        if len(best) >= limit:
            break
    return list(best.values())

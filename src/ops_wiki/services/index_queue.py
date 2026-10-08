'''
保存后的异步向量重建：后台线程 + 去重队列 + 完成事件。
Async vector rebuild after save: a background thread, a de-duplicating queue and
completion events.

为什么用「线程 + 轮询」而不是 WebSocket / Why threads + polling instead of websockets:
    项目是纯 Flask + fetch 的轻量前端，没有长连接依赖。这里由后台线程写事件、
    前端定时轮询读取，零新增依赖，也不影响请求响应。
    The front end is plain Flask + fetch with no long-lived connections: a worker
    thread records events and the page polls for them. No extra dependency, and
    the request itself is never blocked.

约束 / Constraints:
    - embedding 模型 CPU 常驻（约 2.7GB），必须单进程运行
      The CPU-resident model needs a single-process deployment
    - 同一篇文章在队列里只保留一次，合并短时间内的多次保存
      A node is queued at most once, collapsing rapid repeated saves
    - 事件按用户隔离，前端只能看到自己触发的转换结果
      Events are per-user so a page only sees its own results
'''
from __future__ import annotations

import collections
import itertools
import logging
import queue
import threading
import time

from .indexer import index_node

logger = logging.getLogger(__name__)

# ── 去重任务队列 / de-duplicating job queue ──
_queue: 'queue.Queue[tuple[int, int]]' = queue.Queue()
_pending: set[int] = set()
_lock = threading.Lock()
_worker_started = False

# ── 完成事件，供前端轮询 / completion events polled by the page ──
_events: 'collections.deque[dict]' = collections.deque(maxlen=500)
_seq = itertools.count(1)
_events_lock = threading.Lock()


# 记录一次转换结果，供前端 toast 使用
# Record one conversion result so the page can show a toast
def _push_event(user_id: int, node_id: int, title: str, status: str, chunks: int, reason: str = '') -> None:
    with _events_lock:
        _events.append({
            'seq': next(_seq),
            'user_id': user_id,
            'node_id': node_id,
            'title': title,
            'status': status,
            'chunks': chunks,
            'reason': reason,
            'ts': time.time(),
        })


# 读取某个序号之后、属于该用户的事件
# Read the events newer than `seq` that belong to `user_id`
def events_after(seq: int, user_id: int) -> list[dict]:
    with _events_lock:
        return [e for e in _events if e['seq'] > seq and e['user_id'] == user_id]


# 已产生的最大事件序号；前端用它作为下次轮询的游标
# Highest event sequence produced so far; the client uses it as its next cursor
def latest_seq() -> int:
    with _events_lock:
        return _events[-1]['seq'] if _events else 0


# 后台消费线程：逐个重建文章向量
# Worker loop: rebuild one article at a time
def _worker() -> None:
    while True:
        node_id, user_id = _queue.get()
        with _lock:
            _pending.discard(node_id)
        try:
            result = index_node(node_id)
            status = result.get('status', 'failed')
            title = result.get('title') or f'节点 {node_id} / node {node_id}'
            # skipped（正文为空 / 已锁定）不需要提示用户，只在完成或失败时记录事件
            # "skipped" (empty or locked) needs no user-facing toast
            if status in ('ok', 'failed'):
                _push_event(
                    user_id, node_id, title, status,
                    result.get('chunks', 0), result.get('reason', ''),
                )
            if status == 'failed':
                logger.warning('异步向量重建失败 node=%s: %s', node_id, result.get('reason'))
            else:
                logger.info('异步向量重建 node=%s status=%s chunks=%s',
                            node_id, status, result.get('chunks'))
        except Exception:
            logger.exception('异步向量重建异常 node=%s', node_id)
            _push_event(user_id, node_id, f'节点 {node_id} / node {node_id}', 'failed', 0, '内部异常')
        finally:
            _queue.task_done()


# 确保后台线程已启动（首次提交时拉起，daemon 随进程退出）
# Start the worker on first submit; it is a daemon thread and dies with the process
def _ensure_worker() -> None:
    global _worker_started
    if _worker_started:
        return
    with _lock:
        if _worker_started:
            return
        threading.Thread(target=_worker, name='vector-index-worker', daemon=True).start()
        _worker_started = True
        logger.info('向量索引后台线程已启动 / vector index worker started')


# 提交一次重建任务（非阻塞）；排队期间同一篇文章只保留一次
# Submit a rebuild job (non-blocking); the same node is queued at most once
def submit(node_id: int, user_id: int) -> None:
    if not node_id:
        return
    _ensure_worker()
    with _lock:
        if node_id in _pending:
            return
        _pending.add(node_id)
    _queue.put((node_id, user_id))


# 后台预加载 embedding 模型，使其常驻内存（不阻塞应用启动）
# Preload the embedding model in the background (does not block app startup)
def warmup() -> None:
    def _load_model() -> None:
        try:
            from .embedding import _load, device_label
            _load()
            logger.info('embedding 模型已常驻内存 device=%s', device_label())
        except Exception:
            logger.exception('embedding 模型预加载失败，将在首次使用时重试 / preload failed')

    threading.Thread(target=_load_model, name='embedding-warmup', daemon=True).start()

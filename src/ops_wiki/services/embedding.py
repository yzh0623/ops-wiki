'''
本地语义向量服务：Qwen3-Embedding-0.6B（CPU 推理）。
Local embedding service: Qwen3-Embedding-0.6B running on CPU.

设计要点 / Design notes:
    - 模型懒加载 + 进程内单例，避免重复载入（常驻约 2.7GB 内存）
      Lazy-loaded process-wide singleton so the weights are only read once
    - 默认且仅默认使用 CPU，不自动占用 GPU（可用 OPS_WIKI_EMBED_DEVICE 覆盖）
      CPU only by default; the GPU is never used implicitly
    - Qwen3-Embedding 取「最后一个 token」的隐状态做池化，再做 L2 归一化
      Pool the last token's hidden state, then L2-normalise
    - 文档侧不加 instruction，查询侧加官方检索 instruction 前缀
      Documents are embedded raw; queries get the official retrieval instruction
'''
from __future__ import annotations

import threading

from ..core.config import Config

# 模型与分词器单例（懒加载）
# Model and tokenizer singletons, created on first use
_tokenizer = None
_model = None
_load_lock = threading.Lock()
_infer_lock = threading.Lock()

# Qwen3-Embedding 官方检索 instruction：只加在 query 上，文档不加
# Official retrieval instruction: prepended to queries only, never to documents
QUERY_INSTRUCTION = 'Given a web search query, retrieve relevant passages that answer the query'


# 当前设备标签（日志用）
# Current device label, for logging
def device_label() -> str:
    return Config.EMBED_DEVICE


# 权重精度：fp32（默认）、bf16 或 fp16（GPU 上常用）
# Weight precision: fp32 by default, bf16, or fp16 (common on GPU)
def _torch_dtype():
    import torch
    return {
        'bf16': torch.bfloat16,
        'bfloat16': torch.bfloat16,
        'fp16': torch.float16,
        'float16': torch.float16,
        'half': torch.float16,
    }.get(Config.EMBED_DTYPE.lower(), torch.float32)


# 依赖与模型文件是否就绪（不触发加载），供路由做优雅降级
# Check deps and model files without loading, so routes can degrade gracefully
def embedding_available() -> bool:
    import os
    try:
        import torch  # noqa: F401
        import transformers  # noqa: F401
        return os.path.isdir(Config.EMBED_MODEL_PATH)
    except Exception:
        return False


# 懒加载分词器与模型（进程内只加载一次，多线程安全）
# Lazy-load the tokenizer and model once per process (thread-safe)
def _load():
    global _tokenizer, _model
    if _model is not None:
        return
    with _load_lock:
        if _model is not None:
            return
        import os

        import torch
        from transformers import AutoTokenizer, AutoModel

        path = Config.EMBED_MODEL_PATH
        if not os.path.isdir(path):
            raise FileNotFoundError(f'embedding 模型目录不存在 / model dir missing: {path}')

        # CPU 推理线程数：实测 4 线程吞吐最佳，线程过多会互相争抢
        # 4 threads measured fastest on CPU; more threads contend and slow down
        torch.set_num_threads(max(1, min(Config.EMBED_THREADS, os.cpu_count() or 1)))

        # 左填充：这样每个序列的最后一个位置就是最后一个有效 token
        # Left padding so the final position always holds the last real token
        tokenizer = AutoTokenizer.from_pretrained(path, padding_side='left')
        model = AutoModel.from_pretrained(
            path, torch_dtype=_torch_dtype(), low_cpu_mem_usage=True
        )
        model = model.to(Config.EMBED_DEVICE).eval()

        _tokenizer, _model = tokenizer, model


# 暴露分词器，供分块器统计 token 长度
# Expose the tokenizer so the chunker can measure token length
def get_tokenizer():
    _load()
    return _tokenizer


# 统计文本 token 数
# Count tokens in a piece of text
def count_tokens(text: str) -> int:
    if not text:
        return 0
    return len(get_tokenizer().encode(text, add_special_tokens=False))


# 批量编码：last-token pooling + L2 归一化
# Batch encode: last-token pooling followed by L2 normalisation
def _encode(texts: list[str], batch_size: int, max_tokens: int) -> list[list[float]]:
    import torch

    if not texts:
        return []
    _load()
    device = Config.EMBED_DEVICE
    vectors: list[list[float]] = []

    # 推理串行化，避免多个请求同时抢 CPU
    # Serialise inference so concurrent requests do not fight over the CPU
    with _infer_lock:
        for start in range(0, len(texts), batch_size):
            batch = texts[start:start + batch_size]
            enc = _tokenizer(
                batch,
                padding=True,
                truncation=True,
                max_length=max_tokens,
                return_tensors='pt',
            )
            enc = {k: v.to(device) for k, v in enc.items()}
            with torch.no_grad():
                output = _model(**enc)
            # 取序列最后一个位置（左填充下即最后一个有效 token）
            # 注意：不能用 attention_mask.sum()-1，左填充时那指向的是 padding
            # Take the final position (the last real token under left padding).
            # Do NOT use attention_mask.sum()-1: with left padding that points at a pad.
            pooled = output.last_hidden_state[:, -1, :]
            pooled = torch.nn.functional.normalize(pooled.float(), p=2, dim=1)
            vectors.extend(pooled.cpu().tolist())

    return vectors


# 编码文档（不加 instruction）
# Embed documents (no instruction prefix)
def embed_documents(
    texts: list[str],
    batch_size: int | None = None,
    max_tokens: int | None = None,
) -> list[list[float]]:
    return _encode(
        texts,
        batch_size or Config.EMBED_BATCH_SIZE,
        max_tokens or Config.EMBED_MAX_TOKENS,
    )


# 编码查询（加官方检索 instruction 前缀）
# Embed a query (with the official retrieval instruction prefix)
def embed_query(query: str) -> list[float]:
    text = f'Instruct: {QUERY_INSTRUCTION}\nQuery: {query}'
    return _encode([text], Config.EMBED_BATCH_SIZE, Config.EMBED_MAX_TOKENS)[0]

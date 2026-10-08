'''
文档分块：把 Markdown 正文按「标题 + 段落」切成带重叠的 token 块。
Document chunking: split Markdown into overlapping token blocks.

策略 / Strategy:
    - 每个块都以文章标题开头，让标题作为上下文一起编码，提升召回
      Every chunk starts with the article title so it is encoded as context
    - 以空行分隔的段落为最小单位，贪心累积到目标 token 数
      Paragraphs (blank-line separated) are the unit; accumulate up to the target
    - 相邻块保留一定比例的重叠，避免边界信息丢失
      Neighbouring chunks overlap so boundary context is not lost
    - 超长段落按 token 硬切
      Oversized paragraphs are hard-split by token count
'''
from __future__ import annotations

import re

from .embedding import count_tokens, get_tokenizer

# Markdown 图片：保留 alt 文本，丢弃图片地址
# Markdown images: keep the alt text, drop the URL
_IMG_RE = re.compile(r'!\[([^\]]*)\]\([^)]*\)')
# Markdown 链接：[文本](地址) -> 文本
# Markdown links: [text](url) -> text
_LINK_RE = re.compile(r'\[([^\]]*)\]\([^)]*\)')


# 去掉对语义检索无意义的 Markdown 标记
# Strip Markdown markup that carries no meaning for retrieval
def _clean(markdown: str) -> str:
    text = _IMG_RE.sub(r'\1', markdown or '')
    text = _LINK_RE.sub(r'\1', text)
    return text.strip()


# 按空行切分为段落级块
# Split into paragraph-level blocks on blank lines
def _blocks(markdown: str) -> list[str]:
    return [b.strip() for b in re.split(r'\n\s*\n', markdown) if b.strip()]


# 超长块按 token 上限硬切
# Hard-split an oversized block by token limit
def _slice_block(block: str, limit: int) -> list[str]:
    tokenizer = get_tokenizer()
    ids = tokenizer.encode(block, add_special_tokens=False)
    if len(ids) <= limit:
        return [block]
    return [tokenizer.decode(ids[i:i + limit]) for i in range(0, len(ids), limit)]


# 把文章切成若干块，返回 [{'text': 带标题前缀的块文本, 'token_count': token 数}]
# Split an article into chunks: [{'text': title-prefixed text, 'token_count': n}]
def chunk_document(
    title: str,
    content: str,
    target_tokens: int = 450,
    overlap_ratio: float = 0.15,
    max_tokens: int = 512,
) -> list[dict]:
    title = (title or '').strip()
    prefix = f'# {title}\n\n' if title else ''
    prefix_tokens = count_tokens(prefix) if prefix else 0

    body = _clean(content)
    # 只有标题（无正文）时也生成一个标题向量
    # A title-only article still yields one title vector
    if not body:
        return [{'text': prefix.strip(), 'token_count': prefix_tokens}] if title else []

    # 预留标题占用的 token，剩余额度给正文
    # Reserve the title's tokens and spend the rest on the body
    budget = max(target_tokens - prefix_tokens, 64)
    slice_limit = min(max_tokens, budget)
    overlap_budget = max(int(budget * overlap_ratio), 0)

    # 展开为不超过 budget 的段落序列
    # Flatten into a sequence of pieces that fit the budget
    segments: list[tuple[str, int]] = []
    for block in _blocks(body):
        for piece in _slice_block(block, slice_limit):
            segments.append((piece, count_tokens(piece)))

    chunks: list[list[tuple[str, int]]] = []
    current: list[tuple[str, int]] = []
    current_tokens = 0

    for piece, tokens in segments:
        if current and current_tokens + tokens > budget:
            chunks.append(current)
            # 从尾部保留少量段落作为重叠上下文
            # Carry the trailing pieces over as overlap context
            keep: list[tuple[str, int]] = []
            keep_tokens = 0
            for seg in reversed(current):
                if keep_tokens + seg[1] > overlap_budget:
                    break
                keep.insert(0, seg)
                keep_tokens += seg[1]
            current, current_tokens = keep, keep_tokens
        current.append((piece, tokens))
        current_tokens += tokens

    if current:
        chunks.append(current)

    result = []
    for group in chunks:
        text = prefix + '\n\n'.join(seg for seg, _ in group)
        result.append({
            'text': text.strip(),
            'token_count': prefix_tokens + sum(t for _, t in group),
        })
    return result

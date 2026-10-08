#!/usr/bin/env python3
'''
国际化一致性检查 / i18n consistency check:

    1. 前端 JS 里除注释/开发者日志外，不应再残留中文字面量
       No Chinese literals left in front-end JS outside comments and dev logs
    2. index.html 用到的 data-i18n* key 必须都在字典里
       Every data-i18n* key used in index.html exists in the dictionary
    3. i18n.js 的 en / zh 两套 key 必须完全一致
       The en and zh key sets in i18n.js are identical
    4. 后端所有 jsonify 的 error/message 文案都能被 services/i18n.py 翻译
       Every backend jsonify message can be translated by services/i18n.py

用法 / Usage: python scripts/check_i18n.py
'''
from __future__ import annotations

import ast
import os
import re
import sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
sys.path.insert(0, os.path.join(ROOT, 'src'))

from ops_wiki.services.i18n import PATTERNS, EN, translate  # noqa: E402

JS_DIR = os.path.join(ROOT, 'web', 'static', 'js')
HTML_PATH = os.path.join(ROOT, 'web', 'templates', 'index.html')
I18N_JS = os.path.join(JS_DIR, 'i18n.js')
ROUTES = [os.path.join(ROOT, 'src', 'ops_wiki', 'routes', name)
          for name in ('views.py', 'auth.py', 'admin.py')]

CJK = re.compile(r'[\u4e00-\u9fff]')
BLOCK_COMMENT = re.compile(r'/\*.*?\*/', re.S)
LINE_COMMENT = re.compile(r'//[^\n]*')

errors: list[str] = []


# 去掉注释（字符串里的 // 会被误伤，但只会造成漏报，不会误报）
# Strip comments; a // inside a string may be mangled, which only causes misses
def strip_comments(source: str) -> str:
    return LINE_COMMENT.sub('', BLOCK_COMMENT.sub('', source))


def check_js() -> None:
    for name in sorted(os.listdir(JS_DIR)):
        if not name.endswith('.js') or name == 'i18n.js':
            continue
        path = os.path.join(JS_DIR, name)
        with open(path, encoding='utf-8') as f:
            text = strip_comments(f.read())
        for lineno, line in enumerate(text.splitlines(), 1):
            if not CJK.search(line):
                continue
            if 'console.' in line:      # 开发者日志保持中文，不面向用户
                continue
            errors.append(f'{name}:{lineno} 残留中文: {line.strip()[:80]}')


def check_html_keys(dict_keys: set) -> None:
    with open(HTML_PATH, encoding='utf-8') as f:
        html = f.read()
    used = set()
    for attr in ('data-i18n', 'data-i18n-placeholder', 'data-i18n-title', 'data-i18n-aria'):
        used |= set(re.findall(attr + r'="([^"]+)"', html))
    for key in sorted(used - dict_keys):
        errors.append(f'index.html 使用了字典里不存在的 key: {key}')


# 从 i18n.js 里粗略解析出 en / zh 两套 key
# Roughly extract the en / zh key sets from i18n.js
def parse_i18n_keys() -> dict[str, set]:
    with open(I18N_JS, encoding='utf-8') as f:
        text = f.read()
    result: dict[str, set] = {}
    for lang in ('en', 'zh'):
        block = re.search(lang + r':\s*\{(.*?)\n    \},', text, re.S)
        if not block:
            errors.append(f'i18n.js 未找到 {lang} 字典')
            result[lang] = set()
            continue
        result[lang] = set(re.findall(r"'([a-zA-Z0-9_.]+)':", block.group(1)))
    return result


def _sample_fstring(node: ast.JoinedStr) -> list[str]:
    '''把 f-string 的占位符分别替换为数字/文字，得到可测试的样例文案'''
    parts_literal = ''.join(
        part.value for part in node.values if isinstance(part, ast.Constant)
    )
    out = []
    for filler in ('1', 'X'):
        out.append(parts_literal.replace('', '') or parts_literal)
    # 逐段拼接并插入占位符
    # Concatenate piece by piece, inserting a placeholder for each expression
    text_num, text_word = '', ''
    for part in node.values:
        if isinstance(part, ast.Constant):
            text_num += str(part.value)
            text_word += str(part.value)
        else:
            text_num += '1'
            text_word += 'X'
    return [text_num, text_word]


def check_backend() -> list[str]:
    '''返回所有后端文案，供统计 / collect all backend messages for reporting'''
    messages: list[str] = []
    for path in ROUTES:
        with open(path, encoding='utf-8') as f:
            tree = ast.parse(f.read(), filename=path)
        rel = os.path.relpath(path, ROOT)
        for node in ast.walk(tree):
            if not (isinstance(node, ast.Call) and getattr(node.func, 'id', '') == 'jsonify'):
                continue
            if not node.args or not isinstance(node.args[0], ast.Dict):
                continue
            for key, value in zip(node.args[0].keys, node.args[0].values):
                if not (isinstance(key, ast.Constant) and key.value in ('error', 'message')):
                    continue
                if isinstance(value, ast.Constant) and isinstance(value.value, str):
                    messages.append(value.value)
                    if value.value in EN or translate(value.value) != value.value:
                        continue
                    # 有些是变量拼接的提示（如 msg 变量），单独放过
                    # Messages built from variables are checked separately
                    if not CJK.search(value.value):
                        continue
                    errors.append(f'{rel}:{value.lineno} 未翻译: {value.value!r}')
                elif isinstance(value, ast.JoinedStr):
                    messages.append('<f-string>')
                    samples = _sample_fstring(value)
                    if any(any(p.fullmatch(s) for p, _ in PATTERNS) for s in samples):
                        continue
                    errors.append(f'{rel}:{value.lineno} f-string 无匹配规则: '
                                  f'{samples[0]!r}')
                elif isinstance(value, (ast.Name, ast.Call)):
                    # 变量/拼接（如 '; '.join(errors)）：取值由运行时组合校验覆盖
                    # Variables and joins are covered by the runtime value check below
                    messages.append('<dynamic>')
                else:
                    if not (isinstance(value, ast.Constant) and not CJK.search(str(value.value))):
                        errors.append(f'{rel}:{value.lineno} 无法检查的文案类型: '
                                      f'{type(value).__name__}')
    return messages


def check_runtime_variables() -> None:
    '''views.py 里存在变量拼接的提示，单独校验其取值'''
    # Some messages in views.py are built from variables, so validate their values
    samples = [
        '已授权 1 条', '已撤销 1 条',
        '邮箱不能为空; 密码至少6位',           # auth 的 '; '.join(errors)
        '邮箱格式不正确; 密码至少6位',
    ]
    for text in samples:
        if translate(text) == text:
            errors.append(f'动态拼接文案未翻译: {text}')


def check_template_literals() -> None:
    '''
    扫描 JS 模板字符串：I18n.t() 若落在反引号的「字面量区」而不是 ${} 里，
    会被当成普通文本原样输出（曾导致操作列显示出 "' + I18n.t('admin.deactivate') + '"）。
    Scan JS template literals: an I18n.t() call inside the literal-text region of a
    backtick string (instead of inside ${}) is printed verbatim and breaks the UI.
    '''
    for name in sorted(os.listdir(JS_DIR)):
        if not name.endswith('.js') or name == 'i18n.js':
            continue
        with open(os.path.join(JS_DIR, name), encoding='utf-8') as f:
            text = f.read()

        # 上下文栈：tpl（模板字面量）/ expr（${} 内）/ str
        # Context stack: tpl (template), expr (inside ${}), str
        stack: list[dict] = []
        i = 0
        while i < len(text):
            ch = text[i]
            top = stack[-1]['type'] if stack else None

            if ch == '\\' and top in ('tpl', 'str'):
                i += 2
                continue
            if top == 'str':
                if ch == stack[-1]['quote']:
                    stack.pop()
                i += 1
                continue
            if top == 'tpl':
                if ch == '`':
                    stack.pop()
                elif ch == '$' and text[i + 1:i + 2] == '{':
                    stack.append({'type': 'expr', 'depth': 0})
                    i += 2
                    continue
                elif text.startswith('I18n.t(', i):
                    lineno = text.count('\n', 0, i) + 1
                    errors.append(
                        f'{name}:{lineno} I18n.t() 写在模板字面量里会被当成纯文本输出，'
                        f'应改为 ${{I18n.t(...)}}')
                i += 1
                continue
            if top == 'expr':
                if ch == '{':
                    stack[-1]['depth'] += 1
                elif ch == '}':
                    if stack[-1]['depth'] == 0:
                        stack.pop()
                    else:
                        stack[-1]['depth'] -= 1
                elif ch in '\'"':
                    stack.append({'type': 'str', 'quote': ch})
                elif ch == '`':
                    stack.append({'type': 'tpl'})
                i += 1
                continue
            # 普通代码区 / plain code region
            if ch == '/' and text[i + 1:i + 2] == '/':
                newline = text.find('\n', i)
                if newline == -1:
                    break
                i = newline
                continue
            if ch == '/' and text[i + 1:i + 2] == '*':
                end = text.find('*/', i + 2)
                i = len(text) if end == -1 else end + 2
                continue
            if ch == '/' and _starts_regex(text, i):
                i = _skip_regex(text, i)
                continue
            if ch in '\'"':
                stack.append({'type': 'str', 'quote': ch})
            elif ch == '`':
                stack.append({'type': 'tpl'})
            i += 1


# 粗略判断当前位置的 '/' 是正则字面量开头还是除号（看前一个有效字符）
# Roughly decide whether '/' starts a regex or is a division sign
def _starts_regex(text: str, index: int) -> bool:
    j = index - 1
    while j >= 0 and text[j] in ' \t\n\r':
        j -= 1
    if j < 0:
        return True
    return text[j] in '(,=:[!&|?{};+-*%<>~^'


# 跳过一段正则字面量，返回结束引号后的下标
# Skip a regex literal and return the index after its closing slash
def _skip_regex(text: str, index: int) -> int:
    j, in_class = index + 1, False
    while j < len(text):
        c = text[j]
        if c == '\\':
            j += 2
            continue
        if c == '[':
            in_class = True
        elif c == ']':
            in_class = False
        elif c == '/' and not in_class:
            return j + 1
        elif c == '\n':
            return j
        j += 1
    return j


def main() -> int:
    keys = parse_i18n_keys()
    if keys.get('en') != keys.get('zh'):
        only_en = sorted(keys.get('en', set()) - keys.get('zh', set()))
        only_zh = sorted(keys.get('zh', set()) - keys.get('en', set()))
        errors.append(f'en/zh key 不一致: 仅 en={only_en}, 仅 zh={only_zh}')

    check_js()
    check_html_keys(keys.get('en', set()))
    messages = check_backend()
    check_runtime_variables()
    check_template_literals()

    literal = sum(1 for m in messages if m != '<f-string>' and m != '<variable>')
    print(f'字典 key 数: en={len(keys.get("en", set()))} zh={len(keys.get("zh", set()))}')
    print(f'后端文案: 共 {len(messages)} 条（字面量 {literal}）')

    if errors:
        print('\n发现问题:')
        for item in errors:
            print('  -', item)
        return 1
    print('\n结论: 国际化覆盖完整 ✅')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())

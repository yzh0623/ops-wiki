'''
后端国际化：按请求语言返回报错 / 成功提示（默认英文）。
Backend i18n: return error/success messages in the request language (English by default).

实现方式 / How it works:
    - 以中文原文为 msgid 建立到英文的映射表（gettext 风格的懒翻译），
      这样 views/auth/admin 里的 handler 不用改动，只在出口集中翻译。
      Chinese source strings act as msgids, so route handlers need no changes.
    - 带参数的提示（如「不支持的文件格式: .zip」）用正则规则匹配。
      Messages with parameters are matched by regex rules.
    - 通过自定义 JSON Provider 在 jsonify 序列化时翻译 error / message 字段，
      避免直接改写 Response body 带来的 Content-Length 问题。
      A custom JSON provider translates on serialisation, which avoids the
      Content-Length pitfalls of rewriting the response body.
    - 语言来自前端写入的 cookie（ops-wiki-lang），默认 en。
      Language comes from the cookie set by the front end; defaults to English.

注意：新增中文提示后，请同步在 EN / PATTERNS 中补充，否则英文界面下会残留中文；
scripts/check_i18n.py 会做这个一致性检查。
NOTE: add new Chinese messages to EN / PATTERNS as well, otherwise they stay
Chinese in the English UI. scripts/check_i18n.py verifies this.
'''
from __future__ import annotations

import re

from flask import request
from flask.json.provider import DefaultJSONProvider

COOKIE_NAME = 'ops-wiki-lang'
DEFAULT_LANG = 'en'


# 当前请求语言（无请求上下文或缺省时用默认语言）
# Current request language, defaulting when there is no request context
def lang() -> str:
    try:
        value = request.cookies.get(COOKIE_NAME)
    except RuntimeError:
        value = None
    return 'zh' if value == 'zh' else DEFAULT_LANG


# 中文原文 -> 英文（精确匹配）
# Chinese source string -> English (exact match)
EN = {
    # 通用校验 / General validation
    '标题不能为空': 'Title is required',
    '父节点不存在': 'Parent node not found',
    '同级已存在相同标题': 'A node with the same title already exists at this level',
    '类型无效，必须为 document 或 article': 'Invalid type; must be document or article',
    '根节点必须为文档类型': 'Root nodes must be of type document',
    '启用锁定必须设置密码': 'A password is required to enable the lock',
    '只有文章支持密码锁定': 'Only articles support password locking',
    '此文章未锁定': 'This article is not locked',
    '密码错误': 'Incorrect password',
    # 权限 / Permissions
    '无权访问此节点': 'You are not allowed to access this node',
    '无权操作此节点': 'You are not allowed to modify this node',
    '无权删除此节点': 'You are not allowed to delete this node',
    '只有所有者才能编辑此节点': 'Only the owner can edit this node',
    '只有所有者才能分享此节点': 'Only the owner can share this node',
    '只有所有者才能取消分享': 'Only the owner can cancel sharing',
    '只有所有者才能转让': 'Only the owner can transfer ownership',
    '只读': 'Read-only',
    # 移动 / Moving nodes
    '不能移动到自身': 'Cannot move a node into itself',
    '不能移动到子节点下': 'Cannot move a node under its own descendant',
    # 分享 / 权限管理 / Sharing and permission management
    '用户不存在或未激活': 'User not found or inactive',
    '该用户已有访问权限': 'This user already has access',
    '该用户没有访问权限': 'This user has no access',
    '该用户暂未生成加密密钥': "This user hasn't generated an encryption key yet",
    '部分用户不存在': 'Some users do not exist',
    '节点和用户不能为空': 'Nodes and users are required',
    '已取消分享': 'Sharing cancelled',
    # 转让 / Ownership transfer
    '目标用户不存在或未激活': 'Target user not found or inactive',
    '解密内容失败，无法转让': 'Failed to decrypt content; cannot transfer',
    # 导入 / Import
    '没有可导入的数据': 'No data to import',
    '目标节点不存在': 'Target node not found',
    '只能导入到自己的节点下': 'You can only import into your own nodes',
    '请选择文件': 'Please choose a file',
    '仅支持 .docx 格式': 'Only .docx format is supported',
    '仅支持 .xlsx/.xls 格式': 'Only .xlsx/.xls format is supported',
    '服务器未安装 python-docx': 'python-docx is not installed on the server',
    '服务器未安装 openpyxl': 'openpyxl is not installed on the server',
    '无法解析该 Word 文档': 'Unable to parse the Word document',
    '无法解析该 Excel 文件': 'Unable to parse the Excel file',
    '导入文档': 'Imported document',
    # 图片 / Images
    '请选择图片文件': 'Please choose an image file',
    '读取图片失败': 'Failed to read the image',
    '保存图片失败': 'Failed to save the image',
    # 认证 / Authentication
    '邮箱不能为空': 'Email is required',
    '邮箱格式不正确': 'Invalid email format',
    '密码至少6位': 'Password must be at least 6 characters',
    '该邮箱已被注册': 'This email is already registered',
    '邮箱或密码错误': 'Incorrect email or password',
    '账户待审批，请联系管理员': 'Your account is pending approval; please contact an administrator',
    '注册成功': 'Registered successfully',
    '已登出': 'Logged out',
    '未登录': 'Not logged in',
    '不能停用自己的账户': 'You cannot deactivate your own account',
    '用户已激活': 'User activated',
    '用户已停用': 'User deactivated',
    # 语义检索 / Semantic search
    '语义检索不可用：缺少 embedding 依赖或模型文件': 'Semantic search unavailable: missing embedding dependencies or model files',
    '语义检索初始化失败，请查看服务日志': 'Semantic search failed to initialize; check the service logs',
    '语义检索查询失败': 'Semantic search query failed',
}


# 带参数的中文提示 -> 英文模板（顺序敏感：更具体的放前面）
# Parameterised messages: regex to English template (specific rules first)
PATTERNS = [
    (re.compile(r'不支持的文件格式: (.+)，请使用 Markdown 导入'),
     lambda m: f'Unsupported file format: {m.group(1)}; please use Markdown import'),
    (re.compile(r'不支持的文件格式: (.+)'),
     lambda m: f'Unsupported file format: {m.group(1)}'),
    (re.compile(r'不支持的图片格式: (.+)'),
     lambda m: f'Unsupported image format: {m.group(1)}'),
    (re.compile(r'节点已删除，(\d+) 个子节点已上移'),
     lambda m: f'Node deleted; {m.group(1)} child node(s) moved up'),
    (re.compile(r'已将「(.+?)」分享给 (.+?)！'),
     lambda m: f'Shared “{m.group(1)}” with {m.group(2)}!'),
    (re.compile(r'成功导入 (\d+) 个节点'),
     lambda m: f'Successfully imported {m.group(1)} node(s)'),
    (re.compile(r'已授权 (\d+) 条'),
     lambda m: f'{m.group(1)} granted'),
    (re.compile(r'已撤销 (\d+) 条'),
     lambda m: f'{m.group(1)} revoked'),
    (re.compile(r'已转让 (\d+) 个节点给 (.+)'),
     lambda m: f'Transferred {m.group(1)} node(s) to {m.group(2)}'),
    (re.compile(r'无权操作节点 (\d+)'),
     lambda m: f'Not allowed to modify node {m.group(1)}'),
]


# 需要按语言生成的消息（邮件等，因为不是 JSON 响应，走 t()）
# Per-language templates for non-JSON messages such as emails
MESSAGES = {
    'email.share.subject': {
        'en': '{nickname} shared the document “{title}” with you',
        'zh': '{nickname} 分享了文档《{title}》给你',
    },
    'email.share.body': {
        'en': '{nickname} shared the document “{title}” with you. Please log in to view it.',
        'zh': '用户 {nickname} 将文档《{title}》分享给了你，请登录查看。',
    },
}


# 把一段中文提示翻成当前语言（已经是对应语言则原样返回）
# Translate a message into the current language; returns it unchanged if already English
def translate(text: str) -> str:
    if not text:
        return text

    direct = EN.get(text)
    if direct is not None:
        return direct

    # 注册校验错误是 '; ' 拼接的多条，逐段翻译
    # Registration validation errors are joined with '; ', so translate each part
    if '; ' in text:
        return '; '.join(translate(part) for part in text.split('; '))

    for pattern, render in PATTERNS:
        match = pattern.fullmatch(text)
        if match:
            return render(match)

    return text


# 按 key + 参数取当前语言的文案（邮件等非 JSON 场景）
# Look up a message by key with parameters (emails and other non-JSON cases)
def t(key: str, **params) -> str:
    entry = MESSAGES.get(key)
    if not entry:
        return key
    text = entry.get(lang()) or entry.get(DEFAULT_LANG, key)
    for name, value in params.items():
        text = text.replace('{' + name + '}', str(value))
    return text


# 递归翻译 dict / list 里的 error / message 字段
# Recursively translate error/message fields inside dicts and lists
def _translate_fields(obj):
    if isinstance(obj, dict):
        result = {}
        for key, value in obj.items():
            if key in ('error', 'message') and isinstance(value, str):
                result[key] = translate(value)
            else:
                result[key] = _translate_fields(value)
        return result
    if isinstance(obj, list):
        return [_translate_fields(item) for item in obj]
    return obj


# 自定义 JSON 序列化：英文请求下自动翻译提示文案
# Custom JSON serialisation: translate messages when the request is English
class I18nJSONProvider(DefaultJSONProvider):
    def dumps(self, obj, **kwargs):
        if lang() == DEFAULT_LANG:
            obj = _translate_fields(obj)
        kwargs.setdefault('ensure_ascii', False)
        return super().dumps(obj, **kwargs)

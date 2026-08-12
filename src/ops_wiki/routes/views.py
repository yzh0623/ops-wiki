'''
主要 API 视图：文档节点 CRUD、树、搜索、文件导入、分享、转让、批量授权。
'''
from __future__ import annotations

import logging
import os

from flask import Blueprint, request, jsonify, render_template, current_app
from flask_login import login_required, current_user
from werkzeug.security import generate_password_hash, check_password_hash

from ..core.extensions import db
from ..models import Node, User, NodePermission as NodePerm
from ..services.crypto import encrypt_content, decrypt_content
from ..services.email_utils import send_notification

import random
import string
import time

logger = logging.getLogger(__name__)

views_bp = Blueprint('views', __name__)


# 图片统一存储目录（来自配置，指向个人数据资产的 imgs 目录）
def get_images_dir() -> str:
    images_dir = current_app.config.get('IMAGES_DIR')
    if not images_dir:
        images_dir = os.path.join(os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..')), 'images')
    os.makedirs(images_dir, exist_ok=True)
    return images_dir


# 生成统一命名的图片文件名：img_<毫秒时间戳>_<4位随机>.ext
def _gen_image_filename(ext: str) -> str:
    rand = ''.join(random.choices(string.ascii_lowercase + string.digits, k=4))
    ts = int(time.time() * 1000)
    ext = (ext or '').lower()
    if not ext.startswith('.'):
        ext = '.' + ext
    return f'img_{ts}_{rand}{ext}'


# 把图片字节保存到统一图片目录并返回 (存储文件名, 访问URL)
def _save_image_bytes(img_bytes: bytes, ext: str) -> tuple[str, str]:
    images_dir = get_images_dir()
    fname = _gen_image_filename(ext)
    with open(os.path.join(images_dir, fname), 'wb') as f:
        f.write(img_bytes)
    return fname, f'images/{fname}'


@views_bp.record_once
# 注册 SPA 根路由
def _register_root_route(state):
    @state.app.route('/')
    def spa_index():
        return render_template('index.html')


# 把 Node 对象转成字典格式
def _node_dict(node: Node) -> dict:
    return {
        'id': node.id,
        'parent_id': node.parent_id,
        'title': node.title,
        'type': node.type,
        'owner_id': node.owner_id,
        'sort_order': node.sort_order,
        'is_locked': bool(node.is_locked),
        'created_at': node.created_at.isoformat() if node.created_at else None,
        'updated_at': node.updated_at.isoformat() if node.updated_at else None,
    }


# 递归构建树形结构
def _build_tree(nodes: list[Node], parent_id: int | None = None) -> list[dict]:
    result = []
    for node in nodes:
        if node.parent_id == parent_id:
            children = _build_tree(nodes, node.id)
            entry = _node_dict(node)
            entry['children'] = children
            result.append(entry)
    return result


# 递归收集所有后代节点 ID
def _get_subtree_ids(parent_id: int) -> list[int]:
    ids: list[int] = []
    children = Node.query.filter_by(parent_id=parent_id).all()
    for child in children:
        ids.append(child.id)
        ids.extend(_get_subtree_ids(child.id))
    return ids


@views_bp.route('/nodes', methods=['POST'])
@login_required
# 创建新节点（文档或文章）
def create_node():
    data = request.get_json(force=True)
    title = (data.get('title') or '').strip()
    parent_id = data.get('parent_id')
    type_ = data.get('type', 'document')

    if parent_id is not None and not Node.query.get(parent_id):
        return jsonify({'error': '父节点不存在'}), 404

    if not title:
        return jsonify({'error': '标题不能为空'}), 400
    if type_ not in ('document', 'article'):
        return jsonify({'error': '类型无效，必须为 document 或 article'}), 400
    if parent_id is None and type_ != 'document':
        return jsonify({'error': '根节点必须为文档类型'}), 400

    existing = Node.query.filter_by(parent_id=parent_id, title=title).first()
    if existing:
        return jsonify({'error': '同级已存在相同标题'}), 409

    max_order = db.session.query(db.func.max(Node.sort_order)).filter(
        Node.parent_id == parent_id
    ).scalar() or 0

    content = data.get('content', '')

    # 创建时可选启用密码锁定（article 类型才允许）
    want_lock = bool(data.get('is_locked')) and type_ == 'article'
    lock_pwd = (data.get('lock_password') or '').strip() if want_lock else ''

    node = Node(
        title=title,
        parent_id=parent_id,
        type=type_,
        sort_order=max_order + 1,
        content=content,
        owner_id=current_user.id,
    )

    # 启用锁定必须设置密码
    if want_lock:
        if not lock_pwd:
            return jsonify({'error': '启用锁定必须设置密码'}), 400
        node.is_locked = True
        node.lock_password_hash = generate_password_hash(lock_pwd)

    # article 类型的内容用 RSA 混合加密存储
    if type_ == 'article' and content and current_user.rsa_public_key:
        enc_content, enc_key = encrypt_content(content, current_user.rsa_public_key)
        node.content = enc_content
        node.encrypted_key = enc_key

    db.session.add(node)
    db.session.commit()
    return jsonify(_node_dict(node)), 201


# 判断用户是否有权限访问该节点
def _can_access(node: Node, user: User) -> bool:
    if node.owner_id is None:
        return True
    if node.owner_id == user.id:
        return True
    perm = NodePerm.query.filter_by(
        node_id=node.id, grantee_id=user.id
    ).order_by(NodePerm.created_at.desc()).first()
    return perm is not None and perm.is_active


@views_bp.route('/nodes/<int:node_id>', methods=['GET'])
@login_required
# 获取单个节点的详细信息
def get_node(node_id):
    node = Node.query.get_or_404(node_id)
    data = _node_dict(node)

    if not _can_access(node, current_user):
        return jsonify({'error': '无权访问此节点'}), 404

    data['owner_id'] = node.owner_id
    data['is_owner'] = (node.owner_id == current_user.id)
    data['locked'] = bool(node.is_locked)
    data['unlocked'] = False  # 锁定严格生效，每次打开都需输入密码；解锁仅用于本次响应，不跨请求保留

    # 锁定状态的文章一律不返回明文内容，前端展示密码解锁遮罩
    if node.is_locked:
        data['content'] = ''
        grantee_list = _grantee_list(node)
        data['grantees'] = grantee_list
        return jsonify(data), 200

    # 加密内容需要用所有者的私钥解密
    if node.encrypted_key:
        try:
            owner = User.query.get(node.owner_id) if node.owner_id else current_user
            plaintext = decrypt_content(node.content, node.encrypted_key, owner.rsa_private_key)
            data['content'] = plaintext
        except Exception as e:
            logger.exception('Decryption failed for node %d', node.id)
            data['content'] = '(decryption failed)'
    else:
        data['content'] = node.content

    data['grantees'] = _grantee_list(node)

    return jsonify(data), 200


# 收集有访问权限的用户列表（被分享者）
def _grantee_list(node: Node) -> list[dict]:
    grantees = NodePerm.query.filter_by(node_id=node.id, is_active=True).all()
    grantee_list = []
    for g in grantees:
        u = User.query.get(g.grantee_id)
        if u:
            grantee_list.append({'id': u.id, 'nickname': u.nickname or u.email})
    return grantee_list


@views_bp.route('/nodes/<int:node_id>/unlock', methods=['POST'])
@login_required
# 校验锁定密码，正确则返回明文内容并将会话标记为已解锁
def unlock_node(node_id):
    node = Node.query.get_or_404(node_id)
    if not node.is_locked:
        return jsonify({'error': '此文章未锁定'}), 400
    if not _can_access(node, current_user):
        return jsonify({'error': '无权访问此节点'}), 404

    data = request.get_json(force=True)
    password = data.get('password', '')

    if not node.lock_password_hash or not check_password_hash(node.lock_password_hash, password):
        return jsonify({'error': '密码错误'}), 401

    # 校验通过：解密返回内容；本次响应有效，下次 GET 仍会被锁定
    content = node.content
    if node.encrypted_key and node.owner_id:
        owner = User.query.get(node.owner_id)
        if owner:
            try:
                content = decrypt_content(node.content, node.encrypted_key, owner.rsa_private_key)
            except Exception:
                logger.exception('Decryption failed for node %d during unlock', node.id)
                content = node.content

    return jsonify({
        'content': content,
        'locked': True,
        'unlocked': True,
        'is_owner': node.owner_id == current_user.id,
        'grantees': _grantee_list(node),
    }), 200


@views_bp.route('/nodes/<int:node_id>', methods=['PUT'])
@login_required
# 更新节点标题或内容
def update_node(node_id):
    node = Node.query.get_or_404(node_id)
    if node.owner_id != current_user.id:
        return jsonify({'error': '只有所有者才能编辑此节点'}), 403

    data = request.get_json(force=True)

    if 'title' in data:
        title = (data['title'] or '').strip()
        if not title:
            return jsonify({'error': '标题不能为空'}), 400
        node.title = title
    if 'content' in data:
        plaintext = data['content'] or ''
        # 有公钥的文章内容先加密再存
        if node.type == 'article' and plaintext and current_user.rsa_public_key:
            enc_content, enc_key = encrypt_content(plaintext, current_user.rsa_public_key)
            node.content = enc_content
            node.encrypted_key = enc_key
        else:
            node.content = plaintext

    # 锁定设置：仅文章类型，且只有所有者可操作
    if 'is_locked' in data:
        if node.type != 'article':
            return jsonify({'error': '只有文章支持密码锁定'}), 400
        want_lock = bool(data['is_locked'])
        lock_pwd = (data.get('lock_password') or '').strip()
        if want_lock:
            # 启用或改密码：若提供了新密码则更新；否则沿用旧哈希（已锁定时）
            if lock_pwd:
                node.lock_password_hash = generate_password_hash(lock_pwd)
            elif not node.lock_password_hash:
                return jsonify({'error': '启用锁定必须设置密码'}), 400
            node.is_locked = True
        else:
            node.is_locked = False
            node.lock_password_hash = None

    db.session.commit()
    result = _node_dict(node)
    if node.encrypted_key:
        try:
            result['content'] = decrypt_content(node.content, node.encrypted_key, current_user.rsa_private_key)
        except Exception as e:
            logger.exception('Decryption failed for node %d during update', node.id)
            result['content'] = node.content
    else:
        result['content'] = node.content
    return jsonify(result), 200


@views_bp.route('/nodes', methods=['GET'])
@login_required
# 返回节点树或平铺列表
def list_nodes():
    flat = request.args.get('flat', '').lower() == 'true'

    # 只查自己拥有的 + 被授权访问的节点
    authorized_ids = set(
        r[0] for r in
        NodePerm.query.filter_by(grantee_id=current_user.id, is_active=True)
        .with_entities(NodePerm.node_id)
        .all()
    )
    # 自己的节点 + 被授权的节点
    all_nodes = Node.query.filter(
        db.or_(Node.owner_id == current_user.id, Node.id.in_(authorized_ids))
    ).order_by(Node.sort_order, Node.created_at).all()

    # 把授权节点的父级链也补上，保证树能正常展示
    parent_ids = set()
    for node in all_nodes:
        pid = node.parent_id
        while pid is not None:
            parent_ids.add(pid)
            parent_node = Node.query.get(pid)
            if parent_node:
                pid = parent_node.parent_id
            else:
                break
    if parent_ids:
        chain_nodes = Node.query.filter(
            Node.id.in_(parent_ids)
        ).order_by(Node.sort_order, Node.created_at).all()
        existing_ids = {n.id for n in all_nodes}
        for cn in chain_nodes:
            if cn.id not in existing_ids:
                all_nodes.append(cn)

    if flat:
        return jsonify({'nodes': [_node_dict(n) for n in all_nodes]}), 200

    root_nodes = [n for n in all_nodes if n.parent_id is None]
    tree = _build_tree(root_nodes)
    return jsonify({'nodes': tree}), 200


@views_bp.route('/nodes/<int:node_id>', methods=['DELETE'])
@login_required
# 删除节点及其所有子节点
def delete_node(node_id):
    node = Node.query.get_or_404(node_id)
    if node.owner_id != current_user.id:
        return jsonify({'error': '无权删除此节点'}), 403

    # 如果节点是根级别的 article 类型，需要特殊处理（防止所有根节点都是 article）
    if node.parent_id is None and node.type == 'article':
        if node.type != 'document':
            node.type = 'document'

    # 找到所有子节点并按 sort_order 排序
    children = Node.query.filter_by(parent_id=node.parent_id).order_by(Node.sort_order).all()
    sibling_count = 0
    for child in children:
        if child.parent_id == node.parent_id:
            sibling_count += 1

    # 收集所有后代节点 ID
    subtree_ids = _get_subtree_ids(node.id)

    # 删除节点及其所有子节点的权限记录
    all_ids = [node.id] + subtree_ids
    NodePerm.query.filter(NodePerm.node_id.in_(all_ids)).delete(synchronize_session=False)

    # 删除所有子节点
    Node.query.filter(Node.id.in_(subtree_ids)).delete(synchronize_session=False)

    # 更新兄弟节点的 sort_order（把后面的节点往前移）
    if node.parent_id is not None:
        siblings = Node.query.filter(
            Node.parent_id == node.parent_id,
            Node.sort_order > node.sort_order
        ).order_by(Node.sort_order).all()
        for sibling in siblings:
            sibling.sort_order -= 1

    db.session.delete(node)
    db.session.commit()

    return jsonify({'message': f'节点已删除，{sibling_count} 个子节点已上移'}), 200


@views_bp.route('/nodes/<int:node_id>/move', methods=['PUT'])
@login_required
# 移动节点到新的父节点下
def move_node(node_id):
    node = Node.query.get_or_404(node_id)
    if node.owner_id != current_user.id:
        return jsonify({'error': '无权操作此节点'}), 403

    data = request.get_json(force=True)
    new_parent_id = data.get('parent_id')

    # 检查是否形成循环引用
    if new_parent_id == node.id:
        return jsonify({'error': '不能移动到自身'}), 400
    if new_parent_id is not None:
        subtree_ids = _get_subtree_ids(node.id)
        if new_parent_id in subtree_ids:
            return jsonify({'error': '不能移动到子节点下'}), 400

    node.parent_id = new_parent_id
    db.session.commit()
    return jsonify(_node_dict(node)), 200


@views_bp.route('/nodes/<int:node_id>/rename', methods=['PUT'])
@login_required
# 重命名节点标题
def rename_node(node_id):
    node = Node.query.get_or_404(node_id)
    if node.owner_id != current_user.id:
        return jsonify({'error': '无权操作此节点'}), 403

    data = request.get_json(force=True)
    new_title = (data.get('title') or '').strip()
    if not new_title:
        return jsonify({'error': '标题不能为空'}), 400
    if new_title == node.title:
        return jsonify(_node_dict(node)), 200

    node.title = new_title
    db.session.commit()
    return jsonify(_node_dict(node)), 200


@views_bp.route('/nodes/search', methods=['GET'])
@login_required
# 按标题关键词搜索节点
def search_nodes():
    q = (request.args.get('q') or '').strip()
    type_filter = (request.args.get('type') or '').strip()
    if not q:
        return jsonify({'nodes': []}), 200

    # 只搜索用户有权限访问的节点
    authorized_ids = set(
        r[0] for r in
        NodePerm.query.filter_by(grantee_id=current_user.id, is_active=True)
        .with_entities(NodePerm.node_id)
        .all()
    )
    query = Node.query.filter(
        db.or_(Node.owner_id == current_user.id, Node.id.in_(authorized_ids)),
        Node.title.contains(q),
    )
    if type_filter in ('document', 'article'):
        query = query.filter(Node.type == type_filter)

    nodes = query.order_by(Node.sort_order, Node.created_at).all()
    return jsonify({'nodes': [_node_dict(n) for n in nodes]}), 200


@views_bp.route('/nodes/<int:node_id>/share', methods=['POST'])
@login_required
# 把节点分享给其他用户
def share_node(node_id):
    node = Node.query.get_or_404(node_id)
    if node.owner_id != current_user.id:
        return jsonify({'error': '只有所有者才能分享此节点'}), 403

    data = request.get_json(force=True)
    grantee_id = data.get('grantee_id')

    grantee = User.query.get(grantee_id)
    if not grantee or not grantee.is_active:
        return jsonify({'error': '用户不存在或未激活'}), 404

    # 检查是否已有活跃的分享记录
    existing = NodePerm.query.filter_by(
        node_id=node.id, grantee_id=grantee_id
    ).first()

    if existing and existing.is_active:
        return jsonify({'error': '该用户已有访问权限'}), 409

    if not grantee.rsa_public_key:
        return jsonify({'error': '该用户暂未生成加密密钥'}), 400

    # 先解密再重新加密（用所有者的私钥解密原文）
    content_plain = node.content
    if node.encrypted_key and node.owner_id:
        owner = User.query.get(node.owner_id)
        if owner:
            try:
                content_plain = decrypt_content(node.content, node.encrypted_key, owner.rsa_private_key)
            except Exception as e:
                logger.exception('Decryption failed for node %d during share', node.id)
                return jsonify({'error': '解密内容失败'}), 500

    if existing:
        existing.is_active = True
        db.session.commit()
    else:
        perm = NodePerm(node_id=node.id, grantor_id=current_user.id, grantee_id=grantee_id)
        db.session.add(perm)
        db.session.commit()

    # 发送邮件通知被分享者
    send_notification(
        to_email=grantee.email,
        subject=f'{current_user.nickname} 分享了文档《{node.title}》给你',
        body=f'用户 {current_user.nickname} 将文档《{node.title}》分享给了你，请登录查看。',
    )

    return jsonify({'message': f'已将「{node.title}」分享给 {grantee.nickname}！'}), 200


@views_bp.route('/nodes/<int:node_id>/share/<int:grantee_id>', methods=['DELETE'])
@login_required
# 取消分享，收回访问权限
def revoke_share(node_id, grantee_id):
    node = Node.query.get_or_404(node_id)
    if node.owner_id != current_user.id:
        return jsonify({'error': '只有所有者才能取消分享'}), 403

    perm = NodePerm.query.filter_by(
        node_id=node.id, grantee_id=grantee_id
    ).first()
    if not perm or not perm.is_active:
        return jsonify({'error': '该用户没有访问权限'}), 404

    perm.is_active = False
    db.session.commit()
    return jsonify({'message': '已取消分享'}), 200


@views_bp.route('/nodes/import/batch', methods=['POST'])
@login_required
# 批量导入 JSON 格式的节点数据
def batch_import():
    data = request.get_json(force=True)
    nodes_data = data.get('nodes', [])
    if not nodes_data:
        return jsonify({'error': '没有可导入的数据'}), 400

    created = 0
    for item in nodes_data:
        title = item.get('title', '').strip()
        parent_id = item.get('parent_id')
        type_ = item.get('type', 'document')
        content = item.get('content', '')

        if not title:
            continue

        node = Node(
            title=title,
            parent_id=parent_id if parent_id else None,
            type=type_,
            content=content,
            owner_id=current_user.id,
        )
        # 导入时如果有公钥也做加密
        if content and current_user.rsa_public_key:
            enc_content, enc_key = encrypt_content(content, current_user.rsa_public_key)
            node.content = enc_content
            node.encrypted_key = enc_key

        db.session.add(node)
        created += 1

    db.session.commit()
    return jsonify({'message': f'成功导入 {created} 个节点'}), 201


@views_bp.route('/nodes/import/file', methods=['POST'])
@login_required
# 上传文件并导入为新节点
def import_file():
    parent_id = request.form.get('parent_id', type=int)
    parent = None
    if parent_id:
        parent = Node.query.get(parent_id)
        if not parent:
            return jsonify({'error': '目标节点不存在'}), 404
        if parent.owner_id != current_user.id:
            return jsonify({'error': '只能导入到自己的节点下'}), 403
    elif parent_id == 0:
        parent_id = None

    file = request.files.get('file')
    if not file:
        return jsonify({'error': '请选择文件'}), 400

    filename = (file.filename or 'unnamed').strip()
    ext = os.path.splitext(filename)[1].lower()

    # 处理纯文本文件
    if ext in ('.txt', '.md', '.markdown', '.py', '.js', '.html', '.css', '.json', '.xml', '.yaml', '.yml', '.toml', '.ini', '.cfg', '.conf', '.log', '.csv', '.tsv', '.sql', '.sh', '.bat', '.rst', '.tex'):
        try:
            content = file.read().decode('utf-8')
        except UnicodeDecodeError:
            content = file.read().decode('latin-1')
        title = filename.rsplit('.', 1)[0]
        file.seek(0)

        node = Node(
            title=title,
            parent_id=parent_id,
            type='article',
            content=content,
            owner_id=current_user.id,
        )
        if content and current_user.rsa_public_key:
            enc_content, enc_key = encrypt_content(content, current_user.rsa_public_key)
            node.content = enc_content
            node.encrypted_key = enc_key

        db.session.add(node)
        db.session.commit()
        return jsonify(_node_dict(node)), 201

    # 处理 Word 文档
    if ext == '.docx':
        return _import_docx(file, parent_id if parent else None)

    # 处理 Excel 文件
    if ext in ('.xlsx', '.xlsm'):
        return _import_excel(file, parent_id if parent else None)

    return jsonify({'error': f'不支持的文件格式: {ext}'}), 400


# 导入 Word 文档并转成 Markdown（图片保留在文档原始位置）
def _import_docx(file, parent_id):
    try:
        import docx  # type: ignore
        from docx.oxml.ns import qn  # type: ignore
    except ImportError:
        return jsonify({'error': '服务器未安装 python-docx'}), 500

    try:
        doc = docx.Document(file)
    except Exception:
        return jsonify({'error': '无法解析该 Word 文档'}), 400

    # 第一步：预提取所有图片并保存到统一图片目录，建立 rId → markdown 图片引用的映射
    image_rels = {}
    for rel_id, rel in doc.part.rels.items():
        if 'image' in rel.reltype:
            try:
                img = rel.target_part
                img_bytes = img.blob
                ext = os.path.splitext(img.partname)[1]
                if not ext:
                    ext = '.png'
                # 统一重命名后存入个人数据资产 imgs 目录
                fname, url = _save_image_bytes(img_bytes, ext)
                image_rels[rel_id] = f'![image]({url})'
            except Exception:
                pass

    # 第二步：逐段落处理，在原始位置插入图片
    md_parts = []
    for para in doc.paragraphs:
        style = para.style.name if para.style else ''
        para_element = para._element

        # 检测段落是否包含图片（<w:drawing> 元素）
        drawings = para_element.findall(f'.//{qn("w:drawing")}')

        if not drawings:
            # 无图片，使用简单的文本提取
            text = para.text.strip()
            if not text:
                md_parts.append('')
                continue
            if 'Heading 1' in style:
                md_parts.append(f'# {text}')
            elif 'Heading 2' in style:
                md_parts.append(f'## {text}')
            elif 'Heading 3' in style:
                md_parts.append(f'### {text}')
            elif 'Heading 4' in style:
                md_parts.append(f'#### {text}')
            else:
                md_parts.append(text)
        else:
            # 包含图片，逐 run 处理以保持图片在文档中的原始位置
            line_parts = []
            seen_rids = set()  # 避免重复处理（如 mc:AlternateContent）

            for run_element in para_element.findall(qn('w:r')):
                # 按文档顺序遍历 run 的子元素，保证文本和图片的相对位置
                for child in run_element:
                    if child.tag == qn('w:drawing'):
                        # 处理图片
                        for blip in child.findall(f'.//{qn("a:blip")}'):
                            embed = blip.get(qn('r:embed'))
                            if embed and embed in image_rels and embed not in seen_rids:
                                seen_rids.add(embed)
                                line_parts.append(image_rels[embed])
                    elif child.tag == qn('w:t'):
                        text = child.text
                        if text and text.strip():
                            line_parts.append(text.strip())

            if line_parts:
                # 检查是否是标题段落
                heading_prefix = ''
                if 'Heading 1' in style:
                    heading_prefix = '# '
                elif 'Heading 2' in style:
                    heading_prefix = '## '
                elif 'Heading 3' in style:
                    heading_prefix = '### '
                elif 'Heading 4' in style:
                    heading_prefix = '#### '

                for i, part in enumerate(line_parts):
                    if i == 0 and heading_prefix and not part.startswith('!['):
                        md_parts.append(f'{heading_prefix}{part}')
                    else:
                        md_parts.append(part)
            else:
                md_parts.append('')

    content = '\n'.join(md_parts)
    title = file.filename.rsplit('.', 1)[0] if hasattr(file, 'filename') else '导入文档'
    file.seek(0)

    parent_node = None
    if parent_id:
        parent_node = Node.query.get(parent_id)

    node = Node(
        title=title,
        parent_id=parent_id,
        type='article',
        content=content,
        owner_id=current_user.id,
    )
    if content and current_user.rsa_public_key:
        enc_content, enc_key = encrypt_content(content, current_user.rsa_public_key)
        node.content = enc_content
        node.encrypted_key = enc_key

    db.session.add(node)
    db.session.commit()
    return jsonify(_node_dict(node)), 201


# 导入 Excel 文件并转成 Markdown 表格
def _import_excel(file, parent_id):
    try:
        import openpyxl  # type: ignore
    except ImportError:
        return jsonify({'error': '服务器未安装 openpyxl'}), 500

    try:
        wb = openpyxl.load_workbook(file, read_only=True, data_only=True)
    except Exception:
        return jsonify({'error': '无法解析该 Excel 文件'}), 400

    md_parts = []
    for sheet_name in wb.sheetnames:
        ws = wb[sheet_name]
        md_parts.append(f'## {sheet_name}\n')

        rows = list(ws.iter_rows(values_only=True))
        if not rows:
            md_parts.append('*(空表格)*\n')
            continue

        # 第一行作为表头
        header = rows[0]
        md_parts.append('| ' + ' | '.join(str(c or '') for c in header) + ' |')
        md_parts.append('| ' + ' | '.join('---' for _ in header) + ' |')

        # 数据行
        for row in rows[1:]:
            # 行列对齐，补足长度
            cells = list(row) + [None] * (len(header) - len(row))
            md_parts.append('| ' + ' | '.join(str(c or '') for c in cells[:len(header)]) + ' |')

        md_parts.append('')

    wb.close()
    content = '\n'.join(md_parts)
    title = file.filename.rsplit('.', 1)[0]

    node = Node(
        title=title,
        parent_id=parent_id,
        type='article',
        content=content,
        owner_id=current_user.id,
    )

    if content and current_user.rsa_public_key:
        enc_content, enc_key = encrypt_content(content, current_user.rsa_public_key)
        node.content = enc_content
        node.encrypted_key = enc_key

    db.session.add(node)
    db.session.commit()
    return jsonify(_node_dict(node)), 201


# 校验目标父节点是否属于当前用户
def _check_parent_owner(parent_id):
    if parent_id:
        parent = Node.query.get(parent_id)
        if not parent:
            return None, (jsonify({'error': '目标节点不存在'}), 404)
        if parent.owner_id != current_user.id:
            return None, (jsonify({'error': '只能导入到自己的节点下'}), 403)
    return parent_id, None


@views_bp.route('/nodes/<int:parent_id>/import', methods=['POST'])
@login_required
# 导入 Markdown/纯文本文件到指定父节点下
def import_to_node(parent_id):
    real_parent_id, err = _check_parent_owner(parent_id)
    if err:
        return err

    file = request.files.get('file')
    if not file:
        return jsonify({'error': '请选择文件'}), 400

    filename = (file.filename or 'unnamed').strip()
    ext = os.path.splitext(filename)[1].lower()

    if ext not in ('.txt', '.md', '.markdown', '.py', '.js', '.html', '.css', '.json',
                   '.xml', '.yaml', '.yml', '.toml', '.ini', '.cfg', '.conf', '.log',
                   '.csv', '.tsv', '.sql', '.sh', '.bat', '.rst', '.tex'):
        return jsonify({'error': f'不支持的文件格式: {ext}，请使用 Markdown 导入'}), 400

    try:
        content = file.read().decode('utf-8')
    except UnicodeDecodeError:
        content = file.read().decode('latin-1')
    title = filename.rsplit('.', 1)[0]

    node = Node(
        title=title,
        parent_id=real_parent_id,
        type='article',
        content=content,
        owner_id=current_user.id,
    )
    if content and current_user.rsa_public_key:
        enc_content, enc_key = encrypt_content(content, current_user.rsa_public_key)
        node.content = enc_content
        node.encrypted_key = enc_key

    db.session.add(node)
    db.session.commit()
    return jsonify(_node_dict(node)), 201


@views_bp.route('/nodes/<int:parent_id>/import-word', methods=['POST'])
@login_required
# 导入 Word 文档到指定父节点下
def import_word_to_node(parent_id):
    real_parent_id, err = _check_parent_owner(parent_id)
    if err:
        return err

    file = request.files.get('file')
    if not file:
        return jsonify({'error': '请选择文件'}), 400

    filename = (file.filename or 'unnamed').strip()
    ext = os.path.splitext(filename)[1].lower()
    if ext != '.docx':
        return jsonify({'error': '仅支持 .docx 格式'}), 400

    return _import_docx(file, real_parent_id)


@views_bp.route('/nodes/<int:parent_id>/import-excel', methods=['POST'])
@login_required
# 导入 Excel 文件到指定父节点下
def import_excel_to_node(parent_id):
    real_parent_id, err = _check_parent_owner(parent_id)
    if err:
        return err

    file = request.files.get('file')
    if not file:
        return jsonify({'error': '请选择文件'}), 400

    filename = (file.filename or 'unnamed').strip()
    ext = os.path.splitext(filename)[1].lower()
    if ext not in ('.xlsx', '.xlsm', '.xls'):
        return jsonify({'error': '仅支持 .xlsx/.xls 格式'}), 400

    return _import_excel(file, real_parent_id)


@views_bp.route('/nodes/batch-authorize', methods=['POST'])
@login_required
# 批量授权或撤销节点权限
def batch_authorize():
    data = request.get_json(force=True)
    node_ids = data.get('node_ids', [])
    user_ids = data.get('user_ids', [])
    is_active = data.get('is_active', True)
    recursive = data.get('recursive', False)

    if not node_ids or not user_ids:
        return jsonify({'error': '节点和用户不能为空'}), 400

    # 收集需要操作的节点 ID（含子节点）
    target_node_ids = set(node_ids)
    if recursive:
        for nid in node_ids:
            target_node_ids.update(_get_subtree_ids(nid))

    # 校验所有节点都属于当前用户
    nodes = Node.query.filter(Node.id.in_(target_node_ids)).all()
    for n in nodes:
        if n.owner_id != current_user.id:
            return jsonify({'error': f'无权操作节点 {n.id}'}), 403

    # 校验所有目标用户
    grantees = User.query.filter(User.id.in_(user_ids)).all()
    if len(grantees) != len(user_ids):
        return jsonify({'error': '部分用户不存在'}), 404

    granted, revoked = 0, 0
    for node_id in target_node_ids:
        for grantee_id in user_ids:
            perm = NodePerm.query.filter_by(
                node_id=node_id, grantee_id=grantee_id
            ).first()

            if is_active:
                # 授权
                if perm and perm.is_active:
                    continue
                if perm:
                    perm.is_active = True
                else:
                    db.session.add(NodePerm(
                        node_id=node_id,
                        grantor_id=current_user.id,
                        grantee_id=grantee_id,
                    ))
                granted += 1
            else:
                # 撤销
                if perm and perm.is_active:
                    perm.is_active = False
                    revoked += 1

    db.session.commit()

    msg = f'已授权 {granted} 条' if is_active else f'已撤销 {revoked} 条'
    return jsonify({'message': msg}), 200


@views_bp.route('/nodes/<int:node_id>/transfer', methods=['POST'])
@login_required
# 转让节点所有权给其他用户
def transfer_node(node_id):
    node = Node.query.get_or_404(node_id)
    if node.owner_id != current_user.id:
        return jsonify({'error': '只有所有者才能转让'}), 403

    data = request.get_json(force=True)
    new_owner_id = data.get('new_owner_id')
    recursive = data.get('recursive', False)

    new_owner = User.query.get(new_owner_id)
    if not new_owner or not new_owner.is_active:
        return jsonify({'error': '目标用户不存在或未激活'}), 404

    # 如果文章内容加密，需要用当前所有者私钥解密，再用新所有者公钥重新加密
    if node.encrypted_key and node.content:
        try:
            plaintext = decrypt_content(node.content, node.encrypted_key, current_user.rsa_private_key)
        except Exception:
            logger.exception('Decryption failed for node %d during transfer', node.id)
            return jsonify({'error': '解密内容失败，无法转让'}), 500

        if new_owner.rsa_public_key:
            enc_content, enc_key = encrypt_content(plaintext, new_owner.rsa_public_key)
            node.content = enc_content
            node.encrypted_key = enc_key
        else:
            node.content = plaintext
            node.encrypted_key = None

    node.owner_id = new_owner_id
    transferred = 1

    # 递归转让子节点
    if recursive:
        subtree_ids = _get_subtree_ids(node_id)
        for sid in subtree_ids:
            child = Node.query.get(sid)
            if child and child.owner_id == current_user.id:
                if child.encrypted_key and child.content:
                    try:
                        plaintext = decrypt_content(child.content, child.encrypted_key, current_user.rsa_private_key)
                        if new_owner.rsa_public_key:
                            enc_content, enc_key = encrypt_content(plaintext, new_owner.rsa_public_key)
                            child.content = enc_content
                            child.encrypted_key = enc_key
                        else:
                            child.content = plaintext
                            child.encrypted_key = None
                    except Exception:
                        logger.exception('Decryption failed for child node %d during transfer', child.id)
                        continue
                child.owner_id = new_owner_id
                transferred += 1

    db.session.commit()
    return jsonify({'message': f'已转让 {transferred} 个节点给 {new_owner.nickname or new_owner.email}'}), 200


@views_bp.route('/images/upload', methods=['POST'])
@login_required
# 上传本地图片（markdown 写作用），统一重命名后存入 imgs 目录，返回可插入的访问 URL
def upload_image():
    file = request.files.get('file')
    if not file:
        return jsonify({'error': '请选择图片文件'}), 400

    filename = (file.filename or 'unnamed').strip()
    ext = os.path.splitext(filename)[1].lower()
    # 仅允许常见图片格式
    allowed = ('.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.svg')
    if ext not in allowed:
        return jsonify({'error': f'不支持的图片格式: {ext}'}), 400

    try:
        img_bytes = file.read()
    except Exception:
        return jsonify({'error': '读取图片失败'}), 400

    try:
        fname, url = _save_image_bytes(img_bytes, ext)
    except Exception as e:
        logger.exception('保存上传图片失败')
        return jsonify({'error': '保存图片失败'}), 500

    return jsonify({'url': f'/{url}', 'filename': fname}), 201


@views_bp.route('/users', methods=['GET'])
@login_required
# 列出可分享的用户（排除自己）
def list_users():
    users = User.query.filter(
        User.is_active == True, User.id != current_user.id
    ).order_by(User.nickname).all()
    return jsonify({
        'users': [{
            'id': u.id,
            'nickname': u.nickname,
            'email': u.email,
            'is_active': u.is_active,
        } for u in users]
    }), 200

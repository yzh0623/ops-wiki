"""Ops Wiki — wiki node API blueprint (CRUD, tree, import, search)."""

from flask import Blueprint, request, jsonify
from flask_login import login_required, current_user

from app import db
from models import Node, User, NodePermission as NodePerm
from crypto import encrypt_content, decrypt_content

views_bp = Blueprint('views', __name__)


@views_bp.record_once
def _register_root_route(state):
    """Register the SPA root route directly on the Flask app."""
    from flask import render_template

    @state.app.route('/')
    def spa_index():
        return render_template('index.html')


def _node_dict(node: Node) -> dict:
    return {
        'id': node.id,
        'parent_id': node.parent_id,
        'title': node.title,
        'type': node.type,
        'owner_id': node.owner_id,
        'sort_order': node.sort_order,
        'created_at': node.created_at.isoformat() if node.created_at else None,
        'updated_at': node.updated_at.isoformat() if node.updated_at else None,
    }


def _build_tree(nodes: list[Node], parent_id: int | None = None) -> list[dict]:
    """Recursively build nested tree from flat node list."""
    result = []
    for node in nodes:
        if node.parent_id == parent_id:
            children = _build_tree(nodes, node.id)
            entry = _node_dict(node)
            entry['children'] = children
            result.append(entry)
    return result


@views_bp.route('/nodes', methods=['POST'])
@login_required
def create_node():
    data = request.get_json(force=True)
    title = (data.get('title') or '').strip()
    parent_id = data.get('parent_id')
    type_ = data.get('type', 'document')

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

    node = Node(title=title, parent_id=parent_id, type=type_, sort_order=max_order + 1)
    node.owner_id = current_user.id

    content = data.get('content', '')
    node.content = content

    if type_ == 'article' and content:
        enc_content, enc_key = encrypt_content(content, current_user.rsa_public_key)
        node.content = enc_content
        node.encrypted_key = enc_key

    db.session.add(node)
    db.session.commit()
    return jsonify(_node_dict(node)), 201


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
def get_node(node_id):
    node = Node.query.get_or_404(node_id)
    data = _node_dict(node)

    if not _can_access(node, current_user):
        data['content'] = None
        data['owner_id'] = node.owner_id
        return jsonify(data), 200

    if node.encrypted_key:
        try:
            owner = User.query.get(node.owner_id) if node.owner_id else current_user
            plaintext = decrypt_content(node.content, node.encrypted_key, owner.rsa_private_key)
            data['content'] = plaintext
        except Exception:
            data['content'] = '(decryption failed)'
    else:
        data['content'] = node.content

    data['owner_id'] = node.owner_id
    return jsonify(data), 200


@views_bp.route('/nodes/<int:node_id>', methods=['PUT'])
@login_required
def update_node(node_id):
    node = Node.query.get_or_404(node_id)
    data = request.get_json(force=True)

    if 'title' in data:
        title = (data['title'] or '').strip()
        if not title:
            return jsonify({'error': '标题不能为空'}), 400
        node.title = title
    if 'content' in data:
        plaintext = data['content'] or ''
        if node.type == 'article' and plaintext and current_user.rsa_public_key:
            enc_content, enc_key = encrypt_content(plaintext, current_user.rsa_public_key)
            node.content = enc_content
            node.encrypted_key = enc_key
        else:
            node.content = plaintext

    db.session.commit()
    result = _node_dict(node)
    if node.encrypted_key:
        try:
            result['content'] = decrypt_content(node.content, node.encrypted_key, current_user.rsa_private_key)
        except Exception:
            result['content'] = node.content
    else:
        result['content'] = node.content
    return jsonify(result), 200


@views_bp.route('/nodes', methods=['GET'])
@login_required
def list_nodes():
    flat = request.args.get('flat', '').lower() == 'true'
    all_nodes = Node.query.order_by(Node.sort_order, Node.created_at).all()

    if flat:
        return jsonify({'nodes': [_node_dict(n) for n in all_nodes]}), 200

    tree = _build_tree(all_nodes)
    return jsonify({'nodes': tree}), 200


@views_bp.route('/nodes/<int:node_id>', methods=['DELETE'])
@login_required
def delete_node(node_id):
    node = Node.query.get_or_404(node_id)

    child_count = Node.query.filter_by(parent_id=node_id).count()
    Node.query.filter_by(parent_id=node_id).update(
        {'parent_id': node.parent_id}
    )

    db.session.delete(node)
    db.session.commit()
    return jsonify({
        'message': f'节点已删除，{child_count} 个子节点已上移'
    }), 200


@views_bp.route('/nodes/<int:node_id>/share', methods=['POST'])
@login_required
def share_node(node_id):
    node = Node.query.get_or_404(node_id)
    if node.owner_id != current_user.id:
        return jsonify({'error': '只有文章所有者才能分享'}), 403

    data = request.get_json(force=True)
    user_ids = data.get('user_ids', [])

    if not user_ids:
        return jsonify({'error': '未提供用户列表'}), 400

    for uid in user_ids:
        perm = NodePerm(
            node_id=node.id,
            grantor_id=current_user.id,
            grantee_id=uid,
            is_active=True,
        )
        db.session.add(perm)
    db.session.commit()
    return jsonify({'message': f'已授权 {len(user_ids)} 名用户'}), 200


@views_bp.route('/nodes/batch-authorize', methods=['POST'])
@login_required
def batch_authorize():
    data = request.get_json(force=True)
    node_ids = data.get('node_ids', [])
    user_ids = data.get('user_ids', [])
    is_active = data.get('is_active', True)

    if not node_ids or not user_ids:
        return jsonify({'error': '未提供节点或用户列表'}), 400

    nodes = Node.query.filter(Node.id.in_(node_ids)).all()
    authorized = 0
    for node in nodes:
        if node.owner_id != current_user.id:
            continue
        for uid in user_ids:
            perm = NodePerm(
                node_id=node.id,
                grantor_id=current_user.id,
                grantee_id=uid,
                is_active=is_active,
            )
            db.session.add(perm)
            authorized += 1
    db.session.commit()
    action = '授权' if is_active else '撤销'
    return jsonify({'message': f'已{action} {authorized} 项权限'}), 200


@views_bp.route('/nodes/<int:node_id>/transfer', methods=['POST'])
@login_required
def transfer_node(node_id):
    node = Node.query.get_or_404(node_id)
    if node.owner_id != current_user.id:
        return jsonify({'error': '只有文章所有者才能转让'}), 403

    data = request.get_json(force=True)
    new_owner_id = data.get('new_owner_id')
    if not new_owner_id:
        return jsonify({'error': '未指定新所有者'}), 400

    new_owner = User.query.get(new_owner_id)
    if not new_owner:
        return jsonify({'error': '目标用户不存在'}), 404
    if not new_owner.is_active:
        return jsonify({'error': '目标用户未激活'}), 400

    plaintext = ''
    if node.encrypted_key and current_user.rsa_private_key:
        try:
            plaintext = decrypt_content(node.content, node.encrypted_key, current_user.rsa_private_key)
        except Exception:
            plaintext = node.content
    else:
        plaintext = node.content

    if plaintext and new_owner.rsa_public_key:
        enc_content, enc_key = encrypt_content(plaintext, new_owner.rsa_public_key)
        node.content = enc_content
        node.encrypted_key = enc_key

    node.owner_id = new_owner_id
    db.session.commit()
    return jsonify({'message': '所有权转让成功'}), 200


ALLOWED_EXTENSIONS = {'.md'}
MAX_CONTENT_LENGTH = 10 * 1024 * 1024


@views_bp.route('/nodes/<int:node_id>/import', methods=['POST'])
@login_required
def import_markdown(node_id):
    parent = Node.query.get_or_404(node_id)

    if 'file' not in request.files:
        return jsonify({'error': '未提供文件'}), 400

    file = request.files['file']
    if not file.filename:
        return jsonify({'error': '文件名为空'}), 400

    ext = '.' + file.filename.rsplit('.', 1)[-1].lower() if '.' in file.filename else ''
    if ext not in ALLOWED_EXTENSIONS:
        return jsonify({'error': '仅支持 .md 文件'}), 400

    file.seek(0, 2)
    size = file.tell()
    if size > MAX_CONTENT_LENGTH:
        return jsonify({'error': '文件大小超过 10MB 限制'}), 413
    file.seek(0)

    content = file.read().decode('utf-8', errors='replace')
    title = file.filename.rsplit('.', 1)[0]

    node = Node(
        title=title,
        parent_id=parent.id,
        type='article',
        content=content,
    )
    db.session.add(node)
    db.session.commit()
    return jsonify(_node_dict(node)), 201


@views_bp.route('/nodes/search', methods=['GET'])
@login_required
def search_nodes():
    q = (request.args.get('q') or '').strip()
    if not q:
        return jsonify({'nodes': []}), 200

    results = Node.query.filter(Node.title.ilike(f'%{q}%')).order_by(
        Node.sort_order, Node.created_at
    ).all()
    return jsonify({'nodes': [_node_dict(n) for n in results]}), 200

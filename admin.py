"""Ops Wiki — admin-only blueprint (user management)."""
from flask import Blueprint, request, jsonify
from flask_login import current_user
from extensions import db
from models import User
from decorators import admin_required

admin_bp = Blueprint('admin', __name__)


def _user_dict(user: User) -> dict:
    return {
        'id': user.id,
        'email': user.email,
        'nickname': user.nickname,
        'is_active': user.is_active,
        'is_admin': user.is_admin,
        'created_at': user.created_at.isoformat() if user.created_at else None,
    }


@admin_bp.route('/users', methods=['GET'])
@admin_required
def list_users():
    users = User.query.order_by(User.created_at.desc()).all()
    return jsonify({'users': [_user_dict(u) for u in users]}), 200


@admin_bp.route('/users/<int:user_id>/approve', methods=['POST'])
@admin_required
def approve_user(user_id):
    user = User.query.get_or_404(user_id)
    user.is_active = True
    db.session.commit()
    return jsonify({**_user_dict(user), 'message': '用户已激活'}), 200


@admin_bp.route('/users/<int:user_id>/deactivate', methods=['POST'])
@admin_required
def deactivate_user(user_id):
    user = User.query.get_or_404(user_id)
    if user.id == current_user.id:
        return jsonify({'error': '不能停用自己的账户'}), 400
    user.is_active = False
    db.session.commit()
    return jsonify({**_user_dict(user), 'message': '用户已停用'}), 200




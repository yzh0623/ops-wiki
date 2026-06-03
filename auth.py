"""Ops Wiki — authentication blueprint (register, login, logout, me)."""

import re

from flask import Blueprint, request, jsonify
from flask_login import login_user, logout_user, login_required, current_user

from extensions import db
from models import User
from crypto import generate_key_pair

auth_bp = Blueprint('auth', __name__)

_EMAIL_RE = re.compile(r'.+@.+\..+')


def _user_dict(user: User) -> dict:
    return {
        'id': user.id,
        'email': user.email,
        'nickname': user.nickname,
        'is_admin': user.is_admin,
        'is_active': user.is_active,
    }


@auth_bp.route('/register', methods=['POST'])
def register():
    data = request.get_json(force=True)

    email = (data.get('email') or '').strip()
    password = data.get('password') or ''
    nickname = (data.get('nickname') or '').strip()

    errors = []
    if not email:
        errors.append('邮箱不能为空')
    elif not _EMAIL_RE.match(email):
        errors.append('邮箱格式不正确')
    if len(password) < 6:
        errors.append('密码至少6位')
    if errors:
        return jsonify({'error': '; '.join(errors)}), 400

    if User.query.filter_by(email=email).first():
        return jsonify({'error': '该邮箱已被注册'}), 409

    is_first_user = User.query.count() == 0

    user = User(email=email, nickname=nickname)
    user.set_password(password)
    user.is_active = True if is_first_user else False
    user.is_admin = True if is_first_user else False

    # Generate RSA key pair for this user
    private_pem, public_pem = generate_key_pair()
    user.rsa_public_key = public_pem
    user.rsa_private_key = private_pem

    db.session.add(user)
    db.session.commit()

    return jsonify({**_user_dict(user), 'message': '注册成功'}), 201


@auth_bp.route('/login', methods=['POST'])
def login():
    data = request.get_json(force=True)

    email = (data.get('email') or '').strip()
    password = data.get('password') or ''

    user = User.query.filter_by(email=email).first()
    if not user:
        return jsonify({'error': '邮箱或密码错误'}), 401

    if not user.check_password(password):
        return jsonify({'error': '邮箱或密码错误'}), 401

    if not user.is_active:
        return jsonify({'error': '账户待审批，请联系管理员'}), 403

    login_user(user, remember=False)
    return jsonify(_user_dict(user)), 200


@auth_bp.route('/logout', methods=['POST'])
def logout():
    from flask import session
    session.clear()
    logout_user()
    resp = jsonify({'message': '已登出'})
    resp.set_cookie('session', '', expires=0, max_age=0)
    return resp, 200


@auth_bp.route('/me', methods=['GET'])
def me():
    if not current_user.is_authenticated:
        return jsonify({'error': '未登录'}), 401
    return jsonify(_user_dict(current_user)), 200

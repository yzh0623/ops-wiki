'''
认证蓝图：注册（含 RSA 密钥生成）、登录、登出、session 检查。
Auth blueprint: register (with RSA key generation), login, logout, session check.
'''
import re

from flask import Blueprint, request, jsonify, session
from flask_login import login_user, logout_user, current_user

from ..core.extensions import db
from ..models import User
from ..services.crypto import generate_key_pair

auth_bp = Blueprint('auth', __name__)

# 邮箱格式校验：够用即可，不追求完整 RFC
# Pragmatic email validation; full RFC correctness is not the goal
_EMAIL_RE = re.compile(r'.+@.+\..+')


# 把 user 对象转成字典，统一接口返回格式
# Serialise a user into the shared response shape
def _user_dict(user: User) -> dict:
    return {
        'id': user.id,
        'email': user.email,
        'nickname': user.nickname,
        'is_admin': user.is_admin,
        'is_active': user.is_active,
    }


# 新用户注册；首个用户自动激活并成为管理员
# Register a user; the very first one is auto-activated as an admin
@auth_bp.route('/register', methods=['POST'])
def register():
    data = request.get_json(force=True)

    email = (data.get('email') or '').strip()
    password = data.get('password') or ''
    nickname = (data.get('nickname') or '').strip()

    # 累积所有校验错误，一次性返回（前端按 '; ' 拆分展示）
    # Collect every validation error and return them at once for the client
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
    # 首个用户直接可用；后续用户需管理员审批
    # The first user is usable immediately; others wait for admin approval
    user.is_active = True if is_first_user else False
    user.is_admin = True if is_first_user else False

    # 为新用户生成 RSA 密钥对（私钥只存在服务端）
    # Generate the RSA key pair; the private key never leaves the server
    private_pem, public_pem = generate_key_pair()
    user.rsa_public_key = public_pem
    user.rsa_private_key = private_pem

    db.session.add(user)
    db.session.commit()

    return jsonify({**_user_dict(user), 'message': '注册成功'}), 201


# 用户登录（账号需已激活）
# Log in (the account must already be active)
@auth_bp.route('/login', methods=['POST'])
def login():
    data = request.get_json(force=True)

    email = (data.get('email') or '').strip()
    password = data.get('password') or ''

    user = User.query.filter_by(email=email).first()
    # 邮箱不存在与密码错误返回同一条提示，避免暴露账号是否注册
    # Same message for unknown email and wrong password, to avoid account probing
    if not user:
        return jsonify({'error': '邮箱或密码错误'}), 401

    if not user.check_password(password):
        return jsonify({'error': '邮箱或密码错误'}), 401

    if not user.is_active:
        return jsonify({'error': '账户待审批，请联系管理员'}), 403

    login_user(user, remember=False)
    return jsonify(_user_dict(user)), 200


# 登出：清空 session 与 cookie
# Log out: clear the session and the cookie
@auth_bp.route('/logout', methods=['POST'])
def logout():
    session.clear()
    logout_user()
    resp = jsonify({'message': '已登出'})
    resp.set_cookie('session', '', expires=0, max_age=0)
    return resp, 200


# 获取当前登录用户信息
# Return the currently logged-in user
@auth_bp.route('/me', methods=['GET'])
def me():
    if not current_user.is_authenticated:
        return jsonify({'error': '未登录'}), 401
    return jsonify(_user_dict(current_user)), 200

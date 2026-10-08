'''
路由装饰器：管理员权限校验。
Route decorators: admin-only access control.
'''
from functools import wraps

from flask import jsonify
from flask_login import current_user


# 管理员权限装饰器：未登录 401；未激活或非管理员 403
# Admin-only decorator: 401 when anonymous, 403 when inactive or not an admin
def admin_required(f):

    @wraps(f)
    def decorated_function(*args, **kwargs):
        if not current_user.is_authenticated:
            return jsonify({"error": "Authentication required"}), 401
        if not current_user.is_active:
            return jsonify({"error": "Account is deactivated"}), 403
        if not current_user.is_admin:
            return jsonify({"error": "Admin privileges required"}), 403
        return f(*args, **kwargs)

    return decorated_function

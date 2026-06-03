'''
Author: yuanzhenhui 
Date: 2026-06-03 16:12:20
LastEditors: yuanzhenhui 
LastEditTime: 2026-06-03 17:41:24
FilePath: /ops_wiki/decorators.py
'''

from functools import wraps

from flask import jsonify
from flask_login import current_user

# 管理员权限装饰器：未登录返回 401，非活跃或非管理员返回 403
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

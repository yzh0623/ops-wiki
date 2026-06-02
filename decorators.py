"""Ops Wiki — shared decorators for route protection."""

from functools import wraps

from flask import jsonify
from flask_login import current_user


def admin_required(f):
    """Decorator that requires the current user to be authenticated and an admin.

    Returns 401 if not authenticated, 403 if authenticated but not an admin.

    Example:
        @auth_bp.route('/admin-only')
        @admin_required
        def admin_route():
            return jsonify({"ok": True})
    """

    @wraps(f)
    def decorated_function(*args, **kwargs):
        if not current_user.is_authenticated:
            return jsonify({"error": "Authentication required"}), 401
        if not current_user.is_admin:
            return jsonify({"error": "Admin privileges required"}), 403
        return f(*args, **kwargs)

    return decorated_function

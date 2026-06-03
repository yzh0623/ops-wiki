'''
Author: yuanzhenhui yuanzhenhui@paohe.cn
Date: 2026-06-02 08:36:09
LastEditors: yuanzhenhui yuanzhenhui@paohe.cn
LastEditTime: 2026-06-02 16:55:46
FilePath: /ops_wiki/app.py
'''
#!/usr/bin/env python
"""Ops Wiki — Flask application factory."""

import os

from flask import Flask

from extensions import db, login_manager

import models  # noqa: F401 — ensures models are loaded for db.create_all()


def create_app() -> Flask:
    """Create and configure the Flask application."""
    app = Flask(__name__)
    app.config.from_object('config.Config')

    db.init_app(app)
    login_manager.init_app(app)
    login_manager.login_view = None  # JSON API — no Flask-Login redirect

    @login_manager.user_loader
    def load_user(user_id):
        from models import User
        return User.query.get(int(user_id))

    # Enable foreign key enforcement for SQLite (not enabled by default)
    with app.app_context():
        from sqlalchemy import event
        @event.listens_for(db.engine, 'connect')
        def _set_sqlite_pragma(dbapi_conn, _):
            dbapi_conn.execute('PRAGMA foreign_keys=ON')

    from auth import auth_bp
    from views import views_bp
    from admin import admin_bp

    app.register_blueprint(auth_bp, url_prefix='/api/auth')
    app.register_blueprint(views_bp, url_prefix='/api')
    app.register_blueprint(admin_bp, url_prefix='/api/admin')

    with app.app_context():
        db.create_all()

    return app


# Production: use a production WSGI server (gunicorn / uWSGI).
# Never enable debug mode on host='0.0.0.0' in production.
if __name__ == '__main__':
    app = create_app()
    debug_mode = os.environ.get('FLASK_DEBUG', 'false').lower() == 'true'
    app.run(debug=debug_mode, host='0.0.0.0', port=5100)

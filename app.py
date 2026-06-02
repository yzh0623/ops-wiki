#!/usr/bin/env python
"""Ops Wiki — Flask application factory."""

from flask import Flask
from flask_sqlalchemy import SQLAlchemy
from flask_login import LoginManager

db = SQLAlchemy()
login_manager = LoginManager()

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
        db.event.listen(
            db.engine, 'connect',
            lambda dbapi_conn, _: dbapi_conn.execute('PRAGMA foreign_keys=ON'),
        )

    from auth import auth_bp
    from views import views_bp
    from admin import admin_bp

    app.register_blueprint(auth_bp, url_prefix='/api/auth')
    app.register_blueprint(views_bp, url_prefix='/api')
    app.register_blueprint(admin_bp, url_prefix='/api/admin')

    with app.app_context():
        db.create_all()

    return app


if __name__ == '__main__':
    app = create_app()
    app.run(debug=True, host='0.0.0.0', port=5000)

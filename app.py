'''
Author: yuanzhenhui 
Date: 2026-06-02 08:36:09
LastEditors: yuanzhenhui 
LastEditTime: 2026-06-03 17:39:55
FilePath: /ops_wiki/app.py
'''

import os

from flask import Flask
from extensions import db, login_manager

# 创建并配置 Flask 应用
def create_app() -> Flask:
    app = Flask(__name__)
    app.config.from_object('config.Config')

    # 挂载 images 目录，通过 /images/ 访问静态图片
    _basedir = os.path.abspath(os.path.dirname(__file__))
    images_dir = os.path.join(_basedir, 'images')
    os.makedirs(images_dir, exist_ok=True)

    from flask import send_from_directory

    # 图片文件路由
    @app.route('/images/<path:filename>')
    def serve_image(filename):
        return send_from_directory(images_dir, filename)

    db.init_app(app)
    login_manager.init_app(app)
    login_manager.login_view = None  # JSON API，关掉 Flask-Login 默认跳转

    # 从 session 恢复用户对象
    @login_manager.user_loader
    def load_user(user_id):
        from models import User
        return User.query.get(int(user_id))

    # SQLite 默认不开启外键约束，手动打开
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


# 生产环境请用 gunicorn/uWSGI，别在 0.0.0.0 上开 debug
if __name__ == '__main__':
    app = create_app()
    debug_mode = os.environ.get('FLASK_DEBUG', 'false').lower() == 'true'
    app.run(debug=debug_mode, host='0.0.0.0', port=5100)

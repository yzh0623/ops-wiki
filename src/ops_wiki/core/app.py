'''
应用入口：组装 Flask 应用、注册蓝图、挂载图片静态路由。

项目按用途划分：
    src/ops_wiki/
        core/      应用装配、配置、扩展实例
        models/    数据模型
        routes/    蓝图路由（auth、views、admin）
        services/  安全与横切工具（crypto、邮件、权限装饰器）
    web/           前端资源（templates、static）
'''
import os

from flask import Flask, send_from_directory

from .extensions import db, login_manager
from .config import Config


def create_app() -> Flask:
    app = Flask(
        __name__,
        template_folder=os.path.join(Config.WEB_DIR, 'templates'),
        static_folder=os.path.join(Config.WEB_DIR, 'static'),
    )
    app.config.from_object(Config)

    # 挂载图片目录，通过 /images/ 访问静态图片（统一存到个人数据资产的 imgs 目录）
    images_dir = app.config['IMAGES_DIR']
    os.makedirs(images_dir, exist_ok=True)

    @app.route('/images/<path:filename>')
    def serve_image(filename):
        return send_from_directory(images_dir, filename)

    db.init_app(app)
    login_manager.init_app(app)
    login_manager.login_view = None  # JSON API，关掉 Flask-Login 默认跳转

    @login_manager.user_loader
    def load_user(user_id):
        from ..models import User
        return User.query.get(int(user_id))

    # SQLite 默认不开启外键约束，手动打开
    with app.app_context():
        from sqlalchemy import event
        @event.listens_for(db.engine, 'connect')
        def _set_sqlite_pragma(dbapi_conn, _):
            dbapi_conn.execute('PRAGMA foreign_keys=ON')

    from ..routes.auth import auth_bp
    from ..routes.views import views_bp
    from ..routes.admin import admin_bp

    app.register_blueprint(auth_bp, url_prefix='/api/auth')
    app.register_blueprint(views_bp, url_prefix='/api')
    app.register_blueprint(admin_bp, url_prefix='/api/admin')

    with app.app_context():
        db.create_all()
        # 兼容旧库：自动补齐新增列（SQLite 不支持一次性 ALTER 多列，逐列处理）
        _migrate_schema()

    return app


# 旧数据库 schema 迁移：为已存在的 node 表补齐锁定相关字段
def _migrate_schema() -> None:
    from sqlalchemy import inspect as sa_inspect
    inspector = sa_inspect(db.engine)
    if 'node' not in inspector.get_table_names():
        return
    existing = {c['name'] for c in inspector.get_columns('node')}
    migrations = {
        'is_locked': 'BOOLEAN NOT NULL DEFAULT 0',
        'lock_password_hash': 'TEXT',
    }
    for col, ddl in migrations.items():
        if col not in existing:
            with db.engine.begin() as conn:
                conn.execute(db.text(f'ALTER TABLE node ADD COLUMN {col} {ddl}'))


# 生产环境请用 gunicorn/uWSGI，别在 0.0.0.0 上开 debug
if __name__ == '__main__':
    app = create_app()
    debug_mode = os.environ.get('FLASK_DEBUG', 'false').lower() == 'true'
    app.run(debug=debug_mode, host='0.0.0.0', port=5100)

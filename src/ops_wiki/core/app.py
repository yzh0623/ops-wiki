'''
应用入口：组装 Flask 应用、注册蓝图、挂载图片路由、初始化数据库与向量表。
Application entry point: assemble the Flask app, register blueprints, mount the
image route, and initialise the database plus the vector tables.

项目按用途划分 / The project is organised by purpose:
    src/ops_wiki/
        core/      应用装配、配置、扩展实例 (app wiring, config, extensions)
        models/    数据模型 (data models)
        routes/    蓝图路由 auth / views / admin (HTTP blueprints)
        services/  加密、检索、邮件等横切能力 (crypto, retrieval, mail, ...)
    web/           前端资源 templates、static (front-end assets)
'''
import os
import logging

from flask import Flask, send_from_directory

from .extensions import db, login_manager
from .config import Config

logger = logging.getLogger(__name__)


def create_app() -> Flask:
    app = Flask(
        __name__,
        template_folder=os.path.join(Config.WEB_DIR, 'templates'),
        static_folder=os.path.join(Config.WEB_DIR, 'static'),
    )
    app.config.from_object(Config)

    # 响应 JSON 时按请求语言翻译 error / message（默认英文）
    # Translate error/message fields when serialising JSON (English by default)
    from ..services.i18n import I18nJSONProvider
    app.json = I18nJSONProvider(app)

    # 挂载图片目录，通过 /images/ 访问（统一存到个人数据资产的 imgs 目录）
    # Serve the image directory over /images/ (assets stored outside the repo)
    images_dir = app.config['IMAGES_DIR']
    os.makedirs(images_dir, exist_ok=True)

    @app.route('/images/<path:filename>')
    def serve_image(filename):
        return send_from_directory(images_dir, filename)

    db.init_app(app)
    login_manager.init_app(app)
    # 纯 JSON API，关掉 Flask-Login 默认的登录页跳转
    # JSON-only API, so disable the default login-page redirect
    login_manager.login_view = None

    @login_manager.user_loader
    def load_user(user_id):
        from ..models import User
        return User.query.get(int(user_id))

    # SQLite 默认不开外键约束，手动打开；同时在每个连接上加载 sqlite-vec 扩展
    # SQLite does not enforce foreign keys by default; also load sqlite-vec per connection
    with app.app_context():
        from sqlalchemy import event

        @event.listens_for(db.engine, 'connect')
        def _set_sqlite_pragma(dbapi_conn, _):
            dbapi_conn.execute('PRAGMA foreign_keys=ON')
            _load_sqlite_vec(dbapi_conn)

    from ..routes.auth import auth_bp
    from ..routes.views import views_bp
    from ..routes.admin import admin_bp

    app.register_blueprint(auth_bp, url_prefix='/api/auth')
    app.register_blueprint(views_bp, url_prefix='/api')
    app.register_blueprint(admin_bp, url_prefix='/api/admin')

    with app.app_context():
        db.create_all()
        # 兼容旧库：逐列补齐缺失字段（SQLite 不支持一次 ALTER 多列）
        # Backfill missing columns on old databases (one ALTER per column)
        _migrate_schema()
        # 语义检索相关表（与业务表同库）
        # Semantic-search tables, stored in the same database as the business data
        _init_vector_schema()

    # 后台预加载 embedding 模型使其常驻（保存后异步重建向量时即可用）
    # Preload the embedding model in the background so async re-indexing is instant
    if app.config.get('EMBED_WARMUP'):
        try:
            from ..services.index_queue import warmup
            warmup()
        except Exception:
            logger.warning('embedding 模型预加载启动失败 / model preload failed', exc_info=True)

    return app


# 在 sqlite3 连接上加载 sqlite-vec 扩展；失败只告警，不影响其他功能
# Load the sqlite-vec extension on a sqlite3 connection; failure only warns
def _load_sqlite_vec(dbapi_conn) -> None:
    try:
        import sqlite_vec
        dbapi_conn.enable_load_extension(True)
        try:
            sqlite_vec.load(dbapi_conn)
        finally:
            dbapi_conn.enable_load_extension(False)
    except Exception:
        logger.warning('sqlite-vec 扩展加载失败，语义检索将不可用 / '
                       'sqlite-vec failed to load, semantic search disabled',
                       exc_info=True)


# 幂等创建向量检索相关表：node_chunk / vec_index_state / vec_meta / vec0 虚拟表
# Idempotently create the vector tables: node_chunk, vec_index_state, vec_meta, vec0
def _init_vector_schema() -> None:
    try:
        from ..services import vector_store as vs
        raw = db.engine.raw_connection()
        try:
            vs.ensure_schema(raw.driver_connection)
        finally:
            raw.close()
    except Exception:
        logger.warning('向量检索表初始化失败，语义检索将不可用 / '
                       'vector table init failed, semantic search disabled',
                       exc_info=True)


# 旧库迁移：为已存在的 node 表补齐文章锁定相关字段
# Migrate old databases: add the article-lock columns to an existing node table
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


# 生产环境请用 gunicorn/uWSGI，不要把 debug 开在 0.0.0.0 上
# Use gunicorn/uWSGI in production; never expose debug mode on 0.0.0.0
if __name__ == '__main__':
    app = create_app()
    debug_mode = os.environ.get('FLASK_DEBUG', 'false').lower() == 'true'
    app.run(debug=debug_mode, host='0.0.0.0', port=5100)

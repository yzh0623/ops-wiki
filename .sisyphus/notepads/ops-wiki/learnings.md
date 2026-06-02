# Learnings

## 2026-06-02 — Project Scaffold (Task 1)

- Flask-Login `LoginManager()` must be initialized at module level (not inside factory) so models can reference `login_manager.user_loader` decorator later
- SQLite connection timeout=5 to handle concurrent writes when multiple workers access the DB
- Blueprints registered with `url_prefix` at registration time, not in the Blueprint constructor
- `db.create_all()` runs inside `app.app_context()` in the factory — no `@app.before_first_request` needed (deprecated in Flask 2.3+)
- Conda python at `/Users/yuanzhenhui/Documents/anaconda3/envs/ops/bin/python` — pip mirrors configured to tsinghua + aliyun

## 2026-06-02 — Database Models (Task 2)

- `import models` must go AFTER `db = SQLAlchemy()` (line 8) to avoid circular import — models.py does `from app import db` which needs `app.db` to exist
- SQLite FK enforcement requires `db.event.listen(db.engine, 'connect', ...)` with `PRAGMA foreign_keys=ON` — not enabled by default in SQLite
- Node model self-referential FK: `ForeignKey('node.id', ondelete='SET NULL')` — when parent deleted, children's parent_id becomes NULL
- `__table_args__` with `UniqueConstraint('parent_id', 'title', name='uq_parent_title')` prevents duplicate sibling titles
- `children = db.relationship('Node', backref=db.backref('parent', remote_side=[id]), lazy='dynamic')` — `remote_side=[id]` disambiguates the self-referential join

## 2026-06-02 — Auth API (Task 3)

- `UserMixin.is_active` is a property returning `True` by default, but when a SQLAlchemy column has the same name (`is_active`), SQLAlchemy's descriptor takes precedence — so `user.is_active` returns the DB column value correctly.
- `login_manager.login_view = None` prevents Flask-Login from redirecting unauthenticated users to an HTML login page. All auth errors are returned as JSON — critical for an API-only backend.
- `user_loader` is defined inside `create_app()` using a closure (not a module-level decorator) to avoid circular import with `models.py`. The `from models import User` is done lazily inside the callback.
- First-user auto-admin pattern: `User.query.count() == 0` check before creating the user. If count is 0, the registering user gets `is_active=True, is_admin=True`.
- Delete with re-parenting: deleting a parent node reparents its children to the deleted node's parent via `Node.query.filter_by(parent_id=node_id).update({'parent_id': node.parent_id})` before deleting the node.
- Import uses multipart form-data; filename sans extension becomes the node title. Only `.md` files are accepted.
- Search uses `ILIKE` for case-insensitive title matching. Chinese characters need URL encoding in the query string.
- Admin panel: `@admin_required` decorator checks `current_user.is_admin`. Returns 401 if not authenticated, 403 if not admin.
- Self-deactivation is prevented by comparing `user.id == current_user.id` in the deactivate endpoint.
- Email validation uses a simple regex `.+@.+\..+` (not full RFC 5322) — sufficient for a wiki application.
- `@login_required` is imported but not used in `auth.py` — it will be used in `views.py`/`admin.py` to protect wiki content routes.
- `_user_dict()` helper avoids duplicating the user-to-dict serialization across 4 routes.

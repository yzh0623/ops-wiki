# Ops Wiki - 运维日常记录系统

## TL;DR

> **Quick Summary**: 构建一个基于 Flask + SQLite 的轻量级运维 Wiki 系统，支持无限层级树形文档管理、Markdown 编辑（ToastUI Editor 分屏实时预览）、RBAC 用户审批权限控制。
>
> **Deliverables**:
> - Python Flask 后端（conda env: ops）
> - 单页 HTML+JS 前端（无框架）
> - SQLite 数据库（根目录 wiki.sqlite）
> - 完整的 RBAC 权限系统
> - 无限层级树形文档管理
> - Markdown 文章导入、编辑、HTML 预览
> - 标题搜索 + 关键词高亮
>
> **Estimated Effort**: Medium
> **Parallel Execution**: YES - 5 waves
> **Critical Path**: Wave 1 → Wave 2 → Wave 3 → Wave 4 → Wave F

---

## Context

### Original Request
用户需要一个用于运维日常记录的简单 wiki 系统。后端 Python Flask，存储 SQLite，前端纯 HTML+JS。支持 RBAC 权限控制（邮箱注册→超管审批→登录），无限层级树形结构（第一层文档，后续文章），Markdown 编辑/导入/预览，标题搜索与关键词高亮。

### Interview Summary
**Key Decisions**:
- **Web 框架**: Flask（轻量简洁）
- **Markdown 编辑器**: ToastUI Editor (tui.editor)，CDN 加载（后续可本地化）
- **注册方式**: 仅邮箱+密码表单，无需 SMTP 验证
- **超管创建**: 第一个注册用户自动成为超管
- **节点排序**: 按创建时间自动排序
- **搜索方式**: 客户端 JS 过滤（适合中小规模）
- **身份认证**: Flask-Login + Session，无需 JWT
- **前端布局**: 纯 HTML+JS SPA，无框架

**Scope Exclusions (v1)**:
- 图片/文件上传、全文搜索、拖拽排序、深色模式
- 自动保存/版本历史、密码找回、PDF/HTML 导出
- 回收站、响应式/移动端、用户个人资料、i18n

### Metis Review
**Identified Gaps** (addressed):
- **SQLite 并发**: 设置 SQLALCHEMY_ENGINE_OPTIONS timeout=5
- **XSS 防护**: 节点标题使用 textContent 而非 innerHTML，后端使用 escape()
- **CDN 加载失败**: 实现回退到原生 textarea
- **所有操作必须有加载/错误/空状态**: 已作为每个任务的 QA 必要条件
- **删除节点事务**: 子节点重新挂载需在单个事务中完成
- **上传限制**: .md 文件最大 10MB，严格限制扩展名

---

## Work Objectives

### Core Objective
构建一个可用于运维团队日常记录、知识沉淀的 wiki 系统，满足文档管理、在线编辑、权限控制等基础需求。

### Concrete Deliverables
- Flask 后端 API 服务（端口 5000）
- 单页 SPA 前端（左侧树 + 右侧编辑器）
- SQLite 数据库（User 表 + Node 表）
- 完整的注册-审批-登录流程
- 无限层级树形节点 CRUD
- Markdown 文件导入
- 标题模糊搜索
- 文章内容关键词高亮
- 超管用户管理面板

### Definition of Done
- [ ] 启动 `flask run` 后浏览器打开 http://localhost:5000 可访问
- [ ] 注册 → 超管审批 → 登录 → 创建/编辑/删除 全流程跑通
- [ ] ToastUI Editor 正常加载，分屏编辑、HTML 预览、保存均可用
- [ ] 导入 .md 文件生成子节点
- [ ] 删除节点子节点自动上移
- [ ] 搜索框和关键词高亮正常工作

### Must Have
- RBAC：注册用户需超管审批后才能登录
- 无限层级树：第一层固定为文档类型
- 删除节点：子节点重新挂载到父节点
- Markdown 编辑：分屏实时预览
- 标题搜索 + 内容关键词高亮
- 导入 .md 文件生成节点

### Must NOT Have (Guardrails)
- 不要图片/文件上传功能
- 不要全文搜索（仅搜索标题）
- 不要拖拽树重整
- 不要深色模式或主题切换
- 不要自动保存或版本历史
- 不要密码找回功能
- 不要响应式/移动端布局
- 不要 i18n 国际化

---

## Verification Strategy

> **ZERO HUMAN INTERVENTION** - ALL verification is agent-executed. No exceptions.

### Test Decision
- **Infrastructure exists**: NO (bare conda env)
- **Automated tests**: NO (no unit tests for this project)
- **Framework**: None - manual QA via curl + browser verification

### QA Policy
Every task MUST include agent-executed QA scenarios.
Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **API/Backend**: Use Bash (curl) - Send requests, assert status + response fields
- **Frontend/UI**: Use Playwright - Navigate, interact, assert DOM, screenshot
- **Integration**: Full curl → browser workflow verification

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Foundation - 4 tasks, MAX PARALLEL):
├── Task 1: Project scaffold (app.py, config.py, requirements.txt)
├── Task 2: Database models (User, Node)
├── Task 3: Auth API (register, login, logout, me)
└── Task 4: Admin system (seed admin, list users, approve)

Wave 2 (Backend Core - 4 tasks, MAX PARALLEL):
├── Task 5: Node CRUD API (create, read, update, delete)
├── Task 6: Tree structure API (recursive build)
├── Task 7: Node delete re-parenting + import API
└── Task 8: Search API (title search)

Wave 3 (Frontend Skeleton - 3 tasks):
├── Task 9: SPA layout + CSS
├── Task 10: Auth UI (login/register modals)
└── Task 11: ToastUI Editor CDN integration + initialization

Wave 4 (Frontend Components - 4 tasks, MAX PARALLEL):
├── Task 12: Tree component (recursive rendering, expand/collapse, filter)
├── Task 13: Editor component (3 modes, save, keyword highlight)
└── Task 14: Admin panel page

Wave F (Final - 4 parallel reviews):
├── Task F1: Plan compliance audit (oracle)
├── Task F2: Code quality review (unspecified-high)
├── Task F3: Real manual QA (unspecified-high)
└── Task F4: Scope fidelity check (deep)
```

### Dependency Matrix
- **1-4**: None (Wave 1 parallel) → Blocks 5-8
- **5**: 2, 3 → Blocks 6, 7, 8
- **6**: 5 → Blocks 12
- **7**: 2, 3 → Blocks 13
- **8**: 3 → Blocks 12
- **9**: 3 → Blocks 10, 11, 12, 13
- **10**: 3, 9 → None
- **11**: 9 → Blocks 13
- **12**: 6, 8, 9 → None
- **13**: 7, 9, 11 → None
- **14**: 4, 9 → None

Critical Path: Task 1 → 2 → 3 → 5 → 6/7/8 → 9 → 11 → 13 → F1-F4

---

## TODOs

> Implementation + QA = ONE Task. Never separate.
> EVERY task MUST have QA Scenarios. A task WITHOUT QA Scenarios is INCOMPLETE.

- [x] 1. **Project Scaffold — Flask 基础结构搭建**

  **What to do**:
  - 创建 `app.py`：Flask 应用工厂，注册蓝图，SQLAlchemy 初始化，Flask-Login 初始化，配置加载
  - 创建 `config.py`：`Config` 类（SECRET_KEY, SQLALCHEMY_DATABASE_URI="sqlite:///wiki.sqlite", SQLALCHEMY_ENGINE_OPTIONS={"connect_args": {"timeout": 5}}）
  - `requirements.txt`：Flask, Flask-SQLAlchemy, Flask-Login, Markdown, Werkzeug
  - 创建 `auth.py`、`views.py`、`admin.py` 作为蓝图占位
  - `.gitignore`：wiki.sqlite, __pycache__, .env
  - 在 `app.py` 顶部添加 shebang 指向 conda python：`#!/usr/bin/env python` 并设置环境激活方式

  **Must NOT do**:
  - 不要添加任何业务逻辑，仅搭架子
  - 不要使用 `text()` 或原生 SQL

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: [`python-expert`]
    - `python-expert`: Flask 项目结构、conda 环境配置

  **Parallelization**:
  - **Can Run In Parallel**: YES (Wave 1)
  - **Parallel Group**: Wave 1 (with Tasks 2, 3, 4)
  - **Blocks**: Tasks 5, 6, 7, 8, 9
  - **Blocked By**: None

  **Acceptance Criteria**:
  - [ ] Flask app 启动成功：python app.py → 监听 0.0.0.0:5000
  - [ ] curl http://localhost:5000/ 返回 200（即使页面空白）

  **QA Scenarios**:
  ```
  Scenario: Flask app starts and responds
    Tool: Bash (timeout)
    Preconditions: Clean directory, no wiki.sqlite
    Steps:
      1. pip install -r /Users/yuanzhenhui/Documents/code_space/git/processing/python/ops_wiki/requirements.txt
      2. export FLASK_APP=app.py; flask run --port 5000 & (background)
      3. sleep 2
      4. curl -s -o /dev/null -w "%{http_code}" http://localhost:5000/
    Expected Result: HTTP 200
    Failure Indicators: curl fails, port not listening, python import error
    Evidence: .sisyphus/evidence/task-1-flask-start.txt

  Scenario: SQLite database created
    Tool: Bash
    Preconditions: Flask has run once
    Steps:
      1. ls -la wiki.sqlite
      2. python -c "import sqlite3; conn=sqlite3.connect('wiki.sqlite'); print(conn.execute('SELECT name FROM sqlite_master').fetchall())"
    Expected Result: wiki.sqlite exists, tables exist
    Evidence: .sisyphus/evidence/task-1-sqlite-init.txt
  ```

  **Commit**: YES
  - Message: `chore: scaffold flask project structure`
  - Files: app.py, config.py, requirements.txt, .gitignore, auth.py, views.py, admin.py
  - Pre-commit: python -m py_compile app.py

---

- [x] 2. **Database Models — User 与 Node 模型**

  **What to do**:
  - 创建 `models.py`
  - `User` 模型：id, email (unique, not null), password_hash, nickname, is_active (default=0), is_admin (default=0), created_at
  - `Node` 模型：id, parent_id (FK→nodes.id, nullable), title (not null), content (Text, default=''), type (default='document'), sort_order (default=0), created_at, updated_at
  - `UniqueConstraint('parent_id', 'title', name='uq_parent_title')` — 同级节点标题唯一
  - `password_hash` 使用 Werkzeug 的 `generate_password_hash` / `check_password_hash`
  - `__repr__` 方法
  - 导入到 `app.py`，在 `create_app()` 中 `db.init_app(app)`

  **Must NOT do**:
  - 不要添加与 User 或 Node 无关的模型
  - 不要使用 `db.text()` 或原生 SQL

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: [`python-expert`]
    - `python-expert`: SQLAlchemy 模型设计、关系映射

  **Parallelization**:
  - **Can Run In Parallel**: YES (Wave 1)
  - **Parallel Group**: Wave 1 (with Tasks 1, 3, 4)
  - **Blocks**: Tasks 5, 7
  - **Blocked By**: Task 1

  **Acceptance Criteria**:
  - [ ] python -c "from models import User, Node" 无错误
  - [ ] 数据库表自动创建：sqlite3 wiki.sqlite ".tables" → user, node

  **QA Scenarios**:
  ```
  Scenario: Models import and DB tables created
    Tool: Bash
    Preconditions: Task 1 completed, app.py imports models
    Steps:
      1. rm -f wiki.sqlite
      2. echo "from app import create_app; app = create_app(); app.app_context().push(); from models import db; db.create_all()" | python
      3. sqlite3 wiki.sqlite ".tables"
    Expected Result: Output contains "user" and "node"
    Evidence: .sisyphus/evidence/task-2-models-tables.txt

  Scenario: Unique constraint works
    Tool: Bash
    Preconditions: DB created, User model works
    Steps:
      1. Use python to create two users with same email
      2. Assert second insert raises IntegrityError
    Expected Result: Duplicate email raises IntegrityError
    Evidence: .sisyphus/evidence/task-2-unique-constraint.txt
  ```

  **Commit**: YES (groups with Task 3)
  - Message: part of auth implementation
  - Files: models.py

---

- [x] 3. **Auth API — 用户注册、登录、登出、当前用户**

  **What to do**:
  - 在 `auth.py` 中实现 Flask Blueprint `auth_bp`，url_prefix='/api/auth'
  - `POST /api/auth/register`：
    - 接收 JSON: email, password, nickname
    - 验证 email 格式、password 长度 >= 6
    - 创建 User(is_active=0, is_admin=0)
    - 如果这是第一个用户 → is_active=1, is_admin=1（自动超管）
    - 返回 201 + user info
  - `POST /api/auth/login`：
    - 接收 JSON: email, password
    - 验证用户存在、密码正确
    - 检查 is_active=1，否则返回 403 "账户待审批"
    - Flask-Login login_user()
    - 返回 200 + user info
  - `POST /api/auth/logout`：
    - logout_user()
    - 返回 200
  - `GET /api/auth/me`：
    - 返回当前用户信息（含 is_admin）
    - 未登录返回 401
  - 集成 Flask-Login: `login_manager = LoginManager()`，`login_manager.init_app(app)`
  - `@login_manager.user_loader` 回调
  - `@login_manager.unauthorized_handler` 返回 JSON 401
  - 创建 `decorators.py`：`@admin_required` 装饰器，检查 current_user.is_admin

  **Must NOT do**:
  - 不要发送邮件
  - 不要实现密码找回
  - 不要实现 token/JWT 认证

  **Recommended Agent Profile**:
  - **Category**: `deep`
  - **Skills**: [`python-expert`]
    - `python-expert`: Flask-Login 集成、密码哈希、会话管理

  **Parallelization**:
  - **Can Run In Parallel**: YES (Wave 1)
  - **Parallel Group**: Wave 1 (with Tasks 1, 2, 4)
  - **Blocks**: Tasks 5, 7, 8, 10
  - **Blocked By**: Task 1, 2

  **Acceptance Criteria**:
  - [ ] 注册 API: curl -X POST -H "Content-Type: application/json" -d '{"email":"admin@test.com","password":"123456","nickname":"admin"}' http://localhost:5000/api/auth/register → 201
  - [ ] 注册后第一个用户自动成为超管：curl 结果中 is_admin=true
  - [ ] 未审批用户登录: curl -X POST ... 第二个用户 → 403 "账户待审批"
  - [ ] 登录后访问 /api/auth/me 返回用户信息

  **QA Scenarios**:
  ```
  Scenario: First user registers and becomes admin
    Tool: Bash (curl)
    Preconditions: Fresh DB, server running
    Steps:
      1. curl -s -X POST http://localhost:5000/api/auth/register \
           -H "Content-Type: application/json" \
           -d '{"email":"admin@test.com","password":"admin123","nickname":"超管"}'
      2. echo "Response should have is_admin=true"
    Expected Result: HTTP 201, response JSON contains "is_admin": true
    Evidence: .sisyphus/evidence/task-3-register-admin.json

  Scenario: Second user registers (pending approval)
    Tool: Bash (curl)
    Preconditions: First user registered as admin
    Steps:
      1. curl -s -X POST http://localhost:5000/api/auth/register \
           -H "Content-Type: application/json" \
           -d '{"email":"user@test.com","password":"user123","nickname":"用户"}'
      2. Try login: curl -s -X POST http://localhost:5000/api/auth/login \
           -H "Content-Type: application/json" \
           -d '{"email":"user@test.com","password":"user123"}'
    Expected Result: Register returns 201 with is_admin=false
      Login returns 403 with "账户待审批"
    Evidence: .sisyphus/evidence/task-3-register-pending.json

  Scenario: Login and session works
    Tool: Bash (curl with cookie jar)
    Preconditions: Admin user exists, server running
    Steps:
      1. LOGIN=$(curl -s -c cookies.txt -X POST http://localhost:5000/api/auth/login \
           -H "Content-Type: application/json" \
           -d '{"email":"admin@test.com","password":"admin123"}')
      2. ME=$(curl -s -b cookies.txt http://localhost:5000/api/auth/me)
      3. curl -s -b cookies.txt -X POST http://localhost:5000/api/auth/logout
      4. curl -s -b cookies.txt http://localhost:5000/api/auth/me
    Expected Result: Login → 200 with user info; /me → email matches; logout → 200; /me after logout → 401
    Evidence: .sisyphus/evidence/task-3-auth-session.txt
  ```

  **Commit**: YES (groups with Task 2)
  - Message: `feat: implement user auth models and api`
  - Files: auth.py, decorators.py, models.py
  - Pre-commit: python -m py_compile auth.py decorators.py

---

- [x] 4. **Admin System — 超管用户管理面板**

  **What to do**:
  - 在 `admin.py` 中实现 Blueprint `admin_bp`，url_prefix='/api/admin'
  - `GET /api/admin/users`：
    - 返回所有用户列表（id, email, nickname, is_active, is_admin, created_at）
  - `POST /api/admin/users/<id>/approve`：
    - 设置 is_active=1
    - 返回 200 + updated user
  - `POST /api/admin/users/<id>/deactivate`：
    - 设置 is_active=0
    - 返回 200 + updated user
  - 所有路由必须使用 `@admin_required` 装饰器
  - 超管不能将自己 deactivate

  **Must NOT do**:
  - 不要实现用户删除
  - 不要实现角色/权限编辑（v1 只有 user 和 admin）

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: [`python-expert`]
    - `python-expert`: Flask Blueprint、装饰器模式

  **Parallelization**:
  - **Can Run In Parallel**: YES (Wave 1)
  - **Parallel Group**: Wave 1 (with Tasks 1, 2, 3)
  - **Blocks**: Task 14
  - **Blocked By**: Task 1, 2, 3

  **Acceptance Criteria**:
  - [ ] curl -b cookies.txt http://localhost:5000/api/admin/users → 用户列表
  - [ ] 非超管访问 → 403
  - [ ] 审批用户后，该用户可以登录

  **QA Scenarios**:
  ```
  Scenario: Admin approves pending user
    Tool: Bash (curl with cookie jar)
    Preconditions: Admin logged in, pending user "user@test.com" exists
    Steps:
      1. curl -s -b cookies.txt http://localhost:5000/api/admin/users
      2. Find pending user's ID from JSON
      3. curl -s -b cookies.txt -X POST http://localhost:5000/api/admin/users/2/approve
      4. Try login as user: curl -X POST http://localhost:5000/api/auth/login \
           -H "Content-Type: application/json" \
           -d '{"email":"user@test.com","password":"user123"}'
    Expected Result: List shows user with is_active=false; approve returns 200; login now succeeds
    Evidence: .sisyphus/evidence/task-4-approve-user.json

  Scenario: Non-admin cannot access admin API
    Tool: Bash (curl with cookie jar)
    Preconditions: Non-admin user logged in (cookies_b)
    Steps:
      1. curl -s -b cookies_b.txt http://localhost:5000/api/admin/users
    Expected Result: HTTP 403
    Evidence: .sisyphus/evidence/task-4-non-admin-403.txt
  ```

  **Commit**: YES
  - Message: `feat: admin user management and approval`
  - Files: admin.py, decorators.py

---

- [x] 5. **Node CRUD API — 节点的创建、读取、更新**

  **What to do**:
  - 在 `views.py` 中实现 Blueprint `views_bp`，url_prefix='/api'
  - `POST /api/nodes`：
    - 接收 JSON: parent_id (nullable), title, type ('document'/'article')
    - 验证：title 非空，type 有效
    - 检查同级标题唯一性（同一 parent_id 下 title 不能重复）
    - 如果 parent_id 是 None，type 必须为 'document'
    - sort_order 自动设为同级节点最大+1
    - 返回 201 + node
  - `GET /api/nodes/<id>`：
    - 返回节点详情（含 content 字段）
    - 404 if not found
  - `PUT /api/nodes/<id>`：
    - 接收 JSON: title, content (可选)
    - 只更新提供的字段
    - 更新 updated_at
    - 返回 200 + updated node
  - 所有路由使用 `@login_required`

  **Must NOT do**:
  - 不要支持节点移动/重排（v1 不支持拖拽）
  - 不要修改父节点（v1 固定树结构）

  **Recommended Agent Profile**:
  - **Category**: `deep`
  - **Skills**: [`python-expert`]
    - `python-expert`: SQLAlchemy CRUD、事务管理、输入验证

  **Parallelization**:
  - **Can Run In Parallel**: YES (Wave 2)
  - **Parallel Group**: Wave 2 (with Tasks 6, 7, 8)
  - **Blocks**: Tasks 6, 7, 8
  - **Blocked By**: Tasks 2, 3

  **Acceptance Criteria**:
  - [ ] 创建根文档: POST /api/nodes {"title":"运维规范","type":"document"} → 201
  - [ ] 创建子文章: POST /api/nodes {"parent_id":1,"title":"服务器部署","type":"article"} → 201
  - [ ] 获取节点: GET /api/nodes/1 → 200 + node data
  - [ ] 更新节点: PUT /api/nodes/1 {"title":"新标题","content":"# Markdown"} → 200
  - [ ] 同级重复标题: POST 另一个同名节点 → 409
  - [ ] 根级文章: POST /api/nodes {"title":"test","type":"article"} → 400

  **QA Scenarios**:
  ```
  Scenario: Create root document
    Tool: Bash (curl)
    Preconditions: Admin logged in (cookies.txt)
    Steps:
      1. RESP=$(curl -s -b cookies.txt -X POST http://localhost:5000/api/nodes \
           -H "Content-Type: application/json" \
           -d '{"title":"运维规范","type":"document"}')
      2. echo "$RESP" | python -c "import sys,json; d=json.load(sys.stdin); print(d['id'], d['title'], d['type'])"
    Expected Result: Returns node with id, title="运维规范", type="document"
    Evidence: .sisyphus/evidence/task-5-create-node.json

  Scenario: Create child article and duplicate title rejection
    Tool: Bash (curl)
    Preconditions: Root node exists (id=1)
    Steps:
      1. curl -s -b cookies.txt -X POST http://localhost:5000/api/nodes \
           -H "Content-Type: application/json" \
           -d '{"parent_id":1,"title":"服务器部署","type":"article"}'
      2. curl -s -b cookies.txt -X POST http://localhost:5000/api/nodes \
           -H "Content-Type: application/json" \
           -d '{"parent_id":1,"title":"服务器部署","type":"article"}'
    Expected Result: First returns 201, second returns 409
    Evidence: .sisyphus/evidence/task-5-duplicate-title.json

  Scenario: Update node content
    Tool: Bash (curl)
    Preconditions: Node id=2 exists
    Steps:
      1. curl -s -b cookies.txt -X PUT http://localhost:5000/api/nodes/2 \
           -H "Content-Type: application/json" \
           -d '{"title":"更新标题","content":"# Hello World\n\n这是更新后的内容"}'
      2. curl -s -b cookies.txt http://localhost:5000/api/nodes/2
    Expected Result: PUT returns 200 with updated fields; GET returns the new content
    Evidence: .sisyphus/evidence/task-5-update-node.json
  ```

  **Commit**: YES (groups with Task 6)
  - Message: `feat: node crud and tree api`
  - Files: views.py

---

- [x] 6. **Tree Structure API — 递归树结构返回**

  **What to do**:
  - 在 `views.py` 中添加 `GET /api/nodes`：
    - 从数据库查询所有节点（id, parent_id, title, type, sort_order），按 sort_order 和 created_at 排序
    - 使用递归函数在 Python 端构建树结构（而非前端构建）
    - 返回格式：`{nodes: [{id, title, type, children: [...]}]}`
    - children 为空数组 [] 而非 null
    - 返回数据不包含 content 字段（减少传输量），仅包含树结构信息
  - 添加 `GET /api/nodes?flat=true`：
    - 返回所有节点的扁平列表（含 id, parent_id, title, type）
    - 用于前端搜索功能

  **Must NOT do**:
  - 不要在单个请求中返回 content
  - 不要使用递归 CTE（SQLite 支持有限，用 Python 构建）

  **Recommended Agent Profile**:
  - **Category**: `deep`
  - **Skills**: [`python-expert`]
    - `python-expert`: 递归数据结构、API 设计

  **Parallelization**:
  - **Can Run In Parallel**: YES (Wave 2)
  - **Parallel Group**: Wave 2 (with Tasks 5, 7, 8)
  - **Blocks**: Task 12
  - **Blocked By**: Task 5

  **Acceptance Criteria**:
  - [ ] GET /api/nodes 返回嵌套树结构
  - [ ] GET /api/nodes?flat=true 返回扁平列表
  - [ ] 空数据库返回 {nodes: []}

  **QA Scenarios**:
  ```
  Scenario: Get nested tree structure
    Tool: Bash (curl)
    Preconditions: DB has root doc (id=1 with child id=2, child id=3)
    Steps:
      1. RESP=$(curl -s -b cookies.txt http://localhost:5000/api/nodes)
      2. echo "$RESP" | python -c "import sys,json; d=json.load(sys.stdin); print(json.dumps(d['nodes'], indent=2, ensure_ascii=False))"
    Expected Result: Response has nested structure: root→children→children
    Evidence: .sisyphus/evidence/task-6-tree-structure.json

  Scenario: Get flat node list
    Tool: Bash (curl)
    Preconditions: Same as above
    Steps:
      1. curl -s -b cookies.txt "http://localhost:5000/api/nodes?flat=true"
    Expected Result: Returns flat array of all nodes with id, parent_id, title, type
    Evidence: .sisyphus/evidence/task-6-flat-list.json
  ```

  **Commit**: YES (groups with Task 5)
  - Message: part of node crud and tree api
  - Files: views.py

---

- [x] 7. **Node Delete + Markdown Import — 节点删除与文章导入**

  **What to do**:
  - **Delete API** (`DELETE /api/nodes/<id>`)：
    - 禁止删除根级文档的最后一级（至少保留一个文档？不需要，允许删除所有）
    - 查询该节点的所有直接子节点
    - 在单个事务中：
      1. 将所有直接子节点的 parent_id 更新为被删除节点的 parent_id
      2. 删除目标节点
    - 自动级联：如果子节点也有子节点，它们保持不变（只是 parent_id 变了）
    - 返回 200 + {message: "节点已删除，N 个子节点已上移"}
  - **Import API** (`POST /api/nodes/<id>/import`)：
    - 接收 multipart/form-data，字段名 `file`
    - 验证：仅接受 .md 扩展名，最大 10MB
    - 读取文件内容，文件名去掉扩展名作为 title
    - 创建新节点：parent_id=目标节点 id, title=文件名, type='article', content=文件内容
    - 返回 201 + new node
    - 如果目标节点不存在 → 404
  - 所有路由使用 `@login_required`

  **Must NOT do**:
  - 不支持软删除（无回收站）
  - 不支持 .md 文件的 frontmatter 解析
  - 不支持 .zip 批量导入

  **Recommended Agent Profile**:
  - **Category**: `deep`
  - **Skills**: [`python-expert`]
    - `python-expert`: 事务管理、文件上传处理、SQLAlchemy 批量更新

  **Parallelization**:
  - **Can Run In Parallel**: YES (Wave 2)
  - **Parallel Group**: Wave 2 (with Tasks 5, 6, 8)
  - **Blocks**: Task 13
  - **Blocked By**: Tasks 2, 3

  **Acceptance Criteria**:
  - [ ] 删除节点后子节点 parent_id 更新为被删节点的 parent_id
  - [ ] 删除后访问被删节点 → 404
  - [ ] 导入 .md 文件创建子节点
  - [ ] 导入非 .md 文件 → 400
  - [ ] 导入超过 10MB → 413

  **QA Scenarios**:
  ```
  Scenario: Delete node with children re-parenting
    Tool: Bash (curl)
    Preconditions: Tree: A(1) → B(2) → C(3), where B has children C. B's parent_id=1, C's parent_id=2
    Steps:
      1. curl -s -b cookies.txt -X DELETE http://localhost:5000/api/nodes/2
      2. curl -s -b cookies.txt http://localhost:5000/api/nodes/3
      3. curl -s -b cookies.txt http://localhost:5000/api/nodes/2
    Expected Result: Delete returns 200; GET /nodes/3 shows parent_id=1 (was 2); GET /nodes/2 returns 404
    Evidence: .sisyphus/evidence/task-7-delete-reparent.json

  Scenario: Import markdown file
    Tool: Bash (curl)
    Preconditions: Root node id=1 exists; create test.md file
    Steps:
      1. echo -e "# 测试文章\n\n这是导入的 markdown 内容" > /tmp/test_import.md
      2. curl -s -b cookies.txt -X POST http://localhost:5000/api/nodes/1/import \
           -F "file=@/tmp/test_import.md"
      3. curl -s -b cookies.txt http://localhost:5000/api/nodes/$(echo $RESP | python -c "import sys,json; print(json.load(sys.stdin)['id'])")
    Expected Result: Import returns 201 with title="test_import"; GET confirms content matches
    Evidence: .sisyphus/evidence/task-7-import-md.json

  Scenario: Import non-markdown file rejected
    Tool: Bash (curl)
    Preconditions: Root node id=1
    Steps:
      1. echo "not markdown" > /tmp/test.txt
      2. curl -s -b cookies.txt -X POST http://localhost:5000/api/nodes/1/import \
           -F "file=@/tmp/test.txt"
    Expected Result: HTTP 400, error indicates only .md files accepted
    Evidence: .sisyphus/evidence/task-7-import-reject.txt
  ```

  **Commit**: YES
  - Message: `feat: node delete re-parenting and markdown import`
  - Files: views.py

---

- [x] 8. **Search Support — 标题搜索辅助**

  **What to do**：
  - `GET /api/nodes?flat=true` already returns flat list (covered in task 6)
  - 这一步主要确认前端搜索不需要额外后端 API，task 6 的 flat 模式已满足需求
  - 在 `views.py` 中添加可选的 `GET /api/nodes/search?q=keyword`：
    - 返回标题包含 keyword 的节点扁平列表（用 LIKE '%keyword%'）
    - 每个结果包含 id, parent_id, title, type
    - 搜索不区分大小写（SQLite LIKE 默认不区分）
    - 如果 q 为空或未提供，返回空数组

  **Must NOT do**:
  - 不要搜索 content 字段
  - 不要实现全文索引

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: [`python-expert`]
    - `python-expert`: SQLAlchemy 查询

  **Parallelization**:
  - **Can Run In Parallel**: YES (Wave 2)
  - **Parallel Group**: Wave 2 (with Tasks 5, 6, 7)
  - **Blocks**: Task 12
  - **Blocked By**: Task 5, 3

  **Acceptance Criteria**:
  - [ ] curl "http://localhost:5000/api/nodes/search?q=运维" → 返回标题包含"运维"的节点
  - [ ] curl "http://localhost:5000/api/nodes/search?q=" → 返回空数组

  **QA Scenarios**:
  ```
  Scenario: Search nodes by title keyword
    Tool: Bash (curl)
    Preconditions: Nodes exist with titles "运维规范", "服务器部署指南", "日常巡检"
    Steps:
      1. curl -s -b cookies.txt "http://localhost:5000/api/nodes/search?q=运维"
      2. curl -s -b cookies.txt "http://localhost:5000/api/nodes/search?q=部署"
      3. curl -s -b cookies.txt "http://localhost:5000/api/nodes/search?q=不存在的关键词"
    Expected Result: "运维" returns ["运维规范"]; "部署" returns ["服务器部署指南"]; no match returns []
    Evidence: .sisyphus/evidence/task-8-search.txt
  ```

  **Commit**: YES
  - Message: `feat: title search api`
  - Files: views.py

---

- [x] 9. **SPA Layout + CSS — 前端整体布局与样式**

  **What to do**:
  - 创建 `templates/index.html`：
    - 基本的 HTML5 结构
    - 包含 ToastUI Editor 的 CDN CSS（非阻塞加载）
    - 包含自定义 CSS: `<link rel="stylesheet" href="/static/css/style.css">`
    - 包含 JS 文件: `api.js`, `app.js`, `tree.js`, `editor.js`, `auth.js`
    - 包含 ToastUI Editor JS CDN：`<script src="https://cdn.jsdelivr.net/npm/@toast-ui/editor@3.2.2/dist/toastui-editor.min.js"></script>`
    - 包含中文语言包: `<script src="https://cdn.jsdelivr.net/npm/@toast-ui/editor@3.2.2/dist/i18n/zh-cn.js"></script>`
    - body 结构：
      - 顶部导航栏（logo、用户信息、登出按钮）
      - 主体：左侧 sidebar + 右侧 editor area
      - 左侧 sidebar：上方搜索框 + 树容器
      - 右侧 editor area：上方工具栏行（按钮组 + 保存 + 关键词输入框）+ 编辑器容器
  - 创建 `static/css/style.css`：
    - 全局 reset: margin:0, padding:0, box-sizing:border-box
    - 顶部导航栏: flex, height 50px, background #2c3e50, color white
    - 主体: flex, height calc(100vh - 50px)
    - 左侧 sidebar: width 300px, min-width 300px, overflow-y auto, border-right
    - 右侧 editor: flex 1, flex-direction column
    - 工具栏行: flex, height 40px, padding 5px 10px, gap 10px, align-items center, border-bottom
    - 编辑器容器: flex 1, position relative
    - 按钮组: .btn-group 样式, .btn 样式, .btn-save 样式
    - 搜索框: 全宽, padding, border
    - 树样式: 缩进层级, 展开/折叠图标
    - Markdown 编辑区: flex 1 在 split 模式下
  - 添加 `GET /` 路由：返回 index.html 模板

  **Must NOT do**:
  - 不要使用任何前端框架（Vue/React/jQuery）
  - 不要添加动画库
  - 不要添加图标库（用 unicode 代替）

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
  - **Skills**: [`frontend-design`]
    - `frontend-design`: CSS 布局、UI 设计

  **Parallelization**:
  - **Can Run In Parallel**: NO (sequential prerequisite)
  - **Parallel Group**: Wave 3 (with Tasks 10, 11)
  - **Blocks**: Tasks 10, 11, 12, 13
  - **Blocked By**: Task 3 (auth needed)

  **Acceptance Criteria**:
  - [ ] 浏览器打开 http://localhost:5000/ → 页面加载，左侧 sidebar + 右侧编辑区可见
  - [ ] 布局正确：左侧 300px，右侧填充剩余宽度
  - [ ] 顶部导航栏显示

  **QA Scenarios**:
  ```
  Scenario: SPA layout renders correctly
    Tool: Playwright
    Preconditions: Flask server running, clear cookies (not logged in)
    Steps:
      1. Navigate to http://localhost:5000/
      2. Check page title exists
      3. Check 导航栏 visible
      4. Check 左侧 sidebar visible (width ~300px)
      5. Check 右侧 editor area visible
    Expected Result: Page loads with correct layout
    Evidence: .sisyphus/evidence/task-9-layout.png

  Scenario: CSS responsive to content
    Tool: Playwright
    Preconditions: Server running
    Steps:
      1. Navigate to http://localhost:5000/
      2. Take full page screenshot
    Expected Result: Layout displays correctly, no overlapping elements
    Evidence: .sisyphus/evidence/task-9-layout-full.png
  ```

  **Commit**: YES
  - Message: `feat: spa layout and css`
  - Files: templates/index.html, static/css/style.css, views.py (add route)

---

- [x] 10. **Auth UI — 登录/注册前端界面**

  **What to do**:
  - 创建 `static/js/auth.js`：
    - 检查登录状态: 页面加载时调用 GET /api/auth/me
    - 未登录：显示登录模态框（overlay + 表单）
    - 已登录：显示侧边栏和编辑器，顶部显示用户昵称
    - 登录功能：收集 email+password → POST /api/auth/login → 成功刷新页面
    - 注册功能：模态框切换 → 收集 email+password+nickname → POST /api/auth/register → 提示"注册成功，等待管理员审批"
    - 登出功能：POST /api/auth/logout → 刷新显示登录页
    - 登录失败处理：显示错误信息（"账户待审批" / "密码错误" / "用户不存在"）
  - 在 `index.html` 中添加：
    - 登录模态框 HTML（包含 email, password, 登录按钮 + "注册账号"链接）
    - 注册模态框 HTML（包含 email, password, nickname, 注册按钮 + "返回登录"链接）
  - 在 `style.css` 中添加：
    - 模态框样式（居中卡片、半透明背景遮罩）
    - 表单样式（输入框、按钮）
    - 错误提示样式

  **Must NOT do**:
  - 不要实现"记住我"功能
  - 不要实现密码强度指示器
  - 不要实现 OAuth/第三方登录

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
  - **Skills**: [`frontend-design`]
    - `frontend-design`: 模态框交互、表单设计

  **Parallelization**:
  - **Can Run In Parallel**: NO (Wave 3, sequential)
  - **Parallel Group**: Wave 3 (after Task 9)
  - **Blocks**: None
  - **Blocked By**: Tasks 3, 9

  **Acceptance Criteria**:
  - [ ] 未登录时显示登录模态框
  - [ ] 输入正确凭据后登录成功，显示主界面
  - [ ] 输入未审批账户 → 显示"账户待审批"
  - [ ] 注册后显示"等待审批"
  - [ ] 登出后返回登录页

  **QA Scenarios**:
  ```
  Scenario: Login flow with unapproved user
    Tool: Playwright
    Preconditions: Server running, user "user@test.com" registered but not approved
    Steps:
      1. Navigate to http://localhost:5000/
      2. Verify login modal is displayed (not main interface)
      3. Fill email: "user@test.com", password: "user123"
      4. Click login button
      5. Wait for response
    Expected Result: Error message shown: "账户待审批" or similar
    Evidence: .sisyphus/evidence/task-10-login-pending.png

  Scenario: Register new user
    Tool: Playwright
    Preconditions: Server running, not logged in
    Steps:
      1. Navigate to http://localhost:5000/
      2. Click "注册账号" link
      3. Fill email: "newuser@test.com", password: "password123", nickname: "新用户"
      4. Click register button
      5. Wait for response
    Expected Result: Success message shown: "注册成功，等待管理员审批"
    Evidence: .sisyphus/evidence/task-10-register.png

  Scenario: Admin login succeeds
    Tool: Playwright
    Preconditions: Admin user exists (first registered)
    Steps:
      1. Navigate to http://localhost:5000/
      2. Fill admin email + password
      3. Click login
    Expected Result: Login succeeds, main interface with sidebar + editor is shown
    Evidence: .sisyphus/evidence/task-10-login-success.png
  ```

  **Commit**: YES
  - Message: `feat: auth ui with login/register modals`
  - Files: static/js/auth.js, templates/index.html, static/css/style.css

---

- [x] 11. **ToastUI Editor Integration — 编辑器 CDN 加载与初始化**

  **What to do**:
  - 确认 CDN 加载路径已正确添加到 index.html（task 9 已含）
  - 创建 `static/js/editor.js`：
    - `initEditor(containerElement)` 函数：
      - 检查 `typeof toastui !== 'undefined'`
      - 如果 CDN 加载失败：在 containerElement 中创建原生 `<textarea>`，并显示提示信息
      - 如果 CDN 加载成功：创建 Editor 实例
        - `el`: containerElement
        - `initialEditType`: 'markdown'
        - `previewStyle`: 'vertical'（分屏模式：左侧编辑、右侧预览）
        - `height`: '100%'
        - `language`: 'zh-CN'
        - `hideModeSwitch`: true（隐藏切换按钮，由我们自己的按钮控制）
    - `getEditorContent()`: 返回 editor.getMarkdown()
    - `setEditorContent(markdown)`: editor.setMarkdown(markdown)
    - `getHtmlContent()`: 返回 editor.getHTML()（从 markdown 渲染的 HTML）
    - `destroyEditor(editor)`: 销毁实例
    - 暴露全局对象 `window.WikiEditor` 包含以上方法
  - 编辑器三种模式切换逻辑（在 editor.js 中）：
    - **Markdown 模式**：显示 ToastUI 分屏编辑（左侧源码、右侧预览）
    - **HTML 模式**：隐藏编辑器，显示 HTML 渲染结果（从 editor.getHTML() 获取）
    - 按钮组点击时调用切换函数，切换后高亮当前按钮

  **Must NOT do**:
  - 不要添加自定义 toolbar 按钮
  - 不要修改 ToastUI Editor 的主题

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
  - **Skills**: [`frontend-design`]
    - `frontend-design`: 编辑器集成、CDN 加载处理

  **Parallelization**:
  - **Can Run In Parallel**: NO (Wave 3, sequential)
  - **Parallel Group**: Wave 3 (after Task 9)
  - **Blocks**: Task 13
  - **Blocked By**: Task 9

  **Acceptance Criteria**:
  - [ ] ToastUI Editor 加载，显示分屏视图（左 markdown 编辑区，右预览区）
  - [ ] 输入 markdown 语法左侧编辑右侧实时预览
  - [ ] CDN 断开时显示 textarea 回退
  - [ ] 切换 HTML 模式显示渲染结果
  - [ ] 切换 Markdown 模式显示编辑器

  **QA Scenarios**:
  ```
  Scenario: ToastUI Editor loads and split view works
    Tool: Playwright
    Preconditions: Admin logged in, a node selected (or empty state)
    Steps:
      1. Navigate to http://localhost:5000/
      2. Click on a document node to select it
      3. Wait for editor area to load
      4. Check that split view is visible (left = editor, right = preview)
      5. Type in editor: "# Hello World\n\nThis is **bold** text"
      6. Wait for preview to update
    Expected Result: Split view visible, preview renders markdown in real-time
    Evidence: .sisyphus/evidence/task-11-editor-load.png

  Scenario: Switch to HTML mode
    Tool: Playwright
    Preconditions: Same as above
    Steps:
      1. Click "HTML" button in toolbar
      2. Wait for view to switch
    Expected Result: HTML view shows rendered markdown, editor area hidden
    Evidence: .sisyphus/evidence/task-11-html-mode.png
  ```

  **Commit**: YES
  - Message: `feat: toastui editor integration`
  - Files: static/js/editor.js, templates/index.html

---

- [x] 12. **Tree Component — 左侧树结构交互组件**

  **What to do**:
  - 创建 `static/js/tree.js`：
    - `TreeManager` 对象:
    - `loadTree()`: fetch GET /api/nodes → 递归渲染树
    - `renderTree(nodes, container, depth=0)`:
      - 递归遍历节点数组
      - 每个节点渲染为 `<li>`：
        - 左侧缩进 (depth * 20px padding-left)
        - 展开/折叠图标（▶/▼ unicode）
        - 节点标题（使用 textContent 防止 XSS）
        - 右键菜单或操作按钮（新增子节点、删除、导入）
      - 有子节点 → 可展开/折叠
      - 当前选中节点高亮（.selected 类）
    - `filterTree(keyword)`:
      - 获取 flat 节点列表
      - 过滤标题包含 keyword 的节点
      - 只显示匹配的节点及其父路径
    - 创建/删除/导入操作：
      - 点击节点后的操作按钮触发对应 API
      - 创建: prompt 输入标题 + POST /api/nodes → 刷新树
      - 删除: confirm 确认 + DELETE /api/nodes → 刷新树
      - 导入: `<input type="file" accept=".md">` 隐藏控件点击 → POST /api/nodes/<id>/import → 刷新树
  - 在 `index.html` 中加载 `tree.js`
  - 搜索框事件绑定：输入关键词 → 300ms 防抖 → 调用 filterTree()

  **Must NOT do**:
  - 不要使用 jQuery 或第三方树组件
  - 不要实现拖拽排序
  - 不要实现右键菜单（使用按钮更简单）

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
  - **Skills**: [`frontend-design`]
    - `frontend-design`: 递归 DOM 渲染、事件处理

  **Parallelization**:
  - **Can Run In Parallel**: YES (Wave 4)
  - **Parallel Group**: Wave 4 (with Tasks 13, 14)
  - **Blocks**: None
  - **Blocked By**: Tasks 6, 8, 9

  **Acceptance Criteria**:
  - [ ] 左侧树显示所有文档/文章层级结构
  - [ ] 点击展开/折叠切换子节点显示
  - [ ] 点击节点 → 节点高亮选中，右侧加载内容
  - [ ] 创建子节点 → 新节点出现在树中
  - [ ] 删除节点 → 节点消失，子节点上移
  - [ ] 导入 .md → 新节点出现在树中
  - [ ] 搜索框过滤树节点

  **QA Scenarios**:
  ```
  Scenario: Tree structure renders with expand/collapse
    Tool: Playwright
    Preconditions: Admin logged in, tree has nodes (A→B, C) where A has child B
    Steps:
      1. Navigate to http://localhost:5000/
      2. Observe tree in sidebar
      3. Click expand icon on node A
    Expected Result: Child B appears below A with indentation
    Evidence: .sisyphus/evidence/task-12-tree-expand.png

  Scenario: Create child node
    Tool: Playwright
    Preconditions: Admin logged in, tree visible
    Steps:
      1. Click "新增" button on a document node
      2. Type "新文章" in prompt dialog
      3. Confirm
      4. Wait for tree refresh
    Expected Result: New node "新文章" appears under the selected node
    Evidence: .sisyphus/evidence/task-12-create-node.png

  Scenario: Delete node re-parents children
    Tool: Playwright
    Preconditions: Tree: A → B, where B has children
    Steps:
      1. Click "删除" button on node B
      2. Confirm deletion
      3. Observe tree
    Expected Result: B's children now appear under A, B is gone
    Evidence: .sisyphus/evidence/task-12-delete-reparent.png

  Scenario: Import markdown file via tree
    Tool: Playwright
    Preconditions: Admin logged in, node exists
    Steps:
      1. Click "导入" button on a node
      2. Select a .md file from file system
      3. Wait for upload and tree refresh
    Expected Result: New article node appears under the target node with filename as title
    Evidence: .sisyphus/evidence/task-12-import-file.png

  Scenario: Search filters tree
    Tool: Playwright
    Preconditions: Tree has nodes with various titles
    Steps:
      1. Type keyword "运维" in the search box above tree
      2. Observe tree filtering
    Expected Result: Only nodes with "运维" in title (and their parent path) remain visible
    Evidence: .sisyphus/evidence/task-12-search-filter.png
  ```

  **Commit**: YES
  - Message: `feat: tree component with expand/collapse/filter`
  - Files: static/js/tree.js, static/css/style.css, templates/index.html

---

- [x] 13. **Editor Component — 编辑器交互、保存与关键词高亮**

  **What to do**:
  - 在 `static/js/editor.js` 中补全（或创建 `static/js/app.js` 作为主控）：
  - **节点选择事件流**：
    - 点击树节点 → 选中事件触发
    - `onNodeSelected(nodeId)`:
      - fetch GET /api/nodes/<id> → 获取 content
      - setEditorContent(content)
      - 保存按钮启用
      - 当前编辑的 nodeId 记录在全局变量
  - **保存功能**：
    - 点击"保存"按钮或 Ctrl+S
    - 收集 editor.getMarkdown()
    - PUT /api/nodes/<id> {content: markdown}
    - 保存成功：显示绿色提示"已保存"
    - 保存失败：显示红色错误
  - **关键词高亮**：
    - 右侧上方输入框 → 输入关键词
    - 实时（或 300ms 防抖）在预览区高亮匹配的文本
    - 实现方式：
      - Markdown 模式：获取编辑器 HTML 渲染 → 在预览 DOM 中用 `<mark>` 包裹匹配词
      - HTML 模式：直接在高亮 `<mark>` 包裹匹配词
      - 高亮区分大小写
  - **模式切换**（完善 task 11 的切换逻辑）：
    - Markdown 按钮：显示 ToastUI 编辑器（分屏），隐藏 HTML 容器
    - HTML 按钮：隐藏编辑器，显示 HTML 渲染结果
    - 切换时保留当前编辑内容
  - **空状态**：
    - 未选择节点时显示"选择一个节点进行编辑"占位
    - 选中节点无内容时显示空白编辑器
  - **未保存警告**：切换节点时如果内容有修改，显示 confirm 确认是否放弃修改
  - 创建 `static/js/api.js`：
    - 封装所有 fetch API 调用
    - `api.get(url)`、`api.post(url, data)`、`api.put(url, data)`、`api.delete(url)`
    - 统一处理 401 → 跳转登录
    - 统一处理错误 → 显示 toast 消息

  **Must NOT do**:
  - 不要实现自动保存
  - 不要实现版本历史
  - 不要实现文字统计

  **Recommended Agent Profile**:
  - **Category**: `deep`
  - **Skills**: [`frontend-design`]
    - `frontend-design`: DOM 操作、事件管理、编辑器集成

  **Parallelization**:
  - **Can Run In Parallel**: YES (Wave 4)
  - **Parallel Group**: Wave 4 (with Tasks 12, 14)
  - **Blocks**: None
  - **Blocked By**: Tasks 7, 9, 11

  **Acceptance Criteria**:
  - [ ] 选择节点 → 编辑器加载内容
  - [ ] 编辑 markdown → 右侧实时预览
  - [ ] 保存 → 提示"已保存" → 刷新后内容保留
  - [ ] Ctrl+S 触发保存
  - [ ] 关键词高亮：输入关键词 → 预览区匹配词高亮显示
  - [ ] Markdown/HTML 模式切换工作正常
  - [ ] 未保存切换节点 → 提示确认
  - [ ] 未选择节点 → 显示占位信息
  - [ ] 401 时自动跳转登录

  **QA Scenarios**:
  ```
  Scenario: Select node, edit content, save, verify persistence
    Tool: Playwright
    Preconditions: Admin logged in, article node exists
    Steps:
      1. Click on an article node in tree
      2. Wait for editor to load content
      3. Type in editor: "# Updated Title\n\nContent updated at " + Date.now()
      4. Click "保存" button
      5. Wait for save confirmation ("已保存")
      6. Refresh page
      7. Click same node
    Expected Result: Editor shows the updated content after refresh
    Evidence: .sisyphus/evidence/task-13-save-persistence.png

  Scenario: Keyword highlighting
    Tool: Playwright
    Preconditions: Article has content containing "服务器", "部署"
    Steps:
      1. Select an article node
      2. Type "服务器" in the highlight input box
      3. Observe preview area
    Expected Result: All occurrences of "服务器" in the preview are wrapped in <mark> with highlighted background
    Evidence: .sisyphus/evidence/task-13-keyword-highlight.png

  Scenario: Unsaved changes warning
    Tool: Playwright
    Preconditions: Article node selected, content loaded
    Steps:
      1. Modify editor content (make a change)
      2. Without saving, click a different node
    Expected Result: Confirm dialog appears: "当前内容未保存，确定要切换吗？"
    Evidence: .sisyphus/evidence/task-13-unsaved-warning.png

  Scenario: Switch between Markdown and HTML modes
    Tool: Playwright
    Preconditions: Article node selected
    Steps:
      1. Verify default is Markdown mode (split view visible)
      2. Click "HTML" button
      3. Verify editor hidden, rendered HTML shown
      4. Click "Markdown" button
    Expected Result: Smooth transition between modes, content preserved
    Evidence: .sisyphus/evidence/task-13-mode-switch.png
  ```

  **Commit**: YES (groups with Task 12)
  - Message: part of frontend components
  - Files: static/js/editor.js, static/js/app.js, static/js/api.js

---

- [x] 14. **Admin Panel — 超管用户管理界面**

  **What to do**:
  - 在 `index.html` 中添加"用户管理"入口（仅超管可见）
  - 创建管理面板页面/模态框：
    - 点击"用户管理"按钮（顶部导航栏）打开管理面板
    - 面板显示用户列表（表格）：ID、邮箱、昵称、状态、注册时间、操作
    - 操作按钮："审批" / "停用"
    - 状态：已激活 / 待审批 / 已停用
  - 在 `app.js` 中添加管理面板逻辑：
    - `loadUsers()`: fetch GET /api/admin/users → 渲染表格
    - `approveUser(id)`: POST /api/admin/users/<id>/approve → 刷新列表
    - `deactivateUser(id)`: POST /api/admin/users/<id>/deactivate → 刷新列表
    - 仅当前用户 is_admin=true 时显示管理入口
  - CSS 样式：表格样式、管理面板模态框样式

  **Must NOT do**:
  - 不要实现用户编辑/删除
  - 不要实现角色管理

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
  - **Skills**: [`frontend-design`]
    - `frontend-design`: 表格布局、模态框

  **Parallelization**:
  - **Can Run In Parallel**: YES (Wave 4)
  - **Parallel Group**: Wave 4 (with Tasks 12, 13)
  - **Blocks**: None
  - **Blocked By**: Tasks 4, 9

  **Acceptance Criteria**:
  - [ ] 超管顶部导航栏显示"用户管理"按钮
  - [ ] 点击后显示用户列表表格
  - [ ] 审批按钮工作 → 用户状态变为"已激活"
  - [ ] 非超管看不到管理入口
  - [ ] 表格包含：ID、邮箱、昵称、状态、操作

  **QA Scenarios**:
  ```
  Scenario: Admin sees user management
    Tool: Playwright
    Preconditions: Admin logged in, at least 1 pending user
    Steps:
      1. Navigate to http://localhost:5000/
      2. Click "用户管理" button in top nav
      3. Observe user list modal
    Expected Result: User list displayed with pending user showing "待审批" status
    Evidence: .sisyphus/evidence/task-14-admin-panel.png

  Scenario: Admin approves user
    Tool: Playwright
    Preconditions: Admin panel open, pending user visible
    Steps:
      1. Click "审批" button on a pending user
      2. Wait for refresh
    Expected Result: User status changes to "已激活"
    Evidence: .sisyphus/evidence/task-14-approve-user.png

  Scenario: Non-admin cannot see admin button
    Tool: Playwright
    Preconditions: Non-admin user logged in
    Steps:
      1. Navigate to http://localhost:5000/
      2. Check top nav for "用户管理" button
    Expected Result: Button not present or not visible
    Evidence: .sisyphus/evidence/task-14-non-admin.png
  ```

  **Commit**: YES
  - Message: `feat: admin user management panel`
  - Files: static/js/app.js, templates/index.html, static/css/style.css

---

## Final Verification Wave

> 4 review agents run in PARALLEL. ALL must APPROVE.

- [ ] F1. **Plan Compliance Audit** — `oracle`
  Read the plan end-to-end. For each "Must Have": verify implementation exists (read file, curl endpoint, run command). For each "Must NOT Have": search codebase for forbidden patterns — reject with file:line if found. Check evidence files exist in .sisyphus/evidence/. Compare deliverables against plan.
  Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [ ] F2. **Code Quality Review** — `unspecified-high`
  Run `python -m py_compile app.py models.py` + check for: print() in prod, bare except, hardcoded secrets, XSS vectors. Check for AI slop: excessive comments, over-abstraction, generic names.
  Output: `Build [PASS/FAIL] | Files [N clean/N issues] | VERDICT`

- [ ] F3. **Real Manual QA** — `unspecified-high`
  Start from clean state. Execute FULL workflow: start server → register → login (fail without approval) → approve → login → create tree → edit → save → import → delete → search → highlight. Test edge cases: empty DB, duplicate title, delete with children, large content.
  Output: `Scenarios [N/N pass] | Integration [N/N] | VERDICT`

- [ ] F4. **Scope Fidelity Check** — `deep`
  For each task: read "What to do", read actual diff. Verify 1:1 — everything built, nothing beyond spec. Check "Must NOT do" compliance. Detect cross-task contamination.
  Output: `Tasks [N/N compliant] | Contamination [CLEAN/N issues] | VERDICT`

---

## Commit Strategy

- **Task 1**: `chore: scaffold flask project structure`
- **Task 2-3**: `feat: implement user auth models and api`
- **Task 4**: `feat: admin user management and approval`
- **Task 5-6**: `feat: node crud and tree api`
- **Task 7**: `feat: node delete re-parenting and markdown import`
- **Task 8**: `feat: title search api`
- **Task 9**: `feat: spa layout and css`
- **Task 10**: `feat: auth ui with login/register modals`
- **Task 11**: `feat: toastui editor integration`
- **Task 12**: `feat: tree component with expand/collapse/filter`
- **Task 13**: `feat: editor with 3 modes, save, keyword highlight`
- **Task 14**: `feat: admin user management panel`

---

## Success Criteria

### Verification Commands
```bash
cd /Users/yuanzhenhui/Documents/code_space/git/processing/python/ops_wiki
/Users/yuanzhenhui/Documents/anaconda3/envs/ops/bin/python app.py
curl http://localhost:5000/api/auth/me
```

### Final Checklist
- [ ] Flask server starts without errors
- [ ] Register → login (fails without approval) → admin approves → login works
- [ ] Create nested tree nodes, edit content, save
- [ ] Delete node → children auto-mount to parent
- [ ] Import .md file creates child node
- [ ] Title search filters tree correctly
- [ ] Keyword highlight works in content

---

## ToastUI Editor 安装说明（供用户参考）

用户需要下载以下文件放入 `static/lib/toastui/` 目录：

```bash
mkdir -p static/lib/toastui

# 下载 CSS
curl -o static/lib/toastui/toastui-editor.css \
  https://cdn.jsdelivr.net/npm/@toast-ui/editor@3.2.2/dist/toastui-editor.css

# 下载 JS（UMD 包，包含所有依赖）
curl -o static/lib/toastui/toastui-editor.min.js \
  https://cdn.jsdelivr.net/npm/@toast-ui/editor@3.2.2/dist/toastui-editor.min.js

# 下载中文语言包
curl -o static/lib/toastui/zh-cn.js \
  https://cdn.jsdelivr.net/npm/@toast-ui/editor@3.2.2/dist/i18n/zh-cn.js
```

开发阶段代码会优先从 CDN 加载，当以上文件存在时自动切换为本地加载。

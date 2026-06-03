# Ops Wiki

一个基于 Flask 的轻量级企业 Wiki，单页应用架构，开箱即用。

Ops Wiki 用来干什么？就是给团队搭一个内部知识库。树形结构组织文档，支持富文本编辑和 Markdown，文章内容全程加密，分享给谁谁才能看。不需要部署复杂的 Wiki 系统，一个人也能玩，一整个团队也能用。

## 功能

- 树形文档管理，document 目录 + article 文章，支持无限层级嵌套
- 文章内容走 AES-256-GCM + RSA-2048 混合加密，数据库被人拖走了也读不了
- 文档可以分享给其他用户，分享时用对方的公钥重新加密 AES 密钥
- 支持导入 .docx、.xlsx、.txt、.md 文件，Word 导入自动提取图片
- 全文搜索，实时过滤
- 第一个注册的用户自动成为管理员，后面的人注册需要审批
- 管理员后台：审批新用户、停用账户
- 可选 SMTP 邮件通知，有新用户注册时提醒管理员

## 快速开始

### 安装依赖

```bash
pip install -r requirements.txt
```

建议在虚拟环境里装。Python 版本要求 3.9 以上。

### 配置

打开 `config.py`，`SECRET_KEY` 和数据库路径已经写好了默认值，可以直接用。

生产环境建议改一下 `SECRET_KEY`：

```bash
python -c "import secrets; print(secrets.token_hex(32))"
```

把输出粘到 `config.py` 的 `SECRET_KEY` 里就行。

邮件通知是可选的，不配也能正常跑。配的话设环境变量：

```bash
export MAIL_SERVER=smtp.example.com
export MAIL_PORT=587
export MAIL_USERNAME=admin@example.com
export MAIL_PASSWORD=yourpassword
```

### 启动

```bash
python app.py
```

默认监听 `0.0.0.0:5100`。浏览器打开 `http://localhost:5100` 就能看到页面了。

第一个注册的账号自动是管理员。后面注册的账号需要管理员在后台审批才能登录。

生产环境别用 Flask 自带的 dev server，上 gunicorn：

```bash
gunicorn -w 4 -b 0.0.0.0:5100 app:create_app()
```

## 项目结构

几个重要的文件：

```
ops_wiki/
├── app.py              # 应用入口，组装 Flask 应用
├── config.py           # 配置，SECRET_KEY、数据库、SMTP 都在这
├── extensions.py        # db 和 login_manager 实例
├── models.py            # User、Node、NodePermission 三个模型
├── auth.py              # 注册、登录、登出
├── views.py             # 文档 CRUD、树、搜索、导入
├── admin.py             # 管理员：用户审批、停用
├── crypto.py            # AES-256-GCM + RSA-2048 混合加密
├── email_utils.py       # 邮件通知，没配 SMTP 就只打日志
├── requirements.txt
├── templates/
│   └── index.html       # 单页应用入口（所有 UI 都在一个 HTML 里）
├── static/js/           # 前端 JS，按功能拆了文件
└── images/              # Word 导入时提取的图片
```

## API 概览

接口都是 JSON API，前缀 `/api`。

### 认证 `/api/auth`

- `POST /register` — 注册（第一个用户为管理员）
- `POST /login` — 登录
- `POST /logout` — 登出
- `GET /me` — 当前用户信息

### 文档 `/api`

- `GET /nodes` — 获取用户的文档树（flat 参数可拉平）
- `POST /nodes` — 创建节点（document 或 article）
- `GET /nodes/:id` — 获取节点详情（含解密后的内容）
- `PUT /nodes/:id` — 更新节点（标题或内容）
- `DELETE /nodes/:id` — 删除节点（含子节点）
- `POST /nodes/:id/share` — 分享给其他用户
- `DELETE /nodes/:id/share/:user_id` — 取消分享
- `GET /nodes/search?q=xxx` — 全文搜索
- `POST /upload/:parent_id` — 导入文件（multipart）
- `PUT /nodes/:id/move` — 移动节点位置
- `GET /users` — 用户列表（分享时选人用）

### 管理 `/api/admin`

- `GET /users` — 所有用户列表
- `POST /users/:id/approve` — 审批用户
- `POST /users/:id/deactivate` — 停用用户

## 注意事项

- 默认使用 SQLite，并发写多的时候可能会有锁冲突。小团队（几十个人）问题不大，人多了建议换 PostgreSQL。
- 加密是 article 类型自动触发的，document 类型不加密。加密后的内容在数据库里是密文，但前端展示的时候会解密，所以 HTTPS 是必要的，不然中间人能看到明文。
- 分享文档时，会用被分享者的 RSA 公钥重新加密 AES 密钥。如果被分享者还没登录过（没有密钥对），分享会失败。
- `SECRET_KEY` 建议换掉默认值。虽然这个 key 不直接用于内容加密（内容加密走 RSA），但它影响 session 签名。
- 管理员不能删自己的账号，只能让别的管理员来停用。

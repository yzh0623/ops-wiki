# Ops Wiki

一个基于 Flask 的轻量级企业 Wiki，单页应用架构，开箱即用。

Ops Wiki 用来干什么？就是给团队搭一个内部知识库。树形结构组织文档，支持 Markdown 编辑和实时预览，文章内容全程加密，分享给谁谁才能看。支持拖拽排序、批量导入、权限转让，不需要部署复杂的 Wiki 系统，一个人也能玩，一整个团队也能用。

---

## 免责声明与使用须知
- **开源授权**：本项目基于 `MIT` 协议开放源码，仅供技术研究与学习交流，著作权归作者所有。
- **合规责任归属**：任何部署、修改或对外提供服务者，须独立确保符合《网络安全法》《个人信息保护法》服务相关规定。内容安全过滤、用户数据隐私保护均由使用者自行负责。
- **自愿捐赠性质**：项目附带的赞赏/捐赠码仅用于支持开源维护与技术探索，属**个人自愿赠与行为**，不构成任何商品交易、服务对价、售后承诺或商业合作。作者不因受赠承担额外责任。
- **责任豁免**：代码按“现状”提供，不保证无缺陷或完全适配特定场景。因使用、部署、二次开发或依赖本工具产生的任何直接或间接损失（含数据丢失、业务中断、法律纠纷），作者概不负责。
- **同意生效**：使用、修改、分发、部署或捐赠本项目，即视为您已充分理解并完全同意本声明全部内容。

## 功能

### 文档管理
- 树形文档管理，document 目录 + article 文章，支持无限层级嵌套
- 节点拖拽移动：长按拖拽即可调整节点位置，自动防循环引用
- 节点重命名：右键菜单一键重命名
- Ctrl+Click 多选节点，支持批量操作
- 同级标题唯一性约束，避免重复

### Markdown 编辑器
- 分屏编辑：左侧 Markdown，右侧 HTML 实时预览，可拖拽分隔条调整比例
- 拖拽吸附：分隔条拖到边缘自动切换为全屏 Markdown 或全屏预览
- 双向滚动同步：Markdown 区滚动时 HTML 区自动跟随，反之亦然
- 关键词高亮：工具栏输入框实时高亮预览中的匹配文本
- Tab 键缩进、Ctrl+S 保存
- 未保存修改离开页面会弹出提醒

### 文件导入
- 支持导入 .docx（Word）、.xlsx（Excel）、.txt、.md 及常见源代码文件
- Word 导入：标题样式自动转 Markdown 标题，图片**保留在文档原始位置**（不再全部追加到末尾）
- Excel 导入：自动转为 Markdown 表格，多 Sheet 分别渲染
- 批量导入：一次性选择多个文件，逐个上传并汇总结果

### 安全加密
- 文章内容走 AES-256-GCM + RSA-2048 混合加密，数据库被人拖走了也读不了
- 注册时自动生成 RSA 密钥对，密钥仅存储在服务端
- document 类型不加密，article 类型自动加密

### 权限与分享
- 文档可以分享给其他活跃用户，分享时用对方的公钥重新加密 AES 密钥
- 批量授权/撤销：多选节点后批量开放或收回权限，支持递归子节点
- 权限转让：可将节点所有权转让给其他用户，递归转让时自动用新所有者公钥重加密
- 非所有者查看分享文档时显示只读视图（全宽 HTML 预览，隐藏编辑功能）
- 分享成功时自动发送邮件通知被分享者

### 管理员功能
- 第一个注册的用户自动成为管理员，后面的人注册需要审批
- 管理员面板：查看所有用户（含注册时间、角色）、审批新用户、停用账户
- 管理员不能停用自己的账号

### 其他
- 全文搜索，实时过滤，支持按 document/article 类型筛选
- 可选 SMTP 邮件通知：新用户注册时提醒管理员，分享文档时通知被分享者
- 侧边栏宽度可拖拽调整（180-600px）

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
├── app.py              # 应用入口，组装 Flask 应用、挂载图片静态路由
├── config.py           # 配置，SECRET_KEY、数据库、SMTP 都在这
├── extensions.py       # db 和 login_manager 实例
├── models.py           # User、Node、NodePermission 三个模型
├── auth.py             # 注册（含 RSA 密钥生成）、登录、登出、session 检查
├── views.py            # 文档 CRUD、树、搜索、导入、分享、转让、批量授权
├── admin.py            # 管理员：用户审批、停用、用户列表
├── crypto.py           # AES-256-GCM + RSA-2048 混合加密/解密
├── email_utils.py      # 邮件通知，没配 SMTP 就只打日志
├── decorators.py       # 装饰器（管理员权限校验等）
├── requirements.txt
├── templates/
│   └── index.html      # 单页应用入口，所有 UI 组件都在一个 HTML 里
├── static/
│   ├── css/
│   │   └── style.css   # 全局样式
│   └── js/
│       ├── marked.min.js  # Markdown 解析器（第三方库）
│       ├── api.js         # 统一 HTTP 客户端（fetch 封装、401 处理）
│       ├── auth.js        # 登录/注册/登出/session 管理
│       ├── editor.js      # 分屏编辑器、滚动同步、关键词高亮、分隔条拖拽
│       ├── tree.js        # 文档树渲染、拖拽、右键菜单、多选、批量导入
│       └── app.js         # 主控制器 + 管理面板 + 对话框逻辑
└── images/              # Word 导入时提取的图片（运行时自动创建）
```

## API 概览

接口都是 JSON API，前缀 `/api`。

### 认证 `/api/auth`

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/register` | 注册（首用户自动激活+管理员），生成 RSA-2048 密钥对 |
| POST | `/login` | 登录（需已激活） |
| POST | `/logout` | 登出 |
| GET | `/me` | 当前用户信息 |

### 文档 `/api`

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/nodes` | 获取文档树（`?flat=true` 返回平铺列表） |
| POST | `/nodes` | 创建节点（document 或 article，同级标题不可重复） |
| GET | `/nodes/:id` | 获取节点详情（含解密内容、被授权者列表、is_owner 标记） |
| PUT | `/nodes/:id` | 更新节点（标题或内容） |
| DELETE | `/nodes/:id` | 删除节点（子节点上移到父级，非级联删除） |
| PUT | `/nodes/:id/move` | 移动节点到新父节点（支持拖拽，防循环引用） |
| PUT | `/nodes/:id/rename` | 重命名节点标题 |
| GET | `/nodes/search?q=&type=` | 全文搜索（标题包含匹配，可选类型过滤） |
| POST | `/nodes/:id/share` | 分享节点给其他用户（含邮件通知） |
| DELETE | `/nodes/:id/share/:user_id` | 取消分享 |
| POST | `/nodes/batch-authorize` | 批量授权/撤销（支持 `recursive` 递归子节点） |
| POST | `/nodes/:id/transfer` | 转让节点所有权（支持 `recursive` 递归转让 + 重加密） |
| POST | `/nodes/import/batch` | 批量导入 JSON 格式节点数据 |
| POST | `/nodes/import/file` | 通用文件导入（.txt/.md/.docx/.xlsx 等，支持 multipart） |
| POST | `/nodes/:parent_id/import` | 导入 Markdown/纯文本到指定父节点下 |
| POST | `/nodes/:parent_id/import-word` | 导入 Word 文档到指定父节点下（图片保留原始位置） |
| POST | `/nodes/:parent_id/import-excel` | 导入 Excel 到指定父节点下（多 Sheet 渲染为多个表格） |
| GET | `/users` | 列出可分享的活跃用户列表（排除自己） |

### 管理 `/api/admin`

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/users` | 所有用户列表（含角色、状态、注册时间） |
| POST | `/users/:id/approve` | 审批激活用户 |
| POST | `/users/:id/deactivate` | 停用用户（不能停自己） |

### 静态文件

| 路径 | 说明 |
|------|------|
| `GET /images/<filename>` | 访问导入的图片文件 |

## 注意事项

- 默认使用 SQLite，并发写多的时候可能会有锁冲突。小团队（几十个人）问题不大，人多了建议换 PostgreSQL。
- 加密是 article 类型自动触发的，document 类型不加密。加密后的内容在数据库里是密文，但前端展示的时候会解密，所以 HTTPS 是必要的，不然中间人能看到明文。
- 分享文档时，会用被分享者的 RSA 公钥重新加密 AES 密钥。如果被分享者还没登录过（没有密钥对），分享会失败。
- 转让节点所有权时，系统会用当前所有者的私钥解密，再用新所有者的公钥重新加密。递归转让时每个子节点都会独立重加密。
- `SECRET_KEY` 建议换掉默认值。虽然这个 key 不直接用于内容加密（内容加密走 RSA），但它影响 session 签名。
- 管理员不能删自己的账号，只能让别的管理员来停用。
- Word 文档中的图片在导入时会被提取保存到 `images/` 目录，通过 `/images/` 路由访问。图片会保留在文档中的原始段落位置，不会全部追加到末尾。
- Excel 导入时，每个 Sheet 会渲染为一个独立的 Markdown 表格，以 `## Sheet名称` 作为二级标题。
- 删除节点时，其直接子节点会**上移**到被删节点的父节点下，而不是级联删除。
- 被分享的节点在分享对象的树中也能看到完整的父级链（祖先节点即使没有直接权限也会显示）。


## 支持本项目
如本工具对您有启发，欢迎自愿赞赏支持开源维护：

<img src="./templates/img/qrcode.jpg" width="200" height="200">

<small>一点也是爱，感谢您的支持，谢谢。</small>
# Ops Wiki

[English](README.en.md) | 中文

一个基于 Flask 的轻量级团队 Wiki，单页应用架构，开箱即用。

树形结构组织文档，Markdown 编辑 + 实时预览，文章内容全程加密，分享给谁谁才能看，还带一套跑在本地 CPU 上的语义检索。不用部署复杂的 Wiki 系统，一个人能用，一整个团队也能用。

---

> ## ⚠️ 请勿部署到公网
>
> **本项目只适用于个人知识库或团队内网使用，请务必不要把它直接暴露到公网。**
>
> 它的定位是一个轻量的内部工具，**没有针对高强度攻击做过防护加固**：没有 WAF、没有登录失败锁定与速率限制、没有审计日志与入侵检测，安全边界基本就是 Python / Flask / SQLite 的默认水平。一旦直接暴露在公网，很容易被扫描器发现，进而遭到暴力破解、漏洞利用或拒绝服务攻击，**文章内容、账号密码哈希、RSA 私钥等重要数据都可能被窃取**。
>
> 请只在下列场景使用：
> - 本机自用（仅监听 `127.0.0.1`）
> - 局域网 / VPN / 内网环境
> - 确需远程访问时，请自行在前端加一层成熟的反向代理，并做好鉴权、限流、TLS 与访问控制
>
> **如因擅自公开到公网而遭遇攻击、导致数据泄漏或其他损失，作者一概不承担责任。**

---

## 免责声明与使用须知
- **开源授权**：本项目基于 `MIT` 协议开放源码，仅供技术研究与学习交流，著作权归作者所有。
- **合规责任归属**：任何部署、修改或对外提供服务者，须独立确保符合《网络安全法》《个人信息保护法》服务相关规定。内容安全过滤、用户数据隐私保护均由使用者自行负责。
- **公网部署风险自负**：本项目仅为个人 / 团队内部使用而设计，未做面向公网的安全加固。**请勿公开到外网使用**；由此遭受攻击、导致数据泄漏或其他损失的，作者不承担任何责任。
- **责任豁免**：代码按“现状”提供，不保证无缺陷或完全适配特定场景。因使用、部署、二次开发或依赖本工具产生的任何直接或间接损失（含数据丢失、业务中断、法律纠纷），作者概不负责。
- **同意生效**：使用、修改、分发或部署本项目，即视为您已充分理解并完全同意本声明全部内容。

## 技术栈

| 层次 | 选型 |
|------|------|
| 后端 | Flask 3 + Flask-SQLAlchemy 3 + Flask-Login |
| 数据库 | SQLite（WAL 模式）+ `sqlite-vec` 向量扩展 |
| 加密 | `cryptography`：AES-256-GCM + RSA-2048 混合加密 |
| 语义检索 | `transformers` + `torch`（CPU）加载本地 `Qwen3-Embedding-0.6B` |
| 前端 | 原生 JS（无框架、无构建），`marked` + `mermaid` + `katex` 全部本地化，可离线 |
| 文档解析 | `python-docx`（Word）、`openpyxl`（Excel） |

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
- 关键词高亮：工具栏输入框实时高亮预览中的匹配文本，并提供「上一条 / 下一条」快速跳转
- Tab 键缩进、Ctrl/⌘+S 手动保存
- 自动保存：停止编辑满 1 分钟后自动静默保存，编辑过程中不会触发；保存成功时工具栏右侧显示绿色对勾 + 文案（手动保存为「保存成功」，自动保存为「自动保存成功」），5 秒后淡出消失
- 未保存的修改在离开页面时仍会弹出提醒
- Mermaid 图表（v12）：用 ```` ```mermaid ```` 围栏代码块写图表定义（flowchart / sequence / class / state / ER / gantt / pie / journey / gitGraph / mindmap / timeline / quadrant / sankey / xychart / requirement / architecture / block / packet / kanban 等），预览区自动渲染成矢量图，宽度跟着容器走，不会撑出横向滚动条
- LaTeX 公式：行内用 `$E=mc^2$`，块级用 `$$ \int_0^1 x^2\,dx=\frac13 $$`，由 KaTeX 渲染；公式有误时回退成纯文本而不是整段报错
- 预览区自适应：表格单元格会自动换行，图片按容器宽度等比缩放，都不会出现横向滚动条

### 文件导入
- 支持导入 .docx（Word）、.xlsx（Excel）、.txt、.md 及常见源代码文件
- Word 导入：标题样式自动转 Markdown 标题，图片**保留在文档原始位置**（不再全部追加到末尾）
- Excel 导入：自动转为 Markdown 表格，多 Sheet 分别渲染
- 批量导入：一次性选择多个文件，逐个上传并汇总结果
- 导入的节点会与手工新建/编辑的一样，自动进入语义索引队列

### 安全加密
- 文章内容走 AES-256-GCM + RSA-2048 混合加密，数据库被人拖走了也读不了
- 注册时自动生成 RSA 密钥对，密钥仅存储在服务端
- document 类型不加密，article 类型自动加密
- 文章级密码锁定：工具栏可针对单篇文章启用密码锁定并设置口令，锁定后任何人（含所有者）每次打开都需输入正确密码才能查看；密码以哈希存储，错误口令返回 401。左侧菜单以锁图标标记被锁定的文章，所有者自身另以钥匙图标标记，因此“自己且已锁定”的文章会同时出现钥匙 + 锁两个图标
  - 临时解锁查看：输入密码只是本次查看有效，切换文章再切回或刷新页面仍需重新输入密码
  - 真正解除锁定：若想以后打开都无需密码，需先输入密码进入查看，再点工具栏锁定按钮打开「密码锁定管理」，点击其中的「解除锁定」才会真正关闭密码保护。锁定文章在密码遮罩态下不展示锁定按钮，避免未解锁就出现“解除锁定”选项
  - 被锁定的文章不参与语义检索索引，避免锁定内容以向量或片段形式泄露

### 权限与分享
- 文档可以分享给其他活跃用户，分享时用对方的公钥重新加密 AES 密钥
- 批量授权/撤销：多选节点后批量开放或收回权限，支持递归子节点
- 权限转让：可将节点所有权转让给其他用户，递归转让时自动用新所有者公钥重加密
- 非所有者查看分享文档时显示只读视图（全宽 HTML 预览，隐藏编辑功能）
- 分享成功时自动发送邮件通知被分享者（未配置 SMTP 时降级为写日志）

### 语义检索
- 基于 `sqlite-vec` + 本地 `Qwen3-Embedding-0.6B`，把文章按「标题 + 正文」切成带重叠的块，编码为 1024 维归一化向量
- 侧边栏切到「语义」模式，用自然语言描述即可检索，按余弦相似度召回，返回文章标题 + 命中片段 + 相似度
- 结果自动按权限过滤，并排除被密码锁定的文章
- 模型**只在 CPU 上运行**，不占用 GPU；向量与业务数据同库（`wiki.sqlite`），不引入额外服务

### 保存后自动重建（异步）
- 新建 / 编辑 / 改名 / 导入文章后，后端把该文章丢进后台队列，由常驻线程整篇重新分块编码并**覆盖旧向量**；请求立即返回，不阻塞编辑与浏览
- 同一篇文章在排队期间多次保存会自动合并为一次
- 转换完成后页面弹出 toast：`《文章标题》向量转换完成`（失败则提示「向量转换失败」）
- 删除文章时同步清理它的向量与分块记录

### 国际化（中 / 英）
- **默认英文**；登录页与登录后的顶栏右侧各有一个「中｜EN」分段滑块开关，两处始终同步
- 切换后前端全部文案（Markdown 工具栏、右键菜单、弹窗、toast）与**后端返回的报错/成功提示**、**分享通知邮件**一起切换
- 选择存在浏览器本地（`localStorage` + cookie `ops-wiki-lang`），刷新与重开都保留；因为登录前就要能切换，所以不做账号级同步
- 后端以中文原文为 msgid 建立英文字典（`services/i18n.py`），业务 handler 无需改动，在 JSON 出口统一翻译

### 管理员功能
- 第一个注册的用户自动成为管理员，后面的人注册需要审批
- 管理员面板：查看所有用户（含注册时间、角色）、审批新用户、停用账户
- 管理员不能停用自己的账号

### 界面与主题
- 藏蓝（Navy）+ 白的配色方案，专业简洁
- 顶部以文字 Logo「Ops Wiki」替代原来的书籍图标
- 统一为单一亮色主题，已取消亮 / 暗模式切换
- 图标统一用内联 SVG（不依赖图标字体，也不用 emoji）

### 其他
- 全文搜索：侧边栏标题实时过滤 + 后端按标题匹配
- 侧边栏宽度可拖拽调整（180-600px）

## 快速开始

### 环境要求

- Python 3.10+（开发环境为 3.12）
- Linux / macOS（Windows 需自行调整 `run.sh`）
- 语义检索需要本地 `Qwen3-Embedding-0.6B` 模型目录，以及约 3GB 可用内存

### 部署前必须修改的地方

仓库里的路径是按作者机器写死的，**克隆下来不能直接用**。下面这些必须改成你自己的，否则会启动失败或把数据写到错误的位置：

| 文件 | 需要修改的项 | 默认值（作者机器） | 说明 |
|------|--------------|--------------------|------|
| `src/ops_wiki/core/config.py` | `_ASSET_ROOT` | `/home/ph/Documents/docs/myself/knowledge` | **必改**。数据库与图片的存放根目录。别的机器上通常无权在该路径创建目录，不改会直接报权限错误 |
| `src/ops_wiki/core/config.py` | `Config.SECRET_KEY` | 一段固定的十六进制字符串 | **必改**。影响 session 签名（不参与内容加密，内容走 RSA）。多实例部署时更要保证一致且保密 |
| `run.sh` | `CONDA_ENV` | `wiki` | **必改**。你要使用的 conda 环境名 |
| `run.sh` | `CONDA_BASE` | `/home/ph/.conda` | **必改**。conda 的安装位置 |
| `run.sh` | `source ".../conda.sh"` | `/root/miniconda3/etc/profile.d/conda.sh` | **必改**。conda 初始化脚本路径，最容易漏掉，不对就起不来 |
| `run.sh` | `LOG_DIR` | `/home/ph/Documents/logs/ops-wiki` | 日志与 PID 文件目录，需保证可写 |
| `run.sh` | `HOST` / `PORT` | `0.0.0.0` / `5100` | 监听地址与端口。自用建议改成 `127.0.0.1` |
| `wsgi.py` | `LOG_DIR` 默认值 | `/home/ph/Documents/logs/ops-wiki` | 直接 `python wsgi.py` 运行时的日志目录；用 `run.sh` 时会由环境变量覆盖 |
| `src/ops_wiki/core/config.py` | `MAIL_SERVER` 等 | 未定义 | 需要邮件通知时自行在 `Config` 里补上（见「配置」第 3 点） |
| 环境变量 | `OPS_WIKI_EMBED_MODEL` | `/home/ph/Documents/modelscope/qwen/embedding` | 本地 embedding 模型目录，模型需自行下载 |

> 只改 `run.sh` 的 conda 路径和 `config.py` 的 `_ASSET_ROOT` 这两处，基本就能在本机跑起来；其余按需调整（参考下面的「环境变量速查」表）。
>
> 另外：`run.sh` 只负责启动 / 停止；不用它、直接用 `python wsgi.py` 或 `gunicorn wsgi:app` 启动也可以，那就只需要关心 `config.py` 和 `wsgi.py`。

### 安装依赖

```bash
pip install -r requirements.txt
```

建议在虚拟环境（venv 或 conda）里安装。

> `requirements.txt` 里的 `torch==2.2.2` 默认会拉 CUDA 版本。**只用 CPU 的话建议单独装 CPU 版**，体积小得多也不引入 nvidia 依赖：
> ```bash
> pip install torch==2.2.2+cpu --index-url https://download.pytorch.org/whl/cpu
> pip install "transformers==4.51.3" "numpy==1.26.4" "sqlite-vec==0.1.9"
> ```
> 注意 `numpy` 必须 `<2`（torch 2.2.2 与 numpy 2.x 的 ABI 不兼容）。

### 配置

配置集中在 `src/ops_wiki/core/config.py`，需要关注的几项（完整清单见上面「部署前必须修改的地方」）：

**1. 数据资产路径（部署到别的机器必须改）**

```python
_ASSET_ROOT = "/home/ph/Documents/docs/myself/knowledge"   # 改为你自己的目录
```

数据库和图片都放在这个目录下（`db/ops-wiki/wiki.sqlite`、`imgs/`），已加入 `.gitignore`，不会随代码提交。

**2. SECRET_KEY**

```bash
python -c "import secrets; print(secrets.token_hex(32))"
```

把输出填到 `Config.SECRET_KEY`。它不参与内容加密（内容加密走 RSA），但影响 session 签名，公网部署务必更换。

**3. 邮件通知（可选）**

邮件相关的配置在 `Config` 里读取，目前**不支持环境变量**，需要在 `config.py` 的 `Config` 类里补上：

```python
MAIL_SERVER = 'smtp.example.com'
MAIL_PORT = 587
MAIL_USERNAME = 'admin@example.com'
MAIL_PASSWORD = 'yourpassword'
MAIL_SENDER = 'noreply@ops-wiki.local'
```

不配置也能正常跑，只是邮件会降级为写日志（日志里会看到 `[EMAIL DISABLED]`）。

**4. 向量索引模型**

模型目录默认 `/home/ph/Documents/modelscope/qwen/embedding`，可用环境变量覆盖：

```bash
export OPS_WIKI_EMBED_MODEL=/path/to/Qwen3-Embedding-0.6B
export OPS_WIKI_EMBED_DEVICE=cpu     # 默认 cpu，不启用 GPU
export OPS_WIKI_EMBED_DTYPE=fp32     # 默认 fp32；内存紧张时可试 bf16
export OPS_WIKI_EMBED_THREADS=4      # CPU 线程数，实测 4 最好
export OPS_WIKI_EMBED_BATCH=16       # 编码批大小，实测 16 最好
export OPS_WIKI_EMBED_WARMUP=true    # 启动时后台预加载模型（设 false 则首次使用时加载）
```

### 初始化向量索引

首次部署需要把已有文章编码入库（之后日常编辑由上面的异步任务自动维护）：

```bash
python scripts/build_vectors.py              # 增量：只处理新增或修改的文章
python scripts/build_vectors.py --rebuild    # 清空后全量重建
python scripts/build_vectors.py --node-id 10 # 只重建某一篇（验证用）
python scripts/build_vectors.py --prune      # 顺带清理已删除节点的残留向量
```

- 索引与业务数据同库，会自动创建 `node_chunk` / `vec_node_chunk` / `vec_index_state` / `vec_meta` 四张表
- 密文（article）会用所有者的 RSA 私钥解密后再编码；正文为空的节点、被锁定的文章会跳过
- CPU 推理实测约 0.55 块/秒；以本仓库作者的数据量（约 800 块）为例，全量首建约 20–30 分钟

### 启动

项目提供了 `run.sh` 一键脚本，使用 conda 的 `wiki` 环境，日志输出到 `/home/ph/Documents/logs/ops-wiki`。

> ⚠️ 首次使用前请先按「部署前必须修改的地方」改掉 `run.sh` 里的 conda 路径（`CONDA_ENV`、`CONDA_BASE`、`conda.sh` 的路径）和 `LOG_DIR`，否则会启动失败。

```bash
./run.sh start     # 启动（后台运行，开发模式 Flask 内置服务器）
./run.sh stop      # 停止
./run.sh restart   # 重启
./run.sh status    # 查看状态
```

默认监听 `0.0.0.0:5100`，浏览器打开 `http://localhost:5100` 即可。第一个注册的账号自动是管理员，后续注册需要管理员审批才能登录。

生产环境使用 gunicorn：

```bash
OPS_WIKI_MODE=gunicorn ./run.sh start
# 或手动：
gunicorn -w 1 -b 0.0.0.0:5100 wsgi:app
```

> `run.sh` 已把 gunicorn 的 worker 数固定为 `1`（脚本里的 `WORKERS`），**不要调大** —— 原因见下面的单进程说明。

> ⚠️ **语义检索请单进程运行**（`OPS_WIKI_MODE=dev`，或 gunicorn `-w 1`）。模型常驻内存约 2.7GB，每个 worker 都会加载一份；而且异步转换的完成事件保存在进程内存里，多 worker 时「保存」和「轮询提示」可能落在不同进程，toast 会收不到。

### 环境变量速查

| 变量 | 作用 | 默认值 |
|------|------|--------|
| `OPS_WIKI_MODE` | `dev`（Flask 内置服务器）或 `gunicorn` | `dev` |
| `LOG_DIR` | 日志目录 | `/home/ph/Documents/logs/ops-wiki` |
| `FLASK_DEBUG` | 是否开启 Flask debug | `false` |
| `OPS_WIKI_EMBED_MODEL` | embedding 模型目录 | `/home/ph/Documents/modelscope/qwen/embedding` |
| `OPS_WIKI_EMBED_DEVICE` | 推理设备 | `cpu` |
| `OPS_WIKI_EMBED_DTYPE` | 权重精度 `fp32` / `bf16` | `fp32` |
| `OPS_WIKI_EMBED_THREADS` | CPU 推理线程数 | `4` |
| `OPS_WIKI_EMBED_BATCH` | 编码批大小 | `16` |
| `OPS_WIKI_EMBED_WARMUP` | 启动时预加载模型 | `true` |

## 项目结构

后端 Python 代码统一放在 `src/ops_wiki/` 包内并按职责拆成子包（core / models / routes / services），前端资源放在 `web/`，运行时数据与日志落在仓库外的个人数据目录。

```
ops-wiki/
├── run.sh                  # 一键启动/停止/重启/状态（start|stop|restart|status）
├── wsgi.py                 # WSGI 入口：配置日志 + 应用工厂
├── requirements.txt        # 依赖（含 gunicorn）
├── scripts/
│   ├── build_vectors.py    # 向量索引：解密文章 -> 分块 -> CPU 编码 -> 写入 sqlite-vec
│   └── check_i18n.py       # 国际化一致性检查（残留中文 / 字典 key 对齐 / 后端文案覆盖）
├── src/
│   └── ops_wiki/           # 后端 Python 包（按用途归类为 4 个子包）
│       ├── core/           # 应用装配与配置
│       │   ├── app.py          # 应用入口：组装 Flask、注册蓝图、图片路由、加载 sqlite-vec、建表/迁移
│       │   ├── config.py       # 配置：SECRET_KEY、数据库、邮件、图片目录、embedding 参数
│       │   └── extensions.py   # 扩展实例：db、login_manager
│       ├── models/         # 数据模型
│       │   └── models.py       # User、Node、NodePermission
│       ├── routes/         # 蓝图路由（按业务入口划分）
│       │   ├── auth.py         # 认证：注册/登录/登出/session（含 RSA 密钥生成）
│       │   ├── views.py        # 主 API：节点 CRUD、树、搜索（标题/语义）、导入、分享、转让、图片上传
│       │   └── admin.py        # 管理：用户审批、停用、列表
│       └── services/       # 安全、检索与横切工具
│           ├── crypto.py       # 加解密：AES-256-GCM + RSA-2048 混合加密
│           ├── decorators.py   # 装饰器：管理员权限校验
│           ├── email_utils.py  # 邮件通知（无 SMTP 时降级为日志）
│           ├── embedding.py    # 本地 Qwen3-Embedding（CPU）懒加载与编码
│           ├── chunker.py      # 文章分块（标题+正文，带重叠）
│           ├── vector_store.py # sqlite-vec 建表与 KNN 检索
│           ├── indexer.py      # 单篇文章索引（解密 -> 分块 -> 编码 -> 写库）
│           ├── index_queue.py  # 保存后的异步重建：后台线程 + 去重队列 + 完成事件
│           └── i18n.py         # 后端国际化：中文 msgid -> 英文，JSON 出口统一翻译
├── web/                    # 前端资源
│   ├── templates/
│   │   └── index.html      # 单页应用入口（含登录/注册、编辑器、各类弹窗）
│   └── static/
│       ├── css/style.css   # 全局样式
│       ├── vendor/         # 本地化的前端依赖（mermaid、katex 及字体），离线可用
│       └── js/             # 前端逻辑：i18n / api / auth / editor / tree / semantic / app
└── （仓库外，路径见 config.py 的 _ASSET_ROOT）
    ├── db/ops-wiki/wiki.sqlite   # SQLite 数据库（自动创建）
    └── imgs/                     # 上传 / 导入的图片（自动创建）
    # 日志：/home/ph/Documents/logs/ops-wiki/ops-wiki.log
```

### 目录划分原则

后端按“技术层 + 业务域”双重维度归类：`core` 放应用装配与全局配置、`models` 放数据模型、`routes` 放对外 API 蓝图、`services` 放加密/检索/通知/权限等可复用的横切能力。前端资源与后端代码分离到 `web/`，个人数据资产（数据库、图片）全部放在仓库外的 `_ASSET_ROOT` 下，绝不随代码提交。

### 数据库结构

业务表（SQLAlchemy 定义，启动时自动创建）：

| 表 | 说明 |
|----|------|
| `user` | 账号：邮箱、密码哈希、昵称、激活/管理员标志、RSA 密钥对 |
| `node` | 文档树节点：标题、内容（article 为密文）、类型、父节点、排序、锁定字段 |
| `node_permission` | 授权/回收记录（`is_active` 区分授权与撤销） |

语义检索表（启动时自动创建，写入由索引脚本/异步任务完成）：

| 表 | 说明 |
|----|------|
| `node_chunk` | 分块元数据：`node_id`、块序号、标题、块文本、token 数 |
| `vec_node_chunk` | `vec0` 虚拟表，存 1024 维归一化向量，`rowid` 对应 `node_chunk.id` |
| `vec_index_state` | 每个节点的索引状态：内容指纹 `source_hash`、块数、模型标识 |
| `vec_meta` | 索引元信息：模型名、维度、构建时间 |

启动时还会做两件兼容处理：`_migrate_schema()` 给旧库补齐 `node.is_locked` / `node.lock_password_hash` 列；`_init_vector_schema()` 幂等创建上述向量表。每个 SQLite 连接都会自动加载 `sqlite-vec` 扩展。

## API 概览

接口都是 JSON API，前缀 `/api`；响应中的报错/提示文案会按请求携带的 `ops-wiki-lang` cookie 自动切换中/英。

### 认证 `/api/auth`

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/register` | 注册（首用户自动激活 + 管理员），生成 RSA-2048 密钥对 |
| POST | `/login` | 登录（需已激活） |
| POST | `/logout` | 登出 |
| GET | `/me` | 当前用户信息 |

### 文档 `/api`

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/nodes` | 获取文档树（`?flat=true` 返回平铺列表） |
| POST | `/nodes` | 创建节点（document 或 article，同级标题不可重复） |
| GET | `/nodes/:id` | 获取节点详情（含解密内容、被授权者列表、`is_owner` 标记）。返回 `locked`；锁定文章该接口始终 `content` 为空（前端展示密码遮罩），需另行调用 `/unlock` 获取明文 |
| PUT | `/nodes/:id` | 更新节点（标题或内容）。article 支持 `is_locked`（bool）与 `lock_password`；`is_locked: false` 才会真正关闭密码保护。内容或标题变化会触发异步重建向量 |
| DELETE | `/nodes/:id` | 删除节点及其子节点，并清理对应的向量索引 |
| PUT | `/nodes/:id/move` | 移动节点到新父节点（支持拖拽，防循环引用） |
| PUT | `/nodes/:id/rename` | 重命名节点标题（会触发异步重建向量） |
| POST | `/nodes/:id/unlock` | 校验锁定密码；正确则**本次响应**返回明文 `content`（下次 GET 仍会被锁定），错误返回 401 |
| GET | `/nodes/search?q=&type=` | 标题关键词搜索（可选类型过滤） |
| GET | `/nodes/semantic-search?q=&limit=` | 语义检索（需已建索引）。按权限过滤并排除锁定文章，返回 `[{node, chunk_index, snippet, score}]` |
| GET | `/nodes/index-events?after=` | 轮询异步向量转换的完成事件（供页面 toast）。首次不带 `after` 只返回游标 `latest` |
| POST | `/nodes/:id/share` | 分享节点给其他用户（含邮件通知） |
| DELETE | `/nodes/:id/share/:grantee_id` | 取消分享 |
| POST | `/nodes/batch-authorize` | 批量授权/撤销（支持 `recursive` 递归子节点） |
| POST | `/nodes/:id/transfer` | 转让节点所有权（支持 `recursive` 递归转让 + 重加密） |
| POST | `/nodes/import/batch` | 批量导入 JSON 格式节点数据 |
| POST | `/nodes/import/file` | 通用文件导入（.txt/.md/.docx/.xlsx 等，multipart） |
| POST | `/nodes/:parent_id/import` | 导入 Markdown/纯文本到指定父节点下 |
| POST | `/nodes/:parent_id/import-word` | 导入 Word 到指定父节点下（图片保留原始位置） |
| POST | `/nodes/:parent_id/import-excel` | 导入 Excel 到指定父节点下（多 Sheet 渲染为多个表格） |
| POST | `/images/upload` | 上传图片到本地图片库，返回访问 URL |
| GET | `/users` | 列出可分享的活跃用户（排除自己） |

### 管理 `/api/admin`

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/users` | 所有用户列表（含角色、状态、注册时间） |
| POST | `/users/:id/approve` | 审批激活用户 |
| POST | `/users/:id/deactivate` | 停用用户（不能停自己） |

### 页面与静态文件

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/` | 单页应用入口 |
| GET | `/images/<filename>` | 访问导入/上传的图片文件 |
| GET | `/static/...` | 前端静态资源（CSS / JS / vendor） |

## 开发与维护

### 国际化一致性检查

新增或修改文案后跑一次，避免漏译：

```bash
python scripts/check_i18n.py
```

它会检查四件事：

1. 前端 JS 里除注释/开发者日志外，不应残留中文字面量
2. `index.html` 用到的 `data-i18n*` key 必须都在字典里
3. `i18n.js` 的 `en` / `zh` 两套 key 必须完全一致
4. 后端所有 `jsonify` 的 `error` / `message` 文案都能被 `services/i18n.py` 翻译成英文

另外它还会扫描 JS 模板字符串：`I18n.t()` 若写在反引号的**字面量区**（而不是 `${}` 里）会被当成纯文本原样输出，这种情况会直接报错。

### 新增文案的正确写法

| 场景 | 写法 |
|------|------|
| 静态 HTML | 英文默认文案 + `data-i18n="key"`，属性类用 `data-i18n-placeholder` / `data-i18n-title` / `data-i18n-aria` |
| JS 拼字符串 | `'<p>' + I18n.t('key') + '</p>'` |
| JS 模板字符串 | `` `<p>${I18n.t('key')}</p>` ``（注意必须用 `${}`） |
| 带参数 | `I18n.t('key', { name: value })`，字典里写 `{name}` 占位 |
| 后端提示 | handler 里照常写中文，同时往 `services/i18n.py` 的 `EN`（精确）或 `PATTERNS`（带参数）里补一条 |
| 非 JSON 消息（如邮件） | `services/i18n.py` 的 `t('email.share.subject', nickname=..., title=...)` |

### 重建向量索引

- 日常编辑：保存后自动异步重建，无需干预
- 换了 embedding 模型、或调整了分块参数：`python scripts/build_vectors.py --rebuild`
- 只怀疑某篇不对：`python scripts/build_vectors.py --node-id <id> --force`
- 手工改过数据库、删过节点：加 `--prune` 清理残留分块

## 注意事项

- 默认使用 SQLite，并发写多的时候可能会有锁冲突（连接超时设为 5 秒）。小团队（几十个人）问题不大，人多了建议换 PostgreSQL。
- 加密是 article 类型自动触发的，document 类型不加密。加密后的内容在数据库里是密文，但前端展示时会解密，所以**公网部署必须上 HTTPS**，否则中间人能看到明文。
- 分享文档时，会用被分享者的 RSA 公钥重新加密 AES 密钥。如果被分享者还没登录过（没有密钥对），分享会失败。
- 转让节点所有权时，系统会用当前所有者的私钥解密，再用新所有者的公钥重新加密。递归转让时每个子节点都会独立重加密。
- `SECRET_KEY` 建议换掉默认值。虽然它不直接用于内容加密（内容加密走 RSA），但它影响 session 签名。
- 管理员不能删自己的账号，只能让别的管理员来停用。
- Word 文档中的图片在导入时会被提取保存到 `imgs/` 目录，通过 `/images/` 路由访问，并保留在文档中的原始段落位置。
- Excel 导入时，每个 Sheet 会渲染为一个独立的 Markdown 表格，以 `## Sheet名称` 作为二级标题。
- 删除节点时，其直接子节点会**上移**到被删节点的父节点下，而不是级联删除。
- 被分享的节点在分享对象的树中也能看到完整的父级链（祖先节点即使没有直接权限也会显示）。
- 语义检索的索引状态用「标题 + 明文正文」的 SHA-256 指纹判断是否需要重建；因此只用脚本做增量时，指纹未变的文章会被跳过（这正是 `--force` 的用途）。
- 分块文本会以明文形式存入 `node_chunk`（用于展示命中片段）。若对这一点敏感，可以改为只存向量、检索时再解密取片段。
- 邮件通知的语言跟随**分享者的当前界面语言**，而不是收件人的语言。
- 数据库、图片、日志都在 `.gitignore` 里，不会随代码提交；`_ASSET_ROOT` 是作者机器上的绝对路径，部署到别处记得改。

## 许可

MIT License，详见 [LICENSE](LICENSE)。

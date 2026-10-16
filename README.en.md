# Ops Wiki

English | [中文](README.md)

A lightweight, open-box team wiki built on Flask with a single-page application front end.

It organizes documents as a tree, gives you Markdown editing with live preview, encrypts article content end to end, shares only with the people you choose, and ships with semantic search that runs locally on CPU. No heavy wiki platform to deploy — it works for one person or a whole team.

---

> ## ⚠️ Do not expose this to the public internet
>
> **This project is meant for a personal knowledge base or a team's internal network. Never put it directly on the public internet.**
>
> It is deliberately a lightweight internal tool and **has not been hardened against serious attacks**: no WAF, no login throttling or lockout, no audit log and no intrusion detection. Its security boundary is essentially the default of Python / Flask / SQLite. Once exposed publicly it is easily found by scanners and then hit with brute force, exploit attempts or denial of service — and **article content, password hashes and RSA private keys can all be exfiltrated**.
>
> Please only use it in these setups:
> - Locally on your own machine (bind to `127.0.0.1` only)
> - A LAN / VPN / internal network
> - If remote access is genuinely needed, put a mature reverse proxy in front yourself, with proper authentication, rate limiting, TLS and access control
>
> **If you expose it publicly and suffer an attack, a data leak or any other loss as a result, the author accepts no responsibility whatsoever.**

---

## Disclaimer and Terms of Use
- **Open source license**: This project is released under the `MIT` license for technical research and learning. Copyright remains with the author.
- **Compliance is your responsibility**: Anyone who deploys, modifies, or provides services based on this project must independently ensure compliance with applicable laws and regulations. Content moderation and user data privacy are entirely the responsibility of the operator.
- **Public exposure is at your own risk**: This project is designed for personal / internal team use and has not been hardened for the public internet. **Do not expose it publicly.** The author accepts no responsibility for attacks, data leaks or any other loss resulting from doing so.
- **Limitation of liability**: The code is provided "as is", with no guarantee that it is defect-free or suitable for any particular scenario. The author is not liable for any direct or indirect loss (including data loss, business interruption, or legal disputes) arising from use, deployment, or further development of this tool.
- **Acceptance**: By using, modifying, distributing, or deploying this project, you confirm that you have fully understood and accepted this entire disclaimer.

## Tech Stack

| Layer | Choice |
|-------|--------|
| Backend | Flask 3 + Flask-SQLAlchemy 3 + Flask-Login |
| Database | SQLite (WAL mode) + the `sqlite-vec` vector extension |
| Encryption | `cryptography`: AES-256-GCM + RSA-2048 hybrid encryption |
| Semantic search | `transformers` + `torch` (CPU) running a local `Qwen3-Embedding-0.6B` |
| Front end | Vanilla JS (no framework, no build step); `marked`, `mermaid` and `katex` are vendored locally so it works offline |
| Document parsing | `python-docx` (Word), `openpyxl` (Excel) |

## Features

### Document management
- Tree-structured documents: `document` folders and `article` pages, nested to any depth
- Drag to move a node (long press to start), with loop protection; dragging to the top or bottom edge auto-scrolls the list — hold the pointer still and it keeps scrolling, so you can reach nodes outside the visible area (faster the closer you get to the edge)
- Rename from the right-click context menu
- Ctrl+Click multi-select for batch operations
- Unique titles between siblings

### Markdown editor
- Split view: Markdown on the left, live HTML preview on the right, with a draggable splitter
- Snapping: drag the splitter to an edge to go full Markdown or full preview
- Two-way scroll sync between the Markdown pane and the preview
- Keyword highlighting: the toolbar input highlights matches in the preview in real time, with previous/next navigation
- Tab to indent, Ctrl/⌘+S to save manually
- Autosave: one minute after you stop typing it saves silently in the background (never while you are still typing). A green check plus a label appears on the right of the toolbar — "Saved" for manual saves, "Autosaved" for automatic ones — and fades out after 5 seconds
- A warning still appears if you leave the page with unsaved changes
- Mermaid diagrams (v12): use a ```` ```mermaid ```` fenced block (flowchart / sequence / class / state / ER / gantt / pie / journey / gitGraph / mindmap / timeline / quadrant / sankey / xychart / requirement / architecture / block / packet / kanban, etc.) and the preview renders it as a vector diagram that respects container width, so no horizontal scrollbar
- LaTeX math: inline with `$E=mc^2$`, display with `$$ \int_0^1 x^2\,dx=\frac13 $$`, rendered by KaTeX; a malformed formula falls back to plain text instead of breaking the whole block
- Preview adapts to width: table cells wrap and images scale to the container, with no horizontal overflow

### File import
- Import .docx (Word), .xlsx (Excel), .txt, .md and common source files
- Word import: heading styles become Markdown headings, and images **stay in their original position** in the document
- Excel import: converted to Markdown tables, one per sheet
- Batch import: pick several files at once, upload them one by one, and get a summary
- Imported nodes go through the same semantic indexing queue as hand-written or edited ones

### Security and encryption
- Article content uses AES-256-GCM + RSA-2048 hybrid encryption, so a stolen database file is unreadable
- An RSA key pair is generated at registration; private keys stay on the server
- `document` nodes are stored in plain text; `article` nodes are encrypted automatically
- Per-article password lock: from the toolbar you can lock a single article with a passphrase. Once locked, everyone (including the owner) must enter the correct password to view it each time; the password is stored hashed and a wrong passphrase returns 401. The sidebar marks locked articles with a lock icon and marks your own locked articles with a key icon as well, so "mine and locked" shows both
  - Temporary unlock: entering the password only applies to the current view; switching away and back, or reloading, requires the password again
  - Removing the lock permanently: enter the password to view, open the toolbar lock button, and use "Remove lock" in the password-lock dialog. A locked article does not show the lock button while the password overlay is up, so "Remove lock" can never appear before unlocking
  - Locked articles are excluded from the semantic index, so locked content cannot leak through vectors or snippets

### Permissions and sharing
- Share documents with other active users; the AES key is re-encrypted with the recipient's public key
- Batch grant/revoke: select multiple nodes and grant or revoke access at once, optionally including descendants
- Ownership transfer: hand a node to another user, re-encrypting every node recursively with the new owner's public key
- Non-owners see a read-only view (full-width HTML preview, editing hidden)
- Sharing sends an email notification to the recipient (falls back to logging when SMTP is not configured)

### Semantic search
- Built on `sqlite-vec` plus a local `Qwen3-Embedding-0.6B`: articles are split into overlapping chunks prefixed with their title and encoded into 1024-dimensional normalized vectors
- Switch the sidebar to "Semantic" and search in natural language; results are recalled by cosine similarity and show the title, the matching snippet, and a similarity score
- Results are filtered by permission and exclude password-locked articles
- The model runs **on CPU only** and never touches the GPU; vectors live in the same `wiki.sqlite` as your data, so no extra service is needed

### Automatic re-indexing after save (async)
- After you create, edit, rename, or import an article, the backend queues it; a resident worker thread re-chunks and re-encodes the whole article and **overwrites the previous vectors**. The request returns immediately and never blocks editing or browsing
- Saving the same article repeatedly while it is queued collapses into a single job
- When it finishes, the page shows a toast: `"Article title" vectorization complete` (or a failure notice)
- Deleting an article cleans up its vectors and chunks

### Internationalization (Chinese / English)
- **English is the default**; there is a segmented "中 | EN" switch on the login screen and on the right of the top bar after login, and the two stay in sync
- Switching changes all front-end copy (Markdown toolbar, context menu, dialogs, toasts) together with **backend error/success messages** and **share notification emails**
- The choice is stored in the browser (`localStorage` + the `ops-wiki-lang` cookie) and survives refresh and restart. It is not synced per account, because the switch has to work before login
- The backend keys its English dictionary by the Chinese source string (`services/i18n.py`), so route handlers need no changes; translation happens at the JSON boundary

### Admin
- The first registered user becomes an admin automatically; later registrations need approval
- Admin panel: list all users (with role and registration time), approve new users, deactivate accounts
- Admins cannot deactivate their own account

### Interface and theme
- Navy + white palette: professional and clean
- Text wordmark "Ops Wiki" in the header instead of a book icon
- A single light theme; the light/dark toggle was removed
- Icons are inline SVG throughout — no icon fonts, no emoji

### Other
- Search: live title filtering in the sidebar plus backend title matching
- Sidebar width is draggable (180–600 px)

## Getting Started

### Requirements

- Python 3.10+ (developed on 3.12)
- Linux / macOS (adjust `run.sh` on Windows)
- Semantic search needs a local `Qwen3-Embedding-0.6B` model directory and roughly 3 GB of free memory

### Changes required before deploying

Paths in this repository are hard-coded to the author's machine, so **a fresh clone will not run as-is**. Change the following to your own values, otherwise startup fails or data lands in the wrong place:

| File | What to change | Default (author's machine) | Notes |
|------|----------------|----------------------------|-------|
| `src/ops_wiki/core/config.py` | `_ASSET_ROOT` | `/home/ph/Documents/docs/myself/knowledge` | **Required.** Root directory for the database and images. On another machine you usually cannot create that path and will get a permission error |
| `src/ops_wiki/core/config.py` | `Config.SECRET_KEY` | a fixed hex string | **Required.** Signs sessions (it does not encrypt content — that is RSA). With multiple instances it must be identical and secret |
| `run.sh` | `CONDA_ENV` | `wiki` | **Required.** The conda environment to use |
| `run.sh` | `CONDA_BASE` | `/home/ph/.conda` | **Required.** Where conda is installed |
| `run.sh` | `source ".../conda.sh"` | `/root/miniconda3/etc/profile.d/conda.sh` | **Required.** The conda init script. Easiest one to miss; a wrong path means the service will not start at all |
| `run.sh` | `LOG_DIR` | `/home/ph/Documents/logs/ops-wiki` | Log and PID directory; must be writable |
| `run.sh` | `HOST` / `PORT` | `0.0.0.0` / `5100` | Bind address and port. Use `127.0.0.1` for personal use |
| `wsgi.py` | `LOG_DIR` default | `/home/ph/Documents/logs/ops-wiki` | Log directory when running `python wsgi.py` directly (overridden by the env var under `run.sh`) |
| `src/ops_wiki/core/config.py` | `MAIL_SERVER` etc. | not defined | Add them to `Config` if you want email notifications (see point 3 under Configuration) |
| Environment variable | `OPS_WIKI_EMBED_MODEL` | `/home/ph/Documents/modelscope/qwen/embedding` | Local embedding model directory; download the model yourself |

> Changing just the conda paths in `run.sh` and `_ASSET_ROOT` in `config.py` is enough to get it running locally; everything else is optional (see the environment variable table below).
>
> Also note: `run.sh` only starts and stops the service. You can skip it entirely and run `python wsgi.py` or `gunicorn wsgi:app`, in which case you only need to care about `config.py` and `wsgi.py`.

### Install dependencies

```bash
pip install -r requirements.txt
```

A virtual environment (venv or conda) is recommended.

> `requirements.txt` pins `torch==2.2.2`, which pulls the CUDA build by default. **If you only need CPU, install the CPU wheel separately** — it is far smaller and brings no NVIDIA dependencies:
> ```bash
> pip install torch==2.2.2+cpu --index-url https://download.pytorch.org/whl/cpu
> pip install "transformers==4.51.3" "numpy==1.26.4" "sqlite-vec==0.1.9"
> ```
> Note that `numpy` must be `<2`: torch 2.2.2 is not ABI-compatible with numpy 2.x.

### Configuration

Everything lives in `src/ops_wiki/core/config.py`. The important parts (see the full list in "Changes required before deploying" above):

**1. Data asset path (must be changed on any other machine)**

```python
_ASSET_ROOT = "/home/ph/Documents/docs/myself/knowledge"   # point this at your own directory
```

The database and images live under this directory (`db/ops-wiki/wiki.sqlite`, `imgs/`). They are covered by `.gitignore` and are never committed.

**2. SECRET_KEY**

```bash
python -c "import secrets; print(secrets.token_hex(32))"
```

Put the output into `Config.SECRET_KEY`. It is not used to encrypt content (that goes through RSA), but it signs sessions, so change it before exposing the service.

**3. Email notifications (optional)**

Email settings are read from `Config`, and **environment variables are not supported** for them. Add them to the `Config` class in `config.py`:

```python
MAIL_SERVER = 'smtp.example.com'
MAIL_PORT = 587
MAIL_USERNAME = 'admin@example.com'
MAIL_PASSWORD = 'yourpassword'
MAIL_SENDER = 'noreply@ops-wiki.local'
```

Without this the app still runs fine; emails are simply logged instead (you will see `[EMAIL DISABLED]` in the log).

**4. Embedding model**

The model directory defaults to `/home/ph/Documents/modelscope/qwen/embedding` and can be overridden by environment variables:

```bash
export OPS_WIKI_EMBED_MODEL=/path/to/Qwen3-Embedding-0.6B
export OPS_WIKI_EMBED_DEVICE=cpu     # defaults to cpu; GPU is not used
export OPS_WIKI_EMBED_DTYPE=fp32     # fp32 by default; try bf16 if memory is tight
export OPS_WIKI_EMBED_THREADS=4      # CPU threads; 4 measured fastest
export OPS_WIKI_EMBED_BATCH=16       # encoding batch size; 16 measured fastest
export OPS_WIKI_EMBED_WARMUP=true    # preload the model in the background at startup
```

### Build the vector index

On a fresh deployment, encode the existing articles once (day-to-day edits are handled automatically afterwards):

```bash
python scripts/build_vectors.py              # incremental: only new or changed articles
python scripts/build_vectors.py --rebuild    # wipe and rebuild everything
python scripts/build_vectors.py --node-id 10 # rebuild a single article (for verifying)
python scripts/build_vectors.py --prune      # also drop vectors for deleted nodes
```

- The index lives in the same database and creates four tables: `node_chunk`, `vec_node_chunk`, `vec_index_state`, `vec_meta`
- Encrypted (`article`) content is decrypted with the owner's RSA private key before encoding; empty nodes and locked articles are skipped
- CPU inference measures around 0.55 chunks/second; for the author's corpus (~800 chunks) a full first build takes roughly 20–30 minutes

### Run

`run.sh` is a convenience wrapper that uses the conda environment `wiki` and logs to `/home/ph/Documents/logs/ops-wiki`.

> ⚠️ Before the first run, change the conda paths in `run.sh` (`CONDA_ENV`, `CONDA_BASE` and the `conda.sh` path) plus `LOG_DIR`, as listed under "Changes required before deploying" — otherwise it will fail to start.

```bash
./run.sh start     # start in the background (dev mode, Flask's built-in server)
./run.sh stop      # stop
./run.sh restart   # restart
./run.sh status    # status
```

It listens on `0.0.0.0:5100` — open `http://localhost:5100`. The first registered account becomes the admin automatically; later accounts need admin approval before they can log in.

For production, use gunicorn:

```bash
OPS_WIKI_MODE=gunicorn ./run.sh start
# or manually:
gunicorn -w 1 -b 0.0.0.0:5100 wsgi:app
```

> `run.sh` pins the gunicorn worker count to `1` (the `WORKERS` variable). **Do not raise it** — see the single-process note below.

> ⚠️ **Run semantic search as a single process** (`OPS_WIKI_MODE=dev`, or gunicorn `-w 1`). The model is resident at about 2.7 GB and every worker loads its own copy; on top of that, async re-indexing completion events are held in process memory, so with multiple workers the save and the polling request can land in different processes and the toast never appears.

### Environment variables

| Variable | Purpose | Default |
|----------|---------|---------|
| `OPS_WIKI_MODE` | `dev` (Flask dev server) or `gunicorn` | `dev` |
| `LOG_DIR` | Log directory | `/home/ph/Documents/logs/ops-wiki` |
| `FLASK_DEBUG` | Enable Flask debug mode | `false` |
| `OPS_WIKI_EMBED_MODEL` | Embedding model directory | `/home/ph/Documents/modelscope/qwen/embedding` |
| `OPS_WIKI_EMBED_DEVICE` | Inference device | `cpu` |
| `OPS_WIKI_EMBED_DTYPE` | Weight precision: `fp32` / `bf16` | `fp32` |
| `OPS_WIKI_EMBED_THREADS` | CPU inference threads | `4` |
| `OPS_WIKI_EMBED_BATCH` | Encoding batch size | `16` |
| `OPS_WIKI_EMBED_WARMUP` | Preload the model at startup | `true` |

## Project Layout

Backend Python code lives in the `src/ops_wiki/` package split by responsibility (core / models / routes / services), front-end assets live in `web/`, and runtime data plus logs live outside the repository.

```
ops-wiki/
├── run.sh                  # start/stop/restart/status helper (start|stop|restart|status)
├── wsgi.py                 # WSGI entry point: logging setup + app factory
├── requirements.txt        # dependencies (gunicorn included)
├── scripts/
│   ├── build_vectors.py    # vector index: decrypt -> chunk -> CPU encode -> write to sqlite-vec
│   └── check_i18n.py       # i18n consistency check (stray Chinese / key parity / backend coverage)
├── src/
│   └── ops_wiki/           # backend package (four sub-packages by purpose)
│       ├── core/           # app wiring and configuration
│       │   ├── app.py          # app factory: blueprints, image route, sqlite-vec loading, schema setup
│       │   ├── config.py       # config: SECRET_KEY, database, mail, image dir, embedding options
│       │   └── extensions.py   # shared extension instances: db, login_manager
│       ├── models/         # data models
│       │   └── models.py       # User, Node, NodePermission
│       ├── routes/         # blueprints
│       │   ├── auth.py         # auth: register / login / logout / session (RSA key generation)
│       │   ├── views.py        # main API: node CRUD, tree, search (title/semantic), import, share, transfer, upload
│       │   └── admin.py        # admin: approve, deactivate, list users
│       └── services/       # security, retrieval and cross-cutting helpers
│           ├── crypto.py       # AES-256-GCM + RSA-2048 hybrid encryption
│           ├── decorators.py   # admin-only route decorator
│           ├── email_utils.py  # email notification (logs instead when SMTP is absent)
│           ├── embedding.py    # local Qwen3-Embedding (CPU) lazy loading and encoding
│           ├── chunker.py      # article chunking (title + body, with overlap)
│           ├── vector_store.py # sqlite-vec schema and KNN search
│           ├── indexer.py      # single-article indexing (decrypt -> chunk -> encode -> store)
│           ├── index_queue.py  # async rebuild after save: worker thread + dedup queue + events
│           └── i18n.py         # backend i18n: Chinese msgid -> English, translated at the JSON boundary
├── web/                    # front-end assets
│   ├── templates/
│   │   └── index.html      # SPA entry (login/register, editor, dialogs)
│   └── static/
│       ├── css/style.css   # global styles
│       ├── vendor/         # vendored front-end deps (mermaid, katex and fonts) for offline use
│       └── js/             # front-end logic: i18n / api / auth / editor / tree / semantic / app
└── (outside the repo; see _ASSET_ROOT in config.py)
    ├── db/ops-wiki/wiki.sqlite   # SQLite database (created automatically)
    └── imgs/                     # uploaded / imported images (created automatically)
    # logs: /home/ph/Documents/logs/ops-wiki/ops-wiki.log
```

### Why this layout

The backend is organized along two axes — technical layer and business area: `core` holds app wiring and global config, `models` holds data models, `routes` holds the HTTP blueprints, and `services` holds reusable cross-cutting capabilities such as crypto, retrieval, notification, and permissions. Front-end assets are kept separate under `web/`, and personal data assets (database, images) live under `_ASSET_ROOT` outside the repository so they are never committed.

### Database schema

Business tables (defined with SQLAlchemy, created automatically on startup):

| Table | Purpose |
|-------|---------|
| `user` | Accounts: email, password hash, nickname, active/admin flags, RSA key pair |
| `node` | Tree nodes: title, content (ciphertext for articles), type, parent, ordering, lock fields |
| `node_permission` | Grant/revoke records (`is_active` distinguishes a grant from a revoke) |

Semantic search tables (created automatically; populated by the script or the async worker):

| Table | Purpose |
|-------|---------|
| `node_chunk` | Chunk metadata: `node_id`, chunk index, title, chunk text, token count |
| `vec_node_chunk` | `vec0` virtual table holding 1024-dim normalized vectors; `rowid` maps to `node_chunk.id` |
| `vec_index_state` | Per-node index state: content fingerprint `source_hash`, chunk count, model tag |
| `vec_meta` | Index metadata: model name, dimension, build time |

Two compatibility steps also run at startup: `_migrate_schema()` adds `node.is_locked` / `node.lock_password_hash` to older databases, and `_init_vector_schema()` idempotently creates the vector tables. Every SQLite connection loads the `sqlite-vec` extension automatically.

## API Overview

All endpoints are JSON APIs under `/api`. Error and status messages switch between Chinese and English based on the `ops-wiki-lang` cookie sent by the client.

### Auth `/api/auth`

| Method | Path | Description |
|--------|------|-------------|
| POST | `/register` | Register (first user is activated as admin); generates an RSA-2048 key pair |
| POST | `/login` | Log in (account must be active) |
| POST | `/logout` | Log out |
| GET | `/me` | Current user |

### Documents `/api`

| Method | Path | Description |
|--------|------|-------------|
| GET | `/nodes` | Document tree (`?flat=true` returns a flat list) |
| POST | `/nodes` | Create a node (document or article; sibling titles must be unique) |
| GET | `/nodes/:id` | Node detail (decrypted content, grantee list, `is_owner`). Includes `locked`; for a locked article `content` is always empty (the UI shows the password overlay) — call `/unlock` for the plaintext |
| PUT | `/nodes/:id` | Update title or content. Articles accept `is_locked` (bool) and `lock_password`; only `is_locked: false` actually removes protection. Content or title changes trigger an async vector rebuild |
| DELETE | `/nodes/:id` | Delete a node and its descendants, and clean up their vectors |
| PUT | `/nodes/:id/move` | Move a node under a new parent (supports drag and drop, loop-safe) |
| PUT | `/nodes/:id/rename` | Rename a node (triggers an async vector rebuild) |
| POST | `/nodes/:id/unlock` | Verify the lock password; on success returns plaintext `content` **for this response only** (the next GET is locked again); 401 on a wrong password |
| GET | `/nodes/search?q=&type=` | Title keyword search (optional type filter) |
| GET | `/nodes/semantic-search?q=&limit=` | Semantic search (requires a built index). Filters by permission and excludes locked articles; returns `[{node, chunk_index, snippet, score}]` |
| GET | `/nodes/index-events?after=` | Poll for async re-index completion events (drives the UI toast). Called without `after` it only returns the `latest` cursor |
| POST | `/nodes/:id/share` | Share a node with another user (sends an email notification) |
| DELETE | `/nodes/:id/share/:grantee_id` | Revoke a share |
| POST | `/nodes/batch-authorize` | Batch grant/revoke (`recursive` includes descendants) |
| POST | `/nodes/:id/transfer` | Transfer ownership (`recursive` re-encrypts descendants too) |
| POST | `/nodes/import/batch` | Import nodes from JSON |
| POST | `/nodes/import/file` | Generic file import (.txt/.md/.docx/.xlsx, multipart) |
| POST | `/nodes/:parent_id/import` | Import Markdown/plain text under a given parent |
| POST | `/nodes/:parent_id/import-word` | Import Word under a given parent (images keep their position) |
| POST | `/nodes/:parent_id/import-excel` | Import Excel under a given parent (one table per sheet) |
| POST | `/images/upload` | Upload an image into the local library and return its URL |
| GET | `/users` | List active users available for sharing (excluding yourself) |

### Admin `/api/admin`

| Method | Path | Description |
|--------|------|-------------|
| GET | `/users` | All users (role, status, registration time) |
| POST | `/users/:id/approve` | Approve and activate a user |
| POST | `/users/:id/deactivate` | Deactivate a user (cannot deactivate yourself) |

### Pages and static files

| Method | Path | Description |
|--------|------|-------------|
| GET | `/` | Single-page app entry |
| GET | `/images/<filename>` | Imported / uploaded images |
| GET | `/static/...` | Front-end assets (CSS / JS / vendor) |

## Development and Maintenance

### i18n consistency check

Run this after adding or changing any user-facing string:

```bash
python scripts/check_i18n.py
```

It verifies four things:

1. No Chinese literals remain in front-end JS outside comments and developer logs
2. Every `data-i18n*` key used in `index.html` exists in the dictionary
3. The `en` and `zh` key sets in `i18n.js` are exactly the same
4. Every backend `error` / `message` string from `jsonify` can be translated to English by `services/i18n.py`

It also scans JS template literals: if `I18n.t()` appears in the **literal-text** region of a backtick string instead of inside `${}`, it would be printed verbatim, and the check fails.

### How to add a new string

| Case | Pattern |
|------|---------|
| Static HTML | English default text plus `data-i18n="key"`; use `data-i18n-placeholder` / `data-i18n-title` / `data-i18n-aria` for attributes |
| JS string concatenation | `'<p>' + I18n.t('key') + '</p>'` |
| JS template literal | `` `<p>${I18n.t('key')}</p>` `` (the `${}` is required) |
| With parameters | `I18n.t('key', { name: value })`, with `{name}` in the dictionary |
| Backend message | Keep writing Chinese in the handler, and add an entry to `EN` (exact) or `PATTERNS` (parameterized) in `services/i18n.py` |
| Non-JSON message (email) | `t('email.share.subject', nickname=..., title=...)` from `services/i18n.py` |

### Rebuilding the vector index

- Day-to-day editing needs no action; saving triggers an async rebuild
- After switching embedding models or changing chunk parameters: `python scripts/build_vectors.py --rebuild`
- If one article looks wrong: `python scripts/build_vectors.py --node-id <id> --force`
- After manual database edits or node deletions: add `--prune` to drop orphaned chunks

## Notes and Caveats

- SQLite is the default; heavy concurrent writes can hit lock contention (the connection timeout is 5 seconds). Fine for a small team (a few dozen people); switch to PostgreSQL beyond that.
- Encryption is triggered automatically for `article` nodes; `document` nodes are not encrypted. Encrypted content is ciphertext at rest but is decrypted for display, so **HTTPS is mandatory in production**, otherwise a man-in-the-middle can read plaintext.
- Sharing re-encrypts the AES key with the recipient's RSA public key. If the recipient has never logged in (no key pair), sharing fails.
- Transferring ownership decrypts with the current owner's private key and re-encrypts with the new owner's public key; a recursive transfer re-encrypts every descendant individually.
- Replace the default `SECRET_KEY`. It does not encrypt content (that is RSA), but it signs sessions.
- An admin cannot delete their own account; another admin has to deactivate it.
- Images inside imported Word documents are extracted into `imgs/` and served through `/images/`, keeping their original position in the document.
- Each Excel sheet becomes its own Markdown table under a `## Sheet name` heading.
- Deleting a node **moves its direct children up** to the deleted node's parent instead of cascading the delete.
- For a shared node, the recipient's tree still shows the full ancestor chain (ancestors are visible even without direct permission).
- Index freshness is decided by a SHA-256 fingerprint of "title + plaintext body". A script-only incremental run therefore skips articles whose fingerprint is unchanged — that is exactly what `--force` is for.
- Chunk text is stored in plaintext in `node_chunk` so the UI can show matching snippets. If that matters to you, store vectors only and decrypt at query time instead.
- Notification emails are written in the **sharer's current interface language**, not the recipient's.
- The database, images, and logs are all covered by `.gitignore` and never committed. `_ASSET_ROOT` is an absolute path from the author's machine — change it when deploying elsewhere.

## License

MIT License, see [LICENSE](LICENSE).

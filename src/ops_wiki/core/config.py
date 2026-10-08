'''
应用配置：密钥、数据库、邮件、图片目录与语义检索参数。
Application configuration: secret key, database, mail, image directory and
semantic-search options.

数据资产（数据库、图片）统一存放在用户个人目录，不随代码仓库提交。
Data assets (database, images) live in the user's personal directory and are
never committed to the repository.
'''
import os

# 项目根目录（本文件位于 src/ops_wiki/core/，向上三级即项目根）
# Project root (this file sits in src/ops_wiki/core/, so go up three levels)
_PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..'))

# 个人数据资产根目录（不进 git，避免私人数据上传到第三方代码仓库）
# Personal asset root (outside git, so private data is never pushed to a remote)
_ASSET_ROOT = "/home/yzh/Documents/docs/myself/knowledge"
# 数据库目录与文件完整路径（语义检索脚本与 Web 共用同一份）
# Database directory and full file path, shared by the web app and the scripts
_DB_DIR = os.path.join(_ASSET_ROOT, 'db', 'ops-wiki')
DB_PATH = os.path.join(_DB_DIR, "wiki.sqlite")
# 上传 / 导入图片的存放目录
# Directory for uploaded and imported images
_IMAGES_DIR = os.path.join(_ASSET_ROOT, 'imgs')
os.makedirs(_DB_DIR, exist_ok=True)
os.makedirs(_IMAGES_DIR, exist_ok=True)


class Config:
    SECRET_KEY = "1cc8fbc505ebad423701f0e1eb3ee118afc32efb230fd38eb8dbb6604a55cf"
    # 数据库文件路径（模块级常量同值，供脚本直接引用）
    # Database file path (mirrors the module-level constant for scripts)
    DB_PATH = DB_PATH
    # 与个人知识库数据放一起，开启 WAL 以支持并发读写
    # Kept next to the personal knowledge base; WAL enables concurrent access
    SQLALCHEMY_DATABASE_URI = f'sqlite:///{DB_PATH}?journal_mode=WAL'
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    SQLALCHEMY_ENGINE_OPTIONS = {
        # SQLite 写锁等待 5 秒，避免并发写直接报错
        # Wait up to 5s for the SQLite write lock instead of failing immediately
        "connect_args": {"timeout": 5}
    }

    # 图片存储目录（docx 导入提取的图片、Markdown 上传的图片都放这里）
    # Image directory for pictures extracted from docx and uploaded from Markdown
    IMAGES_DIR = _IMAGES_DIR

    # 前端资源目录（templates、static）
    # Front-end assets directory (templates, static)
    WEB_DIR = os.path.join(_PROJECT_ROOT, 'web')

    # ---- 语义检索（sqlite-vec + Qwen3-Embedding）----
    # ---- Semantic search (sqlite-vec + Qwen3-Embedding) ----
    # 本地 embedding 模型目录
    # Local embedding model directory
    EMBED_MODEL_PATH = os.environ.get(
        'OPS_WIKI_EMBED_MODEL', '/home/yzh/Documents/modelscope/qwen/embedding'
    )
    # 推理设备：默认 cpu，显式不启用 GPU
    # Inference device: CPU by default, GPU is deliberately not used
    EMBED_DEVICE = os.environ.get('OPS_WIKI_EMBED_DEVICE', 'cpu')
    # 权重精度：fp32（默认）或 bf16 / fp16（内存更省，GPU 上常用 fp16）
    # Weight precision: fp32 by default; bf16/fp16 save memory (fp16 on GPU)
    EMBED_DTYPE = os.environ.get('OPS_WIKI_EMBED_DTYPE', 'fp32')
    # 向量维度，需与模型 hidden_size 及 vec0 虚拟表声明一致
    # Vector dimension; must match the model hidden_size and the vec0 table
    EMBED_DIM = 1024
    # 单次编码的批大小（实测 16 在 CPU 上吞吐最佳）
    # Encoding batch size (16 measured fastest on CPU)
    EMBED_BATCH_SIZE = int(os.environ.get('OPS_WIKI_EMBED_BATCH', '16'))
    # CPU 推理线程数（实测 4 最好，线程过多会互相争抢反而变慢）
    # CPU inference threads (4 measured best; more threads contend and slow down)
    EMBED_THREADS = int(os.environ.get('OPS_WIKI_EMBED_THREADS', '4'))
    # 启动时后台预加载模型使其常驻；设为 false 则改为首次使用时加载
    # Preload the model in the background at startup; false defers it to first use
    EMBED_WARMUP = os.environ.get('OPS_WIKI_EMBED_WARMUP', 'true').lower() == 'true'
    # 分块目标 token 数与相邻块重叠比例
    # Target token count per chunk and the overlap ratio between neighbours
    EMBED_CHUNK_TOKENS = 450
    EMBED_CHUNK_OVERLAP = 0.15
    # 单个分块的 token 上限，超出部分截断
    # Hard token cap per chunk; anything longer is truncated
    EMBED_MAX_TOKENS = 512

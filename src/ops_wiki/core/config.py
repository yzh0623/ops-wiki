'''
应用配置：SECRET_KEY、数据库、SMTP 邮件通知。

数据资产（数据库、图片）统一存放在用户个人目录，不随代码仓库提交。
'''
import os

# 项目根目录（本文件位于 src/ops_wiki/core/，向上三级即项目根）
_PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..'))

# 个人数据资产根目录（不进 git，避免私人数据上传到第三方代码仓库）
_ASSET_ROOT = "/Users/yuanzhenhui/Documents/document_file/myself/knowledge"
# SQLite 数据库固定存放路径
_DB_DIR = os.path.join(_ASSET_ROOT, 'db', 'ops-wiki')
# 上传/导入图片固定存放路径
_IMAGES_DIR = os.path.join(_ASSET_ROOT, 'imgs')
os.makedirs(_DB_DIR, exist_ok=True)
os.makedirs(_IMAGES_DIR, exist_ok=True)


class Config:
    SECRET_KEY = "1cc8fbc505ebad423701f0e1eb3ee118afc32efb230fd38eb8dbb6604a55cf3e"
    # 数据库文件固定路径，与个人知识库数据放一起
    SQLALCHEMY_DATABASE_URI = f'sqlite:///{os.path.join(_DB_DIR, "wiki.sqlite")}?journal_mode=WAL'
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    SQLALCHEMY_ENGINE_OPTIONS = {
        "connect_args": {"timeout": 5}
    }

    # 图片存储目录（docx 导入提取的图片、markdown 写作上传的图片统一存放于此）
    IMAGES_DIR = _IMAGES_DIR

    # 前端资源目录（templates、static）
    WEB_DIR = os.path.join(_PROJECT_ROOT, 'web')

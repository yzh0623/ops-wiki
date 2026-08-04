'''
WSGI 入口，供 gunicorn 或 flask run 使用。
统一配置日志输出到 LOG_DIR（默认 /Users/yuanzhenhui/Documents/document_file/tmp/ops-wiki）。
'''
import logging
import os

from src.ops_wiki.core.app import create_app

# 日志目录：可通过环境变量 LOG_DIR 覆盖，默认落到用户指定路径
LOG_DIR = os.environ.get(
    'LOG_DIR',
    '/Users/yuanzhenhui/Documents/document_file/tmp/ops-wiki',
)
os.makedirs(LOG_DIR, exist_ok=True)

LOG_FILE = os.path.join(LOG_DIR, 'ops-wiki.log')

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s %(levelname)s [%(name)s] %(message)s',
    handlers=[
        logging.FileHandler(LOG_FILE, encoding='utf-8'),
        logging.StreamHandler(),
    ],
)

app = create_app()

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5100)

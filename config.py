'''
Author: yuanzhenhui yuanzhenhui@paohe.cn
Date: 2026-06-02 08:36:08
LastEditors: yuanzhenhui yuanzhenhui@paohe.cn
LastEditTime: 2026-06-03 10:18:41
FilePath: /ops_wiki/config.py
Description: 这是默认设置,请设置`customMade`, 打开koroFileHeader查看配置 进行设置: https://github.com/OBKoro1/koro1FileHeader/wiki/%E9%85%8D%E7%BD%AE
'''
import os

# Root directory: the directory containing config.py (project root)
_basedir = os.path.abspath(os.path.dirname(__file__))


class Config:
    SECRET_KEY = "dd98346c8e054bcb364a263653a2fde9798fc13f586c3441598cbfd9729b9acb"
    SQLALCHEMY_DATABASE_URI = f'sqlite:///{os.path.join(_basedir, "wiki.sqlite")}?journal_mode=WAL'
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    SQLALCHEMY_ENGINE_OPTIONS = {
        "connect_args": {"timeout": 5}
    }

    # SMTP email notifications (optional — leave empty to disable)
    MAIL_SERVER = os.environ.get('MAIL_SERVER', '')
    MAIL_PORT = int(os.environ.get('MAIL_PORT', '587'))
    MAIL_USERNAME = os.environ.get('MAIL_USERNAME', '')
    MAIL_PASSWORD = os.environ.get('MAIL_PASSWORD', '')
    MAIL_SENDER = os.environ.get('MAIL_SENDER', 'noreply@ops-wiki.local')

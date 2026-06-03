'''
Author: yuanzhenhui 
Date: 2026-06-02 08:36:08
LastEditors: yuanzhenhui 
LastEditTime: 2026-06-03 17:40:51
FilePath: /ops_wiki/config.py
'''
import os

# 项目根目录
_basedir = os.path.abspath(os.path.dirname(__file__))


class Config:
    SECRET_KEY = "dd98346c8e054bcb364a263653a2fde9798fc13f586c3441598cbfd9729b9acb"
    SQLALCHEMY_DATABASE_URI = f'sqlite:///{os.path.join(_basedir, "wiki.sqlite")}?journal_mode=WAL'
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    SQLALCHEMY_ENGINE_OPTIONS = {
        "connect_args": {"timeout": 5}
    }

    # SMTP 邮件通知配置（留空则禁用）
    MAIL_SERVER = os.environ.get('MAIL_SERVER', '')
    MAIL_PORT = int(os.environ.get('MAIL_PORT', '587'))
    MAIL_USERNAME = os.environ.get('MAIL_USERNAME', '')
    MAIL_PASSWORD = os.environ.get('MAIL_PASSWORD', '')
    MAIL_SENDER = os.environ.get('MAIL_SENDER', 'noreply@ops-wiki.local')

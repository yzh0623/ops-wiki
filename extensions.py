'''
Author: yuanzhenhui 
Date: 2026-06-03 16:12:20
LastEditors: yuanzhenhui 
LastEditTime: 2026-06-03 17:41:57
FilePath: /ops_wiki/extensions.py
'''
from flask_sqlalchemy import SQLAlchemy
from flask_login import LoginManager

# SQLAlchemy 数据库实例
db = SQLAlchemy()
# Flask-Login 登录管理器实例
login_manager = LoginManager()

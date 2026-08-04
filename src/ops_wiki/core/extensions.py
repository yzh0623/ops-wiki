'''第三方扩展实例（db、login_manager）。'''
from flask_sqlalchemy import SQLAlchemy
from flask_login import LoginManager

# SQLAlchemy 数据库实例
db = SQLAlchemy()
# Flask-Login 登录管理器实例
login_manager = LoginManager()

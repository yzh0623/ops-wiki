'''
第三方扩展实例（先创建、后 init_app 绑定，避免循环导入）。
Third-party extension instances, created here and bound with init_app later so
that modules can import them without circular dependencies.
'''
from flask_sqlalchemy import SQLAlchemy
from flask_login import LoginManager

# SQLAlchemy 数据库实例
# SQLAlchemy database instance
db = SQLAlchemy()
# Flask-Login 登录管理器实例
# Flask-Login login manager instance
login_manager = LoginManager()

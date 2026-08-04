'''
数据库模型：User、Node、NodePermission。
'''
from datetime import datetime

from werkzeug.security import generate_password_hash, check_password_hash
from flask_login import UserMixin

from ..core.extensions import db


# 用户账号模型
class User(db.Model, UserMixin):

    id = db.Column(db.Integer, primary_key=True)
    email = db.Column(db.String(120), unique=True, nullable=False)
    password_hash = db.Column(db.String(256), nullable=False)
    nickname = db.Column(db.String(80))
    is_active = db.Column(db.Boolean, default=False)
    is_admin = db.Column(db.Boolean, default=False)
    rsa_public_key = db.Column(db.Text, default='')
    rsa_private_key = db.Column(db.Text, default='')
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    # 密码哈希存储
    def set_password(self, password: str) -> None:
        self.password_hash = generate_password_hash(password)

    # 验证密码是否匹配
    def check_password(self, password: str) -> bool:
        return check_password_hash(self.password_hash, password)

    def __repr__(self) -> str:
        return f'<User {self.email}>'


# wiki 页面树节点，支持无限层级
class Node(db.Model):

    id = db.Column(db.Integer, primary_key=True)
    parent_id = db.Column(
        db.Integer,
        db.ForeignKey('node.id', ondelete='SET NULL'),
        nullable=True,
        index=True,
    )
    title = db.Column(db.String(200), nullable=False)
    content = db.Column(db.Text, default='')
    type = db.Column(db.String(20), default='document')
    owner_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=True, index=True)
    encrypted_key = db.Column(db.Text, nullable=True)  # AES密钥用所有者RSA公钥加密(base64)，None=旧数据明文
    sort_order = db.Column(db.Integer, default=0)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(
        db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )

    children = db.relationship(
        'Node', backref=db.backref('parent', remote_side=[id]), lazy='dynamic'
    )

    owner = db.relationship('User', foreign_keys=[owner_id])

    __table_args__ = (
        db.UniqueConstraint('parent_id', 'title', name='uq_parent_title'),
    )

    def __repr__(self) -> str:
        return f'<Node {self.title}>'


# 节点权限授权/回收记录
class NodePermission(db.Model):

    __tablename__ = 'node_permission'

    id = db.Column(db.Integer, primary_key=True)
    node_id = db.Column(db.Integer, db.ForeignKey('node.id', ondelete='CASCADE'), nullable=False, index=True)
    grantor_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    grantee_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False, index=True)
    is_active = db.Column(db.Boolean, default=True)  # True=授权, False=回收
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    __table_args__ = (
        db.UniqueConstraint('node_id', 'grantee_id', name='uq_node_grantee'),
        db.Index('ix_node_permission_node_grantee', 'node_id', 'grantee_id'),
    )

    def __repr__(self) -> str:
        return f'<NodePermission node={self.node_id} grantee={self.grantee_id} active={self.is_active}>'

'''
数据库模型：User（账号）、Node（文档树节点）、NodePermission（授权记录）。
Database models: User, Node (tree node) and NodePermission (grant record).
'''
from datetime import datetime

from werkzeug.security import generate_password_hash, check_password_hash
from flask_login import UserMixin

from ..core.extensions import db


# 用户账号：邮箱登录、密码哈希、RSA 密钥对（用于内容加密）
# User account: email login, password hash and an RSA key pair for content encryption
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

    # 设置密码（werkzeug 哈希，不存明文）
    # Hash and store the password (never keep the plaintext)
    def set_password(self, password: str) -> None:
        self.password_hash = generate_password_hash(password)

    # 校验密码
    # Verify a candidate password
    def check_password(self, password: str) -> bool:
        return check_password_hash(self.password_hash, password)

    def __repr__(self) -> str:
        return f'<User {self.email}>'


# wiki 页面树节点，支持无限层级；document 为目录，article 为文章
# A wiki tree node with unlimited nesting: "document" folders and "article" pages
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
    # AES 密钥用所有者 RSA 公钥加密后存这里（base64）；None 表示旧数据或未加密内容
    # AES key wrapped with the owner's RSA public key (base64); None means plaintext
    encrypted_key = db.Column(db.Text, nullable=True)
    # 是否启用密码锁定 / whether the password lock is enabled
    is_locked = db.Column(db.Boolean, default=False, nullable=False)
    # 锁定密码哈希（werkzeug pbkdf2），未锁定为 None
    # Hash of the lock passphrase (werkzeug pbkdf2); None when not locked
    lock_password_hash = db.Column(db.Text, nullable=True)
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
        # 同一父节点下标题唯一
        # Titles must be unique among siblings
        db.UniqueConstraint('parent_id', 'title', name='uq_parent_title'),
    )

    def __repr__(self) -> str:
        return f'<Node {self.title}>'


# 节点授权/回收记录：is_active=True 表示授权有效，False 表示已回收
# Node grant record: is_active=True means granted, False means revoked
class NodePermission(db.Model):

    __tablename__ = 'node_permission'

    id = db.Column(db.Integer, primary_key=True)
    node_id = db.Column(db.Integer, db.ForeignKey('node.id', ondelete='CASCADE'), nullable=False, index=True)
    grantor_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    grantee_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False, index=True)
    is_active = db.Column(db.Boolean, default=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    __table_args__ = (
        db.UniqueConstraint('node_id', 'grantee_id', name='uq_node_grantee'),
        db.Index('ix_node_permission_node_grantee', 'node_id', 'grantee_id'),
    )

    def __repr__(self) -> str:
        return f'<NodePermission node={self.node_id} grantee={self.grantee_id} active={self.is_active}>'

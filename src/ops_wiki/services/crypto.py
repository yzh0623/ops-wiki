'''
加解密工具：RSA-2048 密钥对生成 + AES-256-GCM / RSA-OAEP 混合加密。
Crypto helpers: RSA-2048 key pair generation plus AES-256-GCM / RSA-OAEP
hybrid encryption.

思路 / How it works:
    内容用随机 AES 密钥做 GCM 加密，AES 密钥再用所有者的 RSA 公钥包裹；
    因此数据库被拖走也读不出明文，而分享 / 转让时只需重新包裹 AES 密钥。
    Content is encrypted with a random AES key, and that key is wrapped with the
    owner's RSA public key, so a stolen database stays unreadable and sharing or
    transferring only needs to re-wrap the key.
'''
from __future__ import annotations

import base64
import os

from cryptography.hazmat.primitives.asymmetric import rsa, padding as asym_padding
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.ciphers.aead import AESGCM


# 生成 RSA-2048 密钥对，返回 (私钥 PEM, 公钥 PEM)
# Generate an RSA-2048 key pair, returning (private PEM, public PEM)
def generate_key_pair() -> tuple[str, str]:
    private_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    public_key = private_key.public_key()

    private_pem = private_key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption(),
    ).decode('utf-8')

    public_pem = public_key.public_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PublicFormat.SubjectPublicKeyInfo,
    ).decode('utf-8')

    return private_pem, public_pem


# 混合加密：AES-GCM 加密内容，RSA-OAEP 加密 AES 密钥
# Hybrid encryption: AES-GCM for the content, RSA-OAEP for the AES key
# 返回 (加密内容_base64, 加密密钥_base64)
def encrypt_content(plaintext: str, public_key_pem: str) -> tuple[str, str]:
    if not plaintext:
        return '', ''

    aes_key = AESGCM.generate_key(bit_length=256)
    aesgcm = AESGCM(aes_key)
    # 每次加密都用新的随机 nonce，把它与密文一起存
    # A fresh random nonce per encryption, stored together with the ciphertext
    nonce = os.urandom(12)
    ciphertext = aesgcm.encrypt(nonce, plaintext.encode('utf-8'), None)
    encrypted_content = base64.b64encode(nonce + ciphertext).decode('utf-8')

    pubkey = serialization.load_pem_public_key(public_key_pem.encode('utf-8'))
    encrypted_key = pubkey.encrypt(
        aes_key,
        asym_padding.OAEP(
            mgf=asym_padding.MGF1(algorithm=hashes.SHA256()),
            algorithm=hashes.SHA256(),
            label=None,
        ),
    )
    encrypted_key_b64 = base64.b64encode(encrypted_key).decode('utf-8')

    return encrypted_content, encrypted_key_b64


# 解密由 encrypt_content 加密的内容
# Decrypt content produced by encrypt_content
def decrypt_content(encrypted_content: str, encrypted_key: str, private_key_pem: str) -> str:
    if not encrypted_content or not encrypted_key:
        return ''

    privkey = serialization.load_pem_private_key(
        private_key_pem.encode('utf-8'), password=None
    )
    enc_key = base64.b64decode(encrypted_key)
    aes_key = privkey.decrypt(
        enc_key,
        asym_padding.OAEP(
            mgf=asym_padding.MGF1(algorithm=hashes.SHA256()),
            algorithm=hashes.SHA256(),
            label=None,
        ),
    )

    # 前 12 字节是 nonce，其余是 GCM 密文
    # The first 12 bytes are the nonce, the rest is the GCM ciphertext
    data = base64.b64decode(encrypted_content)
    nonce = data[:12]
    ciphertext = data[12:]
    aesgcm = AESGCM(aes_key)
    plaintext = aesgcm.decrypt(nonce, ciphertext, None)
    return plaintext.decode('utf-8')

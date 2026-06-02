"""Hybrid encryption: AES-256-GCM (content) + RSA-2048 OAEP (AES key)."""

import base64
import os

from cryptography.hazmat.primitives.asymmetric import rsa, padding as asym_padding
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.ciphers.aead import AESGCM


def generate_key_pair() -> tuple[str, str]:
    """Generate RSA-2048 key pair. Returns (private_key_pem, public_key_pem)."""
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


def encrypt_content(plaintext: str, public_key_pem: str) -> tuple[str, str]:
    """Encrypt content with hybrid AES+RSA.

    Returns (encrypted_content_base64, encrypted_key_base64).
    encrypted_content = base64(nonce + AES-GCM ciphertext)
    encrypted_key = base64(RSA-OAEP encrypted AES key)
    """
    if not plaintext:
        return '', ''

    aes_key = AESGCM.generate_key(bit_length=256)
    aesgcm = AESGCM(aes_key)
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


def decrypt_content(encrypted_content: str, encrypted_key: str, private_key_pem: str) -> str:
    """Decrypt content that was encrypted with encrypt_content()."""
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

    data = base64.b64decode(encrypted_content)
    nonce = data[:12]
    ciphertext = data[12:]
    aesgcm = AESGCM(aes_key)
    plaintext = aesgcm.decrypt(nonce, ciphertext, None)
    return plaintext.decode('utf-8')

# Ops Wiki — Permission System Optimization

## Architecture Overview

```
┌─────────────────────────────────────────────────────┐
│                    Permission Model                  │
├──────────────┬──────────────────────────────────────┤
│ Tree View    │ Public — all users see all titles     │
│ Content      │ Private — owner+granted users only    │
│ Storage      │ AES-256-GCM encrypted at rest         │
│ Key Mgmt     │ RSA-2048 per user; AES key per article│
│ Permission   │ Latest (node, user) entry wins        │
└──────────────┴──────────────────────────────────────┘
```

## Database Changes

### User model additions
- `rsa_public_key` TEXT — PEM format
- `rsa_private_key` TEXT — PEM format (unencrypted for local wiki)

### Node model additions
- `owner_id` Integer FK → User.id
- `encrypted_key` TEXT — AES key encrypted with owner's RSA public key (base64)
- Content field now stores encrypted content (base64 encoded)

### New: NodePermission model
```python
class NodePermission(db.Model):
    id = Column(Integer, primary_key=True)
    node_id = Column(Integer, ForeignKey('node.id', ondelete='CASCADE'), nullable=False, index=True)
    grantor_id = Column(Integer, ForeignKey('user.id'), nullable=False)
    grantee_id = Column(Integer, ForeignKey('user.id'), nullable=False, index=True)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
```

## Crypto Utilities

Hybrid encryption: AES-256-GCM (content) + RSA-2048 OAEP (AES key)

```
Encrypt:  content → AES-256-GCM → encrypted_content (base64)
          AES key → RSA-OAEP (owner pubkey) → encrypted_key (base64)

Decrypt:  encrypted_key → RSA-OAEP (reader privkey) → AES key
          encrypted_content → AES-256-GCM (AES key) → content
```

## API Changes

### Modified: POST /api/auth/register
- Generate RSA-2048 key pair on registration
- Store in user record

### Modified: POST /api/nodes
- If type='article' → encrypt content before save
- Set owner_id = current_user.id

### Modified: GET /api/nodes/<id>
- Check permission: owner OR NodePermission.is_active=True
- If authorized → decrypt and return plaintext
- If unauthorized → return node metadata but content=null

### New: POST /api/nodes/<id>/share
- Body: {user_ids: [1, 2, 3]}
- Creates/updates NodePermission entries (is_active=True)
- Only owner can share

### New: POST /api/nodes/batch-authorize
- Body: {node_ids: [1, 2], user_ids: [3, 4], is_active: true|false}
- Only owner of each node can authorize it

### New: POST /api/nodes/<id>/transfer
- Body: {new_owner_id: 5}
- Decrypt content with old owner's key
- Re-encrypt with new owner's key
- Update owner_id
- Only current owner can transfer

### New: GET /api/admin/users/<id>/private-key
- Super admin only
- Returns the user's RSA private key PEM

### Modified: GET /api/nodes (tree)
- Return all nodes (titles/types) - tree is public
- Do NOT include content

## Frontend Changes

- Tree: add checkboxes for multi-select
- Tree: right-click context menu ("批量授权", "权限转让")
- Toolbar: "分享" button (visible when article selected + owned by current user)
- Share dialog: list of active users with checkboxes
- Batch authorize dialog: list of active users with checkboxes + grant/revoke toggle
- Visual indicators: lock icon (private), shared icon (shared)

## Permission Resolution Logic

```
def can_access(node, user):
    if node.owner_id == user.id:
        return True
    perm = NodePermission.query.filter_by(
        node_id=node.id, grantee_id=user.id
    ).order_by(NodePermission.created_at.desc()).first()
    return perm is not None and perm.is_active
```

Latest entry for (node_id, user_id) wins. No stacking conflict.

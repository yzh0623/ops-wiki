/* Ops Wiki — Main application controller */

const App = (() => {
  let saveTimeout = null;

  function init() {
    bindSaveButton();
    bindKeyboard();
  }

  function bindSaveButton() {
    document.getElementById('btn-save').addEventListener('click', saveCurrentNode);
  }

  function bindKeyboard() {
    document.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        saveCurrentNode();
      }
    });
  }

  async function saveCurrentNode() {
    const nodeId = typeof WikiEditor !== 'undefined' ? WikiEditor.getCurrentNodeId() : null;
    if (!nodeId) {
      showToast('请先选择一个节点', 'error');
      return;
    }

    if (!(typeof WikiEditor !== 'undefined' && WikiEditor.isUnsaved())) {
      showToast('没有需要保存的更改', 'error');
      return;
    }

    const content = WikiEditor.getContent();

    try {
      const res = await fetch(`/api/nodes/${nodeId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      });

      if (res.ok) {
        WikiEditor.markSaved();
        showToast('已保存', 'success');
      } else {
        const data = await res.json();
        showToast(data.error || '保存失败', 'error');
      }
    } catch (e) {
      showToast('保存失败: ' + e.message, 'error');
    }
  }

  function getCurrentUserId() {
    return typeof Auth !== 'undefined' ? (Auth.getUser()?.id || null) : null;
  }

  // ─── Share Dialog ───

  async function openShareDialog() {
    const selectedIds = typeof Tree !== 'undefined' && Tree.getSelectedIds ? Tree.getSelectedIds() : [];
    if (selectedIds.length === 0) {
      showToast('请先在树中选择要分享的文章', 'error');
      return;
    }

    const res = await fetch('/api/admin/users');
    if (!res.ok) { showToast('加载用户列表失败', 'error'); return; }
    const data = await res.json();
    const currentUserId = getCurrentUserId();
    const activeUsers = (data.users || []).filter(u => u.is_active && u.id !== currentUserId);

    const dialog = document.getElementById('share-dialog');
    const userList = document.getElementById('share-user-list');

    let html = '';
    for (const u of activeUsers) {
      html += `<label class="user-checkbox"><input type="checkbox" value="${u.id}" data-email="${u.email}" /> ${escapeHtml(u.nickname || u.email)}</label>`;
    }
    userList.innerHTML = html || '<p style="padding:8px;color:#999">没有其他活跃用户</p>';

    dialog.style.display = 'flex';
    dialog.dataset.nodeIds = selectedIds.join(',');
  }

  // ─── Batch Auth Dialog ───

  async function openBatchAuthDialog(mode) {
    const selectedIds = typeof Tree !== 'undefined' && Tree.getSelectedIds ? Tree.getSelectedIds() : [];
    if (selectedIds.length === 0) {
      showToast('请先在树中选择文章', 'error');
      return;
    }

    const res = await fetch('/api/admin/users');
    if (!res.ok) { showToast('加载用户列表失败', 'error'); return; }
    const data = await res.json();
    const currentUserId = getCurrentUserId();
    const activeUsers = (data.users || []).filter(u => u.is_active && u.id !== currentUserId);

    const dialog = document.getElementById('batch-dialog');
    const userList = document.getElementById('batch-user-list');
    dialog.querySelector('.batch-dialog-title').textContent = mode === 'grant' ? '批量授权' : '批量撤销';

    let html = '';
    for (const u of activeUsers) {
      html += `<label class="user-checkbox"><input type="checkbox" value="${u.id}" /> ${escapeHtml(u.nickname || u.email)}</label>`;
    }
    userList.innerHTML = html || '<p style="padding:8px;color:#999">没有其他活跃用户</p>';

    dialog.style.display = 'flex';
    dialog.dataset.mode = mode;
    dialog.dataset.nodeIds = selectedIds.join(',');
  }

  // ─── Transfer Dialog ───

  async function openTransferDialog() {
    const selectedIds = typeof Tree !== 'undefined' && Tree.getSelectedIds ? Tree.getSelectedIds() : [];
    if (selectedIds.length !== 1) {
      showToast('权限转让只能选择一个节点', 'error');
      return;
    }

    const res = await fetch('/api/admin/users');
    if (!res.ok) { showToast('加载用户列表失败', 'error'); return; }
    const data = await res.json();
    const currentUserId = getCurrentUserId();
    const activeUsers = (data.users || []).filter(u => u.is_active && u.id !== currentUserId);

    const dialog = document.getElementById('transfer-dialog');
    const select = document.getElementById('transfer-user-select');
    select.innerHTML = '<option value="">选择用户...</option>';
    for (const u of activeUsers) {
      select.innerHTML += `<option value="${u.id}">${escapeHtml(u.nickname || u.email)}</option>`;
    }

    dialog.style.display = 'flex';
    dialog.dataset.nodeId = selectedIds[0];
  }

  // ─── Dialog Save Handlers ───

  async function handleShareSave() {
    const dialog = document.getElementById('share-dialog');
    const nodeIds = (dialog.dataset.nodeIds || '').split(',').map(Number).filter(n => n);
    const selectedUsers = [...document.querySelectorAll('#share-user-list input:checked')].map(el => parseInt(el.value));

    if (selectedUsers.length === 0) {
      showToast('请选择要授权的用户', 'error');
      return;
    }

    const res = await fetch('/api/nodes/batch-authorize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ node_ids: nodeIds, user_ids: selectedUsers, is_active: true }),
    });
    if (res.ok) {
      showToast('授权成功', 'success');
      dialog.style.display = 'none';
    } else {
      const d = await res.json();
      showToast(d.error || '授权失败', 'error');
    }
  }

  async function handleBatchSave() {
    const dialog = document.getElementById('batch-dialog');
    const nodeIds = (dialog.dataset.nodeIds || '').split(',').map(Number);
    const selectedUsers = [...document.querySelectorAll('#batch-user-list input:checked')].map(el => parseInt(el.value));
    const mode = dialog.dataset.mode;

    if (selectedUsers.length === 0) { showToast('请选择用户', 'error'); return; }

    const res = await fetch('/api/nodes/batch-authorize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ node_ids: nodeIds, user_ids: selectedUsers, is_active: mode === 'grant' }),
    });
    if (res.ok) {
      showToast(mode === 'grant' ? '授权成功' : '已撤销', 'success');
      dialog.style.display = 'none';
    } else {
      const d = await res.json();
      showToast(d.error || '操作失败', 'error');
    }
  }

  async function handleTransferConfirm() {
    const dialog = document.getElementById('transfer-dialog');
    const nodeId = parseInt(dialog.dataset.nodeId);
    const newOwnerId = parseInt(document.getElementById('transfer-user-select').value);

    if (!newOwnerId) { showToast('请选择目标用户', 'error'); return; }
    if (!confirm('确定转让此文章的所有权吗？')) return;

    const res = await fetch(`/api/nodes/${nodeId}/transfer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ new_owner_id: newOwnerId }),
    });
    if (res.ok) {
      showToast('所有权转让成功', 'success');
      dialog.style.display = 'none';
      if (typeof Tree !== 'undefined' && Tree.loadTree) Tree.loadTree();
    } else {
      const d = await res.json();
      showToast(d.error || '转让失败', 'error');
    }
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // Bind dialog event handlers on DOM ready
  function bindDialogs() {
    const shareBtn = document.getElementById('btn-share');
    if (shareBtn) {
      shareBtn.addEventListener('click', openShareDialog);
    }

    const shareSaveBtn = document.getElementById('btn-share-save');
    if (shareSaveBtn) {
      shareSaveBtn.addEventListener('click', handleShareSave);
    }

    const batchSaveBtn = document.getElementById('btn-batch-save');
    if (batchSaveBtn) {
      batchSaveBtn.addEventListener('click', handleBatchSave);
    }

    const transferConfirmBtn = document.getElementById('btn-transfer-confirm');
    if (transferConfirmBtn) {
      transferConfirmBtn.addEventListener('click', handleTransferConfirm);
    }

    // Context menu item clicks
    const ctxBatch = document.getElementById('ctx-batch-authorize');
    if (ctxBatch) {
      ctxBatch.addEventListener('click', (e) => {
        e.stopPropagation();
        document.getElementById('context-menu').style.display = 'none';
        openBatchAuthDialog('grant');
      });
    }

    const ctxRevoke = document.getElementById('ctx-revoke');
    if (ctxRevoke) {
      ctxRevoke.addEventListener('click', (e) => {
        e.stopPropagation();
        document.getElementById('context-menu').style.display = 'none';
        openBatchAuthDialog('revoke');
      });
    }

    const ctxTransfer = document.getElementById('ctx-transfer');
    if (ctxTransfer) {
      ctxTransfer.addEventListener('click', (e) => {
        e.stopPropagation();
        document.getElementById('context-menu').style.display = 'none';
        openTransferDialog();
      });
    }

    // Close dialogs on overlay click
    ['share-dialog', 'batch-dialog', 'transfer-dialog'].forEach(id => {
      const el = document.getElementById(id);
      if (el) {
        el.addEventListener('click', (e) => {
          if (e.target === el) el.style.display = 'none';
        });
      }
    });
  }

  // Ensure unsaved changes warning on page unload
  window.addEventListener('beforeunload', (e) => {
    if (typeof WikiEditor !== 'undefined' && WikiEditor.isUnsaved()) {
      e.preventDefault();
      e.returnValue = '';
    }
  });

  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => { init(); bindDialogs(); });
  } else {
    init();
    bindDialogs();
  }

  return { saveCurrentNode };
})();

/* Ops Wiki — Admin panel (user management) */
const AdminPanel = (() => {
  const OVERLAY = document.getElementById('admin-overlay');
  const USER_LIST = document.getElementById('admin-user-list');
  const CLOSE_BTN = document.getElementById('btn-close-admin');

  CLOSE_BTN.addEventListener('click', () => {
    OVERLAY.style.display = 'none';
  });

  OVERLAY.addEventListener('click', (e) => {
    if (e.target === OVERLAY) OVERLAY.style.display = 'none';
  });

  async function open() {
    OVERLAY.style.display = 'flex';
    await loadUsers();
  }

  async function loadUsers() {
    try {
      const res = await fetch('/api/admin/users');
      if (!res.ok) {
        USER_LIST.innerHTML = '<p style="color:red;padding:16px">加载失败</p>';
        return;
      }
      const data = await res.json();
      renderUsers(data.users || []);
    } catch (e) {
      USER_LIST.innerHTML = '<p style="color:red;padding:16px">网络错误</p>';
    }
  }

  function renderUsers(users) {
    if (users.length === 0) {
      USER_LIST.innerHTML = '<p style="padding:16px;color:#999">暂无用户</p>';
      return;
    }

    let html = '<table class="admin-table"><thead><tr>';
    html += '<th>ID</th><th>邮箱</th><th>昵称</th><th>状态</th><th>注册时间</th><th>操作</th>';
    html += '</tr></thead><tbody>';

    for (const u of users) {
      const status = u.is_active ? '已激活' : '待审批';
      const statusClass = u.is_active ? 'status-active' : 'status-pending';
      const created = u.created_at ? new Date(u.created_at).toLocaleString('zh-CN') : '-';

      html += `<tr>
        <td>${u.id}</td>
        <td>${escapeHtmlAdmin(u.email)}</td>
        <td>${escapeHtmlAdmin(u.nickname || '-')}</td>
        <td><span class="${statusClass}">${status}</span></td>
        <td>${created}</td>
        <td>
          ${!u.is_active ? `<button class="btn btn-sm btn-approve" data-id="${u.id}">审批</button>` : ''}
          ${u.is_active ? `<button class="btn btn-sm btn-deactivate" data-id="${u.id}">停用</button>` : ''}
        </td>
      </tr>`;
    }

    html += '</tbody></table>';
    USER_LIST.innerHTML = html;

    USER_LIST.querySelectorAll('.btn-approve').forEach(btn => {
      btn.addEventListener('click', () => approveUser(parseInt(btn.dataset.id)));
    });
    USER_LIST.querySelectorAll('.btn-deactivate').forEach(btn => {
      btn.addEventListener('click', () => deactivateUser(parseInt(btn.dataset.id)));
    });
  }

  async function approveUser(id) {
    try {
      const res = await fetch(`/api/admin/users/${id}/approve`, { method: 'POST' });
      if (res.ok) {
        showToast('用户已激活', 'success');
        await loadUsers();
      } else {
        const data = await res.json();
        showToast(data.error || '操作失败', 'error');
      }
    } catch (e) {
      showToast('操作失败', 'error');
    }
  }

  async function deactivateUser(id) {
    try {
      const res = await fetch(`/api/admin/users/${id}/deactivate`, { method: 'POST' });
      if (res.ok) {
        showToast('用户已停用', 'success');
        await loadUsers();
      } else {
        const data = await res.json();
        showToast(data.error || '操作失败', 'error');
      }
    } catch (e) {
      showToast('操作失败', 'error');
    }
  }

  function escapeHtmlAdmin(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  return { open };
})();

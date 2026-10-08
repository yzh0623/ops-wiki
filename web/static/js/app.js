/* Ops Wiki — Main application controller */

const App = (() => {
  function init() {
    bindKeyboard();
    bindDialogs();
  }

  function bindKeyboard() {
    document.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        saveCurrentNode();
      }
    });
  }

  // 保存逻辑已统一收敛到编辑器模块（含手动 Ctrl+S 与后台自动保存）
  // Saving lives entirely in the editor module (manual Ctrl+S and autosave)
  function saveCurrentNode() {
    if (typeof WikiEditor !== 'undefined') WikiEditor.saveCurrentNode(false);
  }

  function getCurrentUserId() {
    return typeof Auth !== 'undefined' ? (Auth.getUser()?.id || null) : null;
  }

  // ─── Batch Auth Dialog ───

  async function openBatchAuthDialog(mode) {
    const selectedIds = typeof Tree !== 'undefined' && Tree.getSelectedIds ? Tree.getSelectedIds() : [];
    if (selectedIds.length === 0) {
      showToast(I18n.t('admin.pleaseSelectArticle'), 'error');
      return;
    }

    const res = await fetch('/api/users');
    if (!res.ok) { showToast(I18n.t('admin.loadUsersFailed'), 'error'); return; }
    const data = await res.json();
    const currentUserId = getCurrentUserId();
    const activeUsers = (data.users || []).filter(u => u.is_active !== false && u.id !== currentUserId);

    const dialog = document.getElementById('batch-dialog');
    const userList = document.getElementById('batch-user-list');
    dialog.querySelector('.batch-dialog-title').textContent =
        mode === 'grant' ? I18n.t('admin.grant') : I18n.t('admin.revoke');

    const recursiveLabel = document.getElementById('batch-recursive-label');
    let totalDesc = 0;
    for (const id of selectedIds) {
      if (typeof Tree !== 'undefined' && Tree.countDescendants) {
        totalDesc += Tree.countDescendants(id);
      }
    }
    const total = selectedIds.length + totalDesc;
    if (totalDesc > 0) {
      dialog.querySelector('.batch-dialog-title').textContent +=
        I18n.t('admin.nodeSummary', { total, desc: totalDesc });
    }
    if (recursiveLabel) {
      recursiveLabel.style.display = totalDesc > 0 ? '' : 'none';
    }

    let html = '';
    for (const u of activeUsers) {
      html += `<label class="user-checkbox"><input type="checkbox" value="${u.id}" /> ${escapeHtml(u.nickname || u.email)}</label>`;
    }
    userList.innerHTML = html || '<p style="padding:12px;color:#94a3b8;font-size:13px">' + I18n.t('admin.noOtherUsers') + '</p>';

    dialog.style.display = 'flex';
    dialog.dataset.mode = mode;
    dialog.dataset.nodeIds = selectedIds.join(',');
  }

  // ─── Transfer Dialog ───

  async function openTransferDialog() {
    const selectedIds = typeof Tree !== 'undefined' && Tree.getSelectedIds ? Tree.getSelectedIds() : [];
    if (selectedIds.length !== 1) {
      showToast(I18n.t('admin.onlyOneNode'), 'error');
      return;
    }

    const res = await fetch('/api/users');
    if (!res.ok) { showToast(I18n.t('admin.loadUsersFailed'), 'error'); return; }
    const data = await res.json();
    const currentUserId = getCurrentUserId();
    const activeUsers = (data.users || []).filter(u => u.is_active !== false && u.id !== currentUserId);

    const dialog = document.getElementById('transfer-dialog');
    const select = document.getElementById('transfer-user-select');
    select.innerHTML = '<option value="">' + I18n.t('admin.selectUserOption') + '</option>';
    for (const u of activeUsers) {
      select.innerHTML += `<option value="${u.id}">${escapeHtml(u.nickname || u.email)}</option>`;
    }

    let totalDesc = 0;
    if (typeof Tree !== 'undefined' && Tree.countDescendants) {
      totalDesc = Tree.countDescendants(selectedIds[0]);
    }
    dialog.querySelector('.modal-header h3').textContent =
      totalDesc > 0 ? I18n.t('admin.transferWithChildren', { desc: totalDesc }) : I18n.t('admin.transferTitle');

    const recursiveLabel = document.getElementById('transfer-recursive-label');
    if (recursiveLabel) {
      recursiveLabel.style.display = totalDesc > 0 ? '' : 'none';
    }

    dialog.style.display = 'flex';
    dialog.dataset.nodeId = selectedIds[0];
  }

  // ─── Dialog Save Handlers ───

  async function handleBatchSave() {
    const dialog = document.getElementById('batch-dialog');
    const nodeIds = (dialog.dataset.nodeIds || '').split(',').map(Number);
    const selectedUsers = [...document.querySelectorAll('#batch-user-list input:checked')].map(el => parseInt(el.value));
    const mode = dialog.dataset.mode;
    const recursive = document.getElementById('batch-recursive')?.checked || false;

    if (selectedUsers.length === 0) { showToast(I18n.t('admin.pleaseSelectUsers'), 'error'); return; }

    const res = await fetch('/api/nodes/batch-authorize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ node_ids: nodeIds, user_ids: selectedUsers, is_active: mode === 'grant', recursive }),
    });
    if (res.ok) {
      showToast(mode === 'grant' ? I18n.t('admin.granted') : I18n.t('admin.revoked'), 'success');
      dialog.style.display = 'none';
      // Refresh current node to update share bar
      const activeId = typeof Tree !== 'undefined' ? Tree.getActiveId() : null;
      if (activeId) {
        try {
          const nodeRes = await fetch(`/api/nodes/${activeId}`);
          if (nodeRes.ok) {
            const node = await nodeRes.json();
            if (typeof WikiEditor !== 'undefined') {
              WikiEditor.loadContent(activeId, node.content || "", node.grantees || [], node.is_owner, node.locked, node.unlocked);
            }
          }
        } catch (_) {}
      }
    } else {
      const d = await res.json();
      showToast(d.error || I18n.t('admin.operationFailed'), 'error');
    }
  }

  async function handleTransferConfirm() {
    const dialog = document.getElementById('transfer-dialog');
    const nodeId = parseInt(dialog.dataset.nodeId);
    const newOwnerId = parseInt(document.getElementById('transfer-user-select').value);
    const recursive = document.getElementById('transfer-recursive')?.checked || false;

    if (!newOwnerId) { showToast(I18n.t('admin.pleaseSelectTarget'), 'error'); return; }

    const totalDescendant = typeof Tree !== 'undefined' && Tree.countDescendants ? Tree.countDescendants(nodeId) : 0;
    const totalNodes = recursive ? (1 + totalDescendant) : 1;
    const confirmMsg = recursive
      ? I18n.t('admin.confirmTransferChildren', { total: totalDescendant, count: totalNodes })
      : I18n.t('admin.confirmTransfer');
    if (!confirm(confirmMsg)) return;

    const res = await fetch(`/api/nodes/${nodeId}/transfer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ new_owner_id: newOwnerId, recursive }),
    });
    if (res.ok) {
      showToast(I18n.t('admin.transferSuccess'), 'success');
      dialog.style.display = 'none';
      if (typeof Tree !== 'undefined' && Tree.loadTree) Tree.loadTree();
      // Refresh current editor — current user is no longer owner
      const activeId = typeof Tree !== 'undefined' ? Tree.getActiveId() : null;
      if (activeId) {
        try {
          const nodeRes = await fetch(`/api/nodes/${activeId}`);
          if (nodeRes.ok) {
            const node = await nodeRes.json();
            if (typeof WikiEditor !== 'undefined') {
              WikiEditor.loadContent(activeId, node.content || "", node.grantees || [], node.is_owner, node.locked, node.unlocked);
            }
          }
        } catch (_) {}
      }
    } else {
      const d = await res.json();
      showToast(d.error || I18n.t('admin.transferFailed'), 'error');
    }
  }

  async function handleRenameConfirm() {
    const dialog = document.getElementById('rename-dialog');
    const nodeId = parseInt(dialog.dataset.nodeId);
    const newTitle = document.getElementById('rename-input').value.trim();
    if (!newTitle) { showToast(I18n.t('admin.titleRequired'), 'error'); return; }
    if (typeof Tree !== 'undefined' && Tree.renameNode) {
      await Tree.renameNode(nodeId, newTitle);
    }
    dialog.style.display = 'none';
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // Bind dialog event handlers
  function bindDialogs() {
    const batchSaveBtn = document.getElementById('btn-batch-save');
    if (batchSaveBtn) {
      batchSaveBtn.addEventListener('click', handleBatchSave);
    }

    const transferConfirmBtn = document.getElementById('btn-transfer-confirm');
    if (transferConfirmBtn) {
      transferConfirmBtn.addEventListener('click', handleTransferConfirm);
    }

    const renameConfirmBtn = document.getElementById('btn-rename-confirm');
    if (renameConfirmBtn) {
      renameConfirmBtn.addEventListener('click', handleRenameConfirm);
    }

    // Close dialogs on overlay click
    ['batch-dialog', 'transfer-dialog', 'rename-dialog'].forEach(id => {
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
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  return { saveCurrentNode, openBatchAuthDialog, openTransferDialog };
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
        USER_LIST.innerHTML = '<p style="color:red;padding:16px">' + I18n.t('admin.loadFailed') + '</p>';
        return;
      }
      const data = await res.json();
      renderUsers(data.users || []);
    } catch (e) {
      USER_LIST.innerHTML = '<p style="color:red;padding:16px">' + I18n.t('admin.networkError') + '</p>';
    }
  }

  function renderUsers(users) {
    if (users.length === 0) {
      USER_LIST.innerHTML = '<p style="padding:16px;color:#94a3b8;font-size:13px">' + I18n.t('admin.noUsers') + '</p>';
      return;
    }

    let html = '<table><thead><tr>';
    html += '<th>' + I18n.t('admin.thId') + '</th><th>' + I18n.t('admin.thEmail') + '</th><th>' +
        I18n.t('admin.thNickname') + '</th><th>' + I18n.t('admin.thRole') + '</th><th>' +
        I18n.t('admin.thStatus') + '</th><th>' + I18n.t('admin.thRegistered') + '</th><th>' +
        I18n.t('admin.thActions') + '</th>';
    html += '</tr></thead><tbody>';

    for (const u of users) {
      const statusClass = u.is_active ? 'status-active' : 'status-pending';
      const status = u.is_active ? I18n.t('admin.active') : I18n.t('admin.pending');
      const roleClass = u.is_admin ? 'role-admin' : 'role-user';
      const role = u.is_admin ? I18n.t('admin.roleAdmin') : I18n.t('admin.roleUser');
      const created = u.created_at ? new Date(u.created_at).toLocaleString(I18n.locale()) : '-';

      html += `<tr>
        <td>${u.id}</td>
        <td>${escapeHtmlAdmin(u.email)}</td>
        <td>${escapeHtmlAdmin(u.nickname || '-')}</td>
        <td><span class="${roleClass}">${role}</span></td>
        <td><span class="${statusClass}">${status}</span></td>
        <td>${created}</td>
        <td>
          ${!u.is_active ? `<button class="btn-approve" data-id="${u.id}">${I18n.t('admin.approve')}</button>` : ''}
          ${u.is_active ? `<button class="btn-deactivate" data-id="${u.id}">${I18n.t('admin.deactivate')}</button>` : ''}
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
        showToast(I18n.t('admin.userActivated'), 'success');
        await loadUsers();
      } else {
        const data = await res.json();
        showToast(data.error || I18n.t('admin.operationFailed'), 'error');
      }
    } catch (e) {
      showToast(I18n.t('admin.operationFailed'), 'error');
    }
  }

  async function deactivateUser(id) {
    try {
      const res = await fetch(`/api/admin/users/${id}/deactivate`, { method: 'POST' });
      if (res.ok) {
        showToast(I18n.t('admin.userDeactivated'), 'success');
        await loadUsers();
      } else {
        const data = await res.json();
        showToast(data.error || I18n.t('admin.operationFailed'), 'error');
      }
    } catch (e) {
      showToast(I18n.t('admin.operationFailed'), 'error');
    }
  }

  function escapeHtmlAdmin(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // 语言切换后：管理面板若开着，重渲染列表（表头/角色/状态/时间格式跟着变）
  // Re-render the admin list on language change so headers, roles and dates follow
  I18n.onChange(() => {
    if (OVERLAY.style.display !== 'none') loadUsers();
  });

  return { open };
})();

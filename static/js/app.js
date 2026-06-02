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
        <td>${escapeHtml(u.email)}</td>
        <td>${escapeHtml(u.nickname || '-')}</td>
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

    // Bind action buttons
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

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  return { open };
})();

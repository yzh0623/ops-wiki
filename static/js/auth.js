const Auth = (() => {
  let currentUser = null;

  function init() {
    document.getElementById('show-register').addEventListener('click', (e) => {
      e.preventDefault();
      document.getElementById('login-modal').style.display = 'none';
      document.getElementById('register-modal').style.display = 'block';
      document.getElementById('login-error').textContent = '';
    });

    document.getElementById('show-login').addEventListener('click', (e) => {
      e.preventDefault();
      document.getElementById('login-modal').style.display = 'block';
      document.getElementById('register-modal').style.display = 'none';
      document.getElementById('register-error').textContent = '';
    });

    document.getElementById('login-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = document.getElementById('login-email').value;
      const password = document.getElementById('login-password').value;
      const errorEl = document.getElementById('login-error');
      errorEl.textContent = '';

      try {
        const res = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password }),
        });
        const data = await res.json();
        if (res.ok) {
          currentUser = data;
          document.getElementById('auth-overlay').style.display = 'none';
          updateUI();
          if (typeof Tree !== 'undefined' && Tree.loadTree) Tree.loadTree();
        } else {
          errorEl.textContent = data.error || '登录失败';
        }
      } catch (err) {
        errorEl.textContent = '网络错误，请重试';
      }
    });

    document.getElementById('register-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = document.getElementById('reg-email').value;
      const password = document.getElementById('reg-password').value;
      const nickname = document.getElementById('reg-nickname').value;
      const errorEl = document.getElementById('register-error');
      errorEl.textContent = '';

      try {
        const res = await fetch('/api/auth/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password, nickname }),
        });
        const data = await res.json();
        if (res.ok) {
          errorEl.style.color = '#27ae60';
          errorEl.textContent = '注册成功！等待管理员审批后即可登录。';
          document.getElementById('reg-email').value = '';
          document.getElementById('reg-password').value = '';
          document.getElementById('reg-nickname').value = '';
        } else {
          errorEl.style.color = '#e74c3c';
          errorEl.textContent = data.error || '注册失败';
        }
      } catch (err) {
        errorEl.textContent = '网络错误，请重试';
      }
    });

    document.getElementById('btn-logout').addEventListener('click', async () => {
      try {
        await fetch('/api/auth/logout', { method: 'POST' });
      } catch (_) {}
      currentUser = null;
      document.getElementById('auth-overlay').style.display = 'flex';
      document.getElementById('login-modal').style.display = 'block';
      document.getElementById('register-modal').style.display = 'none';
      document.getElementById('login-error').textContent = '';
      document.getElementById('login-email').value = '';
      document.getElementById('login-password').value = '';
      updateUI();
    });
  }

  function updateUI() {
    const userInfo = document.getElementById('user-info');
    const btnLogout = document.getElementById('btn-logout');
    const btnAdmin = document.getElementById('btn-admin');
    if (currentUser) {
      userInfo.textContent = currentUser.nickname || currentUser.email;
      btnLogout.style.display = 'inline-block';
      btnAdmin.style.display = currentUser.is_admin ? 'inline-block' : 'none';
    } else {
      userInfo.textContent = '';
      btnLogout.style.display = 'none';
      btnAdmin.style.display = 'none';
    }
  }

  async function checkSession() {
    try {
      const res = await fetch('/api/auth/me');
      if (res.ok) {
        currentUser = await res.json();
        document.getElementById('auth-overlay').style.display = 'none';
        updateUI();
        if (typeof Tree !== 'undefined' && Tree.loadTree) Tree.loadTree();
      } else {
        document.getElementById('auth-overlay').style.display = 'flex';
        document.getElementById('login-modal').style.display = 'block';
        document.getElementById('register-modal').style.display = 'none';
      }
    } catch (_) {
      document.getElementById('auth-overlay').style.display = 'flex';
      document.getElementById('login-modal').style.display = 'block';
      document.getElementById('register-modal').style.display = 'none';
    }
  }

  function getUser() { return currentUser;   }

  document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('btn-admin').addEventListener('click', () => {
      if (typeof AdminPanel !== 'undefined' && AdminPanel.open) {
        AdminPanel.open();
      }
    });
  });

  return { init, checkSession, getUser, updateUI };
})();

document.addEventListener('DOMContentLoaded', () => {
  Auth.init();
  Auth.checkSession();
});

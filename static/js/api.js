/* Ops Wiki — Unified API client */

const api = {
  async request(method, url, body) {
    const opts = { method, headers: {} };
    if (body && !(body instanceof FormData)) {
      opts.headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(body);
    } else if (body instanceof FormData) {
      opts.body = body;
    }
    try {
      const res = await fetch(url, opts);
      if (res.status === 401) {
        // Session expired — redirect to login
        if (typeof Auth !== 'undefined') {
          Auth.checkSession();
        }
        return null;
      }
      return res;
    } catch (err) {
      showToast('网络错误: ' + err.message, 'error');
      return null;
    }
  },

  get(url) { return this.request('GET', url); },
  post(url, body) { return this.request('POST', url, body); },
  put(url, body) { return this.request('PUT', url, body); },
  del(url) { return this.request('DELETE', url); },
};

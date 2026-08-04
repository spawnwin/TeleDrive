/* Client auth for EYE Manager */
window.EYE_AUTH = (() => {
  const TOKEN_KEY = 'eye_auth_token';
  const USER_KEY = 'eye_auth_user';
  let user = null;
  let token = null;

  function apiBase() {
    try { return new URL('.', location.href).toString(); }
    catch { return './'; }
  }

  function loadLocal() {
    try {
      token = localStorage.getItem(TOKEN_KEY);
      user = JSON.parse(localStorage.getItem(USER_KEY) || 'null');
    } catch {
      token = null; user = null;
    }
  }

  function persist() {
    try {
      if (token) localStorage.setItem(TOKEN_KEY, token);
      else localStorage.removeItem(TOKEN_KEY);
      if (user) localStorage.setItem(USER_KEY, JSON.stringify(user));
      else localStorage.removeItem(USER_KEY);
    } catch {}
  }

  function headers(jsonBody = false) {
    const h = {};
    if (jsonBody) h['Content-Type'] = 'application/json';
    if (token) h.Authorization = 'Bearer ' + token;
    return h;
  }

  async function request(path, opts = {}) {
    const res = await fetch(apiBase() + path.replace(/^\//, ''), {
      method: opts.method || 'GET',
      headers: headers(!!opts.body),
      body: opts.body ? JSON.stringify(opts.body) : undefined
    });
    let data = null;
    try { data = await res.json(); } catch { data = null; }
    if (!res.ok) {
      const err = new Error(data?.error || ('HTTP ' + res.status));
      err.status = res.status;
      err.data = data;
      throw err;
    }
    return data;
  }

  async function register({ login, password, name }) {
    const data = await request('api/register', {
      method: 'POST',
      body: { login, password, name }
    });
    token = data.token;
    user = data.user;
    persist();
    return data;
  }

  async function login({ login, password }) {
    const data = await request('api/login', {
      method: 'POST',
      body: { login, password }
    });
    token = data.token;
    user = data.user;
    persist();
    return data;
  }

  async function logout() {
    try { if (token) await request('api/logout', { method: 'POST', body: {} }); } catch {}
    token = null;
    user = null;
    persist();
  }

  async function refreshMe() {
    loadLocal();
    if (!token) return null;
    try {
      const data = await request('api/me');
      user = data.user;
      persist();
      return data;
    } catch {
      token = null; user = null; persist();
      return null;
    }
  }

  async function saveCareer(state, opts = {}) {
    if (!token || !state) return { ok: false, msg: 'Нужен вход' };
    const data = await request('api/career', {
      method: 'POST',
      body: {
        manager: state.managerName,
        state,
        mode: opts.mode === 'create' ? 'create' : 'save'
      }
    });
    return { ok: true, id: data.id, created: !!data.created, teamBound: !!data.teamBound };
  }

  async function loadCareer() {
    if (!token) return null;
    try {
      const data = await request('api/career');
      return data.state || null;
    } catch {
      return null;
    }
  }

  function getUser() { return user; }
  function getToken() { return token; }
  function isLoggedIn() { return !!token && !!user; }

  loadLocal();

  return {
    register, login, logout, refreshMe, saveCareer, loadCareer,
    getUser, getToken, isLoggedIn, headers, apiBase
  };
})();

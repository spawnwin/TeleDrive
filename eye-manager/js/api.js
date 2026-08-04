/* API + auth for EYE XI */
window.EYE_API = (() => {
  const TOKEN_KEY = 'eye_xi_token';
  const USER_KEY = 'eye_xi_user';
  let token = localStorage.getItem(TOKEN_KEY) || '';
  let user = null;
  try { user = JSON.parse(localStorage.getItem(USER_KEY) || 'null'); } catch { user = null; }

  function apiBase() {
    const path = location.pathname.replace(/\/[^/]*$/, '/');
    return path.endsWith('/') ? path : path + '/';
  }

  function headers(extra = {}) {
    const h = { 'Content-Type': 'application/json', ...extra };
    if (token) h.Authorization = 'Bearer ' + token;
    return h;
  }

  async function request(path, opts = {}) {
    const res = await fetch(apiBase() + path.replace(/^\//, ''), {
      method: opts.method || 'GET',
      headers: headers(opts.headers),
      body: opts.body != null ? JSON.stringify(opts.body) : undefined
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(data.error || ('Ошибка ' + res.status));
      err.status = res.status;
      err.data = data;
      throw err;
    }
    return data;
  }

  function persist() {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
    if (user) localStorage.setItem(USER_KEY, JSON.stringify(user));
    else localStorage.removeItem(USER_KEY);
  }

  async function login(payload) {
    const data = await request('api/login', { method: 'POST', body: payload });
    token = data.token;
    user = data.user;
    persist();
    return data;
  }

  async function register(payload) {
    const data = await request('api/register', { method: 'POST', body: payload });
    token = data.token;
    user = data.user;
    persist();
    return data;
  }

  async function logout() {
    try { await request('api/logout', { method: 'POST' }); } catch {}
    token = '';
    user = null;
    persist();
  }

  async function me() {
    if (!token) return null;
    try {
      const data = await request('api/me');
      user = data.user;
      persist();
      return data;
    } catch {
      token = '';
      user = null;
      persist();
      return null;
    }
  }

  return {
    request, login, register, logout, me, headers, apiBase,
    getUser: () => user,
    getToken: () => token,
    isLoggedIn: () => !!token && !!user,
    setUser: (u) => { user = u; persist(); }
  };
})();

/* Online cups + admin API client */
window.EYE_ONLINE = (() => {
  const A = () => window.EYE_AUTH;

  async function request(path, opts = {}) {
    if (!A().isLoggedIn() && opts.auth !== false) {
      const err = new Error('Нужен вход');
      err.status = 401;
      throw err;
    }
    const res = await fetch(A().apiBase() + path.replace(/^\//, ''), {
      method: opts.method || 'GET',
      headers: A().headers(!!opts.body),
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

  function listCups(status) {
    const q = status ? `?status=${encodeURIComponent(status)}` : '';
    return request('api/cups' + q);
  }

  function getCup(id) {
    return request('api/cups/' + encodeURIComponent(id));
  }

  function joinCup(id, clubName) {
    return request('api/cups/' + encodeURIComponent(id) + '/join', {
      method: 'POST',
      body: { clubName: clubName || undefined }
    });
  }

  function leaveCup(id) {
    return request('api/cups/' + encodeURIComponent(id) + '/leave', { method: 'POST', body: {} });
  }

  function meta() {
    return request('api/cups/meta', { auth: false });
  }

  function adminStats() {
    return request('api/admin/stats');
  }

  function adminUsers() {
    return request('api/admin/users');
  }

  function adminBots() {
    return request('api/admin/bots');
  }

  function adminEnsureBots() {
    return request('api/admin/bots/ensure', { method: 'POST', body: {} });
  }

  function adminCups() {
    return request('api/admin/cups');
  }

  function adminCreateCup(payload) {
    return request('api/admin/cups', { method: 'POST', body: payload || {} });
  }

  function adminStartCup(id) {
    return request('api/admin/cups/' + encodeURIComponent(id) + '/start', { method: 'POST', body: {} });
  }

  function adminDeleteCup(id) {
    return request('api/admin/cups/' + encodeURIComponent(id), { method: 'DELETE' });
  }

  function adminTick() {
    return request('api/admin/tick', { method: 'POST', body: {} });
  }

  function adminSetLevel(userId, level) {
    return request('api/admin/users/level', { method: 'POST', body: { userId, level } });
  }

  function statusLabel(s) {
    if (s === 'open') return 'Набор';
    if (s === 'live') return 'Идёт';
    if (s === 'finished') return 'Завершён';
    return s || '—';
  }

  function formatEta(ms) {
    if (ms == null || Number.isNaN(ms)) return '—';
    const sec = Math.max(0, Math.floor(ms / 1000));
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    if (m >= 60) {
      const h = Math.floor(m / 60);
      return `${h}ч ${m % 60}м`;
    }
    return `${m}:${String(s).padStart(2, '0')}`;
  }

  return {
    listCups, getCup, joinCup, leaveCup, meta,
    adminStats, adminUsers, adminBots, adminEnsureBots,
    adminCups, adminCreateCup, adminStartCup, adminDeleteCup,
    adminTick, adminSetLevel, statusLabel, formatEta
  };
})();

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

  function listCups({ status, bracketId, mine } = {}) {
    const q = new URLSearchParams();
    if (status) q.set('status', status);
    if (bracketId) q.set('bracketId', bracketId);
    if (mine) q.set('mine', '1');
    const qs = q.toString();
    return request('api/cups' + (qs ? '?' + qs : ''));
  }

  function getCup(id) {
    return request('api/cups/' + encodeURIComponent(id));
  }

  function joinCup(id, clubName, strength) {
    return request('api/cups/' + encodeURIComponent(id) + '/join', {
      method: 'POST',
      body: {
        clubName: clubName || undefined,
        strength: strength != null ? Number(strength) : undefined
      }
    });
  }

  function leaveCup(id) {
    return request('api/cups/' + encodeURIComponent(id) + '/leave', { method: 'POST', body: {} });
  }

  function meta() {
    return request('api/cups/meta', { auth: false });
  }

  function leaderboard({ bracketId, limit } = {}) {
    const q = new URLSearchParams();
    if (bracketId) q.set('bracketId', bracketId);
    if (limit) q.set('limit', String(limit));
    const qs = q.toString();
    return request('api/cups/leaderboard' + (qs ? '?' + qs : ''), { auth: false });
  }

  function events() {
    return request('api/cups/events');
  }

  function markEventsRead(ids) {
    return request('api/cups/events/read', { method: 'POST', body: { ids: ids || [] } });
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

  function adminAdvanceCup(id) {
    return request('api/admin/cups/' + encodeURIComponent(id) + '/advance', { method: 'POST', body: {} });
  }

  function adminFinishCup(id) {
    return request('api/admin/cups/' + encodeURIComponent(id) + '/finish', { method: 'POST', body: {} });
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

  function archiveReasonRu(reason) {
    const map = {
      no_humans: 'Нет реальных игроков',
      not_enough_players: 'Мало участников',
      finished_expired: 'Истёк срок итогов',
      admin_delete: 'Удалён админом'
    };
    return map[reason] || reason || '—';
  }

  function eventText(ev) {
    if (!ev) return '';
    if (ev.type === 'cup_started') return `${ev.cupName}: старт · ${ev.round || 'раунд'}`;
    if (ev.type === 'cup_out') return `${ev.cupName}: вылет (${ev.round || 'раунд'})`;
    if (ev.type === 'cup_won') return `${ev.cupName}: победа! +${ev.xp || 0} XP` + (ev.money ? ` · +${ev.money}€` : '');
    if (ev.type === 'cup_done') return `${ev.cupName}: итог · +${ev.xp || 0} XP` + (ev.money ? ` · +${ev.money}€` : '');
    return ev.cupName || ev.type || 'Событие';
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

  function formatMoney(n) {
    const v = Number(n) || 0;
    if (Math.abs(v) >= 1e6) return (v / 1e6).toFixed(1).replace('.0', '') + ' млн €';
    if (Math.abs(v) >= 1e3) return Math.round(v / 1e3) + ' тыс €';
    return v + ' €';
  }

  function findMyTie(cup, userId) {
    if (!cup || !userId) return null;
    const rounds = [...(cup.history || [])].reverse();
    for (const h of rounds) {
      const tie = (h.ties || []).find((t) => t.home?.userId === userId || t.away?.userId === userId);
      if (tie) return { round: h.round, tie, latest: true };
    }
    // upcoming: still alive, next round not played
    if (cup.status === 'live' && (cup.aliveIds || []).includes(userId) && !(cup.history || []).length) {
      return { round: cup.round, tie: null, pending: true };
    }
    return null;
  }

  return {
    listCups, getCup, joinCup, leaveCup, meta, leaderboard, events, markEventsRead,
    adminStats, adminUsers, adminBots, adminEnsureBots,
    adminCups, adminCreateCup, adminStartCup, adminAdvanceCup, adminFinishCup, adminDeleteCup,
    adminTick, adminSetLevel, statusLabel, archiveReasonRu, eventText, formatEta, formatMoney, findMyTie
  };
})();

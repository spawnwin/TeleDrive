/* Панель управления FUTBOL X.
   Обычный статический файл: вся власть на сервере, здесь только вызовы API.
   Токен живёт в sessionStorage — закрыл вкладку, вход закончился. */
(() => {
  'use strict';

  const TOKEN_KEY = 'futbolx_admin_token';
  const $ = id => document.getElementById(id);

  const token = {
    get() { try { return sessionStorage.getItem(TOKEN_KEY) || ''; } catch (e) { return ''; } },
    set(v) {
      try { v ? sessionStorage.setItem(TOKEN_KEY, v) : sessionStorage.removeItem(TOKEN_KEY); }
      catch (e) {}
    }
  };

  async function api(method, path, body) {
    const headers = { 'Content-Type': 'application/json' };
    const t = token.get();
    if (t) headers.Authorization = 'Bearer ' + t;
    let res;
    try {
      res = await fetch(path, {
        method, headers,
        body: body === undefined ? undefined : JSON.stringify(body)
      });
    } catch (e) {
      throw new Error('Сервер недоступен');
    }
    let data = null;
    try { data = await res.json(); } catch (e) {}
    if (res.status === 401 && t) { signOut(true); throw new Error('Сессия истекла — войдите заново'); }
    if (!res.ok) throw new Error((data && data.error) || 'Ошибка ' + res.status);
    return data || {};
  }

  // ---------- мелочи интерфейса ----------
  function toast(text, kind) {
    const el = document.createElement('div');
    el.className = 'toast' + (kind ? ' ' + kind : '');
    el.textContent = text;
    $('toasts').appendChild(el);
    setTimeout(() => el.remove(), 2600);
  }

  const esc = s => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  function plural(n, forms) {
    const a = Math.abs(n) % 100, b = a % 10;
    return n + ' ' + forms[a > 10 && a < 20 ? 2 : b === 1 ? 0 : b >= 2 && b <= 4 ? 1 : 2];
  }

  /* «12 минут назад» читается быстрее, чем дата с секундами. */
  function ago(ts) {
    if (!ts) return 'не играл';
    const s = Math.floor((Date.now() - ts) / 1000);
    if (s < 90) return 'только что';
    const m = Math.floor(s / 60);
    if (m < 60) return plural(m, ['минуту', 'минуты', 'минут']) + ' назад';
    const h = Math.floor(m / 60);
    if (h < 24) return plural(h, ['час', 'часа', 'часов']) + ' назад';
    const d = Math.floor(h / 24);
    if (d < 30) return plural(d, ['день', 'дня', 'дней']) + ' назад';
    return new Date(ts).toLocaleDateString('ru-RU');
  }

  function when(ts) {
    return new Date(ts).toLocaleString('ru-RU',
      { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  }

  function bytes(n) {
    if (!n) return '—';
    if (n < 1024) return n + ' Б';
    if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' КБ';
    return (n / 1024 / 1024).toFixed(1) + ' МБ';
  }

  function uptime(sec) {
    const d = Math.floor(sec / 86400), h = Math.floor(sec % 86400 / 3600), m = Math.floor(sec % 3600 / 60);
    if (d) return plural(d, ['день', 'дня', 'дней']) + ' ' + h + ' ч';
    if (h) return h + ' ч ' + m + ' мин';
    return m ? plural(m, ['минуту', 'минуты', 'минут']) : 'меньше минуты';
  }

  /* Эмблема клуба рисуется так же, как в игре: щит с инициалами.
     Цвет выводится из названия, чтобы совпадал с тем, что видит игрок. */
  const CRESTS = ['#B6F24A', '#F2564A', '#4AA3F2', '#F2B14A', '#A855F7', '#3FD98B', '#F24A9E', '#4AE0F2'];
  function crest(name) {
    const label = String(name || '?').trim();
    const words = label.split(/\s+/).filter(w => !/^(fc|фк|фс)$/i.test(w));
    const ini = (words.length ? words : [label]).slice(0, 2)
      .map(w => w[0] || '').join('').toUpperCase() || 'FX';
    let h = 0;
    for (let i = 0; i < label.length; i++) h = (h * 31 + label.charCodeAt(i)) >>> 0;
    const color = CRESTS[h % CRESTS.length];
    const small = ini.length > 1;
    return `<svg class="who-crest" viewBox="0 0 48 48" aria-hidden="true">
      <path d="M24 3 42 9v17c0 10-7.6 17.4-18 20C13.6 43.4 6 36 6 26V9z" fill="${color}" opacity=".16"/>
      <path d="M24 3 42 9v17c0 10-7.6 17.4-18 20C13.6 43.4 6 36 6 26V9z" fill="none"
            stroke="${color}" stroke-width="2"/>
      <text x="24" y="${small ? 30 : 31}" text-anchor="middle" font-size="${small ? 15 : 19}"
            font-weight="900" fill="${color}" font-family="sans-serif">${esc(ini)}</text></svg>`;
  }

  const DIVISIONS = { 1: 'Высшая', 2: 'Первая' };

  // ---------- вход ----------
  $('gate-form').addEventListener('submit', async e => {
    e.preventDefault();
    const status = $('gate-status');
    const btn = $('gate-btn');
    btn.disabled = true;
    status.classList.add('hidden');
    try {
      const data = await api('POST', '/api/admin/login', { password: $('gate-pass').value });
      token.set(data.token);
      $('gate-pass').value = '';
      await openPanel();
    } catch (err) {
      status.textContent = err.message;
      status.classList.remove('hidden');
    } finally {
      btn.disabled = false;
    }
  });

  function signOut(silent) {
    token.set('');
    $('shell').classList.add('hidden');
    $('gate').classList.remove('hidden');
    if (!silent) toast('Вы вышли из панели');
  }

  $('btn-exit').addEventListener('click', async () => {
    await api('POST', '/api/admin/logout').catch(() => {});
    signOut();
  });

  async function openPanel() {
    $('gate').classList.add('hidden');
    $('shell').classList.remove('hidden');
    await Promise.all([loadOverview(), loadPlayers()]);
  }

  // ---------- вкладки ----------
  document.querySelectorAll('.tab').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach(b => b.classList.toggle('active', b === btn));
      document.querySelectorAll('.panel').forEach(p =>
        p.classList.toggle('active', p.id === 'panel-' + btn.dataset.tab));
      if (btn.dataset.tab === 'audit') loadAudit();
      if (btn.dataset.tab === 'settings') fillSettings(state.settings);
    });
  });

  const state = { settings: {}, page: 1, pages: 1, query: '', sort: 'recent' };

  // ---------- сводка ----------
  async function loadOverview() {
    let o;
    try { o = await api('GET', '/api/admin/overview'); }
    catch (e) { toast(e.message, 'err'); return; }
    state.settings = o.settings;

    const tiles = [
      { v: o.users, l: 'менеджеров', cls: 'accent' },
      { v: o.activeDay, l: 'играли за сутки' },
      { v: o.activeWeek, l: 'играли за неделю' },
      { v: o.newToday, l: 'новых за сутки' },
      { v: o.clubs, l: 'клубов создано' },
      { v: o.avgRating || '—', l: 'средний рейтинг' },
      { v: o.trophies, l: 'трофеев у клубов' },
      { v: o.banned, l: 'заблокировано', cls: o.banned ? 'warn' : '' }
    ];
    $('metrics').innerHTML = tiles.map(t =>
      `<div class="metric ${t.cls || ''}"><b>${esc(t.v)}</b><small>${t.l}</small></div>`).join('');

    $('server-facts').innerHTML = [
      ['Хранилище', o.storage === 'sqlite' ? 'SQLite' : 'JSON-файл'],
      ['Размер базы', bytes(o.dbBytes)],
      ['Активных сессий', o.sessions],
      ['Node', o.node],
      ['Память', bytes(o.memory)],
      ['Работает без перезапуска', uptime(o.uptime)]
    ].map(([k, v]) => `<div><dt>${k}</dt><dd>${esc(v)}</dd></div>`).join('');

    const s = o.settings;
    $('state-facts').innerHTML = [
      ['Регистрация', s.registrationOpen ? '<span class="pill ok">открыта</span>'
                                         : '<span class="pill ban">закрыта</span>'],
      ['Вызовы менеджерам', s.rivalsOpen ? '<span class="pill ok">включены</span>'
                                         : '<span class="pill ban">выключены</span>'],
      ['Объявление', s.announcement
        ? '<span class="pill top">показывается</span>' : '<span class="pill quiet">нет</span>']
    ].map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('');

    fillSettings(s);
  }

  $('btn-refresh').addEventListener('click', () => loadOverview().then(() => toast('Обновлено', 'ok')));

  // ---------- менеджеры ----------
  let searchTimer = null;
  $('pl-query').addEventListener('input', e => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      state.query = e.target.value.trim();
      state.page = 1;
      loadPlayers();
    }, 250);
  });
  $('pl-sort').addEventListener('change', e => {
    state.sort = e.target.value; state.page = 1; loadPlayers();
  });
  $('pl-prev').addEventListener('click', () => {
    if (state.page > 1) { state.page--; loadPlayers(); }
  });
  $('pl-next').addEventListener('click', () => {
    if (state.page < state.pages) { state.page++; loadPlayers(); }
  });

  async function loadPlayers() {
    const params = new URLSearchParams({
      query: state.query, page: state.page, sort: state.sort, limit: 25
    });
    let data;
    try { data = await api('GET', '/api/admin/players?' + params); }
    catch (e) { toast(e.message, 'err'); return; }

    state.pages = data.pages;
    const body = $('pl-rows');
    if (!data.rows.length) {
      body.innerHTML = `<tr class="empty"><td colspan="7">${
        state.query ? 'Никого не нашли по этому запросу' : 'Менеджеров пока нет'}</td></tr>`;
    } else {
      body.innerHTML = data.rows.map(p => `
        <tr data-id="${esc(p.id)}">
          <td><div class="who">${crest(p.clubName || p.name)}
            <div><b>${esc(p.name)}</b><small>с ${new Date(p.createdAt).toLocaleDateString('ru-RU')}</small></div>
          </div></td>
          <td>${p.clubName ? esc(p.clubName) : '<span class="pill quiet">клуб не создан</span>'}</td>
          <td>${p.division ? esc(DIVISIONS[p.division] || p.division) +
                ' · сезон ' + esc(p.season) : '—'}</td>
          <td class="num">${p.rating || '—'}</td>
          <td class="num">${p.trophies}</td>
          <td>${p.banned ? `<span class="pill ban">заблокирован</span>` : esc(ago(p.updatedAt))}</td>
          <td><button class="btn ghost sm" data-open="${esc(p.id)}">Открыть</button></td>
        </tr>`).join('');
    }

    $('pl-info').textContent = data.total
      ? `${plural(data.total, ['менеджер', 'менеджера', 'менеджеров'])} · страница ${data.page} из ${data.pages}`
      : '';
    $('pl-prev').disabled = data.page <= 1;
    $('pl-next').disabled = data.page >= data.pages;
  }

  $('pl-rows').addEventListener('click', e => {
    const btn = e.target.closest('[data-open]');
    if (btn) openPlayer(btn.dataset.open);
  });

  // ---------- карточка менеджера ----------
  let current = null;

  function closeDrawer() { $('drawer-back').classList.add('hidden'); current = null; }
  $('dr-close').addEventListener('click', closeDrawer);
  $('drawer-back').addEventListener('click', e => { if (e.target === $('drawer-back')) closeDrawer(); });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !$('drawer-back').classList.contains('hidden')) closeDrawer();
  });

  async function openPlayer(id) {
    try { current = await api('GET', '/api/admin/player?id=' + encodeURIComponent(id)); }
    catch (e) { return toast(e.message, 'err'); }
    renderPlayer();
    $('drawer-back').classList.remove('hidden');
  }

  function renderPlayer() {
    const p = current;
    const s = p.save;
    $('dr-name').textContent = p.name;
    $('dr-club').textContent = p.clubName
      ? p.clubName + ' · ' + (DIVISIONS[p.division] || '—') + ' лига · сезон ' + p.season
      : 'клуб ещё не создан';

    const stats = (s && s.stats) || {};
    const facts = [
      ['Зарегистрирован', new Date(p.createdAt).toLocaleString('ru-RU')],
      ['Последняя игра', ago(p.updatedAt)],
      ['Активных сессий', p.sessions],
      ['Рейтинг состава', p.rating || '—'],
      ['Матчей', stats.matches || 0],
      ['Побед', stats.wins || 0],
      ['Голов', stats.goals || 0],
      ['Трофеев', p.trophies],
      ['Игроков в заявке', s ? s.squad : '—'],
      ['Матчей в истории', s ? s.history : '—']
    ];

    $('dr-body').innerHTML = `
      ${p.banned ? `<p class="warn-note">Аккаунт заблокирован${
        p.banReason ? ': ' + esc(p.banReason) : ''}. Войти он не может.</p>` : ''}

      <div class="card">
        <h3>Досье</h3>
        <dl class="kv">${facts.map(([k, v]) =>
          `<div><dt>${k}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>
      </div>

      ${s ? `<div class="card">
        <h3>Правка сохранения</h3>
        <p class="card-note">Меняется у игрока сразу — при следующей загрузке игры.</p>
        <div class="field-grid">
          <label><span>Монеты</span>
            <input id="ed-coins" class="field" type="number" min="0" value="${s.coins}"></label>
          <label><span>Уровень</span>
            <input id="ed-level" class="field" type="number" min="1" value="${s.level}"></label>
          <label><span>Дивизион</span>
            <select id="ed-division" class="field">
              <option value="1"${p.division === 1 ? ' selected' : ''}>Высшая лига</option>
              <option value="2"${p.division === 2 ? ' selected' : ''}>Первая лига</option>
            </select></label>
          <label><span>Сезон</span>
            <input id="ed-season" class="field" type="number" min="1" value="${p.season || 1}"></label>
          <label class="wide-cell"><span>Название клуба</span>
            <input id="ed-club" class="field" maxlength="18" value="${esc(p.clubName || '')}"></label>
        </div>
        <button class="btn primary" id="btn-save-player">Сохранить</button>
      </div>` : `<div class="card"><h3>Сохранение</h3>
        <p class="card-note">Менеджер ещё не создал клуб — править нечего.</p></div>`}

      <div class="card">
        <h3>Доступ</h3>
        <div class="act-list">
          ${p.banned
            ? `<button class="btn" id="btn-unban"><svg class="ic"><use href="#a-ban"/></svg>Снять блокировку</button>`
            : `<div class="act-row">
                 <input id="ban-reason" class="field" maxlength="200" placeholder="Причина блокировки">
                 <button class="btn danger" id="btn-ban"><svg class="ic"><use href="#a-ban"/></svg>Заблокировать</button>
               </div>`}
          <div class="act-row">
            <input id="new-pass" class="field" type="text" maxlength="200"
                   placeholder="Новый пароль игрока, от 8 символов">
            <button class="btn" id="btn-setpass"><svg class="ic"><use href="#a-key"/></svg>Сбросить</button>
          </div>
          <button class="btn ghost" id="btn-kick">Закрыть все сессии</button>
          <button class="btn danger" id="btn-delete"><svg class="ic"><use href="#a-trash"/></svg>Удалить аккаунт навсегда</button>
        </div>
      </div>`;

    wirePlayerActions();
  }

  function wirePlayerActions() {
    const id = current.id;
    const after = async (msg) => {
      toast(msg, 'ok');
      await Promise.all([loadPlayers(), loadOverview()]);
    };

    const save = $('btn-save-player');
    if (save) save.addEventListener('click', async () => {
      try {
        current = await api('POST', '/api/admin/player/save', {
          id, patch: {
            coins: $('ed-coins').value, level: $('ed-level').value,
            division: $('ed-division').value, season: $('ed-season').value,
            clubName: $('ed-club').value
          }
        });
        renderPlayer();
        await after('Сохранение обновлено');
      } catch (e) { toast(e.message, 'err'); }
    });

    const ban = $('btn-ban');
    if (ban) ban.addEventListener('click', async () => {
      const reason = $('ban-reason').value.trim();
      if (!confirm(`Заблокировать ${current.name}? Все его сессии будут закрыты.`)) return;
      try {
        current = await api('POST', '/api/admin/player/ban', { id, banned: true, reason });
        renderPlayer();
        await after('Аккаунт заблокирован');
      } catch (e) { toast(e.message, 'err'); }
    });

    const unban = $('btn-unban');
    if (unban) unban.addEventListener('click', async () => {
      try {
        current = await api('POST', '/api/admin/player/ban', { id, banned: false });
        renderPlayer();
        await after('Блокировка снята');
      } catch (e) { toast(e.message, 'err'); }
    });

    $('btn-setpass').addEventListener('click', async () => {
      const password = $('new-pass').value;
      if (password.length < 8) return toast('Пароль должен быть не короче 8 символов', 'err');
      try {
        await api('POST', '/api/admin/player/password', { id, password });
        $('new-pass').value = '';
        toast('Пароль изменён, сессии закрыты', 'ok');
      } catch (e) { toast(e.message, 'err'); }
    });

    $('btn-kick').addEventListener('click', async () => {
      try {
        await api('POST', '/api/admin/player/kick', { id });
        current = await api('GET', '/api/admin/player?id=' + encodeURIComponent(id));
        renderPlayer();
        toast('Сессии закрыты', 'ok');
      } catch (e) { toast(e.message, 'err'); }
    });

    $('btn-delete').addEventListener('click', async () => {
      if (!confirm(`Удалить ${current.name} вместе с клубом и сохранением? Отменить нельзя.`)) return;
      try {
        await api('DELETE', '/api/admin/player?id=' + encodeURIComponent(id));
        closeDrawer();
        await after('Аккаунт удалён');
      } catch (e) { toast(e.message, 'err'); }
    });
  }

  // ---------- настройки ----------
  function fillSettings(s) {
    if (!s) return;
    $('set-registration').checked = !!s.registrationOpen;
    $('set-rivals').checked = !!s.rivalsOpen;
    $('set-announce').value = s.announcement || '';
    document.querySelectorAll('#set-motd .chip').forEach(c =>
      c.classList.toggle('active', c.dataset.motd === (s.motd || 'info')));
  }

  document.querySelectorAll('#set-motd .chip').forEach(chip => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('#set-motd .chip').forEach(c => c.classList.toggle('active', c === chip));
    });
  });

  $('btn-save-settings').addEventListener('click', async () => {
    const status = $('settings-status');
    const motd = document.querySelector('#set-motd .chip.active');
    try {
      state.settings = await api('POST', '/api/admin/settings', {
        registrationOpen: $('set-registration').checked,
        rivalsOpen: $('set-rivals').checked,
        announcement: $('set-announce').value.trim(),
        motd: motd ? motd.dataset.motd : 'info'
      });
      status.textContent = 'Сохранено. Игроки увидят изменения сразу.';
      status.className = 'inline-status ok';
      toast('Настройки сохранены', 'ok');
      loadOverview();
    } catch (e) {
      status.textContent = e.message;
      status.className = 'inline-status err';
    }
  });

  $('btn-change-pw').addEventListener('click', async () => {
    const status = $('pw-status');
    try {
      await api('POST', '/api/admin/password', {
        oldPassword: $('pw-old').value, newPassword: $('pw-new').value
      });
      $('pw-old').value = ''; $('pw-new').value = '';
      status.textContent = 'Пароль панели изменён.';
      status.className = 'inline-status ok';
      toast('Пароль изменён', 'ok');
    } catch (e) {
      status.textContent = e.message;
      status.className = 'inline-status err';
    }
  });

  // ---------- журнал ----------
  const ACTIONS = {
    'admin.login': 'вход в панель',
    'admin.password': 'смена пароля панели',
    'settings.update': 'изменены настройки',
    'player.ban': 'блокировка',
    'player.unban': 'снятие блокировки',
    'player.password': 'сброс пароля игрока',
    'player.save': 'правка сохранения',
    'player.kick': 'закрытие сессий',
    'player.delete': 'удаление аккаунта'
  };

  async function loadAudit() {
    let data;
    try { data = await api('GET', '/api/admin/audit?limit=200'); }
    catch (e) { return toast(e.message, 'err'); }
    const body = $('audit-rows');
    body.innerHTML = data.rows.length ? data.rows.map(r => `
      <tr>
        <td>${esc(when(r.at))}</td>
        <td>${esc(ACTIONS[r.action] || r.action)}</td>
        <td>${r.target ? esc(r.target) : '—'}</td>
        <td>${r.detail ? esc(r.detail) : '—'}</td>
        <td>${r.client ? esc(r.client) : '—'}</td>
      </tr>`).join('')
      : '<tr class="empty"><td colspan="5">Пока ничего не происходило</td></tr>';
  }

  $('btn-audit-refresh').addEventListener('click', () => loadAudit().then(() => toast('Обновлено', 'ok')));

  // ---------- старт ----------
  if (token.get()) {
    api('GET', '/api/admin/overview')
      .then(() => openPanel())
      .catch(() => { token.set(''); });
  }
})();

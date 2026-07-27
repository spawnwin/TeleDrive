/* Связь с сервером. Адрес задаётся в интерфейсе входа и хранится локально:
   игра одинаково работает и как чистая клиентская (локальные профили),
   и с поднятым бэкендом (общие аккаунты и облачные сохранения). */
const Net = {
  URL_KEY: 'futbolx_server_url',
  TOKEN_KEY: 'futbolx_token',

  get baseUrl() {
    try { return localStorage.getItem(this.URL_KEY) || ''; } catch (e) { return ''; }
  },
  set baseUrl(v) {
    try {
      if (v) localStorage.setItem(this.URL_KEY, v.replace(/\/+$/, ''));
      else localStorage.removeItem(this.URL_KEY);
    } catch (e) {}
  },

  get token() {
    try { return localStorage.getItem(this.TOKEN_KEY) || ''; } catch (e) { return ''; }
  },
  set token(v) {
    try {
      if (v) localStorage.setItem(this.TOKEN_KEY, v);
      else localStorage.removeItem(this.TOKEN_KEY);
    } catch (e) {}
  },

  enabled() { return !!this.baseUrl; },

  async request(method, path, body) {
    if (!this.baseUrl) throw new Error('Сервер не настроен');
    const headers = { 'Content-Type': 'application/json' };
    if (this.token) headers.Authorization = 'Bearer ' + this.token;

    let res;
    try {
      res = await fetch(this.baseUrl + path, {
        method, headers,
        body: body === undefined ? undefined : JSON.stringify(body)
      });
    } catch (e) {
      throw new Error('Сервер недоступен');
    }

    let data = null;
    try { data = await res.json(); } catch (e) {}
    if (!res.ok) throw new Error((data && data.error) || `Ошибка сервера (${res.status})`);
    return data || {};
  },

  ping() { return this.request('GET', '/api/health'); },
  register(name, password) { return this.request('POST', '/api/auth/register', { name, password }); },
  login(name, password) { return this.request('POST', '/api/auth/login', { name, password }); },
  logout() { return this.request('POST', '/api/auth/logout'); },
  pullSave() { return this.request('GET', '/api/save'); },
  pushSave(save) { return this.request('PUT', '/api/save', { save }); },
  leaderboard() { return this.request('GET', '/api/leaderboard'); }
};

/* Единая точка входа для интерфейса: он не должен знать, лежит ли
   сохранение на сервере или в браузере. */
const Account = {
  mode: 'local',        // 'local' | 'remote'
  remoteUser: null,
  syncTimer: null,
  syncState: 'idle',    // idle | pending | error
  onSyncChange: null,

  init() {
    this.mode = Net.enabled() && Net.token ? 'remote' : 'local';
  },

  /* Проверяет адрес сервера до того, как пользователь введёт пароль. */
  async connect(url) {
    Net.baseUrl = url;
    try {
      await Net.ping();
      return true;
    } catch (e) {
      Net.baseUrl = '';
      throw e;
    }
  },

  disconnect() {
    Net.token = '';
    Net.baseUrl = '';
    this.mode = 'local';
    this.remoteUser = null;
  },

  isRemote() { return this.mode === 'remote'; },

  // ---------- вход ----------
  async register(name, password) {
    const data = await Net.register(name, password);
    Net.token = data.token;
    this.remoteUser = data.user;
    this.mode = 'remote';
    Save.profileId = 'remote:' + data.user.id;
    Save.data = data.save
      ? Object.assign(defaultSave(), data.save)
      : defaultSave();
    Save.repair();
    return data;
  },

  async login(name, password) {
    const data = await Net.login(name, password);
    Net.token = data.token;
    this.remoteUser = data.user;
    this.mode = 'remote';
    Save.profileId = 'remote:' + data.user.id;
    Save.data = data.save
      ? Object.assign(defaultSave(), data.save)
      : defaultSave();
    Save.repair();
    return data;
  },

  /* Восстановление сессии при перезагрузке страницы. */
  async resume() {
    if (!Net.enabled() || !Net.token) return false;
    try {
      const me = await Net.request('GET', '/api/me');
      const data = await Net.pullSave();
      this.remoteUser = me.user;
      this.mode = 'remote';
      Save.profileId = 'remote:' + me.user.id;
      Save.data = data.save ? Object.assign(defaultSave(), data.save) : defaultSave();
      Save.repair();
      return true;
    } catch (e) {
      Net.token = '';
      this.mode = 'local';
      return false;
    }
  },

  async logout() {
    if (this.isRemote()) {
      await this.pushNow().catch(() => {});
      await Net.logout().catch(() => {});
      Net.token = '';
      this.remoteUser = null;
      this.mode = 'local';
      Save.data = null;
      Save.profileId = null;
    } else {
      Save.logout();
    }
  },

  displayName() {
    if (this.isRemote() && this.remoteUser) return this.remoteUser.name;
    const p = Profiles.find(Profiles.activeId());
    return p ? p.name : '—';
  },

  // ---------- синхронизация ----------
  /* Сохранение уходит на сервер с задержкой: за один матч состояние
     меняется десятки раз, и слать каждое изменение незачем. */
  scheduleSync() {
    if (!this.isRemote()) return;
    this.setSync('pending');
    clearTimeout(this.syncTimer);
    this.syncTimer = setTimeout(() => this.pushNow(), 1200);
  },

  async pushNow() {
    if (!this.isRemote() || !Save.data) return;
    clearTimeout(this.syncTimer);
    try {
      await Net.pushSave(Save.data);
      this.setSync('idle');
    } catch (e) {
      this.setSync('error');
    }
  },

  setSync(state) {
    this.syncState = state;
    if (this.onSyncChange) this.onSyncChange(state);
  }
};

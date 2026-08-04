/* UI controllers */
window.EYE_UI = (() => {
  const S = () => window.EYE_STATE;
  const D = () => window.EYE_DATA;
  const E = () => window.EYE_ENGINE;
  const W = () => window.EYE_WORLD;
  const A = () => window.EYE_AUTH;
  const O = () => window.EYE_ONLINE;

  let matchAbort = false;
  let matchSkipHalf = false;
  let matchPaused = false;
  let matchSpeed = 1;
  let matchPlaying = false;
  let secondHalfRunning = false;
  let matchFinishing = false;
  let transferTab = 'market';
  let statsTab = 'goals';
  let selectedPlayerId = null;
  let playerBack = 'squad';
  let selectedSlot = null;
  let bidEntryId = null;
  let matchCtx = null;
  let tableLeagueId = null;
  let cloudHasCareer = false;
  let saveTimer = null;
  let calendarTab = 'mine';
  let historyTab = 'matches';

  let createStep = 1;
  let createMode = 'takeover'; // takeover (real clubs) | custom
  let createDirty = false;
  let onlineCupsTab = 'open';
  let onlineCupId = null;
  let onlinePollTimer = null;
  let cupClockTimer = null;
  let cupClockTarget = null;
  let lastMePayload = null;
  let adminTab = 'cups';
  let adminCache = { cups: [], archive: [], users: [], bots: [], stats: null };

  function $(sel, root = document) { return root.querySelector(sel); }
  function $all(sel, root = document) { return [...root.querySelectorAll(sel)]; }

  const ENTRY_WINDOWS = new Set(['auth', 'register', 'create']);

  function show(id) {
    // home = mode select when logged in; guest sees login
    if (id === 'lobby' && !A().isLoggedIn()) id = 'home';
    if ((id === 'onlinecups' || id === 'cupdetail' || id === 'admin') && !A().isLoggedIn()) id = 'auth';
    if (id === 'create' && !A().isLoggedIn()) id = 'auth';
    if (id === 'create' && A().isLoggedIn() && teamAlreadyBound()) {
      toast('Карьера уже создана. Пересоздание запрещено.');
      id = S().get() || hasLocalCareer() ? 'hub' : 'home';
    }
    if (id === 'admin' && A().isLoggedIn() && !isAdminUser()) {
      toast('Только для администратора');
      id = 'home';
    }

    // Block leaving a live match (finishMatch clears matchPlaying before show('result'))
    if (matchPlaying && id !== 'match') {
      toast('Сначала завершите матч или нажмите «Пропустить»');
      return;
    }

    const isWindow = ENTRY_WINDOWS.has(id);

    $all('.screen').forEach(s => {
      s.classList.remove('active', 'entry-open', 'entry-backdrop');
      if (s.classList.contains('entry-screen')) s.setAttribute('aria-hidden', 'true');
    });

    if (isWindow) {
      const backdropId = 'home';
      const backdrop = document.getElementById('screen-' + backdropId);
      const win = document.getElementById('screen-' + id);
      if (backdrop) {
        backdrop.classList.add('active', 'entry-backdrop');
      }
      if (win) {
        win.classList.add('active', 'entry-open');
        win.setAttribute('aria-hidden', 'false');
        win.scrollTop = 0;
      }
    } else {
      const el = document.getElementById('screen-' + id);
      if (el) el.classList.add('active');
      if (el) el.scrollTop = 0;
    }

    const dockIds = ['hub', 'squad', 'tactics', 'transfers', 'more'];
    $all('.dock-btn').forEach(b => b.classList.toggle('active', b.dataset.nav === id));
    if (!dockIds.includes(id) && id !== 'match' && id !== 'prematch' && id !== 'result') {
      if (['table','calendar','cup','ucl','cwc','board','youth','inbox','stats','finance','train','club','history','player','onlinecups','cupdetail','admin'].includes(id)) {
        $all('.dock-btn').forEach(b => b.classList.toggle('active', b.dataset.nav === 'more'));
      }
    }

    // Desktop: exact match; player card keeps origin tab highlighted
    const deskAlias = {
      player: playerBack === 'youth' ? 'youth' : playerBack === 'inbox' ? 'inbox' : 'squad',
      cupdetail: 'onlinecups'
    };
    const deskActive = deskAlias[id] || id;
    $all('.desk-btn').forEach(b => b.classList.toggle('active', b.dataset.nav === deskActive));

    const app = document.getElementById('app');
    if (app) {
      const menuScreens = ['boot', 'home', 'auth', 'register', 'create', 'lobby'];
      const noCareerOk = ['onlinecups', 'cupdetail', 'admin'];
      const inMenu = menuScreens.includes(id) || (noCareerOk.includes(id) && !S().get());
      app.classList.toggle('menu-mode', inMenu);
      app.classList.toggle('match-mode', id === 'match');
      app.classList.toggle('entry-open', isWindow);
    }

    if (id !== 'onlinecups' && id !== 'cupdetail') {
      clearTimeout(onlinePollTimer);
      onlinePollTimer = null;
      stopCupClock();
    }
    syncAdminNav();
    if (id === 'onlinecups' || id === 'cupdetail' || id === 'admin' || id === 'lobby' || id === 'more') {
      syncOnlineBackNav();
    }
    if (id === 'hub' || id === 'lobby') {
      maybeToastCupEvents();
    }

    window.scrollTo(0, 0);
    if (id === 'create' && !createDirty) createStep = 1;
    if (isWindow) renderHome();
    refresh(id);
  }

  function setCreateStep(step) {
    createStep = Math.max(1, Math.min(3, Number(step) || 1));
    if (createStep > 1) createDirty = true;
    $all('[data-create-pane]').forEach(p => {
      const on = Number(p.dataset.createPane) === createStep;
      p.hidden = !on;
      p.classList.toggle('active', on);
    });
    $all('#create-stepper .create-step').forEach(b => {
      const n = Number(b.dataset.gotoStep);
      b.classList.toggle('active', n === createStep);
      b.classList.toggle('done', n < createStep);
      b.setAttribute('aria-selected', n === createStep ? 'true' : 'false');
    });
    if (createStep === 3) updateCreateSummary();
    const panel = $('#screen-create .entry-panel');
    if (panel) panel.scrollTop = 0;
  }

  function setCreateMode(mode) {
    createMode = mode === 'custom' ? 'custom' : 'takeover';
    $all('#create-mode-switch .mode-chip').forEach(b => {
      b.classList.toggle('active', b.dataset.createMode === createMode);
    });
    const custom = $('#create-custom-block');
    const take = $('#create-takeover-block');
    if (custom) custom.hidden = createMode !== 'custom';
    if (take) take.hidden = createMode !== 'takeover';
    const submit = $('#btn-create-submit');
    if (submit) submit.textContent = createMode === 'custom' ? 'Создать команду' : 'Начать карьеру';
    if (createMode === 'takeover') previewClub();
    else updateCustomPreview();
  }

  function updateCustomPreview() {
    const box = $('#custom-preview');
    if (!box) return;
    const name = ($('#inp-club-name')?.value || 'Мой клуб').trim() || 'Мой клуб';
    const color = $('#sel-color')?.value || '#C8102E';
    const short = ($('#inp-club-short')?.value || name.slice(0, 3)).trim().toUpperCase() || 'EYE';
    box.innerHTML = `
      <div class="club-preview-hero" style="--club:${color}"></div>
      <div class="club-preview-body">
        <div style="display:flex;gap:10px;align-items:center;margin-bottom:8px">
          <span class="club-dot" style="background:${color}"></span>
          <strong style="font-family:var(--display);font-size:17px">${name}</strong>
          <span class="pill">${short}</span>
        </div>
        <div class="meta">
          Автосостав: 18 игроков · OVR ~52–63<br/>
          Инфра ур. 1 · бюджет старта · цель: избежать вылета<br/>
          Развивайте базу, академию, тренировки и фанатов.
        </div>
      </div>
    `;
  }

  function updateCreateSummary() {
    const box = $('#create-summary');
    if (!box) return;
    const leagueId = $('#sel-league')?.value;
    const league = W().LEAGUES.find(l => l.id === leagueId);
    const lname = (window.EYE_I18N?.leagueRu(leagueId, league)?.name) || league?.name || '—';
    const formation = document.querySelector('#form-create select[name="formation"]')?.value || '4-3-3';
    const style = document.querySelector('#form-create select[name="style"]')?.value || 'balance';
    const styleName = D().STYLES.find(s => s.id === style)?.name || style;
    if (createMode === 'custom') {
      const name = ($('#inp-club-name')?.value || 'Мой клуб').trim() || 'Мой клуб';
      box.innerHTML = `<strong>${name}</strong><div class="meta" style="margin-top:6px;color:var(--muted);font-size:13px;line-height:1.45">${lname} · схема ${formation} · ${styleName}<br/>Случайный состав из 18 игроков будет сгенерирован при старте.</div>`;
    } else {
      const tpl = W().clubTemplate($('#sel-club')?.value);
      const ru = tpl ? (window.EYE_I18N.clubRu(tpl.id, tpl.name, tpl.stadium)) : null;
      box.innerHTML = `<strong>${ru?.name || 'Клуб'}</strong><div class="meta" style="margin-top:6px;color:var(--muted);font-size:13px;line-height:1.45">${lname} · схема ${formation} · ${styleName}<br/>Вы возьмёте готовый состав клуба.</div>`;
    }
  }

  function syncDesktopUser() {
    const foot = $('#desktop-user');
    if (!foot) return;
    const user = A().getUser();
    const me = S().get() ? S().club() : null;
    if (me) {
      foot.innerHTML = `<strong>${me.short || me.name}</strong><small>${user?.login ? '@' + user.login : 'Менеджер'}</small>`;
    } else if (user) {
      foot.innerHTML = `<strong>${user.name || user.login}</strong><small>@${user.login}</small>`;
    } else {
      foot.innerHTML = `<strong>Гость</strong><small>ПК-версия</small>`;
    }
  }

  function toast(msg) {
    const t = $('#toast');
    t.hidden = false;
    t.textContent = msg;
    clearTimeout(toast._t);
    toast._t = setTimeout(() => { t.hidden = true; }, 2800);
  }

  function syncCurrencyButtons() {
    const cur = S().getCurrency();
    $all('.cur-btn').forEach(b => b.classList.toggle('active', b.dataset.cur === cur));
    const rates = $('#currency-rates');
    if (rates) {
      rates.textContent = `Сейчас: ${S().currencyInfo().name}. Курсы: 1 € = 100 ₽ = 1,08 $`;
    }
    syncTransferPriceLabels();
  }

  function syncTransferPriceLabels() {
    const sel = $('#tf-price');
    if (!sel) return;
    const caps = [0, 5e6, 15e6, 40e6, 100e6];
    [...sel.options].forEach((opt, i) => {
      const cap = caps[i];
      if (cap == null) return;
      opt.textContent = cap === 0 ? 'Бюджет любой' : 'до ' + S().money(cap);
    });
  }

  function applyCurrency(code) {
    S().setCurrency(code);
    syncCurrencyButtons();
    toast('Валюта: ' + S().currencyInfo(code).name);
    const active = document.querySelector('.screen.active');
    const id = active?.id?.replace('screen-', '');
    if (id) refresh(id);
  }

  function refresh(id) {
    const st = S().get();
    if (!st && !['boot','home','create','auth','register','lobby','onlinecups','cupdetail','admin'].includes(id)) return;
    if (id === 'hub') renderHub();
    if (id === 'squad') renderSquad();
    if (id === 'tactics') renderTactics();
    if (id === 'transfers') renderTransfers(transferTab);
    if (id === 'table') renderTable();
    if (id === 'stats') renderStats();
    if (id === 'train') renderTrain();
    if (id === 'club') renderClub();
    if (id === 'youth') renderYouth();
    if (id === 'inbox') renderInbox();
    if (id === 'prematch') renderPrematch();
    if (id === 'history') renderHistory();
    if (id === 'player') renderPlayer();
    if (id === 'calendar') renderCalendar();
    if (id === 'cup') renderCup();
    if (id === 'ucl') renderUcl();
    if (id === 'cwc') renderCwc();
    if (id === 'board') renderBoard();
    if (id === 'finance') renderFinance();
    if (id === 'result') renderResult();
    if (id === 'create') {
      setCreateStep(createStep || 1);
      fillCreateForm();
    }
    if (id === 'more') {
      syncCurrencyButtons();
      syncAdminNav();
      syncCreateLocks();
      const lvlBox = $('#more-account-level');
      if (lvlBox) {
        const user = A().getUser();
        lvlBox.innerHTML = user
          ? `<strong>Аккаунт · онлайн-уровень</strong>${levelBarHtml(user)}
             <p class="hint" style="margin:8px 0 0">${teamAlreadyBound() ? 'Команда закреплена за аккаунтом. Пересоздание запрещено.' : 'Команда ещё не создана — доступно один раз.'}</p>`
          : '';
      }
    }
    if (id === 'auth') renderAuth();
    if (id === 'register') renderRegister();
    if (id === 'home') renderHome();
    if (id === 'lobby') renderLobby();
    if (id === 'onlinecups') renderOnlineCups();
    if (id === 'cupdetail') renderCupDetail();
    if (id === 'admin') renderAdmin();
  }

  function isAdminUser(user = A().getUser()) {
    return !!user && (user.role === 'admin' || user.login === 'admin');
  }

  function syncAdminNav() {
    const show = isAdminUser();
    ['desk-admin', 'btn-lobby-admin', 'menu-admin'].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.hidden = !show;
    });
  }

  function syncOnlineBackNav() {
    const back = $('#onlinecups-back');
    if (back) back.setAttribute('data-nav', 'lobby');
    const aback = $('#admin-back');
    if (aback) aback.setAttribute('data-nav', 'lobby');
  }

  function openCareerMode() {
    if (!A().isLoggedIn()) {
      show('auth');
      toast('Войдите в аккаунт');
      return;
    }
    if (hasLocalCareer() || cloudHasCareer) {
      enterApp({ toastWelcome: false });
      return;
    }
    createDirty = false;
    createMode = 'takeover';
    createStep = 1;
    show('create');
  }

  function openOnlineMode() {
    if (!A().isLoggedIn()) {
      show('auth');
      toast('Войдите в аккаунт для онлайн');
      return;
    }
    show('lobby');
  }

  function hasLocalCareer() {
    if (S().get()) return true;
    try { return !!localStorage.getItem(S().KEY); } catch { return false; }
  }

  function teamAlreadyBound() {
    const u = A().getUser();
    return !!(cloudHasCareer || u?.teamBound || hasLocalCareer() || lastMePayload?.teamBound || lastMePayload?.hasCareer);
  }

  function syncCreateLocks() {
    const bound = teamAlreadyBound();
    const btnNew = $('#btn-new');
    if (btnNew) {
      btnNew.hidden = bound;
      btnNew.disabled = bound;
    }
    const btnReset = $('#btn-reset');
    if (btnReset) {
      btnReset.hidden = !isAdminUser();
    }
    const accHome = $('#btn-account-home');
    if (accHome) {
      accHome.textContent = 'Онлайн';
      accHome.setAttribute('data-nav', 'lobby');
    }
  }

  async function syncCareerFromCloud() {
    if (!A().isLoggedIn()) return false;
    try {
      const me = await A().refreshMe();
      lastMePayload = me;
      cloudHasCareer = !!me?.hasCareer;
    } catch {}

    let localRaw = null;
    try { localRaw = localStorage.getItem(S().KEY); } catch {}
    let remote = null;
    if (cloudHasCareer || !localRaw) {
      try { remote = await A().loadCareer(); } catch { remote = null; }
    }

    if (remote) {
      let preferRemote = true;
      try {
        if (localRaw) {
          const local = JSON.parse(localRaw);
          const lS = local.season || 0, lW = local.week || 0;
          const rS = remote.season || 0, rW = remote.week || 0;
          const lAt = local.savedAt || 0;
          const rAt = remote.savedAt || 0;
          if (rS > lS || (rS === lS && rW > lW)) preferRemote = true;
          else if (rS === lS && rW === lW && rAt > lAt && rAt > 0) preferRemote = true;
          else preferRemote = false;
        }
      } catch { preferRemote = true; }
      if (preferRemote) {
        try { localStorage.setItem(S().KEY, JSON.stringify(remote)); } catch {}
      } else {
        cloudSave(true);
      }
    }
    return !!(S().load() || (hasLocalCareer() && S().load()));
  }

  async function enterApp({ toastWelcome, toModes } = {}) {
    if (!A().isLoggedIn()) {
      show('home');
      return;
    }
    const loaded = await syncCareerFromCloud();
    if (toModes) {
      if (toastWelcome) toast('С возвращением');
      show('home');
      return;
    }
    if (loaded) {
      if (toastWelcome) toast('С возвращением');
      show('hub');
      return;
    }
    show('home');
  }

  function levelBarHtml(user) {
    if (!user) return '';
    const thr = user.xpThresholds || [0, 0, 100, 250, 500, 900, 1500, 2400, 3600, 5200, 7500];
    const lvl = user.level || 1;
    const xp = user.xp || 0;
    const next = user.xpNext != null ? user.xpNext : 0;
    let pct = 100;
    if (lvl < 10) {
      const floor = thr[lvl] || 0;
      const ceil = thr[lvl + 1] || (floor + Math.max(1, next));
      pct = Math.min(100, Math.max(0, Math.round(((xp - floor) / Math.max(1, ceil - floor)) * 100)));
    }
    return `<div class="level-row">
      <span class="level-badge">Ур. ${lvl}</span>
      <div class="level-track"><div class="level-fill" style="width:${pct}%"></div></div>
      <small>${lvl >= 10 ? 'макс' : `${xp} XP · ещё ${next}`}</small>
    </div>
    <div class="meta">Онлайн-кубки: ${user.cupsPlayed || 0} · Победы: ${user.cupsWon || 0}</div>`;
  }

  function stopCupClock() {
    clearInterval(cupClockTimer);
    cupClockTimer = null;
    cupClockTarget = null;
  }

  function startCupClock(selector, atMs) {
    stopCupClock();
    cupClockTarget = { selector, atMs };
    const tick = () => {
      const el = $(cupClockTarget.selector);
      if (!el || cupClockTarget.atMs == null) return;
      el.textContent = O().formatEta(cupClockTarget.atMs - Date.now());
    };
    tick();
    cupClockTimer = setInterval(tick, 1000);
  }

  async function maybeToastCupEvents() {
    if (!A().isLoggedIn() || !O()) return;
    try {
      const me = lastMePayload || await A().refreshMe();
      lastMePayload = me;
      const events = (me?.cupEvents || []).filter((e) => !e.read).slice(0, 2);
      if (!events.length) return;
      events.forEach((ev) => toast(O().eventText(ev)));
      await O().markEventsRead(events.map((e) => e.id));
      lastMePayload = null;
    } catch {}
  }

  function cupRowHtml(c, user) {
    const uid = user?.id;
    const mine = (c.entrants || []).some((e) => e.userId === uid);
    const levelOk = isAdminUser(user) || (user && user.level >= c.minLevel && user.level <= c.maxLevel);
    const canJoin = c.status === 'open' && levelOk;
    let eta = '';
    if (c.status === 'open') eta = ' · старт <span data-eta="' + (c.startAt || 0) + '">' + O().formatEta((c.startAt || 0) - Date.now()) + '</span>';
    else if (c.status === 'live') {
      eta = ` · ${c.round || 'раунд'}`;
      if (c.nextRoundAt) eta += ' · след. <span data-eta="' + c.nextRoundAt + '">' + O().formatEta(c.nextRoundAt - Date.now()) + '</span>';
    } else if (c.status === 'finished' && c.champion) eta = ' · ' + (c.champion.clubName || c.champion.name);
    return `<button type="button" class="menu-row cup-row" data-cup-open="${c.id}">
      <span class="menu-ico">${c.size}</span>
      <span class="menu-txt">
        <strong>${c.name}</strong>
        <small>${O().statusLabel(c.status)} · ${c.slotsFilled}/${c.size} · люди ${c.humans}${eta}${mine ? ' · вы внутри' : ''}${!canJoin && c.status === 'open' ? ' · не ваш уровень' : ''}</small>
      </span>
    </button>`;
  }

  function refreshEtaSpans(root = document) {
    root.querySelectorAll('[data-eta]').forEach((el) => {
      const at = Number(el.getAttribute('data-eta'));
      if (!at) return;
      el.textContent = O().formatEta(at - Date.now());
    });
  }

  function careerXiStrength() {
    try {
      const me = S().get() ? S().club() : null;
      if (!me?.squad?.length) return null;
      const xi = (me.lineup || []).filter(Boolean);
      const pool = xi.length >= 11
        ? xi.slice(0, 11)
        : [...me.squad].sort((a, b) => (b.ovr || 0) - (a.ovr || 0)).slice(0, 11);
      if (!pool.length) return null;
      return Math.round(pool.reduce((s, p) => s + (p.ovr || 60), 0) / pool.length);
    } catch {
      return null;
    }
  }

  function renderAuth() {
    requestAnimationFrame(() => $('#form-login')?.querySelector('input')?.focus());
  }

  function renderRegister() {
    requestAnimationFrame(() => $('#form-register')?.querySelector('input')?.focus());
  }

  async function renderHome() {
    const logged = A().isLoggedIn();
    const guest = $('#home-guest-actions');
    const modes = $('#home-mode-actions');
    const lede = $('#home-lede');
    const hint = $('#home-hint');
    if (guest) guest.hidden = logged;
    if (modes) modes.hidden = !logged;
    if (lede) {
      lede.textContent = logged
        ? 'Выберите режим: карьера против ИИ или онлайн с игроками.'
        : 'Войдите в аккаунт, затем выберите режим.';
    }
    if (hint) {
      if (!logged) {
        hint.textContent = 'Карьера и онлайн привязаны к аккаунту.';
      } else if (hasLocalCareer() || cloudHasCareer) {
        hint.textContent = 'Карьера: реальные лиги и клубы · соперники ИИ. Онлайн: кубки с людьми.';
      } else {
        hint.textContent = 'В карьере выберите реальную лигу и клуб. Онлайн — кубки с другими менеджерами.';
      }
    }
    const btnCareer = $('#btn-career');
    if (btnCareer) {
      btnCareer.textContent = (hasLocalCareer() || cloudHasCareer) ? 'Продолжить карьеру' : 'Карьера';
    }
    syncCreateLocks();
    syncDesktopUser();
  }

  async function renderLobby() {
    const user = A().getUser();
    const box = $('#lobby-user');
    if (box && user) {
      box.innerHTML = `<div><strong>${user.name || user.login}</strong><small>@${user.login}${isAdminUser(user) ? ' · админ' : ''}</small></div>${levelBarHtml(user)}`;
    }
    const local = hasLocalCareer();
    const btnCont = $('#btn-continue');
    const btnNew = $('#btn-new');
    const hint = $('#lobby-hint');
    const lede = $('#lobby-lede');
    const bound = teamAlreadyBound();
    if (btnCont) {
      btnCont.hidden = !(local || cloudHasCareer);
      btnCont.textContent = 'В карьеру';
    }
    if (btnNew) {
      btnNew.hidden = bound;
      btnNew.disabled = bound;
    }
    if (lede) {
      lede.textContent = 'Кубки с реальными менеджерами. Карьера — отдельно: реальные лиги и клубы против ИИ.';
    }
    if (hint) {
      hint.textContent = bound
        ? 'Карьера уже привязана к аккаунту. Здесь — только онлайн.'
        : 'Карьеру с реальной лигой и клубом можно начать из меню режимов.';
    }
    syncCreateLocks();
    syncOnlineBackNav();
    syncAdminNav();
    syncDesktopUser();
    await renderLobbyCups();
  }

  async function renderLobbyCups() {
    const list = $('#lobby-cups-list');
    const liveBox = $('#lobby-cups-live');
    if (!list) return;
    if (!A().isLoggedIn()) {
      list.innerHTML = '';
      if (liveBox) liveBox.hidden = true;
      return;
    }
    list.innerHTML = '<div class="hint">Загрузка кубков…</div>';
    try {
      let mePayload = lastMePayload;
      try {
        mePayload = await A().refreshMe();
        lastMePayload = mePayload;
      } catch {}
      const bracket = mePayload?.bracket;
      const user = A().getUser();
      if (liveBox) {
        const live = mePayload?.liveCup;
        if (live) {
          liveBox.hidden = false;
          liveBox.innerHTML = `<div class="lobby-live-row">
            <div><strong>Идёт ваш кубок</strong><small>${live.name} · ${live.round || 'раунд'}</small></div>
            <button type="button" class="btn btn-primary btn-tiny" data-cup-open="${live.id}">Открыть</button>
          </div>`;
        } else {
          liveBox.hidden = true;
          liveBox.innerHTML = '';
        }
      }
      const data = await O().listCups({
        status: 'open',
        bracketId: bracket?.id && !isAdminUser(user) ? bracket.id : undefined
      });
      let cups = (data.cups || []).slice(0, 6);
      if (!cups.length) {
        list.innerHTML = '<div class="hint">Открытых кубков вашего уровня пока нет — загляните во «Все кубки».</div>';
      } else {
        list.innerHTML = cups.map((c) => cupRowHtml(c, user)).join('');
      }
    } catch (err) {
      list.innerHTML = `<div class="hint">${err.message || 'Кубки недоступны'}</div>`;
    }
  }

  async function renderOnlineCups() {
    if (!A().isLoggedIn()) { show('auth'); return; }
    syncAdminNav();
    syncOnlineBackNav();
    let bracket = null;
    let mePayload = null;
    try {
      mePayload = await A().refreshMe();
      lastMePayload = mePayload;
      bracket = mePayload?.bracket || null;
    } catch {}
    const user = A().getUser();
    const card = $('#online-level-card');
    if (card) {
      const range = bracket ? bracket.label : `Ур. ${user?.level || 1}`;
      const adminNote = isAdminUser(user) ? ' Админ: любой бракет.' : '';
      const live = mePayload?.liveCup;
      card.innerHTML = `<strong>${user?.name || user?.login || 'Игрок'}</strong>
        ${levelBarHtml(user)}
        <p class="hint" style="margin:8px 0 0">Диапазон: ${range}.${adminNote} Раунды ~20 сек.</p>
        ${live ? `<button type="button" class="btn btn-primary" style="margin-top:8px" data-cup-open="${live.id}">Ваш live-кубок · ${live.round || 'раунд'}</button>` : ''}`;
    }
    $all('#online-cups-tabs .tab').forEach((t) => t.classList.toggle('active', t.dataset.oc === onlineCupsTab));
    const list = $('#online-cups-list');
    const metaEl = $('#online-cups-meta');
    const hadContent = !!(list && list.children.length && !list.querySelector('.hint'));
    if (list && !hadContent) list.innerHTML = '<div class="hint">Загрузка…</div>';

    try {
      if (onlineCupsTab === 'board') {
        const data = await O().leaderboard({ bracketId: bracket?.id, limit: 30 });
        if (metaEl) metaEl.textContent = `Рейтинг${bracket ? ' · ' + bracket.label : ''} по победам, затем XP.`;
        const leaders = data.leaders || [];
        list.innerHTML = leaders.length
          ? leaders.map((u) =>
            `<div class="admin-row">
              <div><strong>#${u.rank} ${u.name || u.login}</strong>
              <small>ур.${u.level} · XP ${u.xp} · побед ${u.cupsWon || 0} · игр ${u.cupsPlayed || 0}</small></div>
            </div>`
          ).join('')
          : '<div class="hint">Пока пусто — сыграйте кубок.</div>';
        stopCupClock();
      } else {
        const opts = {};
        if (onlineCupsTab === 'open') {
          opts.status = 'open';
          if (bracket?.id && !isAdminUser(user)) opts.bracketId = bracket.id;
        } else if (onlineCupsTab === 'mine') {
          opts.mine = true;
        } else if (onlineCupsTab === 'live' || onlineCupsTab === 'finished') {
          opts.status = onlineCupsTab;
        }
        const data = await O().listCups(opts);
        let cups = data.cups || [];
        if (onlineCupsTab === 'open' && isAdminUser(user) && bracket?.id) {
          cups = [...cups].sort((a, b) => (a.bracketId === bracket.id ? 0 : 1) - (b.bracketId === bracket.id ? 0 : 1));
        }
        if (metaEl && data.meta) {
          const next = data.meta.nextTick ? O().formatEta(data.meta.nextTick - Date.now()) : 'скоро';
          const liveSec = Math.round((data.meta.liveRoundMs || 20000) / 1000);
          metaEl.textContent = `Набор: ${data.meta.cupsOpen || 0} · Идут: ${data.meta.cupsLive || 0} · Ботов: ${data.meta.bots || 0} · Тик ~${next} · раунд ${liveSec}с.`;
        }
        list.innerHTML = cups.length
          ? cups.map((c) => cupRowHtml(c, user)).join('')
          : '<div class="hint">Кубков в этой вкладке нет.</div>';
        stopCupClock();
        cupClockTimer = setInterval(() => refreshEtaSpans(list), 1000);
      }
    } catch (err) {
      if (list) list.innerHTML = `<div class="hint">${err.message || 'Ошибка загрузки'}</div>`;
    }
    clearTimeout(onlinePollTimer);
    onlinePollTimer = setTimeout(() => {
      if (document.getElementById('screen-onlinecups')?.classList.contains('active')) renderOnlineCups();
    }, onlineCupsTab === 'live' || onlineCupsTab === 'mine' ? 5000 : 12000);
  }

  async function renderCupDetail() {
    if (!A().isLoggedIn()) { show('auth'); return; }
    if (!onlineCupId) { show('onlinecups'); return; }
    syncOnlineBackNav();
    const head = $('#cupdetail-head');
    const myMatch = $('#cupdetail-mymatch');
    const actions = $('#cupdetail-actions');
    const entrants = $('#cupdetail-entrants');
    const bracketEl = $('#cupdetail-bracket');
    const title = $('#cupdetail-title');
    const firstLoad = !(head && head.dataset.ready === '1');
    if (head && firstLoad) head.innerHTML = 'Загрузка…';
    try {
      const data = await O().getCup(onlineCupId);
      const c = data.cup;
      if (!c) throw new Error('Кубок не найден');
      if (title) title.textContent = c.name;
      const user = A().getUser();
      const mine = (c.entrants || []).some((e) => e.userId === user?.id);
      const levelOk = isAdminUser(user) || (user && user.level >= c.minLevel && user.level <= c.maxLevel);
      const canJoin = c.status === 'open' && levelOk && !mine;
      const clockAt = c.status === 'live' ? c.nextRoundAt : (c.status === 'open' ? c.startAt : null);
      if (head) {
        head.dataset.ready = '1';
        head.innerHTML = `<div class="cup-detail-meta">
          <div><strong>${O().statusLabel(c.status)}</strong> · ${c.bracketLabel} · ${c.slotsFilled}/${c.size}</div>
          <div class="meta">Люди: ${c.humans} · Боты: ${c.bots}${c.status === 'live' ? ' · ' + (c.round || 'раунд') : ''}</div>
          ${clockAt ? `<div class="meta">Таймер: <strong id="cup-clock">${O().formatEta(clockAt - Date.now())}</strong></div>` : ''}
          ${c.champion ? `<div class="meta">Чемпион: <strong>${c.champion.clubName || c.champion.name}</strong>${c.champion.isBot ? ' (бот)' : ''}</div>` : ''}
          ${c.status === 'finished' && mine && c.xpAwards && c.xpAwards[user.id] != null
            ? `<div class="meta">XP: +${c.xpAwards[user.id]}${c.moneyAwards && c.moneyAwards[user.id] ? ' · приз ' + O().formatMoney(c.moneyAwards[user.id]) : ''}</div>` : ''}
        </div>`;
        if (clockAt) startCupClock('#cup-clock', clockAt);
        else stopCupClock();
      }
      if (myMatch) {
        const info = O().findMyTie(c, user?.id);
        if (mine && info) {
          myMatch.hidden = false;
          if (info.pending) {
            myMatch.innerHTML = `<strong>Ваш матч</strong><p class="hint" style="margin:6px 0 0">Ожидание раунда «${info.round || c.round}» · таймер выше.</p>`;
          } else if (info.tie) {
            const t = info.tie;
            const hs = t.score ? `${t.score[0]}:${t.score[1]}` : '—';
            const won = t.winnerId === user.id;
            const alive = (c.aliveIds || []).includes(user.id);
            myMatch.innerHTML = `<strong>Ваш матч · ${info.round}</strong>
              <div class="cup-tie mine-tie" style="margin-top:8px">
                <span class="${t.winnerId === t.home?.userId ? 'win' : ''}">${t.home?.clubName || t.home?.name}</span>
                <b>${hs}</b>
                <span class="${t.winnerId === t.away?.userId ? 'win' : ''}">${t.away?.clubName || t.away?.name}</span>
              </div>
              <p class="hint" style="margin:6px 0 0">${c.status === 'finished' && c.champion?.userId === user.id ? 'Вы чемпион!' : (won ? (alive || c.status === 'finished' ? 'Победа в раунде' : 'Дальше по сетке') : 'Вылет из кубка')}</p>`;
          }
        } else {
          myMatch.hidden = true;
          myMatch.innerHTML = '';
        }
      }
      if (actions) {
        actions.innerHTML = `
          ${canJoin ? `<button class="btn btn-primary" type="button" data-cup-join="${c.id}">Вступить</button>` : ''}
          ${mine && c.status === 'open' ? `<button class="btn btn-glass" type="button" data-cup-leave="${c.id}">Выйти</button>` : ''}
          <button class="btn btn-glass" type="button" data-nav="onlinecups">К списку</button>
        `;
      }
      if (entrants) {
        const rows = (c.entrants || []).map((e, i) =>
          `<div class="cup-entrant${e.userId === user?.id ? ' mine' : ''}${e.out ? ' out' : ''}"><span>${i + 1}. ${e.clubName || e.name}</span><small>ур.${e.level}${e.isBot ? ' · бот' : ''} · сила ${e.strength || '—'}${e.out ? ' · выбыли' : ''}</small></div>`
        ).join('') || '<div class="hint">Пока пусто</div>';
        entrants.innerHTML = `<strong>Участники</strong><div class="cup-entrants">${rows}</div>`;
      }
      if (bracketEl) {
        if (!(c.history || []).length) {
          bracketEl.innerHTML = `<strong>Сетка</strong><p class="hint">Первый раунд «${c.round || 'скоро'}» стартует по таймеру. Свободные места займут боты.</p>`;
        } else {
          bracketEl.innerHTML = `<strong>Сетка</strong>` + (c.history || []).map((h) => {
            const ties = (h.ties || []).map((t) => {
              const hs = t.score ? `${t.score[0]}:${t.score[1]}` : '—';
              const hw = t.winnerId === t.home?.userId ? ' win' : '';
              const aw = t.winnerId === t.away?.userId ? ' win' : '';
              const mineTie = t.home?.userId === user?.id || t.away?.userId === user?.id ? ' mine-tie' : '';
              return `<div class="cup-tie${mineTie}"><span class="${hw}">${t.home?.clubName || t.home?.name}</span><b>${hs}</b><span class="${aw}">${t.away?.clubName || t.away?.name}</span></div>`;
            }).join('');
            return `<div class="cup-round"><div class="meta">${h.round}</div>${ties}</div>`;
          }).join('');
        }
      }

      if (c.status === 'finished' && mine && c.xpAwards && c.xpAwards[user.id] != null) {
        const key = 'xptoast_' + c.id;
        if (!renderCupDetail._seen) renderCupDetail._seen = new Set();
        if (!renderCupDetail._seen.has(key)) {
          renderCupDetail._seen.add(key);
          const before = { level: user.level, xp: user.xp };
          try { await A().refreshMe(); } catch {}
          const after = A().getUser();
          const gain = c.xpAwards[user.id];
          const money = c.moneyAwards && c.moneyAwards[user.id];
          const leveled = after && before && after.level > before.level;
          let msg = leveled ? `+${gain} XP · уровень ${after.level}!` : `Кубок завершён · +${gain} XP`;
          if (money) msg += ` · ${O().formatMoney(money)}`;
          toast(msg);
          if (S().get()) {
            try {
              const cloud = await A().loadCareer();
              if (cloud) {
                try { localStorage.setItem(S().KEY, JSON.stringify(cloud)); } catch {}
                S().load();
              }
            } catch {}
          }
        }
      }
    } catch (err) {
      if (head) head.innerHTML = `<div class="hint">${err.message || 'Ошибка'}</div>`;
    }
    clearTimeout(onlinePollTimer);
    onlinePollTimer = setTimeout(() => {
      if (document.getElementById('screen-cupdetail')?.classList.contains('active')) renderCupDetail();
    }, 4000);
  }

  async function renderAdmin() {
    if (!A().isLoggedIn()) { show('auth'); return; }
    if (!isAdminUser()) {
      toast('Только для администратора');
      show(S().get() ? 'hub' : 'lobby');
      return;
    }
    $all('#admin-tabs .tab').forEach((t) => t.classList.toggle('active', t.dataset.ad === adminTab));
    const statsEl = $('#admin-stats');
    const list = $('#admin-list');
    if (list) list.innerHTML = '<div class="hint">Загрузка…</div>';
    try {
      const [stats, cupsPack, usersPack, botsPack] = await Promise.all([
        O().adminStats(),
        O().adminCups(),
        O().adminUsers(),
        O().adminBots()
      ]);
      adminCache = {
        stats,
        cups: cupsPack.cups || [],
        archive: cupsPack.archive || [],
        users: usersPack.users || [],
        bots: botsPack.bots || []
      };
      if (statsEl) {
        statsEl.innerHTML = `<strong>Сводка</strong>
          <div class="admin-stats-grid">
            <div><b>${stats.humans || 0}</b><small>игроки</small></div>
            <div><b>${stats.bots || 0}</b><small>боты</small></div>
            <div><b>${stats.cupsOpen || 0}</b><small>набор</small></div>
            <div><b>${stats.cupsLive || 0}</b><small>идут</small></div>
            <div><b>${stats.cupsFinished || 0}</b><small>готово</small></div>
            <div><b>${stats.archive || 0}</b><small>архив</small></div>
          </div>
          <p class="hint" style="margin:8px 0 0">Тик ~${O().formatEta((stats.nextTick || 0) - Date.now())} · раунд live ${(stats.liveRoundMs || 20000) / 1000}с</p>`;
      }
      if (adminTab === 'cups') {
        list.innerHTML = (adminCache.cups.length ? adminCache.cups : []).map((c) =>
          `<div class="admin-row">
            <div><strong>${c.name}</strong><small>${O().statusLabel(c.status)}${c.round ? ' · ' + c.round : ''} · ${c.slotsFilled}/${c.size} · люди ${c.humans}</small></div>
            <div class="admin-row-actions">
              ${c.status === 'open' ? `<button type="button" class="btn btn-tiny" data-admin-start="${c.id}">Старт</button>` : ''}
              ${c.status === 'live' ? `<button type="button" class="btn btn-tiny" data-admin-adv="${c.id}">Раунд</button>` : ''}
              ${c.status === 'live' || c.status === 'open' ? `<button type="button" class="btn btn-tiny" data-admin-fin="${c.id}">Доиграть</button>` : ''}
              <button type="button" class="btn btn-tiny" data-cup-open="${c.id}">Открыть</button>
              <button type="button" class="btn btn-tiny btn-danger-tiny" data-admin-del="${c.id}">Удал.</button>
            </div>
          </div>`
        ).join('') || '<div class="hint">Нет активных кубков</div>';
      } else if (adminTab === 'users') {
        list.innerHTML = adminCache.users.map((u) =>
          `<div class="admin-row">
            <div><strong>${u.name || u.login}</strong><small>@${u.login} · ур.${u.level} · XP ${u.xp} · кубки ${u.cupsPlayed}/${u.cupsWon}</small></div>
            <div class="admin-row-actions">
              <button type="button" class="btn btn-tiny" data-admin-lvl="${u.id}" data-lvl="${Math.max(1, (u.level || 1) - 1)}">−</button>
              <button type="button" class="btn btn-tiny" data-admin-lvl="${u.id}" data-lvl="${Math.min(10, (u.level || 1) + 1)}">+</button>
            </div>
          </div>`
        ).join('') || '<div class="hint">Нет игроков</div>';
      } else if (adminTab === 'bots') {
        list.innerHTML = adminCache.bots.slice(0, 80).map((u) =>
          `<div class="admin-row"><div><strong>${u.name}</strong><small>@${u.login} · ур.${u.level} · сила ${u.strength || '—'} · ${u.cupsPlayed || 0} игр</small></div></div>`
        ).join('') || '<div class="hint">Ботов нет</div>';
      } else {
        list.innerHTML = adminCache.archive.map((a) =>
          `<div class="admin-row"><div><strong>${a.name}</strong><small>${O().archiveReasonRu(a.reason)} · люди ${a.humans} · ${new Date(a.archivedAt).toLocaleString('ru-RU')}</small></div></div>`
        ).join('') || '<div class="hint">Архив пуст</div>';
      }
    } catch (err) {
      if (statsEl) statsEl.innerHTML = `<div class="hint">${err.message || 'Нет доступа'}</div>`;
      if (list) list.innerHTML = '';
    }
  }

  function fillCreateForm() {
    const pills = $('#league-pills');
    const picker = $('#club-picker');
    const hidL = $('#sel-league');
    const hidC = $('#sel-club');
    const colors = $('#color-pills');
    if (!pills) return;
    const mgr = document.querySelector('#form-create input[name="manager"]');
    if (mgr && !mgr.value && A().getUser()?.name) mgr.value = A().getUser().name;

    if (!pills.dataset.ready) {
      pills.innerHTML = W().LEAGUES.map((l, i) => {
        const name = (window.EYE_I18N?.leagueRu(l.id, l)?.name) || l.name;
        return `<button type="button" class="league-pill${i === 0 ? ' active' : ''}" data-league="${l.id}" role="option">${name}</button>`;
      }).join('');
      pills.dataset.ready = '1';
      hidL.value = W().LEAGUES[0]?.id || '';
    }

    if (colors && !colors.dataset.ready) {
      const list = D().CLUB_COLORS || ['#C8102E', '#034694', '#0BB363', '#FEBE10'];
      colors.innerHTML = list.map((c, i) =>
        `<button type="button" class="color-pill${i === 0 ? ' active' : ''}" data-color="${c}" style="--swatch:${c}" aria-label="${c}"></button>`
      ).join('');
      colors.dataset.ready = '1';
      $('#sel-color').value = list[0];
      colors.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-color]');
        if (!btn) return;
        $('#sel-color').value = btn.dataset.color;
        colors.querySelectorAll('.color-pill').forEach(p => p.classList.toggle('active', p === btn));
        updateCustomPreview();
      });
    }

    const fillClubs = (keepClub) => {
      if (!picker || !hidC) return;
      const lid = hidL.value || W().LEAGUES[0]?.id;
      const clubs = W().clubsByLeague(lid).slice().sort((a, b) => b.rep - a.rep);
      const preferred = keepClub && clubs.some(c => c.id === keepClub) ? keepClub : clubs[0]?.id;
      hidC.value = preferred || '';
      picker.innerHTML = clubs.map(c => {
        const ru = window.EYE_I18N.clubRu(c.id, c.name, c.stadium);
        const active = c.id === preferred ? ' active' : '';
        return `
          <button type="button" class="club-option${active}" data-club="${c.id}" role="option">
            <span class="club-dot" style="background:${c.color}"></span>
            <span><strong>${ru.name}</strong><small>${ru.stadium}</small></span>
            <span class="rep">${c.rep}</span>
          </button>
        `;
      }).join('');
      previewClub();
    };

    if (!pills.dataset.bound) {
      pills.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-league]');
        if (!btn) return;
        hidL.value = btn.dataset.league;
        pills.querySelectorAll('.league-pill').forEach(p => p.classList.toggle('active', p === btn));
        fillClubs(null);
      });
      picker?.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-club]');
        if (!btn) return;
        hidC.value = btn.dataset.club;
        picker.querySelectorAll('.club-option').forEach(p => p.classList.toggle('active', p === btn));
        previewClub();
      });
      $('#create-mode-switch')?.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-create-mode]');
        if (!btn) return;
        setCreateMode(btn.dataset.createMode);
      });
      ['inp-club-name', 'inp-club-short', 'inp-stadium'].forEach(id => {
        $(`#${id}`)?.addEventListener('input', () => {
          createDirty = true;
          if (id === 'inp-club-name' && !$('#inp-club-short')?.dataset.touched) {
            const v = ($('#inp-club-name').value || '').replace(/[^a-zA-Zа-яА-ЯёЁ0-9]/g, '');
            if ($('#inp-club-short')) $('#inp-club-short').value = v.slice(0, 3).toUpperCase();
          }
          if (id === 'inp-club-short') $('#inp-club-short').dataset.touched = '1';
          updateCustomPreview();
        });
      });
      pills.dataset.bound = '1';
    }

    pills.querySelectorAll('.league-pill').forEach(p => {
      p.classList.toggle('active', p.dataset.league === hidL.value);
    });
    fillClubs(hidC.value);
    setCreateMode(createMode || 'takeover');
    updateCustomPreview();
  }

  function previewClub() {
    const id = $('#sel-club')?.value;
    const box = $('#club-preview');
    const tpl = W().clubTemplate(id);
    if (!tpl || !box) return;
    box.hidden = false;
    const ru = window.EYE_I18N.clubRu(tpl.id, tpl.name, tpl.stadium);
    const stars = (tpl.stars || []).slice(0, 6).map(s => `${s[0]} (${s[3]})`).join(' · ');
    box.innerHTML = `
      <div class="club-preview-hero" style="--club:${tpl.color}"></div>
      <div class="club-preview-body">
        <div style="display:flex;gap:10px;align-items:center;margin-bottom:8px">
          <span class="club-dot" style="background:${tpl.color}"></span>
          <strong style="font-family:var(--display);font-size:17px">${ru.name}</strong>
        </div>
        <div class="meta">
          ${ru.stadium} · бюджет ~${S().money(tpl.budget)}
          · болельщики ${tpl.fans.toLocaleString('ru')}<br/>
          <span style="opacity:.75">${S().moneyHint(tpl.budget)}</span><br/>
          Звёзды: ${stars}
        </div>
      </div>
    `;
  }

  function matchTypeLabel(type) {
    if (type === 'cup') return 'Кубок EYE';
    if (type === 'ucl') return 'Лига чемпионов EYE';
    if (type === 'cwc') return 'Клубный чемпионат мира';
    return S().get()?.leagueName || 'Лига';
  }

  function paintHubChips(opts = {}) {
    const st = opts.st || S().get();
    if (!st) return;
    const pulse = $('#hub-pulse');
    if (!pulse) return;
    const unread = opts.unread != null ? opts.unread : st.inbox.filter(m => !m.read).length;
    const next = opts.next !== undefined ? opts.next : S().nextMatch();
    const chips = [];
    const user = A().getUser();
    if (lastMePayload?.liveCup) {
      const lc = lastMePayload.liveCup;
      chips.push(`<button type="button" class="hub-chip warn" data-cup-open="${lc.id}"><span class="hub-chip-n">LIVE</span>${lc.round || 'Кубок'}</button>`);
    } else if (user?.level) {
      chips.push(`<button type="button" class="hub-chip" data-nav="onlinecups"><span class="hub-chip-n">Ур.${user.level}</span>Онлайн</button>`);
    }
    if (lastMePayload?.cupEventsUnread) {
      chips.push(`<button type="button" class="hub-chip" data-nav="onlinecups"><span class="hub-chip-n">${lastMePayload.cupEventsUnread}</span>Кубки</button>`);
    }
    if (unread) {
      chips.push(`<button type="button" class="hub-chip warn" data-nav="inbox"><span class="hub-chip-n">${unread}</span>Почта</button>`);
    }
    if (st.sacked) {
      chips.push(`<button type="button" class="hub-chip warn" data-nav="board">Новый клуб</button>`);
    } else if (next && next.type !== 'league') {
      const label = next.type === 'cwc' ? 'Матч ЧМ' : next.type === 'ucl' ? 'Матч ЛЧ' : 'Кубок';
      chips.push(`<button type="button" class="hub-chip" data-nav="hub">${label} в очереди</button>`);
    }
    const fin = S().financeSummary?.();
    if (fin && fin.statusLevel >= 2) {
      chips.push(`<button type="button" class="hub-chip warn" data-nav="finance">${fin.statusLabel}${fin.embargo ? ' · эмбарго' : ''}</button>`);
    } else if (fin && fin.statusLevel === 1) {
      chips.push(`<button type="button" class="hub-chip" data-nav="finance">Касса напряжена</button>`);
    }
    pulse.innerHTML = chips.join('');
  }

  function renderHub() {
    const st = S().get();
    const me = S().club();
    if (!st || !me) return;
    if (A().isLoggedIn()) {
      A().refreshMe().then((payload) => {
        lastMePayload = payload;
        // re-paint chips only if still on hub
        if (document.getElementById('screen-hub')?.classList.contains('active')) {
          paintHubChips();
        }
      }).catch(() => {});
    }
    const hubClub = $('#hub-club');
    const hubColor = $('#hub-color');
    const hubMeta = $('#hub-meta');
    const hubBudget = $('#hub-budget');
    const hubMorale = $('#hub-morale');
    if (hubClub) hubClub.textContent = me.name;
    if (hubColor) hubColor.style.background = me.color;
    if (hubMeta) hubMeta.textContent = `${st.leagueName} · Сезон ${st.season} · Тур ${st.week}`;
    if (hubBudget) {
      hubBudget.textContent = S().money(me.budget);
      hubBudget.classList.toggle('neg', (me.budget || 0) < 0);
    }
    if (hubMorale) hubMorale.textContent = 'Мораль ' + me.morale;
    const board = st.board;
    const boardEl = $('#hub-board');
    if (boardEl) {
      if (st.sacked) boardEl.textContent = 'Уволен';
      else if (board) boardEl.textContent = `Совет ${board.confidence}%`;
      else boardEl.textContent = 'Совет —';
    }
    const goal = $('#hub-board-goal');
    if (goal) {
      if (st.sacked) {
        goal.textContent = 'Вас уволили — выберите новый клуб в разделе «Совет».';
      } else if (board) {
        const prog = S().boardProgress();
        const place = prog?.place != null ? `${prog.place}-е / цель ≤${prog.target}` : board.targetLabel;
        goal.textContent = `Цель: ${board.targetLabel} · ${place}${board.cupTarget ? ' · кубок' : ''}`;
      } else {
        goal.textContent = '';
      }
    }
    syncCurrencyButtons();
    const unread = st.inbox.filter(m => !m.read).length;
    const badge = $('#inbox-badge');
    if (badge) badge.textContent = unread ? unread + ' новых' : 'Сообщения';

    const next = S().nextMatch();
    paintHubChips({ unread, next, st });

    const dev = $('#hub-dev');
    if (dev) {
      const summary = S().teamDevSummary?.();
      if (summary && !st.sacked) {
        const trainLeft = Math.max(0, 2 - (st.trainCountWeek || 0));
        dev.hidden = false;
        dev.innerHTML = `
          <div class="hub-dev-head">
            <strong>Развитие клуба · ур. ${summary.level}</strong>
            <span class="meta">OVR ${summary.avgOvr} · фанаты ${summary.fans.toLocaleString('ru')}</span>
          </div>
          <div class="hub-dev-actions">
            <button type="button" class="hub-chip" data-nav="train">Тренировка · ${trainLeft}/2</button>
            <button type="button" class="hub-chip" data-nav="club">База · ${summary.training}</button>
            <button type="button" class="hub-chip" data-nav="youth">Академия · ${summary.youth}</button>
            <button type="button" class="hub-chip" data-nav="transfers">Трансферы</button>
          </div>
          ${summary.custom ? `<div class="hint" style="margin-top:8px">Своя команда: качайте базу, поднимайте молодёжь и копите на усиление состава.</div>` : ''}
        `;
      } else {
        dev.hidden = true;
        dev.innerHTML = '';
      }
    }

    const box = $('#next-fixture');
    const btn = $('#btn-play-match');
    const label = $('#next-label');
    if (st.sacked) {
      if (label) label.textContent = 'Карьера';
      if (box) box.textContent = 'Нужен новый клуб';
      if (btn) { btn.disabled = false; btn.textContent = 'К совету'; }
    } else if (!next) {
      if (label) label.textContent = 'Сезон';
      if (box) box.textContent = 'Сезон завершён — новый стартует';
      if (btn) { btn.disabled = true; btn.textContent = 'Ожидание'; }
    } else {
      const home = S().clubById(next.match.home);
      const away = S().clubById(next.match.away);
      if (label) label.textContent = 'Следующий матч · ' + matchTypeLabel(next.type);
      const riv = home && away ? S().matchRivalry(home.id, away.id) : null;
      if (box) box.textContent = home && away
        ? `${riv ? '⚡ ' : ''}${home.name} — ${away.name}${riv ? ' · ' + riv.name : ''}`
        : 'Матч';
      if (btn) {
        btn.disabled = false;
        btn.textContent = next.type === 'ucl' ? 'Матч ЛЧ'
          : next.type === 'cwc' ? 'Матч ЧМ'
          : next.type === 'cup' ? 'Кубковый матч'
          : riv ? 'Дерби' : 'К матчу';
      }
    }

    const news = $('#news-strip');
    if (news) {
      news.innerHTML = (st.news || []).slice(0, 5).map(n =>
        `<div class="news-item"><strong>${n.title}</strong><div>${n.body}</div></div>`
      ).join('') || `<div class="news-item">Пока тихо. Готовьте состав к туру.</div>`;
    }
    syncDesktopUser();
  }

  function openPlayer(id, back = 'squad') {
    selectedPlayerId = id;
    playerBack = back;
    $('#player-back')?.setAttribute('data-nav', back);
    show('player');
  }

  function findPlayer(id) {
    const st = S().get();
    for (const c of st.clubs) {
      const p = c.squad.find(x => x.id === id);
      if (p) return { player: p, club: c };
      const y = (c.youth || []).find(x => x.id === id);
      if (y) return { player: y, club: c, youth: true };
    }
    const market = (st.transferList || []).find(e => e.player.id === id);
    if (market) return { player: market.player, club: market.clubId ? S().clubById(market.clubId) : null, market };
    return null;
  }

  function renderPlayer() {
    const found = findPlayer(selectedPlayerId);
    const box = $('#player-card');
    if (!found) { box.innerHTML = '<p>Игрок не найден</p>'; return; }
    const p = found.player;
    const c = found.club;
    const isYouth = !!found.youth;
    D().ensureTraits(p);
    const traits = (p.traits || []).map(id => {
      const t = D().traitInfo(id);
      return `<span class="trait-chip" title="${t.desc || ''}">${t.name}</span>`;
    }).join('');
    const focusOpts = [`<option value="">Фокус развития</option>`]
      .concat(D().DEV_FOCUS.map(f => `<option value="${f.id}"${p.devFocus === f.id ? ' selected' : ''}>${f.name}</option>`))
      .join('');
    const mine = !!found.club?.isPlayer;
    const report = (S().get().scoutReports || {})[p.id];
    const avgR = S().avgSeasonRating(p);
    box.innerHTML = `
      <div class="player-hero">
        <div class="ovr big">${p.ovr}</div>
        <div>
          <h3>${p.name}${isYouth ? ' · академия' : ''}</h3>
          <div class="meta">${D().POS_LABEL[p.pos] || p.pos} · ${p.age} лет · ${p.nation}
            ${p.real ? ' · ★' : ''}
            ${c ? ' · ' + c.name : ' · свободный'}</div>
          <div class="trait-row">${traits || '<span class="meta">без ярких черт</span>'}</div>
        </div>
      </div>
      <div class="stat-grid">
        ${bar('Атака', p.attack)}${bar('Защита', p.defense)}${bar('Техника', p.tech)}
        ${bar('Пас', p.pass || p.tech)}${bar('Темп', p.pace || 70)}${bar('Физика', p.physical || p.stamina)}
        ${bar('Вынос.', p.stamina)}${bar('IQ', p.iq)}${bar('Форма', p.form)}
        ${bar('Конд.', p.condition || 70)}${bar('Энерг.', p.energy || 70)}${bar('Мораль', p.morale || 60)}
      </div>
      <div class="meta" style="margin-top:12px;color:var(--muted);font-size:13px;line-height:1.5">
        Потенциал ${p.pot} · стоимость ${S().money(p.value || 0)} · зарплата ${S().money(p.wage || 0)}/нед<br/>
        <span style="opacity:.8">${S().moneyHint(p.value || 0)}</span><br/>
        Сезон: ${p.seasonApps || 0} игр, ${p.seasonGoals || 0} голов, ${p.seasonAssists || 0} ассистов${avgR != null ? ` · ср. оценка ★${avgR}` : ''}<br/>
        Карьера: ${p.careerGoals || 0} голов, ${p.careerAssists || 0} ассистов${isYouth ? '' : ' · контракт ' + (p.contract || 0) + ' г'}
        ${p.injured ? '<br/>Травма: ' + p.injured + ' тур(а)' : ''}
        ${p.suspended ? '<br/>Дисквалификация: ' + p.suspended + ' матч(а)' : ''}
        ${(p.seasonYellows || p.yellow) ? '<br/>Жёлтые в сезоне: ' + (p.seasonYellows || p.yellow) : ''}
        ${report ? `<br/>Скаут: пот. ~${report.pot}, форма ~${report.hiddenForm}, травмы ${report.injuryRisk}${report.traits?.length ? ', ' + report.traits.join(', ') : ''} · ${report.recommendation}` : ''}
      </div>
      ${mine ? `
        <div class="glass-panel contract-box" style="margin-top:12px;padding:12px;display:grid;gap:10px">
          <label>Фокус развития<select id="sel-dev-focus">${focusOpts}</select></label>
          ${isYouth ? `
            <button class="btn btn-primary" id="btn-promote-card" type="button">Выпустить в основу · ${S().money(S().youthPromoteCost?.() || 0)}</button>
          ` : `
            <div class="create-row">
              <label>Срок (лет)<select id="renew-years"><option value="1">1</option><option value="2" selected>2</option><option value="3">3</option><option value="4">4</option></select></label>
              <label>Зарплата / нед (€)<input type="number" id="renew-wage" min="0" step="1000" value="${Math.round(p.wage * 1.12)}" /></label>
            </div>
            <button class="btn btn-primary" id="btn-renew" type="button">Предложить контракт</button>
            <p class="hint" id="renew-msg">Бонус зависит от зарплаты и срока</p>
          `}
        </div>
      ` : ''}
    `;
    $('#sel-dev-focus')?.addEventListener('change', (e) => {
      const r = S().setDevFocus(p.id, e.target.value || null);
      toast(r.msg);
    });
    $('#btn-promote-card')?.addEventListener('click', () => {
      const r = S().promoteYouth(p.id);
      toast(r.msg);
      if (r.ok) { playerBack = 'squad'; openPlayer(p.id, 'squad'); }
    });
    $('#btn-renew')?.addEventListener('click', () => {
      const years = Number($('#renew-years')?.value || 2);
      const wage = Number($('#renew-wage')?.value || p.wage);
      const r = S().negotiateContract(p.id, years, wage);
      const msg = $('#renew-msg');
      if (msg) msg.textContent = r.msg + (r.counterWage ? ` · контр ${S().money(r.counterWage)}` : '');
      toast(r.msg);
      if (r.ok) renderPlayer();
      else if (r.counterWage && $('#renew-wage')) $('#renew-wage').value = r.counterWage;
    });
  }

  function bar(label, val) {
    const v = Math.max(0, Math.min(99, val | 0));
    return `<div class="stat-bar"><span>${label}</span><i style="--v:${v}%"></i><b>${v}</b></div>`;
  }

  function fitTone(v) {
    const n = Number(v) || 0;
    if (n >= 75) return 'ok';
    if (n >= 55) return 'mid';
    return 'bad';
  }

  function fitBar(label, v) {
    const n = Math.max(0, Math.min(100, Math.round(Number(v) || 0)));
    return `<span class="fit-bar ${fitTone(n)}" title="${label} ${n}"><i style="--v:${n}%"></i><em>${label[0]}${n}</em></span>`;
  }

  function renderSquad() {
    const me = S().club();
    const ready = S().squadReadiness();
    const avg = Math.round(me.squad.reduce((s, p) => s + p.ovr, 0) / me.squad.length);
    const stars = me.squad.filter(p => p.real).length;
    const tiredN = ready?.tired?.length || 0;
    const injN = ready?.injured?.length || 0;
    $('#squad-summary').textContent =
      `${me.squad.length} игроков · рейтинг ${avg}` +
      `${me.customClub ? ' · свой клуб' : stars ? ` · звёзды ${stars}` : ''}` +
      ` · конд. ${ready?.avgCond ?? '—'} · энерг. ${ready?.avgEnergy ?? '—'}` +
      `${tiredN ? ` · устали ${tiredN}` : ''}${injN ? ` · лазарет ${injN}` : ''} · ${me.formation}`;
    const sorted = [...me.squad].sort((a, b) => {
      const ta = ((a.condition || 0) < 58 || (a.energy || 0) < 52) ? 1 : 0;
      const tb = ((b.condition || 0) < 58 || (b.energy || 0) < 52) ? 1 : 0;
      if (a.injured !== b.injured) return (b.injured ? 1 : 0) - (a.injured ? 1 : 0);
      if (ta !== tb) return tb - ta;
      return b.ovr - a.ovr;
    });
    $('#squad-list').innerHTML = sorted.map(p => {
      D().ensureTraits(p);
      const trait = (p.traits || [])[0] ? D().traitInfo(p.traits[0]).name : '';
      const avgR = S().avgSeasonRating(p);
      const shortContract = (p.contract || 0) <= 1;
      const yc = p.seasonYellows || 0;
      const cardWarn = yc >= 4 && !p.suspended;
      const tired = !p.injured && !p.suspended && ((p.condition || 100) < 58 || (p.energy || 100) < 52);
      return `
      <button class="row row-btn${tired ? ' row-tired' : ''}${p.injured ? ' row-injured' : ''}" data-player="${p.id}">
        <div class="ovr">${p.ovr}</div>
        <div>
          <strong>${p.name}${p.real ? ' ★' : ''}${shortContract ? ' <span class="badge-warn">📄' + (p.contract || 0) + 'г</span>' : ''}${cardWarn ? ' <span class="badge-warn">ЖК ' + yc + '/5</span>' : ''}</strong>
          <div class="meta">
            <span class="badge-pos">${D().POS_LABEL[p.pos] || p.pos}</span>
            · ${p.age}л · форма ${p.form}
            ${avgR != null ? ' · ★' + avgR : ''}
            ${trait ? ' · ' + trait : ''}
            ${p.devFocus ? ' · фокус' : ''}
            ${p.injured ? ' · травма ' + p.injured : ''}
            ${p.suspended ? ' · бан ' + p.suspended : ''}
            · ${p.seasonGoals || 0}Г/${p.seasonAssists || 0}А
            ${yc && !cardWarn ? ' · ЖК ' + yc : ''}
          </div>
          <div class="fit-row">${fitBar('Конд', p.condition)}${fitBar('Энерг', p.energy)}</div>
        </div>
        <div class="meta">${S().money(p.value)}</div>
      </button>`;
    }).join('');
  }

  function renderTactics() {
    const me = S().club();
    const selF = $('#sel-formation');
    const selS = $('#sel-style');
    if (!selF.options.length) {
      Object.keys(D().FORMATIONS).forEach(f => {
        const o = document.createElement('option'); o.value = f; o.textContent = f; selF.appendChild(o);
      });
      D().STYLES.forEach(s => {
        const o = document.createElement('option'); o.value = s.id; o.textContent = s.name; selS.appendChild(o);
      });
    }
    selF.value = me.formation;
    selS.value = me.style;
    S().ensureLineup();
    selectedSlot = null;
    const fit = drawPitch();
    renderBench();
    const chem = E().teamStrength(me).chemistry;
    const hint = $('#tactics-hint');
    if (hint) {
      hint.textContent = `Химия ${chem}/100 · ${fit.exact} на месте · ${fit.group} рядом · ${fit.oop} не своей · слот → запас`;
    }
  }

  function drawPitch() {
    const me = S().club();
    S().ensureLineup();
    const coords = D().pitchCoords(me.formation);
    const slots = D().FORMATIONS[me.formation].slots;
    const xi = me.lineup;
    let exact = 0, group = 0, oop = 0;
    $('#pitch').innerHTML = coords.map((c, i) => {
      const p = xi[i];
      const slot = slots[i];
      let fitClass = '';
      if (p) {
        if (p.pos === slot) { fitClass = ' fit-exact'; exact++; }
        else if (D().POS_GROUP[p.pos] === D().POS_GROUP[slot]) { fitClass = ' fit-group'; group++; }
        else { fitClass = ' fit-oop'; oop++; }
      }
      const active = selectedSlot === i ? ' selected' : '';
      const title = p
        ? `${p.name} · ${D().POS_LABEL[p.pos] || p.pos}→${D().POS_LABEL[slot] || slot} · ${p.ovr}`
        : (D().POS_LABEL[slot] || slot);
      return `<button type="button" class="player-dot${fitClass}${active}" data-slot="${i}" style="left:${c.x}%;top:${c.y}%" title="${title}">${p ? (D().POS_LABEL[slot] || slot) : '?'}</button>`;
    }).join('');
    return { exact, group, oop };
  }

  function renderBench() {
    const me = S().club();
    S().ensureLineup();
    const xiIds = new Set(me.lineup.map(p => p.id));
    const bench = me.squad.filter(p => !xiIds.has(p.id));
    $('#bench-list').innerHTML = `<div class="news-item"><strong>Запас</strong> · выберите слот на поле, затем игрока</div>` + bench.map(p => `
      <button class="row row-btn" data-bench="${p.id}" ${p.injured ? 'disabled' : ''}>
        <div class="ovr">${p.ovr}</div>
        <div><strong>${p.name}</strong><div class="meta">${D().POS_LABEL[p.pos]} · форма ${p.form}${p.injured ? ' · травма' : ''}</div></div>
        <div class="meta">${selectedSlot != null ? 'в слот ' + (selectedSlot + 1) : ''}</div>
      </button>
    `).join('');
  }

  function ensureTransferLeagueFilter() {
    const sel = $('#tf-league');
    if (!sel || sel.options.length > 1) return;
    W().LEAGUES.forEach(l => {
      const o = document.createElement('option');
      o.value = l.id; o.textContent = l.short || l.name;
      sel.appendChild(o);
    });
  }

  function renderTransfers(tab = 'market') {
    transferTab = tab;
    $all('#transfer-tabs .tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
    const filters = $('#transfer-filters');
    if (filters) filters.style.display = tab === 'market' ? '' : 'none';
    const list = $('#transfer-list');
    const open = S().transferWindowOpen();
    const winLabel = S().transferWindowInfo?.()?.label || '1–8 и 20–28';

    if (tab === 'offers') {
      const offers = S().get().transferOffers || [];
      list.innerHTML = offers.map(o => `
        <div class="row">
          <div class="ovr">$</div>
          <div>
            <strong>${o.playerName}</strong>
            <div class="meta">${o.fromName} предлагает ${S().money(o.bid)}</div>
          </div>
          <div class="row-actions">
            <button class="btn btn-tiny" data-offer-yes="${o.id}">Да</button>
            <button class="btn btn-tiny" data-offer-no="${o.id}">Нет</button>
          </div>
        </div>
      `).join('') || `<div class="news-item">Входящих предложений нет</div>`;
      return;
    }

    if (tab === 'sell') {
      const me = S().club();
      list.innerHTML = me.squad.map(p => `
        <div class="row">
          <div class="ovr">${p.ovr}</div>
          <div>
            <strong>${p.name}${p.listed ? ' · в продаже' : ''}</strong>
            <div class="meta">${D().POS_LABEL[p.pos]} · ${p.age}л · ${S().money(p.value)}${p.listed && p.ask ? ' · лот ' + S().money(p.ask) : ''}</div>
          </div>
          <button class="btn btn-tiny" data-sell="${p.id}" type="button">${p.listed ? 'Ещё раз' : 'Продать'}</button>
        </div>
      `).join('') || `<div class="news-item">Состав пуст</div>`;
      return;
    }

    ensureTransferLeagueFilter();
    syncTransferPriceLabels();
    const maxAge = Number($('#tf-age')?.value || 0) || undefined;
    const market = S().filterMarket({
      q: $('#tf-q')?.value || '',
      pos: $('#tf-pos')?.value || 'ALL',
      leagueId: $('#tf-league')?.value || 'ALL',
      minOvr: Number($('#tf-ovr')?.value || 0),
      maxAge,
      maxPrice: Number($('#tf-price')?.value || 0) || undefined
    });
    const banner = open
      ? `<div class="news-item"><strong>Окно открыто</strong><div>Туры ${winLabel} · можно покупать</div></div>`
      : `<div class="news-item"><strong>Окно закрыто</strong><div>Покупки недоступны · аренда возможна. Откроется в турах ${winLabel}</div></div>`;
    list.innerHTML = banner + (market.slice(0, 60).map(e => {
      const p = e.player;
      const counter = (S().pendingCounters() || {})[e.id];
      const report = (S().get().scoutReports || {})[p.id];
      return `
        <div class="row">
          <div class="ovr">${p.ovr}</div>
          <div>
            <strong>${p.name}${p.real ? ' ★' : ''}</strong>
            <div class="meta">
              ${D().POS_LABEL[p.pos]} · ${p.age}л · пот. ${report ? '~' + report.pot : p.pot}
              · ${e.clubName || 'свободный'}
              · зп ${S().money(e.wageAsk || p.wage)}/нед
              ${e.type === 'star' ? ' · топ' : ''}
              ${counter ? ' · контр ' + S().money(counter) : ''}
              ${report ? ' · скаут: ' + report.recommendation : ''}
            </div>
          </div>
          <div class="row-actions">
            <button class="btn btn-tiny" data-scout="${e.id}">Скаут</button>
            <button class="btn btn-tiny" data-bid="${e.id}" ${open ? '' : 'disabled'}>${S().money(e.ask)}</button>
            ${e.clubId ? `<button class="btn btn-tiny" data-loan="${e.id}">Аренда</button>` : ''}
          </div>
        </div>
      `;
    }).join('') || `<div class="news-item">Никого не найдено — смените фильтры</div>`);
  }

  function openBidModal(entryId) {
    const item = S().get().transferList.find(e => e.id === entryId);
    if (!item) return;
    bidEntryId = entryId;
    const modal = $('#bid-modal');
    modal.hidden = false;
    $('#bid-title').textContent = item.player.name;
    const wageAsk = item.wageAsk || item.player.wage || 10000;
    const pendingW = (S().pendingWage() || {})[entryId];
    $('#bid-meta').textContent = `Запрос: ${S().money(item.ask)} · зп ~${S().money(wageAsk)}/нед · ${item.clubName || 'свободный агент'}`;
    $('#bid-amount').value = item.ask;
    $('#bid-wage').value = pendingW || wageAsk;
    const counter = (S().pendingCounters() || {})[entryId];
    const btnC = $('#bid-counter');
    if (counter) {
      btnC.hidden = false;
      btnC.textContent = 'Принять контр ' + S().money(counter);
    } else btnC.hidden = true;
  }

  function closeBidModal() {
    $('#bid-modal').hidden = true;
    bidEntryId = null;
  }

  function renderCalendar() {
    const st = S().get();
    const me = S().club();
    $all('#calendar-tabs .tab').forEach(t => t.classList.toggle('active', t.dataset.cal === calendarTab));

    const cupBits = [];
    const cup = st.cup;
    if (cup && !cup.champion) {
      const pm = (cup.bracket || []).find(m => m.home === me.id || m.away === me.id);
      if (pm) {
        const h = S().clubById(pm.home); const a = S().clubById(pm.away);
        const score = pm.played ? `${pm.score[0]}:${pm.score[1]}` : '— : —';
        cupBits.push(`<div class="news-item me-round"><strong>Кубок · ${cup.round}</strong><div>${h?.name} ${score} ${a?.name}</div></div>`);
      }
    }
    const ucl = st.ucl;
    if (ucl && !ucl.champion) {
      const pm = (ucl.bracket || []).find(m => m.home === me.id || m.away === me.id);
      if (pm) {
        const h = S().clubById(pm.home); const a = S().clubById(pm.away);
        const score = pm.played ? `${pm.score[0]}:${pm.score[1]}` : '— : —';
        cupBits.push(`<div class="news-item me-round"><strong>ЛЧ · ${ucl.round}</strong><div>${h?.name} ${score} ${a?.name}</div></div>`);
      }
    }
    const cwc = st.cwc;
    if (cwc && !cwc.champion && S().isClubInCwc(me.id)) {
      const pm = S().playerCwcMatch();
      if (pm) {
        const h = S().clubById(pm.home); const a = S().clubById(pm.away);
        const score = pm.played ? `${pm.score[0]}:${pm.score[1]}` : '— : —';
        const label = cwc.phase === 'groups' ? `Группы · тур ${(cwc.groupMatchday || 0) + 1}` : cwc.round;
        cupBits.push(`<div class="news-item me-round"><strong>ЧМ · ${label}</strong><div>${h?.name} ${score} ${a?.name}</div></div>`);
      } else {
        cupBits.push(`<div class="news-item me-round"><strong>Клубный ЧМ</strong><div>${cwc.phase === 'groups' ? 'Групповой этап' : cwc.round}</div></div>`);
      }
    }

    let body = '';
    if (calendarTab === 'rounds') {
      body = st.fixtures.map(r => {
        const isNow = r.round === st.week;
        const rows = r.matches.map(m => {
          const home = S().clubById(m.home);
          const away = S().clubById(m.away);
          const score = m.played ? `${m.score[0]}:${m.score[1]}` : 'vs';
          const mine = m.home === me.id || m.away === me.id;
          return `<div class="cal-fixture${mine ? ' mine' : ''}"><span>${home?.short || home?.name}</span><b>${score}</b><span>${away?.short || away?.name}</span></div>`;
        }).join('');
        return `<div class="cal-round${isNow ? ' current' : ''}" data-round="${r.round}"><strong>Тур ${r.round}${isNow ? ' · сейчас' : ''}</strong><div class="cal-grid">${rows}</div></div>`;
      }).join('');
    } else {
      body = st.fixtures.map(r => {
        const mine = r.matches.find(m => m.home === me.id || m.away === me.id);
        if (!mine) return '';
        const home = S().clubById(mine.home);
        const away = S().clubById(mine.away);
        const score = mine.played ? `${mine.score[0]}:${mine.score[1]}` : '— : —';
        const mineCls = !mine.played && r.round >= st.week ? ' me-round' : '';
        const cur = r.round === st.week ? ' current-week' : '';
        return `<div class="news-item${mineCls}${cur}" data-round="${r.round}"><strong>Тур ${r.round}${r.round === st.week ? ' · сейчас' : ''}</strong><div>${home.name} ${score} ${away.name}</div>${mine.played ? '' : '<small>ожидается</small>'}</div>`;
      }).join('') || `<div class="news-item">Календарь пуст</div>`;
    }

    $('#calendar-list').innerHTML = (cupBits.join('') + body) || `<div class="news-item">Календарь пуст</div>`;
    const focus = $('#calendar-list .current, #calendar-list .current-week, #calendar-list .me-round');
    if (focus) setTimeout(() => focus.scrollIntoView({ block: 'nearest', behavior: 'smooth' }), 40);
  }

  function bracketHtml(matches, stageLabel) {
    const grid = (matches || []).map(m => {
      const h = S().clubById(m.home); const a = S().clubById(m.away);
      const score = m.played ? `${m.score[0]}:${m.score[1]}` : 'ещё не сыгран';
      const mine = m.home === S().club().id || m.away === S().club().id;
      return `<div class="bracket-tie news-item${mine ? ' me-round' : ''}"><strong>${h?.name || '—'} — ${a?.name || '—'}</strong><div>${score}</div></div>`;
    }).join('');
    return `<div class="bracket-round"><div class="bracket-label">${stageLabel}</div><div class="bracket-grid">${grid}</div></div>`;
  }

  function setKoPlayButton(btn, match, playLabel, idleLabel, type) {
    if (!btn) return;
    const next = S().nextMatch();
    const playable = !!(match && (!type || next?.type === type));
    if (playable) {
      btn.hidden = false;
      btn.disabled = false;
      btn.classList.remove('is-disabled');
      btn.textContent = playLabel;
      btn.removeAttribute('aria-disabled');
    } else {
      btn.hidden = true;
      btn.disabled = true;
      btn.classList.add('is-disabled');
      btn.setAttribute('aria-disabled', 'true');
      if (idleLabel) btn.textContent = idleLabel;
    }
  }

  function renderCup() {
    const cup = S().get().cup;
    const status = $('#cup-status');
    const btn = $('#btn-cup-play');
    if (!cup) {
      status.textContent = 'Кубка нет';
      setKoPlayButton(btn, null, 'Играть кубковый матч');
      return;
    }
    if (cup.champion) {
      const c = S().clubById(cup.champion);
      status.innerHTML = `<strong>Победитель:</strong> ${c?.name || '—'}`;
      setKoPlayButton(btn, null, 'Играть кубковый матч');
    } else {
      const pm = S().playerCupMatch();
      const inComp = (cup.bracket || []).some(m => m.home === S().club().id || m.away === S().club().id);
      const next = S().nextMatch();
      status.innerHTML = `<strong>Стадия:</strong> ${cup.round}${
        inComp
          ? (next?.type === 'cup' ? ' · ваш матч в очереди' : (pm ? ' · матч ждёт своего тура' : ''))
          : ' · ваш клуб вне сетки'
      }`;
      setKoPlayButton(btn, pm, 'Играть кубковый матч', null, 'cup');
    }
    $('#cup-list').innerHTML = bracketHtml(cup.bracket, cup.round || 'Сетка') || `<div class="news-item">Сетка пуста</div>`;
  }

  function renderUcl() {
    const ucl = S().get().ucl;
    const status = $('#ucl-status');
    const btn = $('#btn-ucl-play');
    if (!ucl) {
      status.textContent = 'ЛЧ ещё не сформирована';
      setKoPlayButton(btn, null, 'Играть матч ЛЧ');
      return;
    }
    const meId = S().club()?.id;
    const seed = (ucl.seeds || []).find(s => s.id === meId);
    const path = S().get().uclBest ? ` · путь: ${S().get().uclBest}` : '';
    if (ucl.champion) {
      const c = S().clubById(ucl.champion);
      status.innerHTML = `<strong>${ucl.name}</strong><div>Победитель: ${c?.name || '—'}${path}</div>`;
      setKoPlayButton(btn, null, 'Играть матч ЛЧ');
    } else {
      const pm = S().playerUclMatch();
      const inComp = (ucl.bracket || []).some(m => m.home === meId || m.away === meId);
      const next = S().nextMatch();
      status.innerHTML = `<strong>${ucl.name}</strong><div>Стадия: ${ucl.round}${
        next?.type === 'ucl' ? ' · ваш матч в очереди'
          : (pm ? ' · матч ждёт своего тура' : (inComp ? '' : ' · ваш клуб вне сетки'))
      }${path}</div>${seed ? `<div class="hint" style="margin-top:8px">Путёвка: ${seed.reason}</div>` : (
        !inComp ? `<div class="hint" style="margin-top:8px">Путёвка — через зону лиги по итогам сезона.</div>` : ''
      )}`;
      setKoPlayButton(btn, pm, 'Играть матч ЛЧ', null, 'ucl');
    }
    const hist = (ucl.history || []).map(h => bracketHtml(h.ties, h.round)).join('');
    const cur = bracketHtml(ucl.bracket, ucl.round || 'Сетка');
    $('#ucl-list').innerHTML = (hist + cur) || `<div class="news-item">Сетка пуста</div>`;
  }

  function renderCwc() {
    const cwc = S().get().cwc;
    const status = $('#cwc-status');
    const btn = $('#btn-cwc-play');
    const list = $('#cwc-list');
    if (!cwc) {
      status.textContent = 'ЧМ ещё не сформирован';
      setKoPlayButton(btn, null, 'Играть матч ЧМ');
      if (list) list.innerHTML = '';
      return;
    }
    const meId = S().club()?.id;
    const path = S().get().cwcBest ? ` · путь: ${S().get().cwcBest}` : '';
    const mySeed = (cwc.seeds || []).find(s => s.id === meId);
    if (cwc.champion) {
      const c = S().clubById(cwc.champion);
      status.innerHTML = `<strong>${cwc.name}</strong><div>Чемпион мира среди клубов: ${c?.name || '—'}${path}</div>`;
      setKoPlayButton(btn, null, 'Играть матч ЧМ');
    } else {
      const pm = S().playerCwcMatch();
      const inComp = S().isClubInCwc(meId);
      const phase = cwc.phase === 'groups'
        ? `Группы · тур ${(cwc.groupMatchday || 0) + 1}/3`
        : cwc.round;
      status.innerHTML = `<strong>${cwc.name}</strong><div>${phase}${
        pm ? ' · ваш матч готов' : (inComp ? '' : ' · вне турнира')
      }${path}</div>${mySeed ? `<div class="hint" style="margin-top:8px">Сид: ${mySeed.reason}</div>` : ''}`;
      setKoPlayButton(btn, pm, 'Играть матч ЧМ', null, 'cwc');
    }

    let html = '';
    if (cwc.phase === 'groups' || (cwc.history || []).some(h => h.round === 'Группы')) {
      const groups = cwc.phase === 'groups' ? cwc.groups : (cwc.history || []).find(h => h.round === 'Группы')?.groups;
      if (groups) {
        html += Object.values(groups).map(g => {
          const rows = Object.values(g.table || {}).sort((a, b) =>
            b.pts - a.pts || (b.gf - b.ga) - (a.gf - a.ga) || b.gf - a.gf
          ).map((r, i) => {
            const club = S().clubById(r.id);
            const mine = r.id === meId ? ' me-round' : '';
            return `<div class="news-item${mine}"><strong>${i + 1}. ${club?.name || r.id}</strong><div>${r.pts} очк. · ${r.gf}:${r.ga}</div></div>`;
          }).join('');
          const md = cwc.groupMatchday || 0;
          const day = ((g.matchdays || [])[md] || []).map(m => {
            const h = S().clubById(m.home); const a = S().clubById(m.away);
            const score = m.played ? `${m.score[0]}:${m.score[1]}` : 'не сыгран';
            const mine = m.home === meId || m.away === meId;
            return `<div class="news-item${mine ? ' me-round' : ''}">${h?.name} — ${a?.name}<div>${score}</div></div>`;
          }).join('');
          return `<div class="bracket-round"><div class="bracket-label">${g.name}</div>${rows}${cwc.phase === 'groups' ? `<div class="hint" style="margin:8px 0">Тур ${md + 1}</div>${day}` : ''}</div>`;
        }).join('');
      }
    }
    if (cwc.phase === 'ko' || cwc.champion) {
      html += (cwc.history || []).filter(h => h.round !== 'Группы').map(h => bracketHtml(h.ties, h.round)).join('');
      if ((cwc.bracket || []).length) html += bracketHtml(cwc.bracket, cwc.round || 'Плей-офф');
    }
    if (list) list.innerHTML = html || `<div class="news-item">Сетка пуста</div>`;
  }

  function renderBoard() {
    const st = S().get();
    const board = st.board;
    const me = S().club();
    const card = $('#board-card');
    const jobs = $('#job-list');
    if (!board) {
      card.innerHTML = '<p>Нет данных совета</p>';
      jobs.hidden = true;
      return;
    }
    const prog = S().boardProgress();
    const conf = board.confidence;
    const confColor = conf >= 55 ? 'var(--ok)' : conf >= 35 ? 'var(--warn)' : 'var(--danger)';
    const placeLine = prog?.place != null
      ? `Сейчас <strong>${prog.place}-е</strong> из цели ≤${prog.target} · ${prog.pts} очк. · РМ ${(prog.gd > 0 ? '+' : '') + prog.gd}`
      : `Цель: место не ниже ${board.targetPlace}`;
    const track = prog?.place == null ? '' : (prog.onTrack
      ? '<span class="badge-ok">в графике</span>'
      : `<span class="badge-warn">отставание ${prog.gap}</span>`);
    card.innerHTML = `
      <div class="next-label">${st.sacked ? 'Вас уволили' : 'Цели сезона'}</div>
      <h3 style="margin:6px 0;font-family:var(--display)">${board.targetLabel} ${track}</h3>
      <div class="board-conf"><i style="width:${conf}%;background:${confColor}"></i></div>
      <div class="meta" style="color:var(--muted);line-height:1.55;font-size:13px;margin-top:10px">
        ${placeLine}<br/>
        Уверенность: <strong style="color:${confColor}">${conf}%</strong>
        · предупреждений: ${board.warnings}
        ${board.cupTarget ? '<br/>Кубок: ' + (board.cupTarget === 'semi' ? 'полуфинал' : '1/4') : ''}<br/>
        Клуб: «${me.name}» · ${st.leagueName}
      </div>
      ${st.sacked
        ? '<p class="hint" style="margin-top:10px">Выберите новый клуб ниже.</p>'
        : '<p class="hint" style="margin-top:10px">Победы поднимают доверие, поражения роняют. Итог сезона решает контракт.</p>'}
    `;
    if (!st.sacked) { jobs.hidden = true; jobs.innerHTML = ''; return; }
    jobs.hidden = false;
    const candidates = [...st.clubs]
      .filter(c => c.id !== me.id)
      .sort((a, b) => b.reputation - a.reputation)
      .slice(0, 18);
    jobs.innerHTML = candidates.map(c => `
      <button class="row row-btn" data-job="${c.id}">
        <div class="ovr" style="background:${c.color}"></div>
        <div>
          <strong>${c.name}</strong>
          <div class="meta">${c.leagueName} · реп. ${c.reputation} · бюджет ${S().money(c.budget)}</div>
        </div>
      </button>
    `).join('');
  }

  function renderFinance() {
    const f = S().financeSummary();
    const sp = f.sponsor;
    const neg = (f.budget || 0) < 0;
    const statusCls = ({ healthy: 'ok', tight: 'mid', deficit: 'bad', critical: 'bad', insolvent: 'bad' })[f.status] || '';
    const led = (f.ledger || []).map(e => {
      const sign = e.amount >= 0 ? '+' : '';
      const cls = e.amount >= 0 ? 'ok' : 'bad';
      const bal = e.balance != null ? `<em class="${e.balance < 0 ? 'bad' : ''}">${S().money(e.balance)}</em>` : '';
      return `<div class="ledger-row ${cls}"><span>С${e.season}·Т${e.week} · ${e.label}</span><strong>${sign}${S().money(e.amount)}</strong>${bal}</div>`;
    }).join('') || `<div class="hint">Движений пока нет</div>`;
    const flowIn = (f.breakdown?.in || []).map(x =>
      `<div class="flow-row"><span>${x.label}</span><strong class="ok">+${S().money(x.amount)}</strong></div>`
    ).join('');
    const flowOut = (f.breakdown?.out || []).map(x =>
      `<div class="flow-row"><span>${x.label}</span><strong class="bad">${S().money(x.amount)}</strong></div>`
    ).join('');
    $('#finance-card').innerHTML = `
      <div class="finance-status ${statusCls}">
        <strong>${f.statusLabel || 'Стабильно'}</strong>
        <div class="hint">${f.restrictions || (neg ? 'Касса в минусе — начисляются проценты' : `Запас хода ~${f.runwayWeeks} нед.`)}</div>
      </div>
      <div class="stat-grid finance-grid">
        <div class="news-item${neg ? ' fin-neg' : ''}"><strong>${neg ? 'Долг / касса' : 'Бюджет'}</strong><div class="kpi">${S().money(f.budget)}</div><small>${S().moneyHint(f.budget)}</small></div>
        <div class="news-item"><strong>Кредитный лимит</strong><div class="kpi">${S().money(f.creditLimit || 0)}</div><small>осталось ${S().money(f.creditLeft || 0)}</small></div>
        <div class="news-item"><strong>Зарплаты игроков</strong><div class="kpi">${S().money(f.weeklyWages)}</div><small>/ нед</small></div>
        <div class="news-item"><strong>Штаб + база</strong><div class="kpi">${S().money((f.staffWages || 0) + (f.upkeep || 0))}</div><small>штаб ${S().money(f.staffWages || 0)} · база ${S().money(f.upkeep || 0)}</small></div>
        <div class="news-item"><strong>Спонсор</strong><div class="kpi">${sp ? S().money(sp.weekly) : '—'}</div><small>${sp ? sp.name + ' / нед' : 'нет'}</small></div>
        <div class="news-item"><strong>ТВ-пул</strong><div class="kpi">${S().money(f.tvWeekly || 0)}</div><small>/ нед</small></div>
        <div class="news-item"><strong>Касса матча</strong><div class="kpi">${S().money(f.incomePerMatch)}</div><small>дома · в гостях ~${S().money(f.incomeAwayEst || 0)}</small></div>
        <div class="news-item"><strong>Проценты</strong><div class="kpi">${S().money(f.interest || 0)}</div><small>${f.debtWeeks ? `недель в минусе: ${f.debtWeeks}` : 'нет долга'}</small></div>
        <div class="news-item"><strong>Долг по зарплате</strong><div class="kpi">${S().money(f.wageArrears || 0)}</div><small>${f.embargo ? 'эмбарго активно' : 'ок'}</small></div>
        <div class="news-item"><strong>Стоимость состава</strong><div class="kpi">${S().money(f.squadValue)}</div></div>
        <div class="news-item"><strong>Болельщики</strong><div class="kpi">${(f.fans || 0).toLocaleString('ru')}</div></div>
        <div class="news-item"><strong>Баланс недели</strong><div class="kpi">${S().money(f.weeklyNet)}</div><small>доходы − расходы (без кассы матча)</small></div>
      </div>
      <h3 class="section-label" style="margin:16px 0 8px;font-family:var(--display)">План недели</h3>
      <div class="finance-flow">
        <div><div class="field-label">Доходы</div>${flowIn || '<div class="hint">—</div>'}</div>
        <div><div class="field-label">Расходы</div>${flowOut || '<div class="hint">—</div>'}</div>
      </div>
      <h3 class="section-label" style="margin:16px 0 8px;font-family:var(--display)">Журнал</h3>
      <div class="ledger-list">${led}</div>
    `;
  }

  function renderTable() {
    const me = S().club();
    const st = S().get();
    const leagues = S().listLeagueTables();
    if (!tableLeagueId || !leagues.some(l => l.id === tableLeagueId)) tableLeagueId = st.leagueId;
    const pills = $('#table-league-pills');
    if (pills) {
      pills.innerHTML = leagues.map(l =>
        `<button type="button" class="league-pill${l.id === tableLeagueId ? ' active' : ''}" data-table-league="${l.id}">${l.name}</button>`
      ).join('');
    }
    const current = leagues.find(l => l.id === tableLeagueId);
    $('#table-title').textContent = current?.name || st.leagueName || 'Таблица';
    const rows = S().sortedTable(tableLeagueId);
    const n = rows.length;
    const uclSlots = ({ epl: 3, laliga: 3, seriea: 3, bundesliga: 3, ligue1: 2, rpl: 2 })[tableLeagueId] || 2;
    // Match ladder: last 2 places risk relegation when league has 10+ clubs
    const relegN = n >= 10 ? 2 : 1;
    $('#league-table').innerHTML = `
      <div class="hint" style="margin:0 0 10px">Зелёная зона — квалификация в ЛЧ (топ-${uclSlots}). Красная — риск вылета.</div>
      <table class="league">
        <thead><tr><th>#</th><th>Клуб</th><th>И</th><th>В</th><th>Н</th><th>П</th><th>Мячи</th><th>РМ</th><th>О</th></tr></thead>
        <tbody>
          ${rows.map((r, i) => {
            const club = S().clubById(r.id);
            const name = club?.name || r.name || r.id;
            const gd = (r.gf || 0) - (r.ga || 0);
            const gdStr = (gd > 0 ? '+' : '') + gd;
            const zone = i < uclSlots ? 'zone-ucl' : (i >= n - relegN ? 'zone-bot' : '');
            return `
            <tr class="${r.id === me.id ? 'me' : ''} ${zone}">
              <td class="pos">${i + 1}</td>
              <td>${name}${i < uclSlots ? ' <span class="zone-tag">ЛЧ</span>' : ''}${i >= n - relegN ? ' <span class="zone-tag bot">вылет</span>' : ''}</td>
              <td>${r.played}</td><td>${r.w}</td><td>${r.d}</td><td>${r.l}</td>
              <td>${r.gf}:${r.ga}</td><td class="gd">${gdStr}</td><td><strong>${r.pts}</strong></td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    `;
  }

  function renderStats() {
    $all('#stats-tabs .tab').forEach(t => t.classList.toggle('active', t.dataset.stab === statsTab));
    if (statsTab === 'motm') {
      const rows = Object.values(S().get().stats?.motm || {}).sort((a, b) => b.count - a.count);
      $('#stats-list').innerHTML = rows.map((r, i) => `
        <div class="row">
          <div class="ovr">${i + 1}</div>
          <div><strong>${r.name}</strong><div class="meta">Игрок матча</div></div>
          <div class="meta"><strong>${r.count}</strong></div>
        </div>
      `).join('') || `<div class="news-item">Сыграйте матчи — появятся игроки матча</div>`;
      return;
    }
    const rows = S().topScorers(25);
    const sorted = statsTab === 'assists'
      ? [...rows].sort((a, b) => b.assists - a.assists || b.goals - a.goals)
      : rows;
    $('#stats-list').innerHTML = sorted.map((r, i) => `
      <div class="row">
        <div class="ovr">${i + 1}</div>
        <div>
          <strong>${r.name}</strong>
          <div class="meta">${r.club}</div>
        </div>
        <div class="meta"><strong>${r.goals}</strong> Г · ${r.assists} А</div>
      </div>
    `).join('') || `<div class="news-item">Сыграйте матчи — статистика появится</div>`;
  }

  function renderTrain() {
    const ready = S().squadReadiness();
    const st = S().get();
    const status = $('#train-status');
    const used = st?.trainCountWeek || 0;
    const recoverUsed = st?.recoverCountWeek || 0;
    if (status && ready) {
      const focusN = (S().club().squad || []).filter(p => p.devFocus).length;
      status.innerHTML = `
        <strong>Готовность состава</strong>
        <div class="meta" style="color:var(--muted);margin-top:6px;font-size:13px;line-height:1.5">
          Кондиция ${ready.avgCond} · энергия ${ready.avgEnergy}
          · устали ${ready.tired.length} · лазарет ${ready.injured.length}
          · фокус развития: ${focusN}
          · тренировки тура: <strong>${used}/2</strong>${recoverUsed ? ' · восстановление сделано' : ''}
          ${ready.cards.length ? ` · ЖК-риск: ${ready.cards.map(p => p.name).slice(0, 3).join(', ')}` : ''}
        </div>
        <div class="fit-row" style="margin-top:10px">${fitBar('Конд', ready.avgCond)}${fitBar('Энерг', ready.avgEnergy)}</div>
      `;
    }
    $('#train-grid').innerHTML = D().TRAINING.map(t => {
      const isRec = t.focus === 'condition';
      const locked = isRec ? recoverUsed >= 1 : used >= 2;
      return `
      <button class="train-card" data-train="${t.id}" ${locked ? 'disabled' : ''}>
        <div><strong>${t.name}</strong><span>${isRec ? 'восстановление · 1/тур' : 'рост · ' + t.focus}</span></div>
        <span class="btn-tiny">${locked ? 'лимит' : 'Старт'}</span>
      </button>`;
    }).join('');
  }

  function showTrainReport(r) {
    const box = $('#train-report');
    if (!box) return;
    if (!r?.ok) { box.hidden = true; box.innerHTML = ''; return; }
    const lines = (r.gains || []).map(g =>
      `<div class="rating-row"><span>${g.name}</span><strong>${g.text}</strong></div>`
    ).join('') || `<div class="hint">Массовый эффект без ярких индивидуальных приростов</div>`;
    const extra = r.training?.focus === 'condition'
      ? `Восстановились: ${r.recovered || 0}`
      : `Пропущено (травма/бан): ${r.skipped || 0}`;
    box.hidden = false;
    box.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px">
        <strong>Отчёт: ${r.training?.name || 'Тренировка'}</strong>
        <button type="button" class="btn btn-tiny" id="btn-train-report-close">Закрыть</button>
      </div>
      <div class="hint" style="margin:6px 0 10px">${r.msg} · ${extra}</div>
      ${lines}
    `;
    $('#btn-train-report-close')?.addEventListener('click', () => {
      box.hidden = true;
      box.innerHTML = '';
    });
  }

  function renderClub() {
    const me = S().club();
    const ready = S().squadReadiness();
    const summary = S().teamDevSummary?.();
    const bay = $('#medical-bay');
    if (bay) {
      const rows = [...(ready?.injured || []), ...(ready?.suspended || [])];
      bay.innerHTML = `
        <strong>${me.customClub ? 'Ваш клуб' : 'Клуб'} · ур. ${summary?.level || me.clubLevel || 1}</strong>
        <div class="meta" style="color:var(--muted);margin-top:6px;font-size:13px;line-height:1.5">
          OVR ${summary?.avgOvr || '—'} · фанаты ${(me.fans || 0).toLocaleString('ru')} · репутация ${Math.round(me.reputation || 0)}
          · медицина ур. ${me.facilities?.medical || 1}<br/>
          ${rows.length
            ? rows.map(p => `${p.name} — ${p.injured ? 'травма ' + p.injured + ' тур.' : 'бан ' + p.suspended}`).join('<br/>')
            : 'Лазарет пуст — все доступны.'}
        </div>
      `;
    }
    $('#facility-list').innerHTML = D().FACILITIES.map(f => {
      const lvl = me.facilities[f.id] || 1;
      const cost = Math.round(f.base * Math.pow(1.65, lvl - 1));
      return `
        <button class="fac-card" data-fac="${f.id}" ${lvl >= f.max ? 'disabled' : ''}>
          <div><strong>${f.name}</strong><span>Ур. ${lvl}/${f.max} · ${f.effectRu || ''}</span></div>
          <span class="btn-tiny">${lvl >= f.max ? 'макс.' : S().money(cost)}</span>
        </button>
      `;
    }).join('');
    const staff = me.staff || { coach: 1, physio: 1, scoutDir: 1 };
    $('#staff-list').innerHTML = D().STAFF_ROLES.map(r => {
      const lvl = staff[r.id] || 1;
      const cost = Math.round(r.base * Math.pow(1.55, lvl - 1));
      return `
        <button class="fac-card" data-staff="${r.id}" ${lvl >= r.max ? 'disabled' : ''}>
          <div><strong>${r.name}</strong><span>Ур. ${lvl}/${r.max} · ${r.effectRu || ''}</span></div>
          <span class="btn-tiny">${lvl >= r.max ? 'макс.' : S().money(cost)}</span>
        </button>
      `;
    }).join('');
  }

  function renderYouth() {
    const me = S().club();
    const list = me.youth || [];
    const intake = list.filter(p => p.intake).length;
    const cost = S().youthPromoteCost?.() || Math.max(40000, 150000 - (me.facilities?.youth || 1) * 18000);
    $('#youth-status').innerHTML = `
      <strong>Академия ур. ${me.facilities?.youth || 1}</strong>
      <div class="meta" style="color:var(--muted);margin-top:4px;font-size:13px">
        Воспитанников: ${list.length}${intake ? ` · новый набор: ${intake}` : ''}.
        Выпуск в основу: ${S().money(cost)}.
      </div>
    `;
    const bestBtn = $('#btn-youth-best');
    if (bestBtn) bestBtn.textContent = `Выпустить лучшего · ${S().money(cost)}`;
    $('#youth-list').innerHTML = list.slice().sort((a, b) => b.pot - a.pot).map(p => {
      D().ensureTraits(p);
      const trait = (p.traits || [])[0] ? D().traitInfo(p.traits[0]).name : '';
      const focus = p.devFocus ? (D().DEV_FOCUS.find(f => f.id === p.devFocus)?.name || p.devFocus) : '';
      return `
      <div class="row youth-row">
        <button class="row-btn youth-card" data-youth-open="${p.id}" type="button">
          <div class="ovr">${p.ovr}</div>
          <div>
            <strong>${p.name}${p.intake ? ' · новый' : ''}</strong>
            <div class="meta">${D().POS_LABEL[p.pos]} · ${p.age}л · пот. ${p.pot}${trait ? ' · ' + trait : ''}${focus ? ' · ' + focus : ''}</div>
          </div>
        </button>
        <div class="row-actions">
          <button class="btn btn-tiny" data-promote="${p.id}">В основу · ${S().money(cost)}</button>
          <button class="btn btn-tiny" data-youth-drop="${p.id}">Отчислить</button>
        </div>
      </div>`;
    }).join('') || `<div class="news-item">Академия пуста — набор на 2-м туре и в середине сезона</div>`;
  }

  function renderInbox() {
    const st = S().get();
    st.inbox.forEach(m => {
      if ((m.type === 'request' && !m.resolved) || (m.type === 'contract_ask' && !m.resolved)) return;
      m.read = true;
    });
    S().save();
    $('#inbox-list').innerHTML = st.inbox.map(m => {
      let actions = '';
      if (m.type === 'request' && m.playerId && !m.resolved) {
        actions = `<div class="row-actions" style="margin-top:8px">
            <button class="btn btn-tiny" data-req="${m.playerId}" data-req-act="promise">Обещать XI</button>
            <button class="btn btn-tiny" data-req="${m.playerId}" data-req-act="list">На трансфер</button>
            <button class="btn btn-tiny" data-req="${m.playerId}" data-req-act="dismiss">Отказать</button>
          </div>`;
      } else if (m.type === 'contract_ask' && m.playerId && !m.resolved) {
        actions = `<div class="row-actions" style="margin-top:8px">
            <button class="btn btn-tiny" data-contract-open="${m.playerId}">Карточка</button>
            <button class="btn btn-tiny btn-accent" data-contract-quick="${m.playerId}" data-want-wage="${m.wantWage || 0}">Принять ~${S().money(m.wantWage || 0)}</button>
          </div>`;
      } else if (m.type === 'youth_intake' && !m.resolved) {
        actions = `<div class="row-actions" style="margin-top:8px">
            <button class="btn btn-tiny" data-nav="youth">Открыть академию</button>
          </div>`;
        m.resolved = true;
        m.read = true;
      }
      return `<div class="news-item${m.resolved ? ' resolved' : ''}"><strong>${m.title}</strong><div>${m.body}</div>${actions}</div>`;
    }).join('') || `<div class="news-item">Писем нет</div>`;
  }

  function renderHistory() {
    const st = S().get();
    $all('#history-tabs .tab').forEach(t => t.classList.toggle('active', t.dataset.hist === historyTab));
    if (historyTab === 'seasons') {
      const log = st.seasonLog || [];
      $('#history-list').innerHTML = log.map(s => {
        const boot = s.goldenBoot ? `Бомбардир: ${s.goldenBoot.name} (${s.goldenBoot.goals})` : '';
        const ast = s.topAssist ? `Ассисты: ${s.topAssist.name} (${s.topAssist.assists})` : '';
        const board = s.boardOk == null ? '' : (s.boardOk ? 'Цели совета ✔' : 'Цели совета ✖');
        return `<div class="news-item">
          <strong>Сезон ${s.season} · ${s.leagueName}</strong>
          <div>${s.clubName || ''} — ${s.place}-е · ${s.pts} очк. · РМ ${(s.gd > 0 ? '+' : '') + (s.gd || 0)}</div>
          <div class="meta" style="color:var(--muted);margin-top:4px;font-size:12px">
            Кубок: ${s.cupBest || '—'} · ЛЧ: ${s.uclBest || '—'} · ЧМ: ${s.cwcBest || '—'} · призовые ${S().money(s.prize || 0)}
            ${board ? ' · ' + board : ''}${s.sacked ? ' · уволен' : ''}
          </div>
          <div class="meta" style="color:var(--dim);margin-top:2px;font-size:12px">${[boot, ast].filter(Boolean).join(' · ')}</div>
        </div>`;
      }).join('') || `<div class="news-item">Завершите сезон — появится архив с наградами</div>`;
      return;
    }
    $('#history-list').innerHTML = (st.history || []).slice(0, 40).map(h => `
      <div class="news-item"><strong>С${h.season} · Т${h.week}${h.cup ? ' · Кубок' : ''}${h.ucl ? ' · ЛЧ' : ''}${h.cwc ? ' · ЧМ' : ''}</strong><div>${h.home} ${h.score[0]}:${h.score[1]} ${h.away}</div></div>
    `).join('') || `<div class="news-item">Матчей ещё не было</div>`;
  }

  function renderPrematch() {
    const st = S().get();
    if (st?.sacked) { show('board'); return; }
    let next = S().nextMatch();
    if (matchCtx?.match && (matchCtx.type === 'cup' || matchCtx.type === 'ucl' || matchCtx.type === 'cwc')) {
      const still = !matchCtx.match.played &&
        (matchCtx.match.home === st.clubId || matchCtx.match.away === st.clubId);
      if (still) next = { type: matchCtx.type, match: matchCtx.match };
    }
    if (!next) { show('hub'); return; }
    const pm = next.match;
    const home = S().clubById(pm.home);
    const away = S().clubById(pm.away);
    const me = S().club();
    if (!home || !away || !me) { show('hub'); return; }
    const opp = home.id === me.id ? away : home;
    S().ensureLineup();
    const rivalry = S().matchRivalry(home.id, away.id);
    const myS = E().teamStrength(me, { home: home.id === me.id, derby: !!rivalry });
    const opS = E().teamStrength(opp, { home: home.id === opp.id, derby: !!rivalry });
    const ready = S().squadReadiness();
    const cardRisk = (ready?.cards || []).filter(p => (me.lineup || []).some(x => x?.id === p.id));
    $('#prematch-card').innerHTML = `
      <div class="next-label">${matchTypeLabel(next.type)} · Тур ${st.week}${rivalry ? ' · ДЕРБИ' : ''}</div>
      ${rivalry ? `<div class="derby-badge">${rivalry.name}</div>` : ''}
      <div class="vs">${home.name}</div>
      <div style="color:var(--dim)">против</div>
      <div class="vs">${away.name}</div>
      <div class="meta" style="color:var(--muted);margin-top:8px">
        Сила: вы ${Math.round((myS.attack + myS.defense + myS.mid) / 3)}
        · соперник ${Math.round((opS.attack + opS.defense + opS.mid) / 3)}
        · химия ${myS.chemistry}
        · ${me.formation} · ${D().STYLES.find(s => s.id === me.style)?.name || me.style}
      </div>
      ${cardRisk.length ? `<div class="hint" style="margin-top:8px">ЖК-риск в XI: ${cardRisk.map(p => p.name + ' (' + (p.seasonYellows || 0) + '/5)').join(', ')}</div>` : ''}
    `;
    renderPrematchLineup();
    const brief = S().opponentBrief(opp.id);
    const dossier = $('#opp-dossier');
    if (dossier && brief) {
      const threats = brief.threats.map(t =>
        `${t.name} (${t.pos}, ${t.ovr})${t.goals || t.assists ? ` · ${t.goals}Г/${t.assists}А` : ''}`
      ).join('<br/>') || '—';
      const outs = brief.out.map(o => `${o.name} — ${o.reason}`).join('<br/>') || 'Все в строю';
      const form = brief.recent.length ? brief.recent.join('<br/>') : 'Мало данных по форме';
      dossier.innerHTML = `
        <strong>Досье · ${brief.name}</strong>
        <div class="meta" style="color:var(--muted);margin-top:6px;font-size:13px;line-height:1.55">
          ${brief.formation} · ${brief.style} · сила ${brief.strength} · химия ${brief.chemistry}
        </div>
        <div class="dossier-grid">
          <div><span class="field-label">Угрозы</span><div class="hint">${threats}</div></div>
          <div><span class="field-label">Вне состава</span><div class="hint">${outs}</div></div>
          <div class="dossier-form"><span class="field-label">Недавние</span><div class="hint">${form}</div></div>
        </div>
      `;
    } else if (dossier) {
      dossier.innerHTML = '';
    }
    const status = S().xiStatus();
    const warn = $('#prematch-warnings');
    const fixBtn = $('#btn-fix-xi');
    const freshBtn = $('#btn-fresh-xi');
    const kick = $('#btn-kickoff');
    if (!status.ok) {
      warn.hidden = false;
      warn.innerHTML = `<strong>Состав не готов</strong><div class="hint" style="margin-top:6px">${status.unavailable.map(u => `${u.name} — ${u.reason}`).join('<br/>') || 'Нужно 11 игроков'}</div>`;
      if (fixBtn) fixBtn.hidden = false;
      if (freshBtn) freshBtn.hidden = true;
      if (kick) { kick.disabled = true; kick.textContent = 'Исправьте состав'; }
    } else if (status.loadWarn || (status.tired || []).length) {
      warn.hidden = false;
      const list = (status.tired || []).slice(0, 6).map(u => `${u.name} — ${u.reason}`).join('<br/>');
      warn.innerHTML = `<strong>${status.loadWarn ? 'Высокая нагрузка XI' : 'Усталость в составе'}</strong><div class="hint" style="margin-top:6px">${list || 'Рекомендуется ротация'}<br/><button type="button" class="btn btn-tiny" data-nav="train" style="margin-top:8px">К тренировкам</button></div>`;
      if (fixBtn) fixBtn.hidden = true;
      if (freshBtn) freshBtn.hidden = false;
      if (kick) { kick.disabled = false; kick.textContent = 'Начать матч'; }
    } else {
      warn.hidden = true;
      warn.innerHTML = '';
      if (fixBtn) fixBtn.hidden = true;
      if (freshBtn) freshBtn.hidden = true;
      if (kick) { kick.disabled = false; kick.textContent = 'Начать матч'; }
    }
    matchCtx = { type: next.type, match: pm, subsUsed: matchCtx?.subsUsed || 0, derby: rivalry?.name || null };
  }

  function renderPrematchLineup() {
    const box = $('#prematch-lineup');
    if (!box) return;
    const board = S().prematchSquadBoard?.();
    if (!board) { box.innerHTML = ''; return; }
    const xiS = board.xiStrength;
    const bS = board.benchStrength;
    const edge = (xiS.avgOvr || 0) - (bS.avgOvr || 0);
    const fitEdge = (xiS.power || 0) - (bS.power || 0);
    const edgeLabel = fitEdge <= -6
      ? 'запас свежее основы — подумайте о ротации'
      : edge >= 5 ? 'основа заметно сильнее по рейтингу'
      : edge <= -3 ? 'запас близок по рейтингу'
      : 'силы близки';

    const rowHtml = (p, i) => {
      if (!p) return '';
      const cls = p.unfit ? 'pm-player unfit' : p.tired ? 'pm-player tired' : 'pm-player';
      return `
        <div class="${cls}" data-player="${p.id}">
          <span class="pm-slot">${i + 1}</span>
          <span class="pm-pos">${p.pos}</span>
          <span class="pm-name">${p.name}${p.status ? ` <em>${p.status}</em>` : ''}</span>
          <span class="pm-ovr">${p.ovr}</span>
          <span class="pm-fit">${fitBar('К', p.condition)}${fitBar('Э', p.energy)}</span>
        </div>`;
    };

    box.innerHTML = `
      <div class="pm-head">
        <strong>Состав на матч</strong>
        <div class="hint">${board.formation} · ${board.style}</div>
      </div>
      <div class="pm-strength">
        <div class="pm-str-card">
          <span class="field-label">Основа</span>
          <div class="pm-str-kpi">${xiS.avgOvr}</div>
          <small>сила ${xiS.power} · конд. ${xiS.avgCond} · энерг. ${xiS.avgEnergy}</small>
        </div>
        <div class="pm-str-vs" title="${edgeLabel}">${edge > 0 ? '+' : ''}${edge}</div>
        <div class="pm-str-card">
          <span class="field-label">Запас (7)</span>
          <div class="pm-str-kpi">${bS.avgOvr || '—'}</div>
          <small>сила ${bS.power || '—'} · конд. ${bS.avgCond || '—'} · энерг. ${bS.avgEnergy || '—'}</small>
        </div>
      </div>
      <div class="hint" style="margin:8px 0 4px">${edgeLabel}. Δ — разница среднего OVR; «сила» учитывает свежесть.</div>
      <div class="pm-cols">
        <div class="pm-col">
          <div class="pm-col-title">Основной состав · ${board.xi.filter(Boolean).length}</div>
          <div class="pm-list">${board.xi.map((p, i) => rowHtml(p, i)).join('')}</div>
        </div>
        <div class="pm-col">
          <div class="pm-col-title">Запас · ${board.bench.length}${board.reserveTotal > board.bench.length ? ` / ${board.reserveTotal}` : ''}</div>
          <div class="pm-list">${board.bench.map((p, i) => rowHtml(p, i)).join('') || '<div class="hint">Запас пуст</div>'}</div>
        </div>
      </div>
      <div class="pm-actions">
        <button type="button" class="btn btn-tiny" data-nav="tactics">Изменить XI</button>
        <button type="button" class="btn btn-tiny" data-nav="squad">Состав</button>
      </div>
    `;
  }

  function drawMatchFrame(ctx, w, h, minute, colors, ball) {
    ctx.clearRect(0, 0, w, h);
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#0F766E');
    g.addColorStop(0.5, '#0B5C54');
    g.addColorStop(1, '#064E3B');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    // stripes
    ctx.fillStyle = 'rgba(255,255,255,0.03)';
    for (let i = 0; i < 6; i++) ctx.fillRect(0, (h / 6) * i, w, h / 12);

    const pad = 18;
    ctx.strokeStyle = 'rgba(255,255,255,0.28)';
    ctx.lineWidth = 2;
    ctx.strokeRect(pad, pad, w - pad * 2, h - pad * 2);
    // halfway
    ctx.beginPath(); ctx.moveTo(pad, h / 2); ctx.lineTo(w - pad, h / 2); ctx.stroke();
    ctx.beginPath(); ctx.arc(w / 2, h / 2, 42, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.arc(w / 2, h / 2, 3, 0, Math.PI * 2); ctx.fillStyle = 'rgba(255,255,255,0.4)'; ctx.fill();
    // boxes
    const boxW = w * 0.46, boxH = 70, sixH = 28;
    ctx.strokeRect((w - boxW) / 2, pad, boxW, boxH);
    ctx.strokeRect((w - boxW * 0.55) / 2, pad, boxW * 0.55, sixH);
    ctx.strokeRect((w - boxW) / 2, h - pad - boxH, boxW, boxH);
    ctx.strokeRect((w - boxW * 0.55) / 2, h - pad - sixH, boxW * 0.55, sixH);

    const t = minute / 90;
    const drawTeam = (color, top) => {
      for (let i = 0; i < 11; i++) {
        const col = i % 4;
        const row = Math.floor(i / 4);
        const baseX = pad + 28 + col * ((w - pad * 2 - 56) / 3);
        const baseY = top
          ? pad + 36 + row * 48 + t * 18
          : h - pad - 36 - row * 48 - t * 18;
        const x = baseX + Math.sin(minute * 0.18 + i) * 5;
        const y = baseY + Math.cos(minute * 0.14 + i * 1.3) * 4;
        ctx.beginPath();
        ctx.fillStyle = color;
        ctx.arc(x, y, 8, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,0.25)';
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    };
    drawTeam(colors.home, true);
    drawTeam(colors.away, false);

    if (ball) {
      ctx.beginPath();
      ctx.fillStyle = '#F8FAFC';
      ctx.shadowColor = 'rgba(0,0,0,0.35)';
      ctx.shadowBlur = 6;
      ctx.arc(ball.x, ball.y, 5.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    }
  }

  function syncSpeedButtons() {
    $all('#speed-row .speed-btn').forEach(b => {
      b.classList.toggle('active', Number(b.dataset.speed) === matchSpeed);
    });
  }

  function syncPauseButton() {
    const b = $('#btn-pause-match');
    if (b) b.textContent = matchPaused ? 'Продолжить' : 'Пауза';
  }

  function showGoalFlash() {
    const el = $('#goal-flash');
    if (!el) return;
    el.hidden = false;
    clearTimeout(showGoalFlash._t);
    showGoalFlash._t = setTimeout(() => { el.hidden = true; }, 900);
  }

  function liveOpts(from, to) {
    return {
      fromMinute: from,
      toMinute: to,
      getMsPerMinute: () => Math.max(8, Math.round(110 / matchSpeed)),
      paused: () => matchPaused,
      aborted: () => matchAbort || matchSkipHalf
    };
  }

  async function runMatch() {
    if (matchPlaying) return;
    const next = matchCtx || S().nextMatch();
    if (!next) return;
    matchPlaying = true;
    matchAbort = false;
    matchSkipHalf = false;
    matchPaused = false;
    matchCtx = { ...next, subsUsed: next.subsUsed || 0 };
    show('match');
    closeHtPanel();
    syncSpeedButtons();
    syncPauseButton();
    $('#goal-flash').hidden = true;

    const home = S().clubById(next.match.home);
    const away = S().clubById(next.match.away);
    S().ensureLineup();

    const canvas = $('#match-canvas');
    const ctx = canvas.getContext('2d');
    const feed = $('#match-feed');
    feed.innerHTML = '';
    $('#m-home').textContent = home.short || home.name.slice(0, 12);
    $('#m-away').textContent = away.short || away.name.slice(0, 12);
    $('#m-home-dot').style.background = home.color;
    $('#m-away-dot').style.background = away.color;
    $('#m-score').textContent = '0:0';
    $('#m-progress').style.width = '0%';
    let score = [0, 0];
    let ball = { x: canvas.width / 2, y: canvas.height / 2 };

    const updateStats = (result) => {
      $('#match-stats').innerHTML = `
        <div><strong>${result.stats.possession[0]}%</strong>владение</div>
        <div><strong>${result.stats.shots[0]}-${result.stats.shots[1]}</strong>удары</div>
        <div><strong>${result.stats.onTarget[0]}-${result.stats.onTarget[1]}</strong>в створ</div>
      `;
    };

    const onEvent = (ev) => {
      if (ev.type === 'goal') {
        score = ev.score || score;
        $('#m-score').textContent = score.join(':');
        ball = { x: canvas.width / 2, y: ev.side === 'home' ? 48 : canvas.height - 48 };
        showGoalFlash();
      } else {
        ball = { x: canvas.width * (0.28 + Math.random() * 0.44), y: canvas.height * (0.22 + Math.random() * 0.56) };
      }
      const div = document.createElement('div');
      div.className = 'feed-item' + (ev.type === 'goal' ? ' goal' : ev.type === 'red' ? ' red' : ev.type === 'card' ? ' card' : ev.type === 'injury' ? ' injury' : '');
      div.textContent = `${ev.minute}′  ${ev.text}`;
      feed.prepend(div);
      while (feed.children.length > 40) feed.lastChild.remove();
    };
    const onTick = (minute, result) => {
      $('#m-min').textContent = minute + '′';
      $('#m-progress').style.width = Math.min(100, (minute / 90) * 100) + '%';
      drawMatchFrame(ctx, canvas.width, canvas.height, minute, { home: home.color, away: away.color }, ball);
      updateStats(result);
    };

    const half1 = E().simulateMatch(home, away, { startMinute: 1, endMinute: 45, applyFatigue: false });
    await E().playLive(half1, onEvent, onTick, liveOpts(1, 45));

    if (matchAbort) {
      const full = E().simulateMatch(home, away, {
        startMinute: 46, endMinute: 90, score: half1.score, stats: half1.stats,
        scorersH: half1.scorersH, scorersA: half1.scorersA, applyFatigue: true, finalizeStats: true
      });
      const result = E().mergeResults(half1, full);
      score = result.score;
      $('#m-score').textContent = score.join(':');
      $('#m-min').textContent = '90′';
      $('#m-progress').style.width = '100%';
      finishMatch(next, result);
      return;
    }

    matchSkipHalf = false;
    matchCtx.half1 = half1;
    score = half1.score;
    $('#m-score').textContent = score.join(':');
    $('#m-min').textContent = '45′ П';
    $('#m-progress').style.width = '50%';
    showHtPanel();
  }

  function showHtPanel() {
    const panel = $('#ht-panel');
    const scrim = $('#ht-scrim');
    if (!panel) return;
    if (scrim) scrim.hidden = false;
    panel.hidden = false;
    document.body.classList.add('ht-open');
    matchPaused = false;
    syncPauseButton();
    const flash = $('#goal-flash');
    if (flash) flash.hidden = true;
    const used = matchCtx?.subsUsed || 0;
    const left = Math.max(0, 3 - used);
    const hint = $('#ht-hint');
    if (hint) hint.textContent = `Стиль, схема и замены (осталось ${left}/3) · затем второй тайм`;
    const forms = $('#ht-formations');
    if (forms) {
      forms.innerHTML = Object.keys(D().FORMATIONS).map(f =>
        `<button class="btn btn-tiny" data-ht-form="${f}">${f}</button>`
      ).join('');
    }
    const styles = $('#ht-styles');
    if (styles) {
      styles.innerHTML = D().STYLES.map(s =>
        `<button class="btn btn-tiny" data-ht-style="${s.id}">${s.name}</button>`
      ).join('');
    }
    const me = S().club();
    S().ensureLineup();
    const xiIds = new Set(me.lineup.map(p => p.id));
    const slots = D().FORMATIONS[me.formation]?.slots || [];
    const bench = me.squad.filter(p => !xiIds.has(p.id) && !p.injured && !p.suspended).slice(0, 8);
    $('#ht-bench').innerHTML = left <= 0
      ? `<div class="news-item">Лимит замен исчерпан</div>`
      : (bench.map(p => {
          let slot = slots.findIndex((pos, i) => pos === p.pos && me.lineup[i]);
          if (slot < 0) {
            slot = slots.findIndex((pos) => D().POS_GROUP[pos] === D().POS_GROUP[p.pos]);
          }
          // Never park a non-GK into GK or GK into outfield via fallback
          if (slot < 0) {
            slot = slots.findIndex((pos, i) => {
              const sg = D().POS_GROUP[pos];
              const pg = D().POS_GROUP[p.pos];
              if (sg === 'GK' || pg === 'GK') return false;
              return true;
            });
          }
          if (slot < 0) return '';
          return `
            <button class="row row-btn" data-ht-sub="${p.id}" data-ht-slot="${slot}" type="button">
              <div class="ovr">${p.ovr}</div>
              <div><strong>${p.name}</strong><div class="meta">замена · ${D().POS_LABEL[p.pos]} → ${D().POS_LABEL[slots[slot]] || slots[slot]}</div></div>
            </button>
          `;
        }).filter(Boolean).join('') || `<div class="news-item">Нет запасных</div>`);
  }

  function closeHtPanel() {
    const panel = $('#ht-panel');
    const scrim = $('#ht-scrim');
    if (panel) panel.hidden = true;
    if (scrim) scrim.hidden = true;
    document.body.classList.remove('ht-open');
  }

  function isHtOpen() {
    const panel = $('#ht-panel');
    return !!(panel && !panel.hidden);
  }

  async function continueSecondHalf(opts = {}) {
    if (secondHalfRunning || matchFinishing) return;
    const next = matchCtx;
    if (!next?.half1 || !matchPlaying) return;
    secondHalfRunning = true;
    closeHtPanel();
    matchAbort = false;
    matchSkipHalf = false;
    matchPaused = false;
    syncPauseButton();
    try {
      const half1 = next.half1;
      const home = S().clubById(next.match.home);
      const away = S().clubById(next.match.away);
      const feed = $('#match-feed');
      const canvas = $('#match-canvas');
      const ctx = canvas.getContext('2d');
      let score = half1.score;
      let ball = { x: canvas.width / 2, y: canvas.height / 2 };

      const onEvent = (ev) => {
        if (ev.type === 'goal') {
          score = ev.score || score;
          $('#m-score').textContent = score.join(':');
          showGoalFlash();
        }
        const div = document.createElement('div');
        div.className = 'feed-item' + (ev.type === 'goal' ? ' goal' : ev.type === 'red' ? ' red' : ev.type === 'card' ? ' card' : '');
        div.textContent = `${ev.minute}′  ${ev.text}`;
        feed.prepend(div);
      };
      const onTick = (minute, result) => {
        $('#m-min').textContent = minute + '′';
        $('#m-progress').style.width = Math.min(100, (minute / 90) * 100) + '%';
        drawMatchFrame(ctx, canvas.width, canvas.height, minute, { home: home.color, away: away.color }, ball);
        $('#match-stats').innerHTML = `
          <div><strong>${result.stats.possession[0]}%</strong>владение</div>
          <div><strong>${result.stats.shots[0]}-${result.stats.shots[1]}</strong>удары</div>
          <div><strong>${result.stats.onTarget[0]}-${result.stats.onTarget[1]}</strong>в створ</div>
        `;
      };

      const half2 = E().simulateMatch(home, away, {
        startMinute: 46, endMinute: 90, score: half1.score, stats: half1.stats,
        scorersH: half1.scorersH, scorersA: half1.scorersA,
        applyFatigue: true, finalizeStats: true
      });
      if (!opts.skip) {
        await E().playLive(half2, onEvent, onTick, liveOpts(46, 90));
      } else {
        // Dump feed quickly for skip-from-HT
        (half2.events || []).forEach(onEvent);
        score = half2.score;
        $('#m-score').textContent = score.join(':');
        $('#m-min').textContent = '90′';
        onTick(90, half2);
      }
      const result = E().mergeResults(half1, half2);
      $('#m-progress').style.width = '100%';
      finishMatch(next, result);
    } finally {
      secondHalfRunning = false;
    }
  }

  function finishMatch(next, result) {
    if (matchFinishing || !next || !matchPlaying) return;
    matchFinishing = true;
    try {
      if (next.type === 'ucl') S().recordUclMatch(next.match, result);
      else if (next.type === 'cup') S().recordCupMatch(next.match, result);
      else if (next.type === 'cwc') S().recordCwcMatch(next.match, result);
      else S().recordPlayerMatch(next.match, result);
      matchPlaying = false;
      matchPaused = false;
      matchCtx = null;
      closeHtPanel();
      show('result');
      cloudSave(true);
    } finally {
      matchFinishing = false;
    }
  }

  function renderResult() {
    const last = S().get()?.lastResult;
    if (!last) return;
    const [hg, ag] = last.score;
    const scorersH = (last.scorersH || []).map(s => `${s.minute}′ ${s.player?.name || '—'}`).join(', ');
    const scorersA = (last.scorersA || []).map(s => `${s.minute}′ ${s.player?.name || '—'}`).join(', ');
    const highs = (last.highlights || []).slice(0, 8).map(h =>
      `<div class="feed-item ${h.type === 'goal' ? 'goal' : h.type === 'red' ? 'red' : h.type === 'injury' ? 'injury' : ''}">${h.minute || '?'}′ ${h.text}</div>`
    ).join('');
    const me = S().club();
    const mySide = last.homeId === me?.id ? 'home' : last.awayId === me?.id ? 'away' : null;
    const ratingsHtml = (mySide ? (last.ratings?.[mySide] || []) : (last.ratings?.list || []).slice(0, 11))
      .slice()
      .filter(r => r && r.name)
      .sort((a, b) => (b.rating || 0) - (a.rating || 0))
      .map(r => {
        const motm = last.motm?.id === r.id;
        return `<div class="rating-row${motm ? ' motm' : ''}"><span>${r.name}</span><strong>${Number(r.rating || 0).toFixed(1)}</strong></div>`;
      }).join('');
    const motmLine = last.motm
      ? `<div class="motm-banner">Игрок матча: <strong>${last.motm.name}</strong> · ${Number(last.motm.rating).toFixed(1)}</div>`
      : '';
    const chemLine = (last.chemistryHome != null && mySide)
      ? `<div class="hint">Химия XI: ${mySide === 'home' ? last.chemistryHome : last.chemistryAway}</div>`
      : '';
    const stats = last.stats || {};
    const poss = Array.isArray(stats.possession) ? stats.possession.join('% — ') + '%' : '—';
    const shots = Array.isArray(stats.shots) ? stats.shots.join(' — ') : '—';
    const onT = Array.isArray(stats.onTarget) ? stats.onTarget.join(' — ') : '—';
    $('#result-card').innerHTML = `
      <div class="result-layout">
        <div class="result-scoreboard">
          <div class="next-label">${last.derby ? 'Дерби · ' + last.derby : 'Итог матча'}${last.koDecided === 'et' ? ' · доп. время' : ''}${last.competition ? ' · ' + last.competition : ''}</div>
          <div>${last.home}</div>
          <div class="score">${hg}:${ag}</div>
          <div>${last.away}</div>
          ${motmLine}
          ${chemLine}
        </div>
        <div class="result-details">
          <div class="result-meta">
            ${scorersH ? `<div><strong>Голы ${last.home}:</strong> ${scorersH}</div>` : ''}
            ${scorersA ? `<div><strong>Голы ${last.away}:</strong> ${scorersA}</div>` : ''}
            <div>Владение ${poss}</div>
            <div>Удары ${shots} · в створ ${onT}</div>
            ${last.prize != null ? `<div>Призовые ${S().money(last.prize)}${last.income ? ' · касса ' + S().money(last.income) : ''}${last.competition ? ' · ' + last.competition : ''}</div>` : ''}
          </div>
          ${highs ? `<div class="result-highs">${highs}</div>` : ''}
        </div>
        ${ratingsHtml ? `<div class="ratings-block"><strong>Оценки</strong>${ratingsHtml}</div>` : ''}
      </div>
    `;
    const press = S().pendingPress();
    const card = $('#press-card');
    const hubBtn = $('#btn-result-hub');
    if (press && press.options?.length) {
      card.hidden = false;
      card.innerHTML = `
        <strong>${press.title}</strong>
        <div class="hint">${press.context}</div>
        ${press.options.map(o => `<button class="btn btn-glass" data-press="${o.id}">${o.label}</button>`).join('')}
      `;
      if (hubBtn) {
        hubBtn.disabled = true;
        hubBtn.textContent = 'Сначала ответьте прессе';
      }
    } else {
      card.hidden = true;
      card.innerHTML = '';
      if (hubBtn) {
        hubBtn.disabled = false;
        hubBtn.textContent = 'В центр управления';
      }
    }
  }

  function bind() {
    document.body.addEventListener('click', (e) => {
      const nav = e.target.closest('[data-nav]');
      if (nav) {
        const dest = nav.dataset.nav;
        const onResult = document.getElementById('screen-result')?.classList.contains('active');
        if (onResult && S().pendingPress()?.options?.length && dest !== 'result') {
          toast('Сначала ответьте на вопросы прессы');
          return;
        }
        show(dest);
        return;
      }

      const tl = e.target.closest('[data-table-league]');
      if (tl) { tableLeagueId = tl.dataset.tableLeague; renderTable(); return; }

      const ttab = e.target.closest('#transfer-tabs [data-tab]');
      if (ttab) { renderTransfers(ttab.dataset.tab); return; }

      const pl = e.target.closest('[data-player]');
      if (pl) { openPlayer(pl.dataset.player, 'squad'); return; }

      const bid = e.target.closest('[data-bid]');
      if (bid) { openBidModal(bid.dataset.bid); return; }
      const scout = e.target.closest('[data-scout]');
      if (scout) {
        const r = S().scoutPlayer(scout.dataset.scout);
        toast(r.msg);
        if (r.ok && r.report) {
          const tr = (r.report.traits || []).join(', ');
          toast(`${r.report.name}: ${r.report.recommendation} · пот.~${r.report.pot} · форма~${r.report.hiddenForm} · травмы ${r.report.injuryRisk}${tr ? ' · ' + tr : ''}`);
        }
        renderTransfers('market');
        return;
      }
      const job = e.target.closest('[data-job]');
      if (job) {
        const r = S().takeNewJob(job.dataset.job);
        toast(r.msg);
        if (r.ok) { S().autoLineup(); show('hub'); }
        return;
      }
      const loan = e.target.closest('[data-loan]');
      if (loan) {
        const r = S().makeOffer(loan.dataset.loan, 0, true);
        toast(r.msg); renderTransfers('market'); return;
      }
      const slot = e.target.closest('[data-slot]');
      if (slot) {
        selectedSlot = Number(slot.dataset.slot);
        drawPitch(); renderBench(); return;
      }
      const bench = e.target.closest('[data-bench]');
      if (bench) {
        if (selectedSlot == null) { toast('Сначала выберите слот на поле'); return; }
        const r = S().swapIntoXi(bench.dataset.bench, selectedSlot);
        toast(r.msg); selectedSlot = null; drawPitch(); renderBench(); return;
      }
      const htForm = e.target.closest('[data-ht-form]');
      if (htForm) {
        S().setTactics(htForm.dataset.htForm, null, { stickToXi: true });
        toast('Схема: ' + htForm.dataset.htForm + ' · тот же XI');
        showHtPanel();
        return;
      }
      const htStyle = e.target.closest('[data-ht-style]');
      if (htStyle) {
        S().setTactics(null, htStyle.dataset.htStyle);
        toast('Стиль: ' + (D().STYLES.find(s => s.id === htStyle.dataset.htStyle)?.name || htStyle.dataset.htStyle));
        showHtPanel();
        return;
      }
      const htSub = e.target.closest('[data-ht-sub]');
      if (htSub) {
        if (!matchCtx) return;
        if ((matchCtx.subsUsed || 0) >= 3) { toast('Лимит 3 замены'); return; }
        const r = S().swapIntoXi(htSub.dataset.htSub, Number(htSub.dataset.htSlot));
        if (r.ok !== false) {
          matchCtx.subsUsed = (matchCtx.subsUsed || 0) + 1;
          toast((r.msg || 'Замена') + ` · ${matchCtx.subsUsed}/3`);
        } else toast(r.msg || 'Не вышло');
        showHtPanel();
        return;
      }
      const sell = e.target.closest('[data-sell]');
      if (sell) {
        const r = S().sellPlayer(sell.dataset.sell);
        toast(r.msg); renderTransfers('sell'); return;
      }
      const oy = e.target.closest('[data-offer-yes]');
      if (oy) { toast(S().respondOffer(oy.dataset.offerYes, true).msg); renderTransfers('offers'); return; }
      const on = e.target.closest('[data-offer-no]');
      if (on) { toast(S().respondOffer(on.dataset.offerNo, false).msg); renderTransfers('offers'); return; }

      const train = e.target.closest('[data-train]');
      if (train) {
        const r = S().train(train.dataset.train);
        $('#train-msg').textContent = r.msg;
        toast(r.msg);
        showTrainReport(r);
        renderTrain();
        return;
      }
      const fac = e.target.closest('[data-fac]');
      if (fac) {
        const r = S().upgradeFacility(fac.dataset.fac);
        toast(r.msg); renderClub(); return;
      }
      const staff = e.target.closest('[data-staff]');
      if (staff) {
        const r = S().hireStaff(staff.dataset.staff);
        toast(r.msg); renderClub(); return;
      }
      const promote = e.target.closest('[data-promote]');
      if (promote) {
        const r = S().promoteYouth(promote.dataset.promote);
        toast(r.msg);
        $('#youth-msg').textContent = r.msg;
        renderYouth();
        return;
      }
      const yopen = e.target.closest('[data-youth-open]');
      if (yopen) {
        openPlayer(yopen.dataset.youthOpen, 'youth');
        return;
      }
      const copen = e.target.closest('[data-contract-open]');
      if (copen) {
        openPlayer(copen.dataset.contractOpen, 'inbox');
        return;
      }
      const cquick = e.target.closest('[data-contract-quick]');
      if (cquick) {
        const wage = Number(cquick.dataset.wantWage || 0);
        const r = S().negotiateContract(cquick.dataset.contractQuick, 2, wage || null);
        toast(r.msg);
        renderInbox();
        return;
      }
      const ydrop = e.target.closest('[data-youth-drop]');
      if (ydrop) {
        const r = S().releaseYouth(ydrop.dataset.youthDrop);
        toast(r.msg);
        $('#youth-msg').textContent = r.msg;
        if (r.ok) renderYouth();
        return;
      }
      const press = e.target.closest('[data-press]');
      if (press) {
        const r = S().answerPress(press.dataset.press);
        toast(r.msg);
        renderResult();
        return;
      }
    });

    // Home entry actions — capture so nothing can swallow the tap
    document.body.addEventListener('click', (e) => {
      const career = e.target.closest('#btn-career');
      if (career) {
        e.preventDefault();
        e.stopPropagation();
        openCareerMode();
        return;
      }
      const online = e.target.closest('#btn-online');
      if (online) {
        e.preventDefault();
        e.stopPropagation();
        openOnlineMode();
        return;
      }
      const reg = e.target.closest('#btn-register');
      if (reg) {
        e.preventDefault();
        e.stopPropagation();
        show('register');
        return;
      }
      const auth = e.target.closest('#btn-auth');
      if (auth) {
        e.preventDefault();
        e.stopPropagation();
        show('auth');
      }
    }, true);
    $('#btn-new')?.addEventListener('click', () => {
      if (!A().isLoggedIn()) { show('auth'); toast('Сначала войдите'); return; }
      if (teamAlreadyBound()) {
        toast('Карьера уже создана. Пересоздание запрещено.');
        return;
      }
      createDirty = false;
      createMode = 'takeover';
      createStep = 1;
      show('create');
    });
    document.body.addEventListener('click', (e) => {
      const next = e.target.closest('[data-create-next]');
      if (next) {
        const step = Number(next.dataset.createNext);
        if (step === 2) {
          const mgr = document.querySelector('#form-create input[name="manager"]');
          if (mgr && !String(mgr.value || '').trim()) {
            mgr.focus();
            toast('Укажите имя менеджера');
            return;
          }
          if (!$('#sel-league')?.value) { toast('Выберите лигу'); return; }
        }
        if (step === 3) {
          if (createMode === 'custom') {
            if (!String($('#inp-club-name')?.value || '').trim()) {
              toast('Укажите название клуба');
              $('#inp-club-name')?.focus();
              return;
            }
          } else if (!$('#sel-club')?.value) {
            toast('Выберите клуб');
            return;
          }
        }
        setCreateStep(step);
        e.preventDefault();
        return;
      }
      const goto = e.target.closest('[data-goto-step]');
      if (goto) {
        const step = Number(goto.dataset.gotoStep);
        if (step > createStep) {
          if (step >= 2) {
            const mgr = document.querySelector('#form-create input[name="manager"]');
            if (mgr && !String(mgr.value || '').trim()) { toast('Сначала имя менеджера'); return; }
            if (!$('#sel-league')?.value) { toast('Сначала лигу'); return; }
          }
          if (step >= 3) {
            if (createMode === 'custom') {
              if (!String($('#inp-club-name')?.value || '').trim()) { toast('Сначала название клуба'); return; }
            } else if (!$('#sel-club')?.value) { toast('Сначала клуб'); return; }
          }
        }
        setCreateStep(step);
        e.preventDefault();
      }
    });
    $('#btn-continue')?.addEventListener('click', async () => {
      if (!A().isLoggedIn()) { show('auth'); return; }
      toast('Открываем карьеру…');
      await enterApp();
      if (!S().get() && !cloudHasCareer) toast('Карьера не найдена — начните новую');
    });
    async function doLogout() {
      await A().logout();
      S().clear();
      cloudHasCareer = false;
      toast('Вы вышли');
      show('home');
    }
    $('#btn-logout')?.addEventListener('click', () => doLogout());
    $('#btn-logout-more')?.addEventListener('click', () => doLogout());
    $('#form-login')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      $('#login-msg').textContent = 'Вход…';
      try {
        const data = await A().login({
          login: String(fd.get('login')),
          password: String(fd.get('password'))
        });
        cloudHasCareer = !!data.hasCareer;
        $('#login-msg').textContent = '';
        toast('Добро пожаловать, ' + (data.user.name || data.user.login));
        await enterApp({ toastWelcome: false, toModes: true });
      } catch (err) {
        $('#login-msg').textContent = err.message;
      }
    });
    $('#form-register')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      $('#register-msg').textContent = 'Создание…';
      try {
        await A().register({
          login: String(fd.get('login')),
          password: String(fd.get('password')),
          name: String(fd.get('name') || fd.get('login'))
        });
        cloudHasCareer = false;
        $('#register-msg').textContent = '';
        toast('Аккаунт создан — выберите режим');
        show('home');
      } catch (err) {
        $('#register-msg').textContent = err.message;
      }
    });
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      if ($('#bid-modal') && !$('#bid-modal').hidden) { closeBidModal(); return; }
      if (isHtOpen()) {
        toast('Нажмите «Второй тайм», чтобы продолжить');
        return;
      }
      if (document.getElementById('app')?.classList.contains('entry-open')) {
        show('home');
      }
    });
    $('#form-create')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!A().isLoggedIn()) { show('auth'); return; }
      if (teamAlreadyBound()) {
        toast('Карьера уже создана. Пересоздание запрещено.');
        show(S().get() ? 'hub' : 'home');
        return;
      }
      const fd = new FormData(e.target);
      try {
        const managerName = String(fd.get('manager')).trim() || A().getUser()?.name || 'Менеджер';
        const formation = String(fd.get('formation'));
        const style = String(fd.get('style'));
        // Default path: real league + real club
        if (createMode === 'custom') {
          const name = String(fd.get('clubName') || '').trim();
          if (!name) { toast('Укажите название клуба'); setCreateStep(2); return; }
          const leagueId = String(fd.get('league') || $('#sel-league')?.value || '');
          if (!leagueId) { toast('Выберите лигу'); setCreateStep(1); return; }
          S().createCareer({
            managerName,
            formation,
            style,
            custom: {
              leagueId,
              name,
              short: String(fd.get('clubShort') || name).trim(),
              color: String(fd.get('clubColor') || '#C8102E'),
              stadium: String(fd.get('stadium') || 'Стадион клуба').trim() || 'Стадион клуба'
            }
          });
        } else {
          const clubId = String(fd.get('clubId') || $('#sel-club')?.value || '');
          if (!clubId) { toast('Выберите клуб'); setCreateStep(2); return; }
          S().createCareer({ managerName, clubId, formation, style });
        }
        S().autoLineup();
        const saved = await cloudSave(true, { mode: 'create' });
        if (!saved) {
          S().clear();
          cloudHasCareer = !!(lastMePayload?.hasCareer || A().getUser()?.teamBound);
          return;
        }
        cloudHasCareer = true;
        createDirty = false;
        toast('Карьера начата · реальный клуб против ИИ');
        show('hub');
      } catch (err) {
        toast('Ошибка: ' + err.message);
      }
    });

    $('#btn-play-match')?.addEventListener('click', () => {
      if (S().get()?.sacked) show('board');
      else show('prematch');
    });
    $('#btn-kickoff')?.addEventListener('click', () => {
      const st = S().xiStatus();
      if (!st.ok) { toast('Сначала исправьте состав'); renderPrematch(); return; }
      runMatch();
    });
    $('#btn-fix-xi')?.addEventListener('click', () => {
      const r = S().fixXi();
      toast(r.msg);
      renderPrematch();
    });
    $('#btn-fresh-xi')?.addEventListener('click', () => {
      S().autoLineup(true);
      toast('Собран свежий состав');
      renderPrematch();
    });
    $('#btn-skip-match')?.addEventListener('click', () => {
      if (isHtOpen()) {
        continueSecondHalf({ skip: true });
        return;
      }
      if (!matchPlaying) return;
      matchPaused = false;
      matchAbort = true;
      syncPauseButton();
    });
    $('#btn-skip-half')?.addEventListener('click', () => {
      if (isHtOpen()) {
        toast('Уже перерыв — нажмите «Второй тайм» или «Пропустить»');
        return;
      }
      if (!matchPlaying) return;
      matchPaused = false;
      matchSkipHalf = true;
      if (matchCtx?.half1) matchAbort = true;
      syncPauseButton();
    });
    $('#btn-pause-match')?.addEventListener('click', () => {
      if (!matchPlaying || isHtOpen()) return;
      matchPaused = !matchPaused;
      syncPauseButton();
    });
    $('#speed-row')?.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-speed]');
      if (!btn) return;
      matchSpeed = Number(btn.dataset.speed) || 1;
      syncSpeedButtons();
    });
    $('#btn-auto-xi')?.addEventListener('click', () => { S().autoLineup(); toast('Состав собран'); renderSquad(); });
    $('#btn-auto-xi-tac')?.addEventListener('click', () => { S().autoLineup(); toast('Состав собран'); drawPitch(); renderBench(); });
    $('#sel-formation')?.addEventListener('change', (e) => { S().setTactics(e.target.value, null); S().autoLineup(); drawPitch(); renderBench(); });
    $('#sel-style')?.addEventListener('change', (e) => { S().setTactics(null, e.target.value); });
    $('#btn-second-half')?.addEventListener('click', () => continueSecondHalf());
    $('#btn-ht-close')?.addEventListener('click', () => {
      toast('Нажмите «Второй тайм», чтобы продолжить');
    });
    $('#ht-scrim')?.addEventListener('click', () => {
      toast('Нажмите «Второй тайм», чтобы продолжить');
    });
    $('#btn-cup-play')?.addEventListener('click', () => {
      const next = S().nextMatch();
      if (next?.type !== 'cup') {
        toast(next ? 'Сейчас другой матч — откройте Центр' : 'Сейчас нет вашего кубкового матча');
        if (next) show('hub');
        else renderCup();
        return;
      }
      matchCtx = { type: 'cup', match: next.match, subsUsed: 0 };
      show('prematch');
      renderPrematch();
    });
    $('#btn-ucl-play')?.addEventListener('click', () => {
      const next = S().nextMatch();
      if (next?.type !== 'ucl') {
        toast(next ? 'Сейчас другой матч — откройте Центр' : 'Сейчас нет вашего матча ЛЧ');
        if (next) show('hub');
        else renderUcl();
        return;
      }
      matchCtx = { type: 'ucl', match: next.match, subsUsed: 0 };
      show('prematch');
      renderPrematch();
    });
    $('#btn-cwc-play')?.addEventListener('click', () => {
      const next = S().nextMatch();
      if (next?.type !== 'cwc') {
        toast(next ? 'Сейчас другой матч — откройте Центр' : 'Сейчас нет вашего матча ЧМ');
        if (next) show('hub');
        else renderCwc();
        return;
      }
      matchCtx = { type: 'cwc', match: next.match, subsUsed: 0 };
      show('prematch');
      renderPrematch();
    });
    $('#bid-cancel')?.addEventListener('click', () => closeBidModal());
    $('#bid-close')?.addEventListener('click', () => closeBidModal());
    $('#bid-scrim')?.addEventListener('click', () => closeBidModal());
    $('#bid-submit')?.addEventListener('click', () => {
      if (!bidEntryId) return;
      const amount = Number($('#bid-amount').value) || 0;
      const wage = Number($('#bid-wage').value) || 0;
      const r = S().makeOffer(bidEntryId, amount, false, wage);
      toast(r.msg);
      if (r.ok) closeBidModal();
      else if (r.counter) {
        $('#bid-counter').hidden = false;
        $('#bid-counter').textContent = 'Принять контр ' + S().money(r.counter);
        if (r.wageAsk) $('#bid-wage').value = Math.round(r.wageAsk * 1.05);
      }
      renderTransfers('market');
    });
    $('#bid-counter')?.addEventListener('click', () => {
      if (!bidEntryId) return;
      const counter = (S().pendingCounters() || {})[bidEntryId];
      if (!counter) return;
      const wage = Number($('#bid-wage').value) || (S().pendingWage() || {})[bidEntryId] || 0;
      const r = S().makeOffer(bidEntryId, counter, false, wage);
      toast(r.msg);
      if (r.ok) closeBidModal();
      renderTransfers('market');
    });
    $('#transfer-tabs')?.addEventListener('click', (e) => {
      const tab = e.target.closest('.tab');
      if (tab) renderTransfers(tab.dataset.tab);
    });
    $('#stats-tabs')?.addEventListener('click', (e) => {
      const tab = e.target.closest('.tab');
      if (tab) { statsTab = tab.dataset.stab; renderStats(); }
    });
    $('#calendar-tabs')?.addEventListener('click', (e) => {
      const tab = e.target.closest('[data-cal]');
      if (tab) { calendarTab = tab.dataset.cal; renderCalendar(); }
    });
    $('#history-tabs')?.addEventListener('click', (e) => {
      const tab = e.target.closest('[data-hist]');
      if (tab) { historyTab = tab.dataset.hist; renderHistory(); }
    });
    ['tf-q','tf-pos','tf-league','tf-ovr','tf-price','tf-age'].forEach(id => {
      $(`#${id}`)?.addEventListener('input', () => renderTransfers('market'));
      $(`#${id}`)?.addEventListener('change', () => renderTransfers('market'));
    });
    $('#btn-youth-best')?.addEventListener('click', () => {
      const r = S().promoteYouth();
      $('#youth-msg').textContent = r.msg; toast(r.msg);
      if (r.ok) renderYouth();
    });
    $('#btn-reset')?.addEventListener('click', async () => {
      if (!isAdminUser()) {
        toast('Сброс карьеры игрокам недоступен. Одна команда на аккаунт.');
        return;
      }
      if (!confirm('Админ: удалить карьеру этого аккаунта на сервере?')) return;
      try {
        await fetch(A().apiBase() + 'api/career', {
          method: 'DELETE',
          headers: A().headers(true),
          body: JSON.stringify({})
        }).then(async (res) => {
          const data = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(data.error || 'Ошибка');
        });
        S().clear();
        cloudHasCareer = false;
        if (A().getUser()) A().getUser().teamBound = false;
        toast('Карьера снята (админ)');
        show('lobby');
      } catch (err) {
        toast(err.message || 'Не удалось сбросить');
      }
    });
    $('#online-cups-tabs')?.addEventListener('click', (e) => {
      const tab = e.target.closest('[data-oc]');
      if (!tab) return;
      onlineCupsTab = tab.dataset.oc;
      renderOnlineCups();
    });

    $('#admin-tabs')?.addEventListener('click', (e) => {
      const tab = e.target.closest('[data-ad]');
      if (!tab) return;
      adminTab = tab.dataset.ad;
      renderAdmin();
    });

    $('#admin-tick')?.addEventListener('click', async () => {
      try {
        const r = await O().adminTick();
        toast(`Тик: ${ (r.results || []).length } действий`);
        renderAdmin();
      } catch (err) { toast(err.message || 'Ошибка тика'); }
    });
    $('#admin-bots')?.addEventListener('click', async () => {
      try {
        const r = await O().adminEnsureBots();
        toast(`Ботов: ${r.count}`);
        renderAdmin();
      } catch (err) { toast(err.message || 'Ошибка'); }
    });
    $('#admin-refresh')?.addEventListener('click', () => renderAdmin());
    $('#admin-cup-create')?.addEventListener('click', async () => {
      try {
        const size = Number($('#admin-cup-size')?.value || 8);
        const bracketId = $('#admin-cup-bracket')?.value || 'l1_2';
        const delay = Math.max(0, Number($('#admin-cup-delay')?.value || 60)) * 1000;
        await O().adminCreateCup({ size, bracketId, startInMs: delay });
        toast('Кубок создан');
        adminTab = 'cups';
        renderAdmin();
      } catch (err) { toast(err.message || 'Не удалось создать'); }
    });

    document.body.addEventListener('click', (e) => {
      const curBtn = e.target.closest('[data-cur]');
      if (curBtn && curBtn.classList.contains('cur-btn')) {
        applyCurrency(curBtn.dataset.cur);
        e.stopPropagation();
      }
      const req = e.target.closest('[data-req]');
      if (req) {
        const r = S().resolvePlayerRequest(req.dataset.req, req.dataset.reqAct || 'dismiss');
        toast(r.msg);
        renderInbox();
        e.stopPropagation();
      }
      const openCup = e.target.closest('[data-cup-open]');
      if (openCup) {
        onlineCupId = openCup.dataset.cupOpen;
        show('cupdetail');
        e.stopPropagation();
        return;
      }
      const joinBtn = e.target.closest('[data-cup-join]');
      if (joinBtn) {
        (async () => {
          try {
            const club = S().get() ? S().club()?.name : null;
            const strength = careerXiStrength();
            const r = await O().joinCup(joinBtn.dataset.cupJoin, club, strength);
            toast(r.started ? (r.cup?.status === 'live' ? 'Кубок стартовал — идёт сетка!' : 'Кубок стартовал!') : 'Вы в кубке');
            try { await A().refreshMe(); } catch {}
            onlineCupId = joinBtn.dataset.cupJoin;
            renderCupDetail();
          } catch (err) { toast(err.message || 'Не удалось вступить'); }
        })();
        e.stopPropagation();
        return;
      }
      const leaveBtn = e.target.closest('[data-cup-leave]');
      if (leaveBtn) {
        (async () => {
          try {
            await O().leaveCup(leaveBtn.dataset.cupLeave);
            toast('Вы вышли из кубка');
            renderCupDetail();
          } catch (err) { toast(err.message || 'Не удалось выйти'); }
        })();
        e.stopPropagation();
        return;
      }
      const startBtn = e.target.closest('[data-admin-start]');
      if (startBtn) {
        (async () => {
          try {
            const r = await O().adminStartCup(startBtn.dataset.adminStart);
            toast(r.action === 'started' ? (r.status === 'live' ? 'Кубок live' : 'Кубок запущен') : (r.action === 'archived' ? 'В архив (нет людей)' : 'Готово'));
            renderAdmin();
          } catch (err) { toast(err.message || 'Ошибка старта'); }
        })();
        e.stopPropagation();
        return;
      }
      const advBtn = e.target.closest('[data-admin-adv]');
      if (advBtn) {
        (async () => {
          try {
            const r = await O().adminAdvanceCup(advBtn.dataset.adminAdv);
            toast(r.action === 'finished' ? 'Кубок завершён' : `Раунд: ${r.round || 'ok'}`);
            renderAdmin();
          } catch (err) { toast(err.message || 'Ошибка раунда'); }
        })();
        e.stopPropagation();
        return;
      }
      const finBtn = e.target.closest('[data-admin-fin]');
      if (finBtn) {
        (async () => {
          try {
            await O().adminFinishCup(finBtn.dataset.adminFin);
            toast('Кубок доигран');
            renderAdmin();
          } catch (err) { toast(err.message || 'Ошибка'); }
        })();
        e.stopPropagation();
        return;
      }
      const delBtn = e.target.closest('[data-admin-del]');
      if (delBtn) {
        (async () => {
          try {
            await O().adminDeleteCup(delBtn.dataset.adminDel);
            toast('Кубок удалён');
            renderAdmin();
          } catch (err) { toast(err.message || 'Ошибка удаления'); }
        })();
        e.stopPropagation();
        return;
      }
      const lvlBtn = e.target.closest('[data-admin-lvl]');
      if (lvlBtn) {
        (async () => {
          try {
            await O().adminSetLevel(lvlBtn.dataset.adminLvl, Number(lvlBtn.dataset.lvl));
            toast('Уровень обновлён');
            renderAdmin();
          } catch (err) { toast(err.message || 'Ошибка'); }
        })();
        e.stopPropagation();
      }
    });
  }

  async function cloudSave(silent = false, opts = {}) {
    const st = S().get();
    if (!st) return silent ? null : toast('Нет карьеры');
    if (!A().isLoggedIn()) return silent ? null : toast('Войдите в аккаунт');
    try {
      await A().saveCareer(st, opts);
      cloudHasCareer = true;
      if (A().getUser()) A().getUser().teamBound = true;
      return true;
    } catch (err) {
      if (!silent) toast(err.message || 'Сервер недоступен');
      return null;
    }
  }

  function scheduleCloudSave() {
    if (!A().isLoggedIn() || !S().get()) return;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => cloudSave(true), 1800);
  }

  async function boot() {
    bind();
    window.EYE_ON_SAVE = () => scheduleCloudSave();
    const fill = $('#boot-fill');
    for (let i = 0; i <= 100; i += 4) {
      fill.style.width = i + '%';
      await E().sleep(16);
    }
    const me = await A().refreshMe();
    cloudHasCareer = !!me?.hasCareer;
    lastMePayload = me;
    if (A().isLoggedIn()) {
      await syncCareerFromCloud();
      toast('С возвращением');
    }
    show('home');
  }

  return { show, toast, boot, refresh };
})();

/* EYE XI — 11x11-style client */
(() => {
  const A = () => window.EYE_API;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];

  let state = {
    section: 'cabinet',
    tab: 'main',
    me: null,
    club: null,
    cache: {}
  };

  const TABS = {
    cabinet: [
      ['main', 'Главная'],
      ['finance', 'Финансы'],
      ['mail', 'События']
    ],
    team: [
      ['formation', 'Построение'],
      ['stadium', 'Стадион'],
      ['colors', 'Клуб']
    ],
    players: [
      ['squad', 'Состав'],
      ['train', 'Тренировки'],
      ['recover', 'Восстановление']
    ],
    matches: [
      ['friendly', 'Товарищеские'],
      ['cups', 'Кубки'],
      ['history', 'Архив']
    ],
    tactics: [
      ['setup', 'Настройки']
    ],
    bonus: [
      ['shop', 'Бустеры']
    ],
    rating: [
      ['board', 'Таблица']
    ]
  };

  function money(n) {
    return new Intl.NumberFormat('ru-RU').format(Math.round(n || 0)) + ' ¤';
  }

  function toast(msg) {
    const el = $('#toast');
    el.textContent = msg;
    el.hidden = false;
    clearTimeout(toast._t);
    toast._t = setTimeout(() => { el.hidden = true; }, 2600);
  }

  function openModal(html) {
    $('#modal-card').innerHTML = html;
    $('#modal').hidden = false;
  }
  function closeModal() { $('#modal').hidden = true; }

  function tickClock() {
    const d = new Date();
    $('#clock').textContent = d.toTimeString().slice(0, 5);
  }

  function setNavActive() {
    $$('.side-links button, .topnav-main button').forEach((b) => {
      b.classList.toggle('active', b.dataset.nav === state.section);
    });
  }

  function renderSubnav() {
    const tabs = TABS[state.section] || [];
    const box = $('#subnav');
    if (!tabs.length) { box.innerHTML = ''; return; }
    if (!tabs.some((t) => t[0] === state.tab)) state.tab = tabs[0][0];
    box.innerHTML = tabs.map(([id, label]) =>
      `<button type="button" data-tab="${id}" class="${id === state.tab ? 'active' : ''}">${label}</button>`
    ).join('');
  }

  function paintSidebar() {
    const u = state.me?.user || A().getUser();
    const club = state.me?.club || state.club;
    $('#side-club').textContent = club?.name || 'Клуб';
    const lvl = u?.level || 1;
    const xp = u?.xp || 0;
    const thr = [0, 0, 100, 250, 500, 900, 1500, 2400, 3600, 5200, 7500];
    const floor = thr[lvl] || 0;
    const ceil = thr[lvl + 1] || floor + 1;
    const pct = lvl >= 10 ? 100 : Math.max(0, Math.min(100, Math.round(((xp - floor) / Math.max(1, ceil - floor)) * 100)));
    $('#side-user').innerHTML = `
      <strong>${u?.name || u?.login || 'Менеджер'}</strong>
      <small>@${u?.login || '—'} · ур. ${lvl}</small>
      <div class="level-bar"><i style="width:${pct}%"></i></div>`;
    $('#side-wallet').innerHTML = `
      <div class="row"><span>Деньги</span><b>${money(u?.money)}</b></div>
      <div class="row"><span>Опыт</span><b>${money(u?.xp).replace(' ¤','')}</b></div>
      <div class="row"><span>Фанаты</span><b>${money(u?.fans).replace(' ¤','')}</b></div>
      <div class="row"><span>Очки</span><b>${u?.points || 0}</b></div>
      <div class="row"><span>Бустеры</span><b>${u?.boosters || 0}</b></div>`;
    $('#side-online').textContent = state.me?.online ?? '—';
  }

  async function refreshMe() {
    const data = await A().me();
    if (!data) return null;
    state.me = data;
    state.club = data.club;
    paintSidebar();
    return data;
  }

  function pitchHtml(club) {
    if (!club) return '';
    const slots = {
      '4-4-2': [[50,12],[18,28],[38,30],[62,30],[82,28],[18,52],[38,55],[62,55],[82,52],[38,78],[62,78]],
      '4-3-3': [[50,12],[18,28],[38,30],[62,30],[82,28],[30,52],[50,55],[70,52],[18,78],[50,80],[82,78]],
      '3-5-2': [[50,12],[30,28],[50,30],[70,28],[14,52],[34,55],[50,50],[66,55],[86,52],[38,80],[62,80]],
      '4-2-3-1': [[50,12],[18,28],[38,30],[62,30],[82,28],[35,48],[65,48],[18,66],[50,64],[82,66],[50,84]]
    };
    const form = slots[club.formation] || slots['4-4-2'];
    const xi = (club.lineupIds || []).map((id) => club.players.find((p) => p.id === id)).filter(Boolean);
    return `<div class="pitch">${xi.map((p, i) => {
      const [x, y] = form[i] || [50, 50];
      return `<div class="player-chip" style="left:${x}%;top:${y}%"><b>${p.pos}</b>${p.name.split(' ').pop()}<div>${p.effective || p.mastery}</div></div>`;
    }).join('')}</div>`;
  }

  async function renderCabinet() {
    const club = state.club;
    const u = state.me?.user;
    if (state.tab === 'finance') {
      $('#view').innerHTML = `
        <div class="grid-3">
          <div class="stat-card"><span>Баланс</span><b>${money(u?.money)}</b></div>
          <div class="stat-card"><span>Фанаты</span><b>${money(u?.fans).replace(' ¤','')}</b></div>
          <div class="stat-card"><span>Зарплаты / нед</span><b>${money((club?.players || []).reduce((s, p) => s + (p.wage || 0), 0))}</b></div>
        </div>
        <section class="panel">
          <h3>Финансы клуба</h3>
          <p class="hint">Доход идёт с товарищеских и кубков. Победа — до 45 000 ¤, ничья — 18 000 ¤.</p>
        </section>`;
      return;
    }
    if (state.tab === 'mail') {
      const events = state.me?.cupEvents || [];
      $('#view').innerHTML = `
        <section class="panel">
          <h3>События</h3>
          <div class="list">${events.length ? events.map((e) => `
            <div class="list-row"><div><strong>${e.title || e.type}</strong><small>${e.body || ''}</small></div><small>${new Date(e.at || Date.now()).toLocaleString('ru-RU')}</small></div>
          `).join('') : '<p class="hint">Пока тихо — сыграйте матч или вступите в кубок.</p>'}</div>
        </section>`;
      return;
    }
    $('#view').innerHTML = `
      <div class="hero-strip">
        <div class="club-banner" style="--club:${club?.color || '#1fa65a'}">
          <h2>${club?.name || 'Клуб'}</h2>
          <p>Сила состава ${club?.strength || '—'} · схема ${club?.formation || '4-4-2'} · ${club?.stadium || 'Стадион'}</p>
          <div style="margin-top:16px;display:flex;gap:8px;flex-wrap:wrap">
            <button class="btn btn-primary btn-tiny" data-nav="matches">К матчам</button>
            <button class="btn btn-tiny" data-nav="players">Состав</button>
          </div>
        </div>
        <section class="panel">
          <h3>Сводка</h3>
          <div class="grid-3" style="grid-template-columns:1fr 1fr">
            <div class="stat-card"><span>Уровень</span><b>${u?.level || 1}</b></div>
            <div class="stat-card"><span>Кубки</span><b>${u?.cupsWon || 0}/${u?.cupsPlayed || 0}</b></div>
            <div class="stat-card"><span>Слава</span><b>${u?.fame || 0}</b></div>
            <div class="stat-card"><span>Престиж</span><b>${u?.prestige || 0}</b></div>
          </div>
          <p class="hint" style="margin:14px 0 0">Добро пожаловать в EYE XI. Выберите соперника в товарищеских или вступите в кубок своего уровня.</p>
        </section>
      </div>
      <section class="panel">
        <div class="panel-head"><h3>Состав на поле</h3><span class="badge">${club?.formation}</span></div>
        ${pitchHtml(club)}
      </section>`;
  }

  async function renderTeam() {
    const club = state.club;
    if (state.tab === 'stadium') {
      $('#view').innerHTML = `
        <section class="panel">
          <h3>${club.stadium}</h3>
          <div class="grid-3">
            <div class="stat-card"><span>Уровень</span><b>${club.stadiumLevel || 1}</b></div>
            <div class="stat-card"><span>Вместимость</span><b>${money(club.capacity || 8000).replace(' ¤','')}</b></div>
            <div class="stat-card"><span>Фанаты</span><b>${money(state.me?.user?.fans).replace(' ¤','')}</b></div>
          </div>
          <p class="hint" style="margin-top:12px">Стадион растёт вместе с фан-базой. Играйте матчи — болельщики приходят на хорошую игру.</p>
        </section>`;
      return;
    }
    if (state.tab === 'colors') {
      $('#view').innerHTML = `
        <section class="panel">
          <h3>Клубные настройки</h3>
          <form class="form-grid" id="form-club">
            <label>Название<input name="name" value="${club.name || ''}" maxlength="32" /></label>
            <label>Аббревиатура<input name="short" value="${club.short || ''}" maxlength="4" /></label>
            <label>Стадион<input name="stadium" value="${club.stadium || ''}" maxlength="40" /></label>
            <label>Цвет<input name="color" type="color" value="${club.color || '#1fa65a'}" /></label>
            <button class="btn btn-primary" type="submit">Сохранить</button>
          </form>
        </section>`;
      return;
    }
    $('#view').innerHTML = `
      <div class="grid-2">
        <section class="panel">
          <div class="panel-head"><h3>Построение</h3><span class="badge">${club.formation}</span></div>
          ${pitchHtml(club)}
        </section>
        <section class="panel">
          <h3>Схема</h3>
          <form class="form-grid" id="form-formation">
            <label>Формация
              <select name="formation">
                ${['4-4-2','4-3-3','3-5-2','4-2-3-1'].map((f) => `<option value="${f}" ${club.formation===f?'selected':''}>${f}</option>`).join('')}
              </select>
            </label>
            <button class="btn btn-primary" type="submit">Применить</button>
          </form>
          <p class="hint">Игроки подбираются автоматически под позиции схемы с учётом мастерства и готовности.</p>
        </section>
      </div>`;
  }

  async function renderPlayers() {
    const club = state.club;
    const players = [...(club.players || [])].sort((a, b) => (b.effective || 0) - (a.effective || 0));
    if (state.tab === 'recover') {
      $('#view').innerHTML = `
        <section class="panel">
          <h3>Восстановление</h3>
          <p class="hint">Восстановить физическую готовность и ускорить лечение — 15 000 ¤</p>
          <button class="btn btn-primary" id="btn-recover">Восстановить состав</button>
        </section>
        <section class="panel">
          <div class="table-wrap"><table class="sheet"><thead><tr><th>Игрок</th><th>Физа</th><th>Травма</th></tr></thead>
          <tbody>${players.map((p) => `<tr><td>${p.name}</td><td>${p.fitness}%</td><td>${p.injuredHours ? p.injuredHours + 'ч' : '—'}</td></tr>`).join('')}</tbody></table></div>
        </section>`;
      return;
    }
    if (state.tab === 'train') {
      $('#view').innerHTML = `
        <section class="panel">
          <h3>Тренировки</h3>
          <p class="hint">Опыт копится в матчах. Распределите его в умения. Потолок зависит от тренера.</p>
          <div class="list">${players.map((p) => `
            <div class="list-row">
              <div>
                <strong>${p.name} · ${p.pos}</strong>
                <small>Мастерство ${p.mastery} · опыт ${p.xpPool || 0} · талант ${p.talent}</small>
              </div>
              <button class="btn btn-tiny" data-train="${p.id}">Качать</button>
            </div>`).join('')}</div>
        </section>`;
      return;
    }
    $('#view').innerHTML = `
      <section class="panel">
        <div class="panel-head"><h3>Состав</h3><span class="badge">${players.length} игроков</span></div>
        <div class="table-wrap"><table class="sheet">
          <thead><tr><th>Имя</th><th>Поз</th><th>Возр</th><th>Маст</th><th>Эфф</th><th>Физа</th><th>Мораль</th><th>Опыт</th></tr></thead>
          <tbody>${players.map((p) => `
            <tr>
              <td><strong>${p.name}</strong></td>
              <td><span class="badge">${p.pos}</span></td>
              <td>${p.age}</td>
              <td>${p.mastery}</td>
              <td><b>${p.effective}</b></td>
              <td>${p.fitness}%${p.injuredHours ? ' <span class="badge danger">травма</span>' : ''}</td>
              <td>${p.morale > 0 ? '+' : ''}${p.morale}</td>
              <td>${p.xpPool || 0}</td>
            </tr>`).join('')}</tbody>
        </table></div>
      </section>`;
  }

  async function renderMatches() {
    if (state.tab === 'history') {
      const data = await A().request('api/matches');
      const list = data.matches || [];
      $('#view').innerHTML = `
        <section class="panel">
          <h3>Архив матчей</h3>
          <div class="list">${list.length ? list.map((m) => `
            <div class="list-row">
              <div>
                <strong>${m.home?.name} ${m.score?.[0]}:${m.score?.[1]} ${m.away?.name}</strong>
                <small>${m.competition || 'match'} · ${new Date(m.createdAt).toLocaleString('ru-RU')}</small>
              </div>
              <button class="btn btn-tiny" data-match="${m.id}">Отчёт</button>
            </div>`).join('') : '<p class="hint">Матчей пока нет</p>'}</div>
        </section>`;
      return;
    }
    if (state.tab === 'cups') {
      const data = await A().request('api/cups?status=open');
      const cups = data.cups || [];
      const live = state.me?.liveCup;
      $('#view').innerHTML = `
        ${live ? `<section class="panel"><div class="panel-head"><h3>Ваш кубок идёт</h3><button class="btn btn-primary btn-tiny" data-cup="${live.id}">Открыть</button></div>
          <p>${live.name} · ${live.round || 'раунд'}</p></section>` : ''}
        <section class="panel">
          <div class="panel-head"><h3>Открытые кубки</h3><span class="badge">автостарт</span></div>
          <p class="hint">Кубки создаются по уровням. Если нет живых игроков к старту — кубок уходит в архив.</p>
          <div class="list">${cups.length ? cups.map((c) => `
            <div class="list-row">
              <div>
                <strong>${c.name}</strong>
                <small>${c.bracketLabel || c.bracketId || ''} · ${c.entrantsCount || c.humans || 0}/${c.size} · старт ${c.startAt ? new Date(c.startAt).toLocaleTimeString('ru-RU') : 'скоро'}</small>
              </div>
              <div style="display:flex;gap:6px">
                <button class="btn btn-tiny" data-cup="${c.id}">Карточка</button>
                <button class="btn btn-primary btn-tiny" data-cup-join="${c.id}">Вступить</button>
              </div>
            </div>`).join('') : '<p class="hint">Сейчас нет открытых кубков — загляните чуть позже</p>'}</div>
        </section>`;
      return;
    }
    const data = await A().request('api/friendly');
    const queue = (data.queue || []).filter((q) => q.userId !== A().getUser()?.id);
    $('#view').innerHTML = `
      <section class="panel">
        <div class="panel-head">
          <h3>Товарищеские</h3>
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            <button class="btn btn-primary btn-tiny" id="btn-friendly-post">Подать заявку</button>
            <button class="btn btn-tiny" id="btn-friendly-bot">Играть с ботом</button>
          </div>
        </div>
        <p class="hint">Вызовите менеджера из очереди или сыграйте быстрый матч с ботом для тренировки.</p>
        <div class="list">${queue.length ? queue.map((q) => `
          <div class="list-row">
            <div>
              <strong>${q.clubName}</strong>
              <small>@${q.login} · ур. ${q.level} · сила ${q.strength}</small>
            </div>
            <button class="btn btn-primary btn-tiny" data-accept="${q.id}">Принять</button>
          </div>`).join('') : '<p class="hint">Очередь пуста — подайте заявку первым</p>'}</div>
      </section>
      <section class="panel">
        <h3>Онлайн сейчас</h3>
        <div class="list">${(data.online || []).slice(0, 12).map((u) => `
          <div class="list-row"><div><strong>${u.clubName || u.name}</strong><small>@${u.login} · ур. ${u.level}</small></div><span class="badge">online</span></div>
        `).join('') || '<p class="hint">Никого нет в сети</p>'}</div>
      </section>`;
  }

  async function renderTactics() {
    const club = state.club;
    $('#view').innerHTML = `
      <div class="grid-2">
        <section class="panel">
          <h3>Тактика на матч</h3>
          <form class="form-grid" id="form-tactics">
            <label>Стиль
              <select name="style">
                ${[['balance','Баланс'],['attack','Атака'],['defend','Оборона'],['press','Прессинг'],['counter','Контратака']].map(([v,l]) =>
                  `<option value="${v}" ${club.style===v?'selected':''}>${l}</option>`).join('')}
              </select>
            </label>
            <label>Формация
              <select name="formation">
                ${['4-4-2','4-3-3','3-5-2','4-2-3-1'].map((f) => `<option value="${f}" ${club.formation===f?'selected':''}>${f}</option>`).join('')}
              </select>
            </label>
            <button class="btn btn-primary" type="submit">Сохранить тактику</button>
          </form>
          <p class="hint">Атака и прессинг дают больше моментов, но сильнее жгут физическую готовность.</p>
        </section>
        <section class="panel">
          <h3>Превью</h3>
          ${pitchHtml(club)}
        </section>
      </div>`;
  }

  async function renderBonus() {
    $('#view').innerHTML = `
      <section class="panel">
        <h3>Бустеры</h3>
        <p class="hint">У вас ${state.me?.user?.boosters || 0} бустеров. В EYE XI бустеры — косметика и удобство, без pay-to-win в кубках.</p>
        <div class="grid-3">
          <div class="stat-card"><span>VIP</span><b>скоро</b></div>
          <div class="stat-card"><span>Смена эмблемы</span><b>скоро</b></div>
          <div class="stat-card"><span>Ускорение лечения</span><b>скоро</b></div>
        </div>
      </section>`;
  }

  async function renderRating() {
    const data = await A().request('api/rating');
    const leaders = data.leaders || [];
    $('#view').innerHTML = `
      <section class="panel">
        <h3>Рейтинг менеджеров</h3>
        <div class="table-wrap"><table class="sheet">
          <thead><tr><th>#</th><th>Менеджер</th><th>Клуб</th><th>Ур.</th><th>Очки</th><th>Сила</th></tr></thead>
          <tbody>${leaders.map((u, i) => `
            <tr>
              <td>${i + 1}</td>
              <td><strong>${u.name || u.login}</strong></td>
              <td>${u.clubName || '—'}</td>
              <td>${u.level}</td>
              <td><b>${u.points || 0}</b></td>
              <td>${u.strength || '—'}</td>
            </tr>`).join('')}</tbody>
        </table></div>
      </section>`;
  }

  async function render() {
    setNavActive();
    renderSubnav();
    paintSidebar();
    const view = $('#view');
    view.innerHTML = '<section class="panel"><p class="hint">Загрузка…</p></section>';
    try {
      if (state.section === 'cabinet') await renderCabinet();
      else if (state.section === 'team') await renderTeam();
      else if (state.section === 'players') await renderPlayers();
      else if (state.section === 'matches') await renderMatches();
      else if (state.section === 'tactics') await renderTactics();
      else if (state.section === 'bonus') await renderBonus();
      else if (state.section === 'rating') await renderRating();
    } catch (e) {
      view.innerHTML = `<section class="panel"><p class="hint">${e.message || 'Ошибка загрузки'}</p></section>`;
    }
  }

  function showMatch(match) {
    openModal(`
      <div class="panel-head">
        <h2 style="margin:0;font-family:Syne,sans-serif">${match.competition === 'friendly' ? 'Товарищеский' : match.competition}</h2>
        <button class="btn btn-tiny" id="modal-close">Закрыть</button>
      </div>
      <div class="match-score">
        <div class="team"><strong>${match.home?.name}</strong><div class="hint">сила ${match.home?.strength}</div></div>
        <div class="score">${match.score?.[0]}:${match.score?.[1]}</div>
        <div class="team"><strong>${match.away?.name}</strong><div class="hint">сила ${match.away?.strength}</div></div>
      </div>
      <h3>События</h3>
      <div class="events">${(match.events || []).map((e) => `
        <div class="event"><span class="min">${e.minute}'</span><span>⚽ ${e.side === 'home' ? match.home?.name : match.away?.name} — ${e.player} (${e.score?.[0]}:${e.score?.[1]})</span></div>
      `).join('') || '<p class="hint">Без голов</p>'}</div>
    `);
  }

  async function showCup(id) {
    const data = await A().request('api/cups/' + id);
    const c = data.cup;
    openModal(`
      <div class="panel-head">
        <h2 style="margin:0;font-family:Syne,sans-serif">${c.name}</h2>
        <button class="btn btn-tiny" id="modal-close">Закрыть</button>
      </div>
      <p class="hint">${c.bracketLabel || ''} · ${c.status} · ${c.size} команд</p>
      <div class="list">${(c.entrants || c.publicEntrants || []).map((e) => `
        <div class="list-row"><div><strong>${e.clubName || e.name || e.login}</strong><small>${e.isBot ? 'бот' : 'игрок'} · сила ${e.strength || '—'}</small></div></div>
      `).join('') || '<p class="hint">Пока никого</p>'}</div>
      <div style="margin-top:12px;display:flex;gap:8px">
        <button class="btn btn-primary" data-cup-join="${c.id}">Вступить</button>
        <button class="btn" data-cup-leave="${c.id}">Выйти</button>
      </div>
    `);
  }

  function showTrain(playerId) {
    const p = state.club.players.find((x) => x.id === playerId);
    if (!p) return;
    const skills = p.pos === 'Gk'
      ? [['save','Сейвы'],['reflex','Рефлекс'],['aerial','Воздух'],['distribution','Игра ногами']]
      : [['tackle','Отбор'],['mark','Опека'],['dribble','Дриблинг'],['control','Приём'],['stamina','Выносливость'],['pass','Пас'],['shotPower','Сила удара'],['shotAcc','Точность']];
    openModal(`
      <div class="panel-head"><h2 style="margin:0;font-family:Syne,sans-serif">${p.name}</h2><button class="btn btn-tiny" id="modal-close">Закрыть</button></div>
      <p class="hint">Опыт: ${p.xpPool || 0} · мастерство ${p.mastery}</p>
      <div class="list">${skills.map(([k, label]) => `
        <div class="list-row">
          <div><strong>${label}</strong><small>${p.skills?.[k] ?? '—'}</small></div>
          <button class="btn btn-tiny" data-skill="${k}" data-pid="${p.id}">+1 (8 опыта)</button>
        </div>`).join('')}</div>
    `);
  }

  function bind() {
    $('#btn-show-register')?.addEventListener('click', () => {
      $('#form-login').hidden = true;
      $('#form-register').hidden = false;
    });
    $('#btn-show-login')?.addEventListener('click', () => {
      $('#form-register').hidden = true;
      $('#form-login').hidden = false;
    });

    $('#form-login')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      $('#login-msg').textContent = 'Вход…';
      try {
        await A().login({ login: fd.get('login'), password: fd.get('password') });
        await enterGame();
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
          login: fd.get('login'),
          password: fd.get('password'),
          name: fd.get('name') || fd.get('login'),
          clubName: fd.get('clubName')
        });
        await enterGame();
      } catch (err) {
        $('#register-msg').textContent = err.message;
      }
    });

    document.addEventListener('click', async (e) => {
      const nav = e.target.closest('[data-nav]');
      if (nav && (nav.closest('.side-links') || nav.closest('.topnav') || nav.closest('#view'))) {
        state.section = nav.dataset.nav;
        state.tab = (TABS[state.section] || [['main']])[0][0];
        render();
        return;
      }
      const tab = e.target.closest('[data-tab]');
      if (tab) {
        state.tab = tab.dataset.tab;
        render();
        return;
      }
      if (e.target.id === 'modal-close' || e.target.id === 'modal') {
        if (e.target.id === 'modal' && e.target !== e.currentTarget) return;
        closeModal();
      }
      if (e.target.id === 'btn-logout') {
        await A().logout();
        location.reload();
      }
      if (e.target.id === 'btn-friendly-post') {
        try {
          await A().request('api/friendly', { method: 'POST' });
          toast('Заявка в очереди');
          render();
        } catch (err) { toast(err.message); }
      }
      if (e.target.id === 'btn-friendly-bot') {
        try {
          const data = await A().request('api/friendly/bot', { method: 'POST' });
          await refreshMe();
          showMatch(data.match);
          toast('Матч сыгран');
        } catch (err) { toast(err.message); }
      }
      const acc = e.target.closest('[data-accept]');
      if (acc) {
        try {
          const data = await A().request('api/friendly/' + acc.dataset.accept + '/accept', { method: 'POST' });
          await refreshMe();
          showMatch(data.match);
        } catch (err) { toast(err.message); }
      }
      const mid = e.target.closest('[data-match]');
      if (mid) {
        const data = await A().request('api/matches/' + mid.dataset.match);
        showMatch(data.match);
      }
      const cup = e.target.closest('[data-cup]');
      if (cup) showCup(cup.dataset.cup);
      const join = e.target.closest('[data-cup-join]');
      if (join) {
        try {
          await A().request('api/cups/' + join.dataset.cupJoin + '/join', { method: 'POST' });
          toast('Вы в кубке');
          closeModal();
          await refreshMe();
          render();
        } catch (err) { toast(err.message); }
      }
      const leave = e.target.closest('[data-cup-leave]');
      if (leave) {
        try {
          await A().request('api/cups/' + leave.dataset.cupLeave + '/leave', { method: 'POST' });
          toast('Вы вышли из кубка');
          closeModal();
          render();
        } catch (err) { toast(err.message); }
      }
      const train = e.target.closest('[data-train]');
      if (train) showTrain(train.dataset.train);
      const skill = e.target.closest('[data-skill]');
      if (skill) {
        try {
          const data = await A().request('api/players/train', {
            method: 'POST',
            body: { playerId: skill.dataset.pid, skill: skill.dataset.skill, amount: 1 }
          });
          state.club = data.club;
          toast('Умение прокачано');
          showTrain(skill.dataset.pid);
        } catch (err) { toast(err.message); }
      }
      if (e.target.id === 'btn-recover') {
        try {
          const data = await A().request('api/players/recover', { method: 'POST' });
          state.club = data.club;
          state.me.user = data.user;
          A().setUser(data.user);
          paintSidebar();
          toast('Состав восстановлен');
          render();
        } catch (err) { toast(err.message); }
      }
    });

    document.addEventListener('submit', async (e) => {
      if (e.target.id === 'form-club' || e.target.id === 'form-formation' || e.target.id === 'form-tactics') {
        e.preventDefault();
        const fd = new FormData(e.target);
        const body = Object.fromEntries(fd.entries());
        try {
          const data = await A().request('api/club', { method: 'POST', body });
          state.club = data.club;
          toast('Сохранено');
          await refreshMe();
          render();
        } catch (err) { toast(err.message); }
      }
    });

    $('#modal')?.addEventListener('click', (e) => {
      if (e.target.id === 'modal') closeModal();
    });
  }

  async function enterGame() {
    $('#gate').hidden = true;
    $('#app').hidden = false;
    await refreshMe();
    state.section = 'cabinet';
    state.tab = 'main';
    render();
    toast('Добро пожаловать в EYE XI');
  }

  async function boot() {
    bind();
    tickClock();
    setInterval(tickClock, 15000);
    try {
      const health = await fetch(A().apiBase() + 'api/health').then((r) => r.json());
      if (health?.online != null) $('#stat-online').textContent = health.online;
    } catch {}
    if (A().isLoggedIn()) {
      const me = await A().me();
      if (me) await enterGame();
    }
  }

  boot();
})();

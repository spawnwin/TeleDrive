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
    cache: {},
    cupPoll: null,
    watchingCup: null
  };

  const EVENT_LABELS = {
    cup_started: 'Кубок стартовал',
    cup_out: 'Вылет из кубка',
    cup_won: 'Победа в кубке',
    cup_done: 'Кубок завершён'
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
      const ledger = club?.ledger || [];
      $('#view').innerHTML = `
        <div class="grid-3">
          <div class="stat-card"><span>Баланс</span><b>${money(u?.money)}</b></div>
          <div class="stat-card"><span>Фанаты</span><b>${money(u?.fans).replace(' ¤','')}</b></div>
          <div class="stat-card"><span>Зарплаты / нед</span><b>${money((club?.players || []).reduce((s, p) => s + (p.wage || 0), 0))}</b></div>
        </div>
        <section class="panel">
          <h3>Движение средств</h3>
          <p class="hint">Товарищеские: победа 45 000 · ничья 18 000 · поражение 8 000. Кубки дают призовые и очки рейтинга.</p>
          <div class="list">${ledger.length ? ledger.map((row) => `
            <div class="list-row">
              <div><strong>${row.label}</strong><small>${new Date(row.at).toLocaleString('ru-RU')}</small></div>
              <b style="color:${row.delta >= 0 ? 'var(--grass-bright)' : 'var(--danger)'}">${row.delta >= 0 ? '+' : ''}${money(row.delta)}</b>
            </div>`).join('') : '<p class="hint">Пока нет операций — сыграйте матч</p>'}</div>
        </section>`;
      return;
    }
    if (state.tab === 'mail') {
      const events = state.me?.cupEvents || [];
      $('#view').innerHTML = `
        <section class="panel">
          <h3>События</h3>
          <div class="list">${events.length ? events.map((e) => `
            <div class="list-row"><div><strong>${e.title || EVENT_LABELS[e.type] || e.type}</strong><small>${e.cupName || e.body || ''}${e.xp ? ' · +' + e.xp + ' XP' : ''}${e.money ? ' · +' + money(e.money) : ''}</small></div><small>${new Date(e.at || Date.now()).toLocaleString('ru-RU')}</small></div>
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
      const lvl = club.stadiumLevel || 1;
      const cost = 100000 * lvl;
      $('#view').innerHTML = `
        <section class="panel">
          <div class="panel-head"><h3>${club.stadium}</h3><button class="btn btn-primary btn-tiny" id="btn-stadium" ${lvl >= 8 ? 'disabled' : ''}>Улучшить · ${money(cost)}</button></div>
          <div class="grid-3">
            <div class="stat-card"><span>Уровень</span><b>${lvl} / 8</b></div>
            <div class="stat-card"><span>Вместимость</span><b>${money(club.capacity || 8000).replace(' ¤','')}</b></div>
            <div class="stat-card"><span>Фанаты</span><b>${money(state.me?.user?.fans).replace(' ¤','')}</b></div>
          </div>
          <p class="hint" style="margin-top:12px">Каждый уровень увеличивает вместимость и привлекает болельщиков.</p>
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
    const sorted = [...(club.players || [])].sort((a, b) => (b.effective || 0) - (a.effective || 0));
    const xi = new Set(club.lineupIds || []);
    $('#view').innerHTML = `
      <div class="grid-2">
        <section class="panel">
          <div class="panel-head"><h3>Построение</h3><span class="badge">${club.formation}</span></div>
          ${pitchHtml(club)}
        </section>
        <section class="panel">
          <h3>Схема и основа</h3>
          <form class="form-grid" id="form-formation">
            <label>Формация
              <select name="formation">
                ${['4-4-2','4-3-3','3-5-2','4-2-3-1'].map((f) => `<option value="${f}" ${club.formation===f?'selected':''}>${f}</option>`).join('')}
              </select>
            </label>
            <button class="btn btn-primary" type="submit">Автосостав по схеме</button>
          </form>
          <p class="hint">Отметьте ровно 11 игроков и сохраните основу вручную.</p>
          <div class="list" id="lineup-picker">${sorted.map((p) => `
            <label class="list-row" style="cursor:pointer">
              <div><strong>${p.name} · ${p.pos}</strong><small>эфф. ${p.effective} · физа ${p.fitness}%</small></div>
              <input type="checkbox" data-lineup-id="${p.id}" ${xi.has(p.id) ? 'checked' : ''} />
            </label>`).join('')}</div>
          <button class="btn btn-primary" id="btn-save-lineup" style="margin-top:12px">Сохранить основу</button>
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
          <p class="hint">15 000 ¤ или 1 бустер. Врач ускоряет восстановление в матчах.</p>
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            <button class="btn btn-primary" id="btn-recover">За 15 000 ¤</button>
            <button class="btn" id="btn-recover-boost">За бустер (${state.me?.user?.boosters || 0})</button>
          </div>
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
          <p class="hint">Опыт копится в матчах. Потолок умений: полевые ${club.skillCap || 20}, вратари ${club.gkSkillCap || 20}. Поднимите персонал в Бонусе.</p>
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
      const [openData, liveData, doneData] = await Promise.all([
        A().request('api/cups?status=open'),
        A().request('api/cups?status=live'),
        A().request('api/cups?status=finished')
      ]);
      const lvl = state.me?.user?.level || 1;
      const cups = (openData.cups || []).filter((c) => lvl >= (c.minLevel || 1) && lvl <= (c.maxLevel || 10));
      const liveAll = liveData.cups || [];
      const finished = (doneData.cups || []).slice(0, 8);
      const live = state.me?.liveCup;
      $('#view').innerHTML = `
        ${live ? `<section class="panel"><div class="panel-head"><h3>Ваш кубок идёт</h3><button class="btn btn-primary btn-tiny" data-cup="${live.id}">Смотреть</button></div>
          <p>${live.name} · ${live.round || 'раунд'}${live.nextRoundAt ? ' · следующий раунд ' + new Date(live.nextRoundAt).toLocaleTimeString('ru-RU') : ''}</p></section>` : ''}
        <section class="panel">
          <div class="panel-head"><h3>Кубки вашего уровня</h3><span class="badge">ур. ${lvl}</span></div>
          <p class="hint">Запись открыта до старта. Без живых игроков кубок уходит в архив.</p>
          <div class="list">${cups.length ? cups.map((c) => `
            <div class="list-row">
              <div>
                <strong>${c.name}</strong>
                <small>${c.bracketLabel || ''} · ${c.slotsFilled || c.entrantsCount || 0}/${c.size} · люди ${c.humans || 0} · старт ${c.startAt ? new Date(c.startAt).toLocaleTimeString('ru-RU') : 'скоро'}</small>
              </div>
              <div style="display:flex;gap:6px">
                <button class="btn btn-tiny" data-cup="${c.id}">Открыть</button>
                <button class="btn btn-primary btn-tiny" data-cup-join="${c.id}">Вступить</button>
              </div>
            </div>`).join('') : '<p class="hint">Нет открытых кубков вашего уровня — подождите тик</p>'}</div>
        </section>
        <section class="panel">
          <h3>Идут сейчас</h3>
          <div class="list">${liveAll.length ? liveAll.map((c) => `
            <div class="list-row">
              <div><strong>${c.name}</strong><small>${c.round || 'раунд'} · в сетке ${c.aliveCount || '—'}</small></div>
              <button class="btn btn-tiny" data-cup="${c.id}">Смотреть</button>
            </div>`).join('') : '<p class="hint">Сейчас никто не играет</p>'}</div>
        </section>
        <section class="panel">
          <h3>Недавние итоги</h3>
          <div class="list">${finished.length ? finished.map((c) => `
            <div class="list-row">
              <div><strong>${c.name}</strong><small>чемпион: ${c.champion?.clubName || c.champion?.name || '—'}</small></div>
              <button class="btn btn-tiny" data-cup="${c.id}">Отчёт</button>
            </div>`).join('') : '<p class="hint">Пока пусто</p>'}</div>
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
    const club = state.club;
    const staff = club?.staff || {};
    const boosters = state.me?.user?.boosters || 0;
    const staffRows = [
      ['coach', 'Тренер', staff.coach || 0, 5, 80000],
      ['gkCoach', 'Тренер вратарей', staff.gkCoach || 0, 5, 60000],
      ['scout', 'Скаут', staff.scout || 0, 3, 50000],
      ['medic', 'Врач', staff.medic || 0, 3, 45000]
    ];
    $('#view').innerHTML = `
      <section class="panel">
        <div class="panel-head"><h3>Бустеры</h3><span class="badge">${boosters} шт.</span></div>
        <p class="hint">Бустеры ускоряют развитие, но не покупают победы в кубках.</p>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px">
          <button class="btn btn-primary" id="btn-recover-boost">Восстановить состав · 1 бустер</button>
          <button class="btn" id="btn-xp-boost">+40 опыта лучшему игроку · 1 бустер</button>
        </div>
      </section>
      <section class="panel">
        <h3>Персонал</h3>
        <p class="hint">Тренер поднимает потолок умений полевых, тренер вратарей — голкиперов.</p>
        <div class="list">${staffRows.map(([role, label, cur, max, base]) => {
          const cost = base * (cur + 1);
          return `<div class="list-row">
            <div><strong>${label}</strong><small>ур. ${cur}/${max}${cur < max ? ' · следующий ' + money(cost) : ''}</small></div>
            <button class="btn btn-tiny" data-hire="${role}" ${cur >= max ? 'disabled' : ''}>Нанять</button>
          </div>`;
        }).join('')}</div>
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

  function stopCupPoll() {
    if (state.cupPoll) {
      clearInterval(state.cupPoll);
      state.cupPoll = null;
    }
    state.watchingCup = null;
  }

  function renderCupCard(c) {
    const statusLabel = c.status === 'open' ? 'набор' : c.status === 'live' ? 'идёт' : 'завершён';
    const ties = (c.history || []).slice().reverse().flatMap((h) =>
      (h.ties || []).map((t) => ({ ...t, round: h.round }))
    );
    const bracket = c.bracket || [];
    return `
      <div class="panel-head">
        <h2 style="margin:0;font-family:Syne,sans-serif">${c.name}</h2>
        <button class="btn btn-tiny" id="modal-close">Закрыть</button>
      </div>
      <p class="hint">${c.bracketLabel || ''} · <span class="badge">${statusLabel}</span> · ${c.slotsFilled || c.entrantsCount || 0}/${c.size}
        ${c.round ? ' · ' + c.round : ''}
        ${c.nextRoundAt && c.status === 'live' ? ' · след. раунд ' + new Date(c.nextRoundAt).toLocaleTimeString('ru-RU') : ''}
      </p>
      ${c.champion ? `<div class="stat-card" style="margin-bottom:12px"><span>Чемпион</span><b>${c.champion.clubName || c.champion.name}</b></div>` : ''}
      ${bracket.length ? `<h3>Текущая сетка</h3><div class="list">${bracket.map((t) => `
        <div class="list-row">
          <div><strong>${t.home?.clubName || t.home?.name} ${t.score ? t.score[0] + ':' + t.score[1] : 'vs'} ${t.away?.clubName || t.away?.name}</strong>
          <small>${t.score ? 'сыграно' : 'ожидание'}${t.matchId ? ' · есть отчёт' : ''}</small></div>
          ${t.matchId ? `<button class="btn btn-tiny" data-match="${t.matchId}">Отчёт</button>` : ''}
        </div>`).join('')}</div>` : ''}
      ${ties.length ? `<h3 style="margin-top:14px">История</h3><div class="list">${ties.slice(0, 16).map((t) => `
        <div class="list-row">
          <div><strong>${t.round}: ${t.home?.clubName || t.home?.name} ${t.score?.[0]}:${t.score?.[1]} ${t.away?.clubName || t.away?.name}</strong></div>
          ${t.matchId ? `<button class="btn btn-tiny" data-match="${t.matchId}">Отчёт</button>` : ''}
        </div>`).join('')}</div>` : ''}
      <h3 style="margin-top:14px">Участники</h3>
      <div class="list">${(c.entrants || []).map((e) => `
        <div class="list-row"><div><strong>${e.clubName || e.name}</strong><small>${e.isBot ? 'бот' : 'игрок'} · сила ${e.strength || '—'} · ур. ${e.level || '?'}${e.out ? ' · выбыл' : ''}</small></div>
        ${e.out ? '<span class="badge danger">out</span>' : '<span class="badge">in</span>'}</div>
      `).join('') || '<p class="hint">Пока никого</p>'}</div>
      <div style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap">
        ${c.status === 'open' ? `<button class="btn btn-primary" data-cup-join="${c.id}">Вступить</button>
        <button class="btn" data-cup-leave="${c.id}">Выйти</button>` : ''}
        ${c.status === 'live' ? '<span class="badge warn">автообновление</span>' : ''}
      </div>`;
  }

  async function showCup(id) {
    stopCupPoll();
    state.watchingCup = id;
    const data = await A().request('api/cups/' + id);
    openModal(renderCupCard(data.cup));
    if (data.cup.status === 'live') {
      state.cupPoll = setInterval(async () => {
        if (state.watchingCup !== id || $('#modal').hidden) {
          stopCupPoll();
          return;
        }
        try {
          const fresh = await A().request('api/cups/' + id);
          $('#modal-card').innerHTML = renderCupCard(fresh.cup);
          if (fresh.cup.status !== 'live') {
            stopCupPoll();
            await refreshMe();
          }
        } catch {}
      }, 3000);
    }
  }

  function closeModal() {
    stopCupPoll();
    $('#modal').hidden = true;
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
      if (e.target.id === 'btn-recover-boost') {
        try {
          const data = await A().request('api/players/recover', { method: 'POST', body: { booster: true } });
          state.club = data.club;
          state.me.user = data.user;
          A().setUser(data.user);
          paintSidebar();
          toast('Восстановлено за бустер');
          render();
        } catch (err) { toast(err.message); }
      }
      if (e.target.id === 'btn-xp-boost') {
        try {
          const best = [...(state.club?.players || [])].sort((a, b) => (b.effective || 0) - (a.effective || 0))[0];
          const data = await A().request('api/bonus/xp', { method: 'POST', body: { playerId: best?.id } });
          state.club = data.club;
          state.me.user = data.user;
          A().setUser(data.user);
          paintSidebar();
          toast('+40 опыта');
          render();
        } catch (err) { toast(err.message); }
      }
      if (e.target.id === 'btn-stadium') {
        try {
          const data = await A().request('api/club/stadium', { method: 'POST' });
          state.club = data.club;
          state.me.user = data.user;
          A().setUser(data.user);
          paintSidebar();
          toast('Стадион улучшен');
          render();
        } catch (err) { toast(err.message); }
      }
      if (e.target.id === 'btn-save-lineup') {
        const ids = $$('#lineup-picker [data-lineup-id]:checked').map((el) => el.dataset.lineupId);
        if (ids.length !== 11) {
          toast('Отметьте ровно 11 игроков');
          return;
        }
        try {
          const data = await A().request('api/club/lineup', { method: 'POST', body: { lineupIds: ids } });
          state.club = data.club;
          toast('Основа сохранена');
          render();
        } catch (err) { toast(err.message); }
      }
      const hire = e.target.closest('[data-hire]');
      if (hire && !hire.disabled) {
        try {
          const data = await A().request('api/club/staff', { method: 'POST', body: { role: hire.dataset.hire } });
          state.club = data.club;
          state.me.user = data.user;
          A().setUser(data.user);
          paintSidebar();
          toast('Персонал нанят');
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

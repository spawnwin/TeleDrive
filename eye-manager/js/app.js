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
    watchingCup: null,
    lastWageToast: null,
    lastChallengeToast: null,
    seenEventIds: new Set()
  };

  const EVENT_LABELS = {
    cup_started: 'Кубок стартовал',
    cup_out: 'Вылет из кубка',
    cup_won: 'Победа в кубке',
    cup_done: 'Кубок завершён',
    challenge_in: 'Входящий вызов',
    challenge_done: 'Вызов сыгран',
    challenge_declined: 'Вызов отклонён',
    friendly_done: 'Товарищеский сыгран',
    injury: 'Травма',
    wage: 'Зарплаты',
    transfer_bought: 'Трансфер',
    transfer_sold: 'Продажа',
    transfer_listed: 'На рынке',
    youth: 'Академия',
    league_joined: 'Запись в лигу',
    league_started: 'Лига стартовала',
    league_match: 'Матч лиги',
    league_won: 'Чемпион лиги',
    league_done: 'Лига завершена'
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
      ['recover', 'Восстановление'],
      ['market', 'Трансферы'],
      ['academy', 'Академия']
    ],
    matches: [
      ['friendly', 'Товарищеские'],
      ['league', 'Лига'],
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
      ['board', 'Очки'],
      ['cups', 'Кубки']
    ],
    admin: [
      ['cups', 'Кубки'],
      ['stats', 'Статистика']
    ]
  };

  const COMP_LABELS = { friendly: 'Товарищеский', cup: 'Кубок', league: 'Лига', match: 'Матч' };

  function money(n) {
    return new Intl.NumberFormat('ru-RU').format(Math.round(n || 0)) + ' ¤';
  }

  function esc(s) {
    return String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function compLabel(c) {
    return COMP_LABELS[c] || (c ? esc(c) : 'Матч');
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
      <strong>${esc(u?.name || u?.login || 'Менеджер')}</strong>
      <small>@${esc(u?.login || '—')} · ур. ${lvl}</small>
      <div class="level-bar"><i style="width:${pct}%"></i></div>`;
    $('#side-wallet').innerHTML = `
      <div class="row"><span>Деньги</span><b>${money(u?.money)}</b></div>
      <div class="row"><span>Опыт</span><b>${money(u?.xp).replace(' ¤','')}</b></div>
      <div class="row"><span>Фанаты</span><b>${money(u?.fans).replace(' ¤','')}</b></div>
      <div class="row"><span>Очки</span><b>${u?.points || 0}</b></div>
      <div class="row"><span>Бустеры</span><b>${u?.boosters || 0}</b></div>
      ${(state.me?.challenges || []).length ? `<div class="row"><span>Вызовы</span><b style="color:var(--warn,#eab308)">${state.me.challenges.length}</b></div>` : ''}`;
    $('#side-online').textContent = state.me?.online ?? '—';
  }

  function showGate() {
    stopCupPoll();
    $('#app').hidden = true;
    $('#gate').hidden = false;
    state.me = null;
    state.club = null;
  }

  function toastEvents(events) {
    const unread = (events || []).filter((e) => e && e.id && !e.read && !state.seenEventIds.has(e.id));
    unread.slice(0, 3).forEach((e) => {
      state.seenEventIds.add(e.id);
      const label = EVENT_LABELS[e.type] || e.title || e.type;
      toast(label + (e.cupName ? ': ' + e.cupName : e.body ? ' — ' + e.body : ''));
    });
    (events || []).forEach((e) => { if (e?.id) state.seenEventIds.add(e.id); });
  }

  async function refreshMe() {
    const data = await A().me();
    if (!data) {
      if (!$('#app')?.hidden) showGate();
      return null;
    }
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
      return `<div class="player-chip" style="left:${x}%;top:${y}%"><b>${esc(p.pos)}</b>${esc((p.name || '').split(' ').pop())}<div>${p.effective || p.mastery}</div></div>`;
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
          <div class="stat-card"><span>Зарплаты / сут</span><b>${money(Math.round((club?.players || []).reduce((s, p) => s + (p.wage || 0), 0) / 7))}</b></div>
        </div>
        <section class="panel">
          <h3>Движение средств</h3>
          <p class="hint">Матчи: приз + билеты только дома. Раз в сутки — 1/7 недельной зарплаты и доход от фанатов. Кубки: взнос за матч и призовые.</p>
          <div class="list">${ledger.length ? ledger.map((row) => `
            <div class="list-row">
              <div><strong>${esc(row.label)}</strong><small>${new Date(row.at).toLocaleString('ru-RU')}</small></div>
              <b style="color:${row.delta >= 0 ? 'var(--grass-bright)' : 'var(--danger)'}">${row.delta >= 0 ? '+' : ''}${money(row.delta)}</b>
            </div>`).join('') : '<p class="hint">Пока нет операций — сыграйте матч</p>'}</div>
        </section>`;
      return;
    }
    if (state.tab === 'mail') {
      const events = state.me?.cupEvents || [];
      const liveChals = new Set((state.me?.challenges || []).map((c) => c.id));
      try { await A().request('api/cups/events/read', { method: 'POST', body: {} }); } catch {}
      $('#view').innerHTML = `
        <section class="panel">
          <h3>События</h3>
          <div class="list">${events.length ? events.map((e) => `
            <div class="list-row">
              <div>
                <strong>${esc(e.title || EVENT_LABELS[e.type] || e.type)}</strong>
                <small>${esc(e.cupName || e.body || '')}${e.xp ? ' · +' + e.xp + ' XP' : ''}${e.money ? ' · +' + money(e.money) : ''}</small>
              </div>
              <div style="display:flex;gap:6px;align-items:center">
                ${e.challengeId && e.type === 'challenge_in' && liveChals.has(e.challengeId) ? `
                  <button class="btn btn-primary btn-tiny" data-chal-accept="${esc(e.challengeId)}">Принять</button>
                  <button class="btn btn-tiny" data-chal-decline="${esc(e.challengeId)}">Отклонить</button>` : ''}
                ${e.challengeId && e.type === 'challenge_in' && !liveChals.has(e.challengeId) ? '<small>уже неактуален</small>' : ''}
                ${e.matchId ? `<button class="btn btn-tiny" data-match="${esc(e.matchId)}">Отчёт</button>` : ''}
                <small>${new Date(e.at || Date.now()).toLocaleString('ru-RU')}</small>
              </div>
            </div>
          `).join('') : '<p class="hint">Пока тихо — сыграйте матч или вступите в кубок.</p>'}</div>
        </section>`;
      return;
    }
    const cal = state.me?.calendar;
    const nextFix = (cal?.items || []).find((x) => x.status === 'next' || x.status === 'planned');
    $('#view').innerHTML = `
      <div class="hero-strip">
        <div class="club-banner" style="--club:${esc(club?.color || '#1fa65a')}">
          <h2>${esc(club?.name || 'Клуб')}</h2>
          <p>Сила состава ${club?.strength || '—'} · схема ${esc(club?.formation || '4-4-2')} · ${esc(club?.stadium || 'Стадион')}</p>
          ${club?.understrength ? '<p class="hint" style="margin-top:10px;color:var(--warn,#eab308)">В основе меньше 11 здоровых — проверьте травмы и автосостав.</p>' : ''}
          <div style="margin-top:16px;display:flex;gap:8px;flex-wrap:wrap">
            <button class="btn btn-primary btn-tiny" data-nav="matches" data-goto-tab="league">К лиге</button>
            <button class="btn btn-tiny" data-nav="matches">К матчам</button>
            <button class="btn btn-tiny" data-nav="players">Состав</button>
          </div>
        </div>
        <section class="panel">
          <h3>Сводка</h3>
          <div class="grid-3" style="grid-template-columns:1fr 1fr">
            <div class="stat-card"><span>Уровень</span><b>${u?.level || 1}</b></div>
            <div class="stat-card"><span>Сезон / тур</span><b>${cal?.season || '—'} / ${cal?.week || '—'}</b></div>
            <div class="stat-card"><span>Слава</span><b>${u?.fame || 0}</b></div>
            <div class="stat-card"><span>Престиж</span><b>${u?.prestige || 0}</b></div>
          </div>
          ${nextFix ? `<p class="hint" style="margin:14px 0 0">Ближайший матч лиги: <strong>${esc(nextFix.home)}</strong> — <strong>${esc(nextFix.away)}</strong>${nextFix.when ? ' · ' + new Date(nextFix.when).toLocaleString('ru-RU') : ''}</p>` : `<p class="hint" style="margin:14px 0 0">Запишитесь в лигу своего уровня или сыграйте товарищеский / кубок.</p>`}
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
          <div class="panel-head"><h3>${esc(club.stadium)}</h3><button class="btn btn-primary btn-tiny" id="btn-stadium" ${lvl >= 8 ? 'disabled' : ''}>Улучшить · ${money(cost)}</button></div>
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
            <label>Название<input name="name" value="${esc(club.name || '')}" maxlength="32" /></label>
            <label>Аббревиатура<input name="short" value="${esc(club.short || '')}" maxlength="4" /></label>
            <label>Стадион<input name="stadium" value="${esc(club.stadium || '')}" maxlength="40" /></label>
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
            <input type="hidden" name="rebuildLineup" value="1" />
            <button class="btn btn-primary" type="submit">Автосостав по схеме</button>
          </form>
          <p class="hint">Отметьте ровно 11 игроков, включая вратаря. Травмированных в основу нельзя.</p>
          ${club.understrength ? '<p class="hint" style="color:var(--warn,#eab308)">Сейчас в основе меньше 11 здоровых — сохраните основу или нажмите «Автосостав».</p>' : ''}
          <div class="list" id="lineup-picker">${sorted.map((p) => `
            <label class="list-row" style="cursor:pointer">
              <div><strong>${esc(p.name)} · ${esc(p.pos)}</strong><small>эфф. ${p.effective} · физа ${p.fitness}%${p.injuredHours ? ' · травма' : ''}</small></div>
              <input type="checkbox" data-lineup-id="${esc(p.id)}" ${xi.has(p.id) ? 'checked' : ''} ${p.injuredHours ? 'disabled' : ''} />
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
          <tbody>${players.map((p) => `<tr><td>${esc(p.name)}</td><td>${p.fitness}%</td><td>${p.injuredHours ? p.injuredHours + 'ч' : '—'}</td></tr>`).join('')}</tbody></table></div>
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
                <strong>${esc(p.name)} · ${esc(p.pos)}</strong>
                <small>Мастерство ${p.mastery} · опыт ${p.xpPool || 0} · талант ${p.talent}</small>
              </div>
              <button class="btn btn-tiny" data-train="${esc(p.id)}">Качать</button>
            </div>`).join('')}</div>
        </section>`;
      return;
    }
    if (state.tab === 'market') {
      const data = await A().request('api/transfers');
      const list = data.list || [];
      const clubListings = data.clubListings || [];
      const myListings = data.myListings || [];
      const scout = data.scoutLevel || 0;
      $('#view').innerHTML = `
        <section class="panel">
          <div class="panel-head">
            <h3>Трансферный рынок</h3>
            <button class="btn btn-tiny" id="btn-market-refresh" ${scout < 1 ? 'disabled' : ''}>Обновить агентов · 5 000 ¤</button>
          </div>
          <p class="hint">Скаут ур. ${scout}. Состав ${data.squadSize || 0}/25. Можно купить у других клубов или у агентов; своего игрока — выставить или продать агентам.</p>
          ${myListings.length ? `<h4 style="margin:12px 0 8px;font-family:Syne,sans-serif">Ваши лоты</h4>
            <div class="list">${myListings.map((p) => `
              <div class="list-row">
                <div><strong>${esc(p.name)} · ${esc(p.pos)}</strong><small>${money(p.value)}</small></div>
                <button class="btn btn-tiny" data-unlist="${esc(p.id)}">Снять</button>
              </div>`).join('')}</div>` : ''}
          ${clubListings.length ? `<h4 style="margin:16px 0 8px;font-family:Syne,sans-serif">Клубы</h4>
            <div class="list">${clubListings.map((p) => `
              <div class="list-row">
                <div>
                  <strong>${esc(p.name)} · ${esc(p.pos)}</strong>
                  <small>${esc(p.sellerClub || 'клуб')} · маст. ${p.mastery} · ${p.age} лет</small>
                </div>
                <button class="btn btn-primary btn-tiny" data-buy="${esc(p.id)}">${money(p.value)}</button>
              </div>`).join('')}</div>` : ''}
          <h4 style="margin:16px 0 8px;font-family:Syne,sans-serif">Агенты</h4>
          <div class="list">${list.length ? list.map((p) => `
            <div class="list-row">
              <div>
                <strong>${esc(p.name)} · ${esc(p.pos)}</strong>
                <small>маст. ${p.mastery} · ${p.age} лет · зарплата ${money(p.wage)}</small>
              </div>
              <button class="btn btn-primary btn-tiny" data-buy="${esc(p.id)}">${money(p.value)}</button>
            </div>`).join('') : `<p class="hint">${scout < 1
              ? 'Рынок агентов закрыт — наймите скаута в «Бонусе».'
              : 'Список пуст — нажмите «Обновить».'}</p>`}</div>
        </section>`;
      return;
    }
    if (state.tab === 'academy') {
      const lvl = club.stadiumLevel || 1;
      const cost = 20000 + Math.max(0, lvl - 2) * 5000;
      $('#view').innerHTML = `
        <section class="panel">
          <h3>Молодёжная академия</h3>
          <p class="hint">Раз в сутки выпускает игрока 16–19 лет. Нужен стадион ур. 2+. Выше уровень стадиона — сильнее выпускники.</p>
          <div class="grid-3">
            <div class="stat-card"><span>Стадион</span><b>${lvl} / 8</b></div>
            <div class="stat-card"><span>Состав</span><b>${(club.players || []).length}/25</b></div>
            <div class="stat-card"><span>Выпуск</span><b>${money(cost)}</b></div>
          </div>
          <button class="btn btn-primary" id="btn-youth" style="margin-top:14px" ${lvl < 2 ? 'disabled' : ''}>Выпустить воспитанника</button>
          ${lvl < 2 ? '<p class="hint" style="margin-top:10px">Сначала улучшите стадион во вкладке «Команда».</p>' : ''}
        </section>`;
      return;
    }
    $('#view').innerHTML = `
      <section class="panel">
        <div class="panel-head"><h3>Состав</h3><span class="badge">${players.length} игроков</span></div>
        <div class="table-wrap"><table class="sheet">
          <thead><tr><th>Имя</th><th>Поз</th><th>Возр</th><th>Маст</th><th>Эфф</th><th>Физа</th><th>Мораль</th><th></th></tr></thead>
          <tbody>${players.map((p) => `
            <tr>
              <td><button type="button" class="link" data-train="${esc(p.id)}"><strong>${esc(p.name)}</strong></button></td>
              <td><span class="badge">${esc(p.pos)}</span></td>
              <td>${p.age}</td>
              <td>${p.mastery}</td>
              <td><b>${p.effective}</b></td>
              <td>${p.fitness}%${p.injuredHours ? ' <span class="badge danger">травма</span>' : ''}</td>
              <td>${p.morale > 0 ? '+' : ''}${p.morale}</td>
              <td style="white-space:nowrap">
                <button class="btn btn-tiny" data-list="${esc(p.id)}">На рынок</button>
                <button class="btn btn-tiny" data-sell="${esc(p.id)}">Агентам</button>
              </td>
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
                <strong>${esc(m.home?.name)} ${m.score?.[0]}:${m.score?.[1]} ${esc(m.away?.name)}</strong>
                <small>${compLabel(m.competition)} · ${new Date(m.createdAt).toLocaleString('ru-RU')}</small>
              </div>
              <button class="btn btn-tiny" data-match="${m.id}">Отчёт</button>
            </div>`).join('') : '<p class="hint">Матчей пока нет</p>'}</div>
        </section>`;
      return;
    }
    if (state.tab === 'league') {
      const data = await A().request('api/league?mine=1');
      const L = data.league;
      const open = data.open || [];
      const cal = data.calendar || {};
      if (!L) {
        $('#view').innerHTML = `
          <section class="panel">
            <h3>Дивизионная лига</h3>
            <p class="hint">Круговой турнир на 8 клубов вашего уровня. Туры идут автоматически ~каждые 8 минут. Чемпион получает крупный приз и престиж.</p>
            <div class="list">${open.length ? open.map((c) => `
              <div class="list-row">
                <div><strong>${esc(c.name)}</strong><small>${c.humans || 0} чел. · ${c.entrantsCount || 0}/${c.size}</small></div>
                <button class="btn btn-primary btn-tiny" id="btn-league-join">Вступить</button>
              </div>`).join('') : '<p class="hint">Открытых лиг нет — нажмите «Вступить», создастся набор</p>'}
            ${!open.length ? '<button class="btn btn-primary" id="btn-league-join">Вступить в лигу</button>' : ''}
          </section>`;
        return;
      }
      const myId = A().getUser()?.id;
      const standings = L.standings || [];
      const fixtures = (L.fixtures || []).filter((f) => f.round === L.currentRound || f.mine);
      const myFixtures = (cal.items || L.fixtures || []).filter((f) => f.mine || f.homeUserId === myId || f.awayUserId === myId);
      $('#view').innerHTML = `
        <section class="panel">
          <div class="panel-head">
            <h3>${esc(L.name)}</h3>
            <span class="badge">${L.status === 'live' ? 'тур ' + L.currentRound + '/' + L.totalRounds : L.status === 'open' ? 'набор' : 'завершена'}</span>
          </div>
          ${L.status === 'open' ? `<p class="hint">Ожидание старта · ${L.humans || 0} менеджеров. Можно выйти до начала.</p>
            <button class="btn btn-tiny" id="btn-league-leave">Выйти из набора</button>` : ''}
          ${L.nextRoundAt && L.status === 'live' ? `<p class="hint">Следующий тур: ${new Date(L.nextRoundAt).toLocaleString('ru-RU')}</p>` : ''}
          ${L.champion ? `<div class="stat-card" style="margin:10px 0"><span>Чемпион</span><b>${esc(L.champion.clubName)}</b></div>` : ''}
        </section>
        <section class="panel">
          <h3>Таблица</h3>
          <div class="table-wrap"><table class="sheet">
            <thead><tr><th>#</th><th>Клуб</th><th>И</th><th>В</th><th>Н</th><th>П</th><th>Мячи</th><th>О</th></tr></thead>
            <tbody>${standings.map((r) => `
              <tr style="${r.userId === myId ? 'font-weight:700' : ''}">
                <td>${r.rank}</td>
                <td>${esc(r.clubName)}${r.isBot ? ' <small>AI</small>' : ''}</td>
                <td>${r.played}</td><td>${r.won}</td><td>${r.drawn}</td><td>${r.lost}</td>
                <td>${r.gf}:${r.ga}</td>
                <td><b>${r.pts}</b></td>
              </tr>`).join('')}</tbody>
          </table></div>
        </section>
        <section class="panel">
          <h3>Календарь ваших матчей</h3>
          <div class="list">${(myFixtures.length ? myFixtures : fixtures).map((f) => `
            <div class="list-row">
              <div>
                <strong>Тур ${f.round}: ${esc(f.home || f.homeName)} ${f.score ? f.score[0] + ':' + f.score[1] : '—'} ${esc(f.away || f.awayName)}</strong>
                <small>${f.status === 'done' || f.playedAt ? 'сыгран' : f.status === 'next' ? 'следующий' : 'в плане'}</small>
              </div>
              ${f.matchId ? `<button class="btn btn-tiny" data-match="${esc(f.matchId)}">Отчёт</button>` : ''}
            </div>`).join('') || '<p class="hint">Календарь появится после старта</p>'}</div>
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
      const myId = A().getUser()?.id;
      const cups = (openData.cups || []).filter((c) => lvl >= (c.minLevel || 1) && lvl <= (c.maxLevel || 10));
      const liveAll = liveData.cups || [];
      const finished = (doneData.cups || []).slice(0, 8);
      const live = state.me?.liveCup;
      const inCup = (c) => (c.entrants || []).some((e) => e.userId === myId);
      const liveTitle = live && live.stillAlive === false ? 'Вы выбыли из кубка' : 'Ваш кубок идёт';
      $('#view').innerHTML = `
        ${live ? `<section class="panel"><div class="panel-head"><h3>${liveTitle}</h3><button class="btn btn-primary btn-tiny" data-cup="${esc(live.id)}">Смотреть</button></div>
          <p>${esc(live.name)} · ${esc(live.round || 'раунд')}${live.stillAlive === false ? ' · вы уже не в сетке' : ''}${live.nextRoundAt && live.stillAlive !== false ? ' · следующий раунд ' + new Date(live.nextRoundAt).toLocaleTimeString('ru-RU') : ''}</p></section>` : ''}
        <section class="panel">
          <div class="panel-head"><h3>Кубки вашего уровня</h3><span class="badge">ур. ${lvl}</span></div>
          <p class="hint">Запись ~5 минут до старта. Без живых игроков кубок уходит в архив.</p>
          <div class="list">${cups.length ? cups.map((c) => `
            <div class="list-row">
              <div>
                <strong>${esc(c.name)}</strong>
                <small>${esc(c.bracketLabel || '')} · ${c.slotsFilled || c.entrantsCount || 0}/${c.size} · люди ${c.humans || 0} · старт ${c.startAt ? new Date(c.startAt).toLocaleTimeString('ru-RU') : 'ожидание'}</small>
              </div>
              <div style="display:flex;gap:6px">
                <button class="btn btn-tiny" data-cup="${esc(c.id)}">Открыть</button>
                ${inCup(c)
                  ? `<button class="btn btn-tiny" data-cup-leave="${esc(c.id)}">Выйти</button>`
                  : `<button class="btn btn-primary btn-tiny" data-cup-join="${esc(c.id)}">Вступить</button>`}
              </div>
            </div>`).join('') : '<p class="hint">Нет открытых кубков вашего уровня — новые появятся в течение ~5 минут</p>'}</div>
        </section>
        <section class="panel">
          <h3>Идут сейчас</h3>
          <div class="list">${liveAll.length ? liveAll.map((c) => `
            <div class="list-row">
              <div><strong>${esc(c.name)}</strong><small>${esc(c.round || 'раунд')} · в сетке ${c.aliveCount || '—'}</small></div>
              <button class="btn btn-tiny" data-cup="${esc(c.id)}">Смотреть</button>
            </div>`).join('') : '<p class="hint">Сейчас никто не играет</p>'}</div>
        </section>
        <section class="panel">
          <h3>Недавние итоги</h3>
          <div class="list">${finished.length ? finished.map((c) => `
            <div class="list-row">
              <div><strong>${esc(c.name)}</strong><small>чемпион: ${esc(c.champion?.clubName || c.champion?.name || '—')}</small></div>
              <button class="btn btn-tiny" data-cup="${esc(c.id)}">Отчёт</button>
            </div>`).join('') : '<p class="hint">Пока пусто</p>'}</div>
        </section>`;
      return;
    }
    const data = await A().request('api/friendly');
    const queue = data.queue || [];
    const myRequest = data.myRequest;
    const challenges = data.challenges || [];
    const myChallenges = data.myChallenges || [];
    $('#view').innerHTML = `
      ${challenges.length ? `<section class="panel">
        <h3>Входящие вызовы</h3>
        <div class="list">${challenges.map((c) => `
          <div class="list-row">
            <div><strong>${esc(c.clubName)}</strong><small>@${esc(c.login)} · ур. ${c.level} · сила ${c.strength}</small></div>
            <div style="display:flex;gap:6px">
              <button class="btn btn-primary btn-tiny" data-chal-accept="${esc(c.id)}">Принять</button>
              <button class="btn btn-tiny" data-chal-decline="${esc(c.id)}">Отклонить</button>
            </div>
          </div>`).join('')}</div>
      </section>` : ''}
      <section class="panel">
        <div class="panel-head">
          <h3>Товарищеские</h3>
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            <button class="btn btn-primary btn-tiny" id="btn-friendly-post">${myRequest ? 'Обновить заявку' : 'Подать заявку'}</button>
            ${myRequest ? '<button class="btn btn-tiny" id="btn-friendly-cancel">Снять заявку</button>' : ''}
            <button class="btn btn-tiny" id="btn-friendly-bot">Играть с ботом</button>
          </div>
        </div>
        ${myRequest ? `<p class="hint">Ваша заявка активна · ${esc(myRequest.clubName)} · сила ${myRequest.strength} · до ${new Date(myRequest.expiresAt).toLocaleTimeString('ru-RU')}</p>` : ''}
        <p class="hint">Примите заявку из очереди, вызовите игрока онлайн или сыграйте с ботом.</p>
        <div class="list">${queue.length ? queue.map((q) => `
          <div class="list-row">
            <div>
              <strong>${esc(q.clubName)}</strong>
              <small>@${esc(q.login)} · ур. ${q.level} · сила ${q.strength}</small>
            </div>
            <button class="btn btn-primary btn-tiny" data-accept="${esc(q.id)}">Принять</button>
          </div>`).join('') : '<p class="hint">Очередь пуста — подайте заявку первым</p>'}</div>
      </section>
      ${myChallenges.length ? `<section class="panel"><h3>Ваши исходящие вызовы</h3>
        <div class="list">${myChallenges.map((c) => `
          <div class="list-row">
            <div><strong>${esc(c.clubName || c.targetName)}</strong><small>ожидает ответа</small></div>
            <button class="btn btn-tiny" data-chal-cancel="${esc(c.id)}">Отозвать</button>
          </div>`).join('')}</div></section>` : ''}
      <section class="panel">
        <h3>Онлайн сейчас</h3>
        <div class="list">${(data.online || []).filter((u) => u.id !== A().getUser()?.id).slice(0, 12).map((u) => `
          <div class="list-row">
            <div><strong>${esc(u.clubName || u.name)}</strong><small>@${esc(u.login)} · ур. ${u.level}</small></div>
            <button class="btn btn-primary btn-tiny" data-challenge="${esc(u.id)}">Вызвать</button>
          </div>
        `).join('') || '<p class="hint">Никого нет в сети</p>'}</div>
      </section>`;
  }

  async function renderTactics() {
    const club = state.club;
    const chosen = new Set(club.instructions || []);
    const INS = [
      ['high_press', 'Высокий прессинг'],
      ['low_block', 'Низкий блок'],
      ['wide_play', 'Игра в ширину'],
      ['through_balls', 'Передачи вразрез'],
      ['long_balls', 'Длинные передачи'],
      ['keep_ball', 'Контроль мяча'],
      ['man_mark', 'Персональная опека'],
      ['counter_fast', 'Быстрый отрыв']
    ];
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
            <div>
              <strong style="display:block;margin-bottom:8px">Указания (до 4)</strong>
              <div class="list">${INS.map(([id, label]) => `
                <label class="list-row" style="cursor:pointer">
                  <div><strong>${label}</strong></div>
                  <input type="checkbox" name="instruction" value="${id}" ${chosen.has(id) ? 'checked' : ''} />
                </label>`).join('')}</div>
            </div>
            <button class="btn btn-primary" type="submit">Сохранить тактику</button>
          </form>
          <p class="hint">Стиль, схема и указания влияют на моменты, владение и расход сил. Атака/прессинг жгут физу сильнее.</p>
        </section>
        <section class="panel">
          <h3>Превью</h3>
          ${pitchHtml(club)}
        </section>
      </div>`;
  }

  async function renderAdmin() {
    if (state.tab === 'stats') {
      const data = await A().request('api/admin/stats');
      $('#view').innerHTML = `
        <section class="panel">
          <h3>Админ · статистика</h3>
          <div class="grid-3">
            <div class="stat-card"><span>Люди</span><b>${data.humans || 0}</b></div>
            <div class="stat-card"><span>Боты</span><b>${data.bots || 0}</b></div>
            <div class="stat-card"><span>Открытых кубков</span><b>${data.cupsOpen || 0}</b></div>
            <div class="stat-card"><span>Live</span><b>${data.cupsLive || 0}</b></div>
            <div class="stat-card"><span>Архив</span><b>${data.archive || 0}</b></div>
          </div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:14px">
            <button class="btn btn-primary" id="btn-admin-tick">Tick кубков</button>
            <button class="btn" id="btn-admin-league-tick">Tick лиг</button>
          </div>
        </section>`;
      return;
    }
    const [cupsData, leagueData] = await Promise.all([
      A().request('api/admin/cups'),
      A().request('api/league')
    ]);
    const rows = [...(cupsData.live || []), ...(cupsData.open || [])].slice(0, 40);
    const leagues = [...(leagueData.leagues || [])].filter((L) => L.status !== 'finished').slice(0, 20);
    $('#view').innerHTML = `
      <section class="panel">
        <div class="panel-head"><h3>Админ · кубки</h3>
          <button class="btn btn-primary btn-tiny" id="btn-admin-create">Создать 8</button>
        </div>
        <div class="list">${rows.length ? rows.map((c) => `
          <div class="list-row">
            <div>
              <strong>${esc(c.name)}</strong>
              <small>${esc(c.status)} · ${c.slotsFilled || c.entrantsCount || 0}/${c.size} · ${esc(c.round || c.bracketLabel || '')}</small>
            </div>
            <div style="display:flex;gap:6px;flex-wrap:wrap">
              ${c.status === 'open' ? `<button class="btn btn-tiny" data-admin-start="${esc(c.id)}">Старт</button>` : ''}
              ${c.status === 'live' ? `<button class="btn btn-tiny" data-admin-adv="${esc(c.id)}">Раунд</button>
                <button class="btn btn-tiny" data-admin-fin="${esc(c.id)}">Финиш</button>` : ''}
              <button class="btn btn-tiny" data-admin-del="${esc(c.id)}">Удалить</button>
            </div>
          </div>`).join('') : '<p class="hint">Нет кубков</p>'}</div>
      </section>
      <section class="panel">
        <h3>Админ · лиги</h3>
        <div class="list">${leagues.length ? leagues.map((L) => `
          <div class="list-row">
            <div>
              <strong>${esc(L.name)}</strong>
              <small>${esc(L.status)} · тур ${L.currentRound || 0}/${L.totalRounds || '—'} · люди ${L.humans || 0}</small>
            </div>
            <div style="display:flex;gap:6px">
              <button class="btn btn-tiny" data-admin-lg-round="${esc(L.id)}">Тур/старт</button>
              <button class="btn btn-tiny" data-admin-lg-fin="${esc(L.id)}">Доиграть</button>
            </div>
          </div>`).join('') : '<p class="hint">Нет лиг</p>'}</div>
      </section>`;
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
        <p class="hint">Бустеры ускоряют развитие, но не покупают победы в кубках. Цена: 25 000 ¤ за штуку.</p>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px">
          <button class="btn btn-primary" id="btn-buy-booster">Купить 1 · 25 000 ¤</button>
          <button class="btn" id="btn-buy-booster-5">Купить 5 · 125 000 ¤</button>
          <button class="btn" id="btn-recover-boost">Восстановить состав · 1 бустер</button>
          <button class="btn" id="btn-xp-boost">+40 опыта лучшему игроку · 1 бустер</button>
        </div>
      </section>
      <section class="panel">
        <h3>Персонал</h3>
        <p class="hint">Тренер — потолок умений полевых; тренер вратарей — голкиперов; скаут — трансферный рынок; врач — меньше травм и быстрее восстановление.</p>
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
    if (state.tab === 'cups') {
      const data = await A().request('api/cups/leaderboard');
      const leaders = data.leaders || [];
      $('#view').innerHTML = `
        <section class="panel">
          <h3>Кубковый рейтинг</h3>
          <div class="table-wrap"><table class="sheet">
            <thead><tr><th>#</th><th>Менеджер</th><th>Клуб</th><th>Ур.</th><th>Победы</th><th>Игры</th></tr></thead>
            <tbody>${leaders.map((u) => `
              <tr>
                <td>${u.rank || '—'}</td>
                <td><strong>${esc(u.name || u.login)}</strong></td>
                <td>${esc(u.clubName || '—')}</td>
                <td>${u.level || 1}</td>
                <td><b>${u.cupsWon || 0}</b></td>
                <td>${u.cupsPlayed || 0}</td>
              </tr>`).join('') || '<tr><td colspan="6">Пока пусто</td></tr>'}</tbody>
          </table></div>
        </section>`;
      return;
    }
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
              <td><strong>${esc(u.name || u.login)}</strong></td>
              <td>${esc(u.clubName || '—')}</td>
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
      else if (state.section === 'admin') await renderAdmin();
    } catch (e) {
      view.innerHTML = `<section class="panel"><p class="hint">${esc(e.message || 'Ошибка загрузки')}</p></section>`;
    }
  }

  function showMatch(match) {
    const st = match.stats || {};
    const evLabel = (e) => {
      if (e.type === 'goal') return 'Гол' + (e.assist ? ` (п. ${esc(e.assist)})` : '');
      if (e.type === 'shot') return 'Удар';
      if (e.type === 'corner') return 'Угловой';
      if (e.type === 'yellow') return 'Жёлтая';
      if (e.type === 'red') return 'Красная';
      if (e.type === 'injury') return 'Травма';
      if (e.type === 'pens') return 'Пенальти';
      return esc(e.type || 'Событие');
    };
    openModal(`
      <div class="panel-head">
        <h2 style="margin:0;font-family:Syne,sans-serif">${compLabel(match.competition)}${match.cupName ? ' · ' + esc(match.cupName) : ''}</h2>
        <button class="btn btn-tiny" id="modal-close">Закрыть</button>
      </div>
      <div class="match-score">
        <div class="team"><strong>${esc(match.home?.name)}</strong><div class="hint">${esc(match.home?.formation || '')} · ${esc(match.home?.style || '')} · сила ${match.home?.strength}</div></div>
        <div class="score">${match.score?.[0]}:${match.score?.[1]}</div>
        <div class="team"><strong>${esc(match.away?.name)}</strong><div class="hint">${esc(match.away?.formation || '')} · ${esc(match.away?.style || '')} · сила ${match.away?.strength}</div></div>
      </div>
      ${st.shots ? `<div class="grid-3" style="margin:12px 0">
        <div class="stat-card"><span>Владение</span><b>${(st.possession||[])[0]||'—'}% : ${(st.possession||[])[1]||'—'}%</b></div>
        <div class="stat-card"><span>Удары (в створ)</span><b>${(st.shots||[])[0]||0}(${(st.shotsOn||[])[0]||0}) : ${(st.shots||[])[1]||0}(${(st.shotsOn||[])[1]||0})</b></div>
        <div class="stat-card"><span>Угловые / карт.</span><b>${(st.corners||[])[0]||0}:${(st.corners||[])[1]||0} / ${(st.cards||[])[0]||0}:${(st.cards||[])[1]||0}</b></div>
      </div>` : ''}
      <h3>События</h3>
      <div class="events">${(match.events || []).map((e) => {
        return `<div class="event"><span class="min">${e.minute}'</span><span>${evLabel(e)}: ${esc(e.side === 'home' ? match.home?.name : match.away?.name)} — ${esc(e.player)} (${e.score?.[0]}:${e.score?.[1]})</span></div>`;
      }).join('') || '<p class="hint">Без событий</p>'}</div>
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
    const myId = A().getUser()?.id;
    const joined = (c.entrants || []).some((e) => e.userId === myId);
    const ties = (c.history || []).slice().reverse().flatMap((h) =>
      (h.ties || []).map((t) => ({ ...t, round: h.round }))
    );
    const bracket = c.bracket || [];
    return `
      <div class="panel-head">
        <h2 style="margin:0;font-family:Syne,sans-serif">${esc(c.name)}</h2>
        <button class="btn btn-tiny" id="modal-close">Закрыть</button>
      </div>
      <p class="hint">${esc(c.bracketLabel || '')} · <span class="badge">${statusLabel}</span> · ${c.slotsFilled || c.entrantsCount || 0}/${c.size}
        ${c.round ? ' · ' + esc(c.round) : ''}
        ${c.nextRoundAt && c.status === 'live' ? ' · след. раунд ' + new Date(c.nextRoundAt).toLocaleTimeString('ru-RU') : ''}
      </p>
      ${c.champion ? `<div class="stat-card" style="margin-bottom:12px"><span>Чемпион</span><b>${esc(c.champion.clubName || c.champion.name)}</b></div>` : ''}
      ${bracket.length ? `<h3>Текущая сетка</h3><div class="list">${bracket.map((t) => `
        <div class="list-row">
          <div><strong>${esc(t.home?.clubName || t.home?.name)} ${t.score ? t.score[0] + ':' + t.score[1] : 'vs'} ${esc(t.away?.clubName || t.away?.name)}</strong>
          <small>${t.score ? 'сыграно' : 'ожидание'}${t.matchId ? ' · есть отчёт' : ''}</small></div>
          ${t.matchId ? `<button class="btn btn-tiny" data-match="${esc(t.matchId)}">Отчёт</button>` : ''}
        </div>`).join('')}</div>` : ''}
      ${ties.length ? `<h3 style="margin-top:14px">История</h3><div class="list">${ties.slice(0, 16).map((t) => `
        <div class="list-row">
          <div><strong>${esc(t.round)}: ${esc(t.home?.clubName || t.home?.name)} ${t.score?.[0]}:${t.score?.[1]} ${esc(t.away?.clubName || t.away?.name)}</strong></div>
          ${t.matchId ? `<button class="btn btn-tiny" data-match="${esc(t.matchId)}">Отчёт</button>` : ''}
        </div>`).join('')}</div>` : ''}
      <h3 style="margin-top:14px">Участники</h3>
      <div class="list">${(c.entrants || []).map((e) => `
        <div class="list-row"><div><strong>${esc(e.clubName || e.name)}</strong><small>${e.isBot ? 'бот' : 'игрок'} · сила ${e.strength || '—'} · ур. ${e.level || '?'}${e.out ? ' · выбыл' : ''}</small></div>
        ${e.out ? '<span class="badge danger">выбыл</span>' : '<span class="badge">в сетке</span>'}</div>
      `).join('') || '<p class="hint">Пока никого</p>'}</div>
      <div style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap">
        ${c.status === 'open' ? (joined
          ? `<button class="btn" data-cup-leave="${esc(c.id)}">Выйти из кубка</button>`
          : `<button class="btn btn-primary" data-cup-join="${esc(c.id)}">Вступить</button>`) : ''}
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
      <div class="panel-head"><h2 style="margin:0;font-family:Syne,sans-serif">${esc(p.name)}</h2><button class="btn btn-tiny" id="modal-close">Закрыть</button></div>
      <p class="hint">Опыт: ${p.xpPool || 0} · мастерство ${p.mastery}</p>
      <div class="list">${skills.map(([k, label]) => `
        <div class="list-row">
          <div><strong>${label}</strong><small>${p.skills?.[k] ?? '—'}</small></div>
          <button class="btn btn-tiny" data-skill="${k}" data-pid="${esc(p.id)}">+1 (8 опыта)</button>
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
        if (nav.dataset.gotoTab) state.tab = nav.dataset.gotoTab;
        else state.tab = (TABS[state.section] || [['main']])[0][0];
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
      if (e.target.id === 'btn-league-join') {
        try {
          await A().request('api/league/join', { method: 'POST' });
          toast('Вы в лиге');
          await refreshMe();
          render();
        } catch (err) { toast(err.message); }
      }
      if (e.target.id === 'btn-league-leave') {
        try {
          await A().request('api/league/leave', { method: 'POST' });
          toast('Вышли из набора');
          await refreshMe();
          render();
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
        try {
          const data = await A().request('api/matches/' + mid.dataset.match);
          showMatch(data.match);
        } catch (err) { toast(err.message || 'Матч не найден'); }
      }
      const challenge = e.target.closest('[data-challenge]');
      if (challenge) {
        try {
          await A().request('api/friendly/challenge', {
            method: 'POST',
            body: { userId: challenge.dataset.challenge }
          });
          toast('Вызов отправлен — ждите ответа');
          render();
        } catch (err) { toast(err.message); }
      }
      const chalAcc = e.target.closest('[data-chal-accept]');
      if (chalAcc) {
        try {
          const data = await A().request('api/friendly/challenge/' + chalAcc.dataset.chalAccept + '/accept', { method: 'POST' });
          await refreshMe();
          showMatch(data.match);
          toast('Вызов принят');
        } catch (err) { toast(err.message); }
      }
      const chalDec = e.target.closest('[data-chal-decline]');
      if (chalDec) {
        try {
          await A().request('api/friendly/challenge/' + chalDec.dataset.chalDecline + '/decline', { method: 'POST' });
          toast('Вызов отклонён');
          render();
        } catch (err) { toast(err.message); }
      }
      const chalCancel = e.target.closest('[data-chal-cancel]');
      if (chalCancel) {
        try {
          await A().request('api/friendly/cancel', { method: 'POST', body: { challengeId: chalCancel.dataset.chalCancel } });
          toast('Вызов отозван');
          render();
        } catch (err) { toast(err.message); }
      }
      if (e.target.id === 'btn-friendly-cancel') {
        try {
          await A().request('api/friendly/cancel', { method: 'POST', body: {} });
          toast('Заявка снята');
          render();
        } catch (err) { toast(err.message); }
      }
      const buy = e.target.closest('[data-buy]');
      if (buy) {
        try {
          const data = await A().request('api/transfers/buy', { method: 'POST', body: { playerId: buy.dataset.buy } });
          state.club = data.club;
          state.me.user = data.user;
          A().setUser(data.user);
          paintSidebar();
          toast('Игрок куплен');
          render();
        } catch (err) { toast(err.message); }
      }
      const sell = e.target.closest('[data-sell]');
      if (sell) {
        if (!confirm('Продать агентам за ~70% стоимости?')) return;
        try {
          const data = await A().request('api/transfers/sell', { method: 'POST', body: { playerId: sell.dataset.sell } });
          state.club = data.club;
          state.me.user = data.user;
          A().setUser(data.user);
          paintSidebar();
          toast('Продано за ' + money(data.value));
          render();
        } catch (err) { toast(err.message); }
      }
      const listPl = e.target.closest('[data-list]');
      if (listPl) {
        try {
          const data = await A().request('api/transfers/sell', {
            method: 'POST',
            body: { playerId: listPl.dataset.list, mode: 'list' }
          });
          state.club = data.club;
          state.me.user = data.user;
          A().setUser(data.user);
          paintSidebar();
          toast('Выставлен за ' + money(data.listing?.value));
          render();
        } catch (err) { toast(err.message); }
      }
      const unlist = e.target.closest('[data-unlist]');
      if (unlist) {
        try {
          const data = await A().request('api/transfers/unlist', { method: 'POST', body: { playerId: unlist.dataset.unlist } });
          state.club = data.club;
          toast('Лот снят, игрок вернулся');
          await refreshMe();
          render();
        } catch (err) { toast(err.message); }
      }
      if (e.target.id === 'btn-youth') {
        try {
          const data = await A().request('api/academy/promote', { method: 'POST' });
          state.club = data.club;
          state.me.user = data.user;
          A().setUser(data.user);
          paintSidebar();
          toast('Воспитанник: ' + (data.player?.name || ''));
          render();
        } catch (err) { toast(err.message); }
      }
      if (e.target.id === 'btn-admin-tick') {
        try {
          await A().request('api/admin/tick', { method: 'POST' });
          toast('Tick выполнен');
          render();
        } catch (err) { toast(err.message); }
      }
      if (e.target.id === 'btn-admin-league-tick') {
        try {
          await A().request('api/admin/league/tick', { method: 'POST' });
          toast('Лиги tick');
          render();
        } catch (err) { toast(err.message); }
      }
      const admLgRound = e.target.closest('[data-admin-lg-round]');
      if (admLgRound) {
        try {
          await A().request('api/admin/league/' + admLgRound.dataset.adminLgRound + '/round', { method: 'POST' });
          toast('Тур лиги');
          render();
        } catch (err) { toast(err.message); }
      }
      const admLgFin = e.target.closest('[data-admin-lg-fin]');
      if (admLgFin) {
        try {
          await A().request('api/admin/league/' + admLgFin.dataset.adminLgFin + '/finish', { method: 'POST' });
          toast('Лига доиграна');
          render();
        } catch (err) { toast(err.message); }
      }
      if (e.target.id === 'btn-admin-create') {
        try {
          await A().request('api/admin/cups', { method: 'POST', body: { size: 8, bracketId: 'l1_2', startInMs: 120000 } });
          toast('Кубок создан');
          render();
        } catch (err) { toast(err.message); }
      }
      const admStart = e.target.closest('[data-admin-start]');
      if (admStart) {
        try {
          await A().request('api/admin/cups/' + admStart.dataset.adminStart + '/force-start', { method: 'POST' });
          toast('Старт');
          render();
        } catch (err) { toast(err.message); }
      }
      const admAdv = e.target.closest('[data-admin-adv]');
      if (admAdv) {
        try {
          await A().request('api/admin/cups/' + admAdv.dataset.adminAdv + '/advance', { method: 'POST' });
          toast('Раунд');
          render();
        } catch (err) { toast(err.message); }
      }
      const admFin = e.target.closest('[data-admin-fin]');
      if (admFin) {
        try {
          await A().request('api/admin/cups/' + admFin.dataset.adminFin + '/finish', { method: 'POST' });
          toast('Финиш');
          render();
        } catch (err) { toast(err.message); }
      }
      const admDel = e.target.closest('[data-admin-del]');
      if (admDel) {
        if (!confirm('Удалить кубок?')) return;
        try {
          await A().request('api/admin/cups/' + admDel.dataset.adminDel, { method: 'DELETE' });
          toast('Удалён');
          render();
        } catch (err) { toast(err.message); }
      }
      if (e.target.id === 'btn-market-refresh') {
        try {
          const data = await A().request('api/transfers/refresh', { method: 'POST' });
          state.club = data.club;
          state.me.user = data.user;
          A().setUser(data.user);
          paintSidebar();
          toast('Рынок обновлён');
          render();
        } catch (err) { toast(err.message); }
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
      if (e.target.id === 'btn-buy-booster' || e.target.id === 'btn-buy-booster-5') {
        const qty = e.target.id === 'btn-buy-booster-5' ? 5 : 1;
        try {
          const data = await A().request('api/bonus/buy', { method: 'POST', body: { qty } });
          state.club = data.club;
          state.me.user = data.user;
          A().setUser(data.user);
          paintSidebar();
          toast(`Куплено бустеров: ${qty}`);
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
        if (body.rebuildLineup) body.rebuildLineup = true;
        if (e.target.id === 'form-tactics') {
          const instructions = [...e.target.querySelectorAll('input[name="instruction"]:checked')].map((el) => el.value).slice(0, 4);
          body.instructions = instructions;
          delete body.instruction;
        }
        try {
          const data = await A().request('api/club', { method: 'POST', body });
          state.club = data.club;
          toast(e.target.id === 'form-formation' ? 'Автосостав обновлён' : 'Сохранено');
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
    // show admin nav for admins
    const isAdmin = state.me?.user?.role === 'admin' || state.me?.user?.login === 'admin';
    $$('.side-links button[data-nav="admin"], .topnav-main button[data-nav="admin"]').forEach((b) => b.remove());
    if (isAdmin) {
      $('.side-links')?.insertAdjacentHTML('beforeend', '<button type="button" data-nav="admin">Админ</button>');
      $('.topnav-main')?.insertAdjacentHTML('beforeend', '<button type="button" data-nav="admin">Админ</button>');
    }
    state.section = 'cabinet';
    state.tab = 'main';
    render();
    toast('Добро пожаловать в EYE XI');
  }

  async function boot() {
    bind();
    tickClock();
    setInterval(tickClock, 15000);
    setInterval(async () => {
      if (!A().isLoggedIn() || $('#app')?.hidden) return;
      try {
        const prevLive = state.me?.liveCup?.id;
        const data = await refreshMe();
        if (!data) return;
        if (data.wageDay && data.wageDay.at !== state.lastWageToast) {
          state.lastWageToast = data.wageDay.at || Date.now();
          const days = data.wageDay.days > 1 ? ` (${data.wageDay.days} дн.)` : '';
          toast('Суточный расчёт' + days + ': ' + (data.wageDay.delta >= 0 ? '+' : '') + money(data.wageDay.delta));
        }
        toastEvents(data.cupEvents);
        const chals = data.challenges || [];
        const chalKey = chals.map((c) => c.id).sort().join(',');
        if (chalKey && chalKey !== state.lastChallengeToast) {
          state.lastChallengeToast = chalKey;
          toast(chals.length === 1 ? 'Новый вызов на матч!' : `Новые вызовы: ${chals.length}`);
          if (state.section === 'matches' && state.tab === 'friendly') render();
          if (state.section === 'cabinet' && state.tab === 'mail') render();
        }
        if (state.section === 'matches' && state.tab === 'cups') {
          const nowLive = state.me?.liveCup?.id;
          if (nowLive !== prevLive || nowLive) render();
        } else {
          paintSidebar();
        }
      } catch (err) {
        if (err?.status === 401) showGate();
      }
    }, 20000);
    try {
      const health = await fetch(A().apiBase() + 'api/health').then((r) => r.json());
      if (health?.online != null) $('#stat-online').textContent = health.online;
    } catch {}
    if (A().isLoggedIn()) {
      const me = await A().me();
      if (me) {
        (me.cupEvents || []).forEach((e) => { if (e?.id) state.seenEventIds.add(e.id); });
        await enterGame();
      } else {
        showGate();
      }
    }
  }

  boot();
})();

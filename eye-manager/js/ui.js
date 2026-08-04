/* UI controllers */
window.EYE_UI = (() => {
  const S = () => window.EYE_STATE;
  const D = () => window.EYE_DATA;
  const E = () => window.EYE_ENGINE;
  const W = () => window.EYE_WORLD;

  let matchAbort = false;
  let matchPlaying = false;
  let transferTab = 'market';
  let statsTab = 'goals';
  let selectedPlayerId = null;
  let playerBack = 'squad';
  let selectedSlot = null;
  let bidEntryId = null;
  let matchCtx = null; // { type, match, half1, score... }

  function $(sel, root = document) { return root.querySelector(sel); }
  function $all(sel, root = document) { return [...root.querySelectorAll(sel)]; }

  function show(id) {
    $all('.screen').forEach(s => s.classList.remove('active'));
    const el = document.getElementById('screen-' + id);
    if (el) el.classList.add('active');
    $all('.dock-btn').forEach(b => b.classList.toggle('active', b.dataset.nav === id || (id === 'hub' && b.dataset.nav === 'hub')));
    if (['squad','tactics','transfers','more'].includes(id)) {
      $all('.dock-btn').forEach(b => b.classList.toggle('active', b.dataset.nav === id));
    }
    window.scrollTo(0, 0);
    refresh(id);
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
    if (!st && !['boot','home','create'].includes(id)) return;
    if (id === 'hub') renderHub();
    if (id === 'squad') renderSquad();
    if (id === 'tactics') renderTactics();
    if (id === 'transfers') renderTransfers(transferTab);
    if (id === 'table') renderTable();
    if (id === 'stats') renderStats();
    if (id === 'train') renderTrain();
    if (id === 'club') renderClub();
    if (id === 'inbox') renderInbox();
    if (id === 'prematch') renderPrematch();
    if (id === 'history') renderHistory();
    if (id === 'player') renderPlayer();
    if (id === 'calendar') renderCalendar();
    if (id === 'cup') renderCup();
    if (id === 'finance') renderFinance();
    if (id === 'create') fillCreateForm();
    if (id === 'more') syncCurrencyButtons();
    if (id === 'home') {
      const cont = $('#btn-continue');
      cont.hidden = !S().load();
    }
  }

  function fillCreateForm() {
    const selL = $('#sel-league');
    const selC = $('#sel-club');
    if (!selL.options.length) {
      W().LEAGUES.forEach(l => {
        const o = document.createElement('option');
        o.value = l.id;
        o.textContent = `${l.name} (${l.country})`;
        selL.appendChild(o);
      });
    }
    const fillClubs = () => {
      const lid = selL.value;
      selC.innerHTML = '';
      W().clubsByLeague(lid).slice().sort((a, b) => b.rep - a.rep).forEach(c => {
        const o = document.createElement('option');
        o.value = c.id;
        const ru = window.EYE_I18N.clubRu(c.id, c.name, c.stadium);
        o.textContent = `${ru.name} · сила ${c.rep}`;
        selC.appendChild(o);
      });
      previewClub();
    };
    selL.onchange = fillClubs;
    selC.onchange = previewClub;
    fillClubs();
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
      <div style="display:flex;gap:10px;align-items:center;margin-bottom:8px">
        <span class="club-dot" style="background:${tpl.color}"></span>
        <strong>${ru.name}</strong>
      </div>
      <div class="meta" style="color:var(--muted);font-size:12px;line-height:1.45">
        ${ru.stadium} · бюджет ~${S().money(tpl.budget)}
        · болельщики ${tpl.fans.toLocaleString('ru')}<br/>
        <span style="opacity:.75">${S().moneyHint(tpl.budget)}</span><br/>
        Звёзды: ${stars}
      </div>
    `;
  }

  function renderHub() {
    const st = S().get();
    const me = S().club();
    $('#hub-club').textContent = me.name;
    $('#hub-color').style.background = me.color;
    $('#hub-meta').textContent = `${st.leagueName} · Сезон ${st.season} · Тур ${st.week}`;
    $('#hub-budget').textContent = S().money(me.budget);
    $('#hub-morale').textContent = 'Мораль ' + me.morale;
    syncCurrencyButtons();
    const unread = st.inbox.filter(m => !m.read).length;
    $('#inbox-badge').textContent = unread ? unread + ' новых' : 'Почта';

    const next = S().nextMatch();
    const box = $('#next-fixture');
    const btn = $('#btn-play-match');
    if (!next) {
      box.textContent = 'Сезон завершён — новый стартует';
      btn.disabled = true;
      btn.textContent = 'Ожидание';
    } else {
      const home = S().clubById(next.match.home);
      const away = S().clubById(next.match.away);
      const tag = next.type === 'cup' ? 'Кубок · ' : '';
      box.textContent = `${tag}${home.name} — ${away.name}`;
      btn.disabled = false;
      btn.textContent = next.type === 'cup' ? 'Кубковый матч' : 'К матчу';
    }

    const news = $('#news-strip');
    news.innerHTML = (st.news || []).slice(0, 5).map(n =>
      `<div class="news-item"><strong>${n.title}</strong><div>${n.body}</div></div>`
    ).join('') || `<div class="news-item">Пока тихо. Готовьте состав к туру.</div>`;
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
    box.innerHTML = `
      <div class="player-hero">
        <div class="ovr big">${p.ovr}</div>
        <div>
          <h3>${p.name}</h3>
          <div class="meta">${D().POS_LABEL[p.pos] || p.pos} · ${p.age} лет · ${p.nation}
            ${p.real ? ' · ★' : ''}
            ${c ? ' · ' + c.name : ' · свободный'}</div>
        </div>
      </div>
      <div class="stat-grid">
        ${bar('Атака', p.attack)}${bar('Защита', p.defense)}${bar('Техника', p.tech)}
        ${bar('Пас', p.pass || p.tech)}${bar('Темп', p.pace || 70)}${bar('Физика', p.physical || p.stamina)}
        ${bar('Вынос.', p.stamina)}${bar('IQ', p.iq)}${bar('Форма', p.form)}
      </div>
      <div class="meta" style="margin-top:12px;color:var(--muted);font-size:13px;line-height:1.5">
        Потенциал ${p.pot} · стоимость ${S().money(p.value)} · зарплата ${S().money(p.wage)}/нед<br/>
        <span style="opacity:.8">${S().moneyHint(p.value)}</span><br/>
        Сезон: ${p.seasonApps || 0} игр, ${p.seasonGoals || 0} голов, ${p.seasonAssists || 0} ассистов<br/>
        Карьера: ${p.careerGoals || 0} голов, ${p.careerAssists || 0} ассистов · контракт ${p.contract} г
        ${p.injured ? '<br/>Травма: ' + p.injured + ' тур(а)' : ''}
      </div>
      ${found.club?.isPlayer ? `<button class="btn btn-primary" id="btn-renew" data-renew="${p.id}" style="margin-top:12px">Продлить контракт (+2 г)</button>` : ''}
    `;
    $('#btn-renew')?.addEventListener('click', () => {
      const r = S().renewContract(p.id, 2);
      toast(r.msg);
      if (r.ok) renderPlayer();
    });
  }

  function bar(label, val) {
    const v = Math.max(0, Math.min(99, val | 0));
    return `<div class="stat-bar"><span>${label}</span><i style="--v:${v}%"></i><b>${v}</b></div>`;
  }

  function renderSquad() {
    const me = S().club();
    const avg = Math.round(me.squad.reduce((s, p) => s + p.ovr, 0) / me.squad.length);
    const stars = me.squad.filter(p => p.real).length;
    $('#squad-summary').textContent = `${me.squad.length} игроков · рейтинг ${avg} · ${stars} звёзд · ${me.formation} · ${me.stadium || ''}`;
    const sorted = [...me.squad].sort((a, b) => b.ovr - a.ovr);
    $('#squad-list').innerHTML = sorted.map(p => `
      <button class="row row-btn" data-player="${p.id}">
        <div class="ovr">${p.ovr}</div>
        <div>
          <strong>${p.name}${p.real ? ' ★' : ''}</strong>
          <div class="meta">
            <span class="badge-pos">${D().POS_LABEL[p.pos] || p.pos}</span>
            · ${p.age}л · форма ${p.form}
            ${p.injured ? ' · травма' : ''}
            · ${p.seasonGoals || 0}Г/${p.seasonAssists || 0}А
          </div>
        </div>
        <div class="meta">${S().money(p.value)}</div>
      </button>
    `).join('');
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
    drawPitch();
    renderBench();
  }

  function drawPitch() {
    const me = S().club();
    S().ensureLineup();
    const coords = D().pitchCoords(me.formation);
    const slots = D().FORMATIONS[me.formation].slots;
    const xi = me.lineup;
    $('#pitch').innerHTML = coords.map((c, i) => {
      const p = xi[i];
      const active = selectedSlot === i ? ' selected' : '';
      return `<button type="button" class="player-dot${active}" data-slot="${i}" style="left:${c.x}%;top:${c.y}%;border-color:${me.color}" title="${p?.name || ''}">${p ? (D().POS_LABEL[slots[i]] || slots[i]) : '?'}</button>`;
    }).join('');
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
            <strong>${p.name}</strong>
            <div class="meta">${D().POS_LABEL[p.pos]} · ${p.age}л · ${S().money(p.value)}</div>
          </div>
          <button class="btn btn-tiny" data-sell="${p.id}">Продать</button>
        </div>
      `).join('');
      return;
    }

    ensureTransferLeagueFilter();
    const market = S().filterMarket({
      q: $('#tf-q')?.value || '',
      pos: $('#tf-pos')?.value || 'ALL',
      leagueId: $('#tf-league')?.value || 'ALL',
      minOvr: Number($('#tf-ovr')?.value || 0),
      maxPrice: Number($('#tf-price')?.value || 0) || undefined
    });
    list.innerHTML = market.slice(0, 60).map(e => {
      const p = e.player;
      const counter = (S().pendingCounters() || {})[e.id];
      return `
        <div class="row">
          <div class="ovr">${p.ovr}</div>
          <div>
            <strong>${p.name}${p.real ? ' ★' : ''}</strong>
            <div class="meta">
              ${D().POS_LABEL[p.pos]} · ${p.age}л · пот. ${p.pot}
              · ${e.clubName || 'свободный'}
              ${e.type === 'star' ? ' · топ' : ''}
              ${counter ? ' · контр ' + S().money(counter) : ''}
            </div>
          </div>
          <div class="row-actions">
            <button class="btn btn-tiny" data-bid="${e.id}">${S().money(e.ask)}</button>
            ${e.clubId ? `<button class="btn btn-tiny" data-loan="${e.id}">Аренда</button>` : ''}
          </div>
        </div>
      `;
    }).join('') || `<div class="news-item">Никого не найдено — смените фильтры</div>`;
  }

  function openBidModal(entryId) {
    const item = S().get().transferList.find(e => e.id === entryId);
    if (!item) return;
    bidEntryId = entryId;
    const modal = $('#bid-modal');
    modal.hidden = false;
    $('#bid-title').textContent = item.player.name;
    $('#bid-meta').textContent = `Запрос: ${S().money(item.ask)} · ${item.clubName || 'свободный агент'}`;
    $('#bid-amount').value = item.ask;
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
    $('#calendar-list').innerHTML = st.fixtures.map(r => {
      const mine = r.matches.find(m => m.home === me.id || m.away === me.id);
      if (!mine) return '';
      const home = S().clubById(mine.home);
      const away = S().clubById(mine.away);
      const score = mine.played ? `${mine.score[0]}:${mine.score[1]}` : '— : —';
      const mineCls = !mine.played && r.round >= st.week ? ' me-round' : '';
      return `<div class="news-item${mineCls}"><strong>Тур ${r.round}</strong><div>${home.name} ${score} ${away.name}</div>${mine.played ? '' : '<small>ожидается</small>'}</div>`;
    }).join('') || `<div class="news-item">Календарь пуст</div>`;
  }

  function renderCup() {
    const cup = S().get().cup;
    const status = $('#cup-status');
    const btn = $('#btn-cup-play');
    if (!cup) { status.textContent = 'Кубка нет'; btn.hidden = true; return; }
    if (cup.champion) {
      const c = S().clubById(cup.champion);
      status.innerHTML = `<strong>Победитель:</strong> ${c?.name || '—'}`;
      btn.hidden = true;
    } else {
      status.innerHTML = `<strong>Стадия:</strong> ${cup.round}`;
      const pm = S().playerCupMatch();
      btn.hidden = !pm;
    }
    $('#cup-list').innerHTML = (cup.bracket || []).map(m => {
      const h = S().clubById(m.home); const a = S().clubById(m.away);
      const score = m.played ? `${m.score[0]}:${m.score[1]}` : 'ещё не сыгран';
      const mine = m.home === S().club().id || m.away === S().club().id;
      return `<div class="news-item${mine ? ' me-round' : ''}"><strong>${h?.name} — ${a?.name}</strong><div>${score}</div></div>`;
    }).join('');
  }

  function renderFinance() {
    const f = S().financeSummary();
    $('#finance-card').innerHTML = `
      <div class="stat-grid">
        <div class="news-item"><strong>Бюджет</strong><div>${S().money(f.budget)}</div><small>${S().moneyHint(f.budget)}</small></div>
        <div class="news-item"><strong>Зарплаты / нед</strong><div>${S().money(f.weeklyWages)}</div></div>
        <div class="news-item"><strong>Стоимость состава</strong><div>${S().money(f.squadValue)}</div></div>
        <div class="news-item"><strong>Болельщики</strong><div>${f.fans.toLocaleString('ru')}</div></div>
        <div class="news-item"><strong>Касса с матча (оценка)</strong><div>${S().money(f.incomePerMatch)}</div></div>
      </div>
    `;
  }

  function renderTable() {
    const me = S().club();
    const st = S().get();
    $('#table-title').textContent = st.leagueName || 'Таблица';
    const rows = S().sortedTable();
    $('#league-table').innerHTML = `
      <table class="league">
        <thead><tr><th>#</th><th>Клуб</th><th>И</th><th>В</th><th>Н</th><th>П</th><th>Мячи</th><th>О</th></tr></thead>
        <tbody>
          ${rows.map((r, i) => `
            <tr class="${r.id === me.id ? 'me' : ''}">
              <td class="pos">${i + 1}</td>
              <td>${r.name}</td>
              <td>${r.played}</td><td>${r.w}</td><td>${r.d}</td><td>${r.l}</td>
              <td>${r.gf}:${r.ga}</td><td><strong>${r.pts}</strong></td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  }

  function renderStats() {
    $all('#stats-tabs .tab').forEach(t => t.classList.toggle('active', t.dataset.stab === statsTab));
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
    $('#train-grid').innerHTML = D().TRAINING.map(t => `
      <button class="train-card" data-train="${t.id}">
        <div><strong>${t.name}</strong><span>${t.focus}</span></div>
        <span class="btn-tiny">Старт</span>
      </button>
    `).join('');
  }

  function renderClub() {
    const me = S().club();
    $('#facility-list').innerHTML = D().FACILITIES.map(f => {
      const lvl = me.facilities[f.id] || 1;
      const cost = Math.round(f.base * Math.pow(1.65, lvl - 1));
      return `
        <button class="fac-card" data-fac="${f.id}" ${lvl >= f.max ? 'disabled' : ''}>
          <div><strong>${f.name}</strong><span>Уровень ${lvl}/${f.max}</span></div>
          <span class="btn-tiny">${lvl >= f.max ? 'макс.' : S().money(cost)}</span>
        </button>
      `;
    }).join('');
  }

  function renderInbox() {
    const st = S().get();
    st.inbox.forEach(m => m.read = true);
    S().save();
    $('#inbox-list').innerHTML = st.inbox.map(m => `
      <div class="news-item"><strong>${m.title}</strong><div>${m.body}</div></div>
    `).join('') || `<div class="news-item">Писем нет</div>`;
  }

  function renderHistory() {
    const st = S().get();
    $('#history-list').innerHTML = (st.history || []).slice(0, 40).map(h => `
      <div class="news-item"><strong>С${h.season} · Т${h.week}</strong><div>${h.home} ${h.score[0]}:${h.score[1]} ${h.away}</div></div>
    `).join('') || `<div class="news-item">Матчей ещё не было</div>`;
  }

  function renderPrematch() {
    const next = S().nextMatch();
    if (!next) { show('hub'); return; }
    const pm = next.match;
    const home = S().clubById(pm.home);
    const away = S().clubById(pm.away);
    const me = S().club();
    const opp = home.id === me.id ? away : home;
    S().ensureLineup();
    const myS = E().teamStrength(me, { home: home.id === me.id });
    const opS = E().teamStrength(opp, { home: home.id === opp.id });
    $('#prematch-card').innerHTML = `
      <div class="next-label">${next.type === 'cup' ? 'Кубок EYE' : S().get().leagueName} · Тур ${S().get().week}</div>
      <div class="vs">${home.name}</div>
      <div style="color:var(--dim)">против</div>
      <div class="vs">${away.name}</div>
      <div class="meta" style="color:var(--muted);margin-top:8px">
        Сила: вы ${Math.round((myS.attack + myS.defense + myS.mid) / 3)}
        · соперник ${Math.round((opS.attack + opS.defense + opS.mid) / 3)}
        · ${me.formation} · ${D().STYLES.find(s => s.id === me.style)?.name || me.style}
      </div>
    `;
    matchCtx = { type: next.type, match: pm };
  }

  function drawMatchFrame(ctx, w, h, minute, colors, ball) {
    ctx.clearRect(0, 0, w, h);
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#0F766E');
    g.addColorStop(1, '#064E3B');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.lineWidth = 2;
    ctx.strokeRect(16, 16, w - 32, h - 32);
    ctx.beginPath(); ctx.arc(w / 2, h / 2, 36, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(16, h / 2); ctx.lineTo(w - 16, h / 2); ctx.stroke();
    const t = minute / 90;
    for (let i = 0; i < 11; i++) {
      const x = 40 + (i % 5) * ((w - 80) / 4) + Math.sin(minute * 0.2 + i) * 4;
      const y = 40 + Math.floor(i / 5) * 70 + Math.cos(minute * 0.15 + i) * 3 + t * 20;
      ctx.beginPath(); ctx.fillStyle = colors.home; ctx.arc(x, y, 7, 0, Math.PI * 2); ctx.fill();
    }
    for (let i = 0; i < 11; i++) {
      const x = 40 + (i % 5) * ((w - 80) / 4) + Math.cos(minute * 0.18 + i) * 4;
      const y = h - 100 - Math.floor(i / 5) * 70 + Math.sin(minute * 0.12 + i) * 3 - t * 15;
      ctx.beginPath(); ctx.fillStyle = colors.away; ctx.arc(x, y, 7, 0, Math.PI * 2); ctx.fill();
    }
    if (ball) {
      ctx.beginPath(); ctx.fillStyle = '#F8FAFC'; ctx.arc(ball.x, ball.y, 5, 0, Math.PI * 2); ctx.fill();
    }
  }

  async function runMatch() {
    if (matchPlaying) return;
    const next = matchCtx || S().nextMatch();
    if (!next) return;
    matchPlaying = true;
    matchAbort = false;
    matchCtx = next;
    show('match');
    $('#ht-panel').hidden = true;

    const home = S().clubById(next.match.home);
    const away = S().clubById(next.match.away);
    S().ensureLineup();

    const canvas = $('#match-canvas');
    const ctx = canvas.getContext('2d');
    const feed = $('#match-feed');
    feed.innerHTML = '';
    $('#m-home').textContent = home.short || home.name.slice(0, 12);
    $('#m-away').textContent = away.short || away.name.slice(0, 12);
    $('#m-score').textContent = '0:0';
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
        ball = { x: canvas.width / 2, y: ev.side === 'home' ? 40 : canvas.height - 40 };
      } else {
        ball = { x: canvas.width * (0.3 + Math.random() * 0.4), y: canvas.height * (0.25 + Math.random() * 0.5) };
      }
      const div = document.createElement('div');
      div.className = 'feed-item' + (ev.type === 'goal' ? ' goal' : '');
      div.textContent = `${ev.minute}′  ${ev.text}`;
      feed.prepend(div);
    };
    const onTick = (minute, result) => {
      $('#m-min').textContent = minute + '′';
      drawMatchFrame(ctx, canvas.width, canvas.height, minute, { home: home.color, away: away.color }, ball);
      updateStats(result);
    };

    // First half
    const half1 = E().simulateMatch(home, away, { startMinute: 1, endMinute: 45, applyFatigue: false });
    await E().playLive(half1, onEvent, onTick, { msPerMinute: 90, fromMinute: 1, toMinute: 45, aborted: () => matchAbort });

    if (matchAbort) {
      const full = E().simulateMatch(home, away, {
        startMinute: 46, endMinute: 90, score: half1.score, stats: half1.stats,
        scorersH: half1.scorersH, scorersA: half1.scorersA, applyFatigue: true, finalizeStats: true
      });
      const result = E().mergeResults(half1, full);
      score = result.score;
      $('#m-score').textContent = score.join(':');
      $('#m-min').textContent = '90′';
      finishMatch(next, result);
      return;
    }

    // HT panel
    matchCtx.half1 = half1;
    score = half1.score;
    $('#m-score').textContent = score.join(':');
    $('#m-min').textContent = '45′ П';
    showHtPanel();
  }

  function showHtPanel() {
    const panel = $('#ht-panel');
    panel.hidden = false;
    $('#ht-styles').innerHTML = D().STYLES.map(s =>
      `<button class="btn btn-tiny" data-ht-style="${s.id}">${s.name}</button>`
    ).join('');
    const me = S().club();
    S().ensureLineup();
    const xiIds = new Set(me.lineup.map(p => p.id));
    const bench = me.squad.filter(p => !xiIds.has(p.id) && !p.injured).slice(0, 8);
    $('#ht-bench').innerHTML = bench.map((p, i) => `
      <button class="row row-btn" data-ht-sub="${p.id}" data-ht-slot="${(i % 10)}">
        <div class="ovr">${p.ovr}</div>
        <div><strong>${p.name}</strong><div class="meta">замена · ${D().POS_LABEL[p.pos]}</div></div>
      </button>
    `).join('') || `<div class="news-item">Нет запасных</div>`;
  }

  async function continueSecondHalf() {
    $('#ht-panel').hidden = true;
    const next = matchCtx;
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
      }
      const div = document.createElement('div');
      div.className = 'feed-item' + (ev.type === 'goal' ? ' goal' : '');
      div.textContent = `${ev.minute}′  ${ev.text}`;
      feed.prepend(div);
    };
    const onTick = (minute, result) => {
      $('#m-min').textContent = minute + '′';
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
    await E().playLive(half2, onEvent, onTick, {
      msPerMinute: matchAbort ? 0 : 90, fromMinute: 46, toMinute: 90, aborted: () => matchAbort
    });
    const result = E().mergeResults(half1, half2);
    finishMatch(next, result);
  }

  function finishMatch(next, result) {
    if (next.type === 'cup') S().recordCupMatch(next.match, result);
    else S().recordPlayerMatch(next.match, result);
    matchPlaying = false;
    matchCtx = null;
    renderResult(result);
    show('result');
  }

  function renderResult(result) {
    const last = S().get().lastResult || result;
    const [hg, ag] = last.score;
    $('#result-card').innerHTML = `
      <div class="next-label">Итог матча</div>
      <div>${last.home}</div>
      <div class="score">${hg}:${ag}</div>
      <div>${last.away}</div>
      <div style="color:var(--muted);font-size:13px;margin-top:8px">
        Владение ${last.stats.possession.join('% — ')}%<br/>
        Удары ${last.stats.shots.join(' — ')} · в створ ${last.stats.onTarget.join(' — ')}<br/>
        ${last.prize != null ? `Призовые ${S().money(last.prize)}${last.income ? ' · касса ' + S().money(last.income) : ''}${last.competition ? ' · ' + last.competition : ''}` : ''}
      </div>
    `;
  }

  function bind() {
    document.body.addEventListener('click', (e) => {
      const nav = e.target.closest('[data-nav]');
      if (nav) { show(nav.dataset.nav); return; }

      const pl = e.target.closest('[data-player]');
      if (pl) { openPlayer(pl.dataset.player, 'squad'); return; }

      const bid = e.target.closest('[data-bid]');
      if (bid) { openBidModal(bid.dataset.bid); return; }
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
      const htStyle = e.target.closest('[data-ht-style]');
      if (htStyle) {
        S().setTactics(null, htStyle.dataset.htStyle);
        toast('Стиль: ' + htStyle.dataset.htStyle); return;
      }
      const htSub = e.target.closest('[data-ht-sub]');
      if (htSub) {
        const r = S().swapIntoXi(htSub.dataset.htSub, Number(htSub.dataset.htSlot) % 10);
        toast(r.msg || 'Замена'); showHtPanel(); return;
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
        $('#train-msg').textContent = r.msg; toast(r.msg); return;
      }
      const fac = e.target.closest('[data-fac]');
      if (fac) {
        const r = S().upgradeFacility(fac.dataset.fac);
        toast(r.msg); renderClub(); return;
      }
    });

    $('#btn-new')?.addEventListener('click', () => show('create'));
    $('#btn-continue')?.addEventListener('click', () => { if (S().load()) show('hub'); });
    $('#form-create')?.addEventListener('submit', (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      try {
        S().createCareer({
          managerName: String(fd.get('manager')).trim(),
          clubId: String(fd.get('clubId')),
          formation: String(fd.get('formation')),
          style: String(fd.get('style'))
        });
        S().autoLineup();
        toast('Карьера начата');
        show('hub');
      } catch (err) {
        toast('Ошибка: ' + err.message);
      }
    });

    $('#btn-play-match')?.addEventListener('click', () => show('prematch'));
    $('#btn-kickoff')?.addEventListener('click', () => runMatch());
    $('#btn-skip-match')?.addEventListener('click', () => { matchAbort = true; });
    $('#btn-auto-xi')?.addEventListener('click', () => { S().autoLineup(); toast('Состав собран'); renderSquad(); });
    $('#btn-auto-xi-tac')?.addEventListener('click', () => { S().autoLineup(); toast('Состав собран'); drawPitch(); renderBench(); });
    $('#sel-formation')?.addEventListener('change', (e) => { S().setTactics(e.target.value, null); S().autoLineup(); drawPitch(); renderBench(); });
    $('#sel-style')?.addEventListener('change', (e) => { S().setTactics(null, e.target.value); });
    $('#btn-second-half')?.addEventListener('click', () => continueSecondHalf());
    $('#btn-cup-play')?.addEventListener('click', () => {
      const pm = S().playerCupMatch();
      if (!pm) return;
      matchCtx = { type: 'cup', match: pm };
      show('prematch');
      renderPrematch();
    });
    $('#bid-cancel')?.addEventListener('click', () => closeBidModal());
    $('#bid-submit')?.addEventListener('click', () => {
      if (!bidEntryId) return;
      const amount = Number($('#bid-amount').value) || 0;
      const r = S().makeOffer(bidEntryId, amount, false);
      toast(r.msg);
      if (r.ok) closeBidModal();
      else if (r.counter) {
        $('#bid-counter').hidden = false;
        $('#bid-counter').textContent = 'Принять контр ' + S().money(r.counter);
      }
      renderTransfers('market');
    });
    $('#bid-counter')?.addEventListener('click', () => {
      if (!bidEntryId) return;
      const counter = (S().pendingCounters() || {})[bidEntryId];
      if (!counter) return;
      const r = S().makeOffer(bidEntryId, counter, false);
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
    ['tf-q','tf-pos','tf-league','tf-ovr','tf-price'].forEach(id => {
      $(`#${id}`)?.addEventListener('input', () => renderTransfers('market'));
      $(`#${id}`)?.addEventListener('change', () => renderTransfers('market'));
    });
    $('#btn-youth')?.addEventListener('click', () => {
      const r = S().promoteYouth();
      $('#club-msg').textContent = r.msg; toast(r.msg);
    });
    $('#btn-reset')?.addEventListener('click', () => {
      if (confirm('Сбросить карьеру EYE?')) { S().clear(); show('home'); }
    });
    $('#btn-save-cloud')?.addEventListener('click', () => cloudSave());

    document.body.addEventListener('click', (e) => {
      const curBtn = e.target.closest('[data-cur]');
      if (curBtn && curBtn.classList.contains('cur-btn')) {
        applyCurrency(curBtn.dataset.cur);
        e.stopPropagation();
      }
    });
  }

  async function cloudSave() {
    const st = S().get();
    if (!st) return toast('Нет сохранения');
    try {
      const res = await fetch(new URL('api/save', location.href).toString(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ manager: st.managerName, state: st })
      });
      if (!res.ok) throw new Error('fail');
      const data = await res.json();
      toast('Облако: ' + (data.id || 'ok'));
    } catch {
      toast('Сервер недоступен — локальное сохранение активно');
    }
  }

  async function boot() {
    bind();
    const fill = $('#boot-fill');
    for (let i = 0; i <= 100; i += 4) {
      fill.style.width = i + '%';
      await E().sleep(16);
    }
    show('home');
    refresh('home');
  }

  return { show, toast, boot, refresh };
})();

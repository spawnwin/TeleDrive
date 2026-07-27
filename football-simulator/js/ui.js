(function () {

  let friendlyRivalId = DATA.clubs[0].id;
  let activeMatchCtx = null;
  let lastScore = { home: 0, away: 0 };
  let pendingSeasonSummary = null;

  const icon = (name, cls) =>
    `<svg class="ic${cls ? ' ' + cls : ''}"><use href="#i-${name}"/></svg>`;

  const clubName = id => Save.teamName(id);
  const clubColor = id => Save.teamColor(id);

  function kitHex() {
    const k = DATA.kitColors.find(k => k.id === Save.data.kit);
    return k ? k.color : '#B6F24A';
  }

  function initials(name) {
    const skip = /^(fc|фк|фс)$/i;
    const words = name.trim().split(/\s+/).filter(w => !skip.test(w));
    const src = words.length ? words : name.trim().split(/\s+/);
    return src.slice(0, 2).map(w => w[0]).join('').toUpperCase() || 'FX';
  }

  /* Русские числительные: 1 победа, 2 победы, 5 побед. Формы задаются
     тройкой [одна, две, пять]. */
  function plural(n, forms) {
    const a = Math.abs(n) % 100, b = a % 10;
    const form = a > 10 && a < 20 ? 2 : b === 1 ? 0 : b >= 2 && b <= 4 ? 1 : 2;
    return n + ' ' + forms[form];
  }

  /* Цвет чужого клуба выводим из названия, чтобы эмблема соперника не
     менялась от захода к заходу и совпадала в списке и на предматчевом. */
  const RIVAL_COLORS = ['#F2564A', '#4AA3F2', '#F2B14A', '#A855F7', '#3FD98B',
                        '#F24A9E', '#4AE0F2', '#F27C4A'];
  function colorFromName(name) {
    let h = 0;
    for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
    return RIVAL_COLORS[h % RIVAL_COLORS.length];
  }

  /* Эмблема собирается процедурно: щит цветом формы + инициалы клуба. */
  function crestMarkup(name, color) {
    const ini = initials(name);
    const small = ini.length > 1;
    return `
      <path d="M24 3 42 9v17c0 10-7.6 17.4-18 20C13.6 43.4 6 36 6 26V9z"
            fill="${color}" opacity=".16"/>
      <path d="M24 3 42 9v17c0 10-7.6 17.4-18 20C13.6 43.4 6 36 6 26V9z"
            fill="none" stroke="${color}" stroke-width="2"/>
      <path d="M6 20h36" stroke="${color}" stroke-width="1" opacity=".45"/>
      <text x="24" y="${small ? 30 : 31}" text-anchor="middle"
            font-size="${small ? 14 : 18}" font-weight="900"
            letter-spacing="-.5" fill="${color}"
            font-family="-apple-system, BlinkMacSystemFont, sans-serif">${ini}</text>`;
  }

  function paintCrest(el) {
    if (el) el.innerHTML = crestMarkup(Save.data.clubName, kitHex());
  }

  function showScreen(id) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    const el = document.getElementById('screen-' + id);
    if (el) { el.classList.add('active'); el.scrollTop = 0; }
    if (id === 'menu') renderMenu();
    if (id === 'friendly') renderFriendly();
    if (id === 'league') renderLeague();
    if (id === 'squad') renderSquad();
    if (id === 'training') renderTraining();
    if (id === 'transfers') renderTransfers();
    if (id === 'shop') renderShop(currentShopTab);
    if (id === 'customize') renderCustomize();
    if (id === 'achievements') renderAchievements();
    if (id === 'cups') renderCups();
    if (id === 'trophies') renderTrophies();
    if (id === 'auth') renderAuth();
    if (id === 'create-team') renderCreateTeam();
    if (id === 'prematch') renderPreMatch();
    if (id === 'history') renderHistory();
    if (id === 'profile') renderProfile();
    if (id === 'rivals') renderRivals();
  }

  document.querySelectorAll('[data-nav]').forEach(btn => {
    btn.addEventListener('click', () => showScreen(btn.dataset.nav));
  });

  function showToast(text) {
    const layer = document.getElementById('global-toast-layer');
    const el = document.createElement('div');
    el.className = 'toast'; el.textContent = text;
    layer.appendChild(el);
    setTimeout(() => el.remove(), 1900);
  }

  function pill(container, items, selectedId, onPick, opts) {
    container.innerHTML = '';
    items.forEach(item => {
      const el = document.createElement('button');
      el.className = 'pill' + (item.id === selectedId ? ' selected' : '');
      const locked = opts && opts.lockedCheck && opts.lockedCheck(item);
      if (locked) el.classList.add('locked');
      const label = opts && opts.label ? opts.label(item) : item.name;
      el.innerHTML = (locked ? icon('lock', 'ic-sm') : (item.ic ? icon(item.ic, 'ic-sm') : '')) +
        `<span>${label}</span>`;
      el.addEventListener('click', () => {
        if (locked) { showToast('Открывается в магазине'); return; }
        onPick(item.id);
        pill(container, items, item.id, onPick, opts);
      });
      container.appendChild(el);
    });
  }

  // ---------------- ПАНЕЛЬ КЛУБА ----------------
  function sortedTable() {
    return Save.data.table.slice().sort((a, b) =>
      b.pts - a.pts || (b.gf - b.ga) - (a.gf - a.ga) || b.gf - a.gf);
  }

  function renderMenu() {
    if (!Save.data) return;
    const d = Save.data;
    document.getElementById('menu-club-name').textContent = d.clubName;
    document.getElementById('menu-season').textContent = d.season;
    document.getElementById('menu-season-foot').textContent = d.season;
    document.getElementById('menu-level').textContent = d.level;
    document.getElementById('menu-coins').textContent = d.coins;
    paintCrest(document.getElementById('menu-crest'));
    paintAccountBar();
    const rivalTile = document.getElementById('tile-rivals');
    if (rivalTile) rivalTile.style.display = Account.isRemote() ? '' : 'none';
    const divFoot = document.getElementById('menu-division');
    if (divFoot) divFoot.textContent = DATA.divisions.find(x => x.id === d.division).name;

    const table = sortedTable();
    const pos = table.findIndex(r => r.id === 'user') + 1;
    const me = table.find(r => r.id === 'user');
    document.getElementById('menu-position').textContent = me.played ? pos : '—';
    document.getElementById('menu-record').textContent = `${me.w}-${me.d}-${me.l}`;
    const s = Save.teamStrength();
    document.getElementById('menu-strength').textContent =
      Math.round((s.attack + s.defense) / 2);

    formStrip(document.getElementById('menu-form'), Save.formGuide(5));

    const fx = Save.nextFixture();
    const ctxEl = document.getElementById('fh-context');
    const roundEl = document.getElementById('fh-round');
    const ctaLabel = document.getElementById('fh-cta-label');

    if (fx) {
      ctxEl.textContent = fx.label;
      // В кубке стадия уже названа в подписи слева — справа её не повторяем.
      const stage = DATA.knockoutStages[fx.stage];
      roundEl.textContent = fx.kind === 'league'
        ? `Тур ${d.round + 1} / ${d.fixtures.length}`
        : (stage && fx.label.toLowerCase().includes(stage.toLowerCase()) ? '' : stage || '');
      setFixtureSide('home', fx.home);
      setFixtureSide('away', fx.away);
      ctaLabel.textContent = 'Провести матч';
    } else {
      ctxEl.textContent = 'Сезон завершён';
      roundEl.textContent = '';
      setFixtureSide('home', 'user');
      setFixtureSide('away', DATA.clubs[0].id);
      ctaLabel.textContent = 'Товарищеский матч';
    }
  }

  function setFixtureSide(side, id) {
    const crest = document.getElementById(`fh-${side}-crest`);
    const name = document.getElementById(`fh-${side}-name`);
    // Свой клуб рисуется цветом выбранной формы, чужой — цветом клуба.
    crest.innerHTML = crestMarkup(clubName(id), id === 'user' ? kitHex() : clubColor(id));
    name.textContent = clubName(id);
  }

  document.getElementById('btn-play-next').addEventListener('click', () => {
    const fx = Save.nextFixture();
    if (fx) {
      openPreMatch({
        opponentId: fx.home === 'user' ? fx.away : fx.home,
        competition: fx.kind,
        userIsHome: fx.home === 'user',
        label: fx.label
      });
    } else {
      showScreen('friendly');
    }
  });

  // ---------------- ТОВАРИЩЕСКИЙ ----------------
  function renderFriendly() {
    pill(document.getElementById('rival-list'),
      DATA.clubs.map(c => ({ id: c.id, name: c.name })),
      friendlyRivalId, id => friendlyRivalId = id);
    pill(document.getElementById('stadium-list'), DATA.stadiums, Save.data.stadiumId,
      id => { Save.data.stadiumId = id; Save.persist(); }, {
        lockedCheck: s => s.cost > 0 && !Save.owns('stadiums', s.id)
      });
    pill(document.getElementById('weather-list'), DATA.weathers, Save.data.weatherId,
      id => { Save.data.weatherId = id; Save.persist(); });
  }

  document.getElementById('btn-start-match').addEventListener('click', () => {
    openPreMatch({ opponentId: friendlyRivalId, label: 'Товарищеский матч' });
  });

  // ---------------- ЛИГА ----------------
  function renderLeague() {
    document.getElementById('league-season').textContent = Save.data.season;
    const divEl = document.getElementById('menu-division');
    if (divEl) divEl.textContent = DATA.divisions.find(x => x.id === Save.data.division).name;
    document.getElementById('league-round').textContent =
      Math.min(Save.data.round + 1, Save.data.fixtures.length);

    const table = sortedTable();
    const tbody = document.getElementById('league-table-body');
    tbody.innerHTML = '';
    table.forEach((row, i) => {
      const gd = row.gf - row.ga;
      const tr = document.createElement('tr');
      tr.className = [
        row.id === 'user' ? 'me' : '',
        i === 0 ? 'ucl' : '',
        i >= table.length - 2 ? 'drop' : ''
      ].filter(Boolean).join(' ');
      tr.innerHTML = `
        <td>${i + 1}</td>
        <td><div class="club-cell"><i class="club-dot" style="background:${row.color}"></i>${row.name}</div></td>
        <td>${row.played}</td>
        <td class="gd ${gd > 0 ? 'pos' : gd < 0 ? 'neg' : ''}">${gd > 0 ? '+' : ''}${gd}</td>
        <td class="pts">${row.pts}</td>`;
      tbody.appendChild(tr);
    });

    const round = Save.currentRoundFixtures();
    const wrap = document.getElementById('league-fixtures');
    wrap.innerHTML = '';
    if (!round) {
      wrap.innerHTML = '<p class="note">Сезон завершён — таблица обнулится, начнётся новый.</p>';
      return;
    }
    round.forEach(([h, a]) => {
      const mine = h === 'user' || a === 'user';
      const row = document.createElement('div');
      row.className = 'fixture-row' + (mine ? ' mine' : '');
      row.innerHTML = `<span class="fr-teams">${clubName(h)} — ${clubName(a)}</span>`;
      if (mine) {
        row.insertAdjacentHTML('beforeend', '<span class="fr-done">ваш матч</span>');
      } else {
        row.insertAdjacentHTML('beforeend', '<span class="fr-done">по расписанию</span>');
      }
      wrap.appendChild(row);
    });

    renderScorers();
  }

  function renderScorers() {
    const block = document.getElementById('scorers-block');
    const list = document.getElementById('scorers-list');
    const scorers = Save.topScorers(5);
    block.style.display = scorers.length ? '' : 'none';
    list.innerHTML = '';
    scorers.forEach(p => {
      const row = document.createElement('div');
      row.className = 'player-row';
      row.innerHTML = `
        <div class="player-pos ${p.pos}">${p.pos}</div>
        <div class="player-info">
          <b>${p.name}</b>
          <div class="player-meta"><span>матчей <i>${p.apps}</i></span></div>
        </div>
        <div class="player-ovr ovr-hi">${p.goals}</div>`;
      list.appendChild(row);
    });
  }

  // ---------------- СОСТАВ ----------------
  function ovrClass(v) { return v >= 70 ? 'ovr-hi' : v >= 60 ? 'ovr-mid' : 'ovr-lo'; }

  function renderSquad() {
    pill(document.getElementById('formation-list'),
      Object.keys(DATA.formations).map(id => ({ id, name: DATA.formations[id].label })),
      Save.data.formation, id => { Save.data.formation = id; Save.persist(); renderSquad(); });

    pill(document.getElementById('tactic-list'), DATA.tacticStyles, Save.data.tacticStyle,
      id => { Save.data.tacticStyle = id; Save.persist(); renderSquad(); });

    const s = Save.teamStrength();
    document.getElementById('stat-attack-fill').style.width = Math.min(100, s.attack) + '%';
    document.getElementById('stat-attack-val').textContent = Math.round(s.attack);
    document.getElementById('stat-defense-fill').style.width = Math.min(100, s.defense) + '%';
    document.getElementById('stat-defense-val').textContent = Math.round(s.defense);

    const xi = new Set(s.xi.all.map(p => p.id));
    const list = document.getElementById('squad-list');
    list.innerHTML = '';
    const order = { GK: 0, DEF: 1, MID: 2, FWD: 3 };
    Save.data.squad.slice()
      .sort((a, b) => order[a.pos] - order[b.pos] || overall(b) - overall(a))
      .forEach(p => {
        const v = overall(p);
        const out = p.injuredFor ? `травма · ${p.injuredFor}` :
                    p.suspendedFor ? `дисквалификация · ${p.suspendedFor}` : null;
        const row = document.createElement('div');
        row.className = 'player-row' + (out ? ' out' : '');
        row.innerHTML = `
          <div class="player-pos ${p.pos}">${p.pos}</div>
          <div class="player-info">
            <b>${p.name}${xi.has(p.id) ? icon('star', 'ic-sm xi') : ''}</b>
            <div class="player-meta">
              ${out
                ? `<span class="out-tag">${out}</span>`
                : `<span>форма <i>${p.fitness}%</i></span><span>настрой <i>${p.morale}%</i></span>`}
              ${p.goals ? `<span>голы <i>${p.goals}</i></span>` : ''}
              <span>${p.age} лет</span>
            </div>
          </div>
          <div class="player-ovr ${ovrClass(v)}">${v}</div>
          <button class="player-sell">Продать</button>`;
        row.querySelector('.player-sell').addEventListener('click', () => {
          const refund = Save.sellPlayer(p.id);
          if (refund === false) { showToast('Состав слишком мал для продажи'); return; }
          showToast(`Продан за ${refund} монет`);
          renderSquad();
        });
        list.appendChild(row);
      });
  }

  // ---------------- ТРЕНИРОВКИ ----------------
  function renderTraining() {
    document.getElementById('training-coins').textContent = Save.data.coins;
    const list = document.getElementById('training-list');
    list.innerHTML = '';
    const order = { GK: 0, DEF: 1, MID: 2, FWD: 3 };
    Save.data.squad.slice()
      .sort((a, b) => order[a.pos] - order[b.pos] || overall(b) - overall(a))
      .forEach(p => {
        const v = overall(p);
        const cost = Save.trainingCost(p);
        const rest = Save.restCost(p);
        const row = document.createElement('div');
        row.className = 'player-row';
        row.innerHTML = `
          <div class="player-pos ${p.pos}">${p.pos}</div>
          <div class="player-info">
            <b>${p.name}</b>
            <div class="player-meta">
              <span>${p.age} лет</span>
              <span class="outlook a${p.age <= 21 ? 'y' : p.age <= 26 ? 'm' : p.age <= 30 ? 's' : 'v'}">${Save.trainingOutlook(p.age)}</span>
              <span>форма <i>${p.fitness}%</i></span>
            </div>
          </div>
          <div class="player-ovr ${ovrClass(v)}">${v}</div>
          <div class="train-actions">
            <button class="train-btn" ${Save.data.coins < cost ? 'disabled' : ''}>${cost}</button>
            ${p.fitness >= 100 ? ''
              : `<button class="rest-btn" ${Save.data.coins < rest ? 'disabled' : ''}>+форма ${rest}</button>`}
          </div>`;
        row.querySelector('.train-btn').addEventListener('click', () => {
          const res = Save.trainPlayer(p.id);
          if (!res) { showToast('Недостаточно монет'); return; }
          showToast(res.delta > 0
            ? `${res.name}: рейтинг +${res.delta}`
            : `${res.name} потренировался, но рейтинг не вырос`);
          renderTraining();
        });
        const restBtn = row.querySelector('.rest-btn');
        if (restBtn) restBtn.addEventListener('click', () => {
          const res = Save.restPlayer(p.id);
          if (!res) { showToast('Недостаточно монет'); return; }
          showToast(`${res.name} полностью восстановлен`);
          renderTraining();
        });
        list.appendChild(row);
      });
  }

  // ---------------- ТРАНСФЕРЫ ----------------
  function renderTransfers() {
    document.getElementById('transfers-coins').textContent = Save.data.coins;
    if (!Save.data.transferPool.length) Save.refreshTransferPool();
    const list = document.getElementById('transfer-list');
    list.innerHTML = '';
    Save.data.transferPool.forEach(p => {
      const v = overall(p);
      const affordable = Save.data.coins >= p.price;
      const row = document.createElement('div');
      row.className = 'player-row';
      row.innerHTML = `
        <div class="player-pos ${p.pos}">${p.pos}</div>
        <div class="player-info">
          <b>${p.name}</b>
          <div class="player-meta"><span>${p.age} лет</span><span>форма <i>${p.fitness}%</i></span></div>
        </div>
        <div class="player-ovr ${ovrClass(v)}">${v}</div>
        <span class="player-price">${p.price}</span>
        <button class="player-buy" ${affordable ? '' : 'disabled'}>Купить</button>`;
      row.querySelector('.player-buy').addEventListener('click', () => {
        if (Save.buyPlayer(p.id)) { showToast(`${p.name} подписан`); renderTransfers(); }
        else showToast('Недостаточно монет');
      });
      list.appendChild(row);
    });
  }

  document.getElementById('btn-refresh-market').addEventListener('click', () => {
    Save.refreshTransferPool();
    renderTransfers();
    showToast('Рынок обновлён');
  });

  // ---------------- МАГАЗИН ----------------
  let currentShopTab = 'kits';
  document.querySelectorAll('.shop-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.shop-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      currentShopTab = tab.dataset.tab;
      renderShop(currentShopTab);
    });
  });

  function renderShop(tab) {
    document.getElementById('shop-coins').textContent = Save.data.coins;
    const grid = document.getElementById('shop-grid');
    grid.innerHTML = '';

    let items, category, artFn, equipKey;
    if (tab === 'kits') {
      items = DATA.kitColors; category = 'kits'; equipKey = 'kit';
      artFn = k => `<svg class="ic ic-lg" style="color:${k.color}"><use href="#i-kit"/></svg>`;
    } else if (tab === 'balls') {
      items = DATA.ballSkins; category = 'balls'; equipKey = 'ball';
      artFn = b => `<svg class="ic ic-lg" style="color:${b.color}"><use href="#i-ball"/></svg>`;
    } else if (tab === 'interventions') {
      items = DATA.interventions; category = 'interventions'; equipKey = null;
      artFn = i => icon(i.ic, 'ic-lg');
    } else {
      items = DATA.stadiums; category = 'stadiums'; equipKey = null;
      artFn = s => `<span class="si-swatch" style="background:${s.grass}"></span>`;
    }

    items.forEach(item => {
      const owned = item.cost === 0 || Save.owns(category, item.id);
      const equipped = equipKey && Save.data[equipKey] === item.id;
      const card = document.createElement('div');
      card.className = 'shop-item';
      card.innerHTML = `
        <div class="si-art">${artFn(item)}</div>
        <div class="si-name">${item.name}</div>
        <div class="si-desc">${item.desc || ''}</div>
        ${owned ? '' : `<div class="si-price">${item.cost} монет</div>`}
        <button class="si-buy ${equipped ? 'equipped' : owned ? 'owned' : ''}">
          ${equipped ? 'В деле' : owned ? (equipKey ? 'Выбрать' : 'Куплено') : 'Купить'}
        </button>`;
      card.querySelector('.si-buy').addEventListener('click', () => {
        if (!owned) {
          if (Save.buy(category, item.id, item.cost)) {
            Save.unlockAchievement('shopaholic');
            if (equipKey) Save.data[equipKey] = item.id;
            Save.persist();
            renderShop(tab);
            showToast(`${item.name} — куплено`);
          } else showToast('Недостаточно монет');
        } else if (equipKey && !equipped) {
          Save.data[equipKey] = item.id;
          Save.persist();
          renderShop(tab);
        }
      });
      grid.appendChild(card);
    });
  }

  // ---------------- КЛУБ И ФОРМА ----------------
  function renderCustomize() {
    const input = document.getElementById('club-name-input');
    input.value = Save.data.clubName;
    paintCrest(document.getElementById('customize-crest'));

    input.oninput = () => {
      const preview = document.getElementById('customize-crest');
      preview.innerHTML = crestMarkup(input.value.trim() || 'FC Аврора', kitHex());
    };

    pill(document.getElementById('kit-color-list'), DATA.kitColors, Save.data.kit,
      id => { Save.data.kit = id; paintCrest(document.getElementById('customize-crest')); }, {
        lockedCheck: k => !Save.owns('kits', k.id)
      });
    pill(document.getElementById('ball-skin-list'), DATA.ballSkins, Save.data.ball,
      id => Save.data.ball = id, {
        lockedCheck: b => !Save.owns('balls', b.id)
      });
  }

  document.getElementById('btn-save-customize').addEventListener('click', () => {
    const name = document.getElementById('club-name-input').value.trim();
    Save.data.clubName = name || 'FC Аврора';
    Save.data.table.find(r => r.id === 'user').name = Save.data.clubName;
    Save.persist();
    showToast('Клуб обновлён');
    showScreen('menu');
  });

  // ---------------- ДОСТИЖЕНИЯ ----------------
  function renderAchievements() {
    const list = document.getElementById('achievements-list');
    list.innerHTML = '';
    let unlocked = 0;
    DATA.achievements.forEach(a => {
      const has = !!Save.data.achievements[a.id];
      if (has) unlocked++;
      const el = document.createElement('div');
      el.className = 'achv-item' + (has ? ' unlocked' : '');
      el.innerHTML = `
        <span class="ai-mark">${icon(has ? a.ic : 'lock', 'ic-sm')}</span>
        <div><b>${a.name}</b><small>${a.desc}</small></div>`;
      list.appendChild(el);
    });
    document.getElementById('achv-count').textContent =
      `${unlocked} из ${DATA.achievements.length}`;
  }


  // ---------------- ВХОД И ПРОФИЛИ ----------------
  let authMode = 'local';

  /* Когда игра открыта с собственного бэкенда, адрес подставлен сам:
     обычному игроку показываем только имя и пароль, всю техническую часть
     (переключатель режимов и поле адреса) прячем. */
  function renderAuth() {
    const auto = Account.serverDetected;
    document.getElementById('mode-switch').classList.toggle('hidden', auto);
    document.getElementById('server-block').classList.toggle('hidden', auto);
    document.getElementById('btn-play-local').classList.toggle('hidden', !auto);
    document.getElementById('btn-use-account').classList.toggle('hidden', !auto);

    document.querySelectorAll('.mode-btn').forEach(b =>
      b.classList.toggle('active', b.dataset.mode === authMode));
    document.getElementById('auth-local').classList.toggle('hidden', authMode !== 'local');
    document.getElementById('auth-remote').classList.toggle('hidden', authMode !== 'remote');
    document.getElementById('server-url').value = Net.baseUrl;
    renderProfiles();
  }

  function renderProfiles() {
    const list = document.getElementById('profile-list');
    const profiles = Profiles.list().sort((a, b) => b.lastPlayed - a.lastPlayed);
    list.innerHTML = '';
    if (!profiles.length) {
      list.innerHTML = '<p class="profile-empty">Профилей пока нет — создайте первый.</p>';
      return;
    }
    profiles.forEach(p => {
      const row = document.createElement('div');
      row.className = 'profile-row';
      row.innerHTML = `
        <svg class="pr-crest" viewBox="0 0 48 48">${crestMarkup(p.clubName || p.name, '#B6F24A')}</svg>
        <div class="pr-info">
          <b>${p.name}</b>
          <small>${p.clubName ? p.clubName : 'клуб не создан'}${p.pin ? ' · PIN' : ''}</small>
        </div>
        <button class="pr-enter">Войти</button>
        <button class="pr-del" aria-label="Удалить">✕</button>`;
      row.querySelector('.pr-enter').addEventListener('click', () => enterProfile(p));
      row.querySelector('.pr-del').addEventListener('click', () => {
        if (confirm(`Удалить профиль «${p.name}» вместе с сохранением?`)) {
          Profiles.remove(p.id);
          renderProfiles();
        }
      });
      list.appendChild(row);
    });
  }

  function enterProfile(p) {
    if (p.pin) {
      const entered = prompt(`PIN для профиля «${p.name}»`);
      if (entered === null) return;
      if (!Profiles.checkPin(p.id, entered.trim())) { showToast('Неверный PIN'); return; }
    }
    Profiles.setActive(p.id);
    Account.mode = 'local';
    Save.loadProfile(p.id);
    afterSignIn();
  }

  document.querySelectorAll('.mode-btn').forEach(btn => {
    btn.addEventListener('click', () => { authMode = btn.dataset.mode; renderAuth(); });
  });

  document.getElementById('btn-create-profile').addEventListener('click', () => {
    const name = document.getElementById('new-profile-name').value.trim();
    const pin = document.getElementById('new-profile-pin').value.trim();
    if (name.length < 3) { showToast('Имя не короче трёх символов'); return; }
    if (Profiles.nameTaken(name)) { showToast('Такое имя уже есть'); return; }
    const p = Profiles.create(name, pin);
    Profiles.setActive(p.id);
    Account.mode = 'local';
    Save.loadProfile(p.id);
    document.getElementById('new-profile-name').value = '';
    document.getElementById('new-profile-pin').value = '';
    afterSignIn();
  });

  document.getElementById('btn-connect').addEventListener('click', async () => {
    const url = document.getElementById('server-url').value.trim();
    const status = document.getElementById('server-status');
    if (!url) { status.textContent = 'Укажите адрес сервера'; return; }
    status.textContent = 'Проверяем…';
    try {
      await Account.connect(url);
      status.textContent = 'Сервер отвечает — можно входить';
    } catch (e) {
      status.textContent = e.message;
    }
  });

  async function remoteAuth(kind) {
    const name = document.getElementById('account-name').value.trim();
    const pass = document.getElementById('account-pass').value;
    const status = document.getElementById('server-status');
    if (!Net.enabled()) { status.textContent = 'Сначала укажите и проверьте адрес сервера'; return; }
    if (!name || !pass) { showToast('Введите имя и пароль'); return; }
    status.textContent = kind === 'login' ? 'Входим…' : 'Регистрируем…';
    try {
      if (kind === 'login') await Account.login(name, pass);
      else await Account.register(name, pass);
      document.getElementById('account-pass').value = '';
      status.textContent = '';
      afterSignIn();
    } catch (e) {
      status.textContent = e.message;
    }
  }

  document.getElementById('btn-play-local').addEventListener('click', () => {
    authMode = 'local'; renderAuth();
  });
  document.getElementById('btn-use-account').addEventListener('click', () => {
    authMode = 'remote'; renderAuth();
  });

  document.getElementById('btn-login').addEventListener('click', () => remoteAuth('login'));
  document.getElementById('btn-register').addEventListener('click', () => remoteAuth('register'));

  /* После входа: если клуб ещё не создан — мастер, иначе панель клуба. */
  function afterSignIn() {
    if (!Save.data) { showScreen('auth'); return; }
    showScreen(Save.data.created ? 'menu' : 'create-team');
  }

  document.getElementById('btn-logout').addEventListener('click', async () => {
    await Account.logout();
    authMode = (Account.serverDetected || Net.enabled()) ? 'remote' : 'local';
    showScreen('auth');
  });

  // ---------------- СОЗДАНИЕ КОМАНДЫ ----------------
  const draft = { clubName: 'FC Аврора', kit: 'cyan', formation: '4-4-2', tacticStyle: 'balance' };

  /* Состав генерируется вместе с сохранением, поэтому при создании клуба его
     можно сразу показать — игрок видит, кем будет играть, до первого матча. */
  function renderCreateSquad() {
    const squad = Save.data.squad;
    const ratings = squad.map(overall);
    const avg = Math.round(ratings.reduce((a, b) => a + b, 0) / squad.length);
    const best = Math.max.apply(null, ratings);
    const age = (squad.reduce((a, p) => a + p.age, 0) / squad.length).toFixed(1);

    document.getElementById('cs-rating').textContent = avg;
    document.getElementById('cs-age').textContent = age;
    document.getElementById('cs-best').textContent = best;

    const order = { GK: 0, DEF: 1, MID: 2, FWD: 3 };
    const grid = document.getElementById('create-squad');
    grid.innerHTML = '';
    squad.slice()
      .sort((a, b) => order[a.pos] - order[b.pos] || overall(b) - overall(a))
      .forEach(p => {
        const cell = document.createElement('div');
        cell.className = 'xi-cell';
        cell.innerHTML = `<div class="player-pos ${p.pos}">${p.pos}</div>
          <span>${p.name}</span><b>${overall(p)}</b>`;
        grid.appendChild(cell);
      });

    const young = squad.filter(p => p.age <= 21).length;
    document.getElementById('cs-note').textContent =
      `${squad.length} игроков, из них молодых до 21 года — ${young}. ` +
      'Состав можно менять на трансферном рынке и в тренировках.';
  }

  document.getElementById('btn-reroll-squad').addEventListener('click', () => {
    Save.data.squad = genSquad(62);
    Save.persist();
    renderCreateSquad();
    showToast('Состав пересобран');
  });

  function renderCreateTeam() {
    const nameInput = document.getElementById('create-name');
    nameInput.value = draft.clubName;
    const repaint = () => {
      document.getElementById('create-crest').innerHTML =
        crestMarkup(draft.clubName || 'FC Аврора',
          (DATA.kitColors.find(k => k.id === draft.kit) || {}).color || '#B6F24A');
    };
    nameInput.oninput = () => { draft.clubName = nameInput.value.trim(); repaint(); };
    repaint();

    pill(document.getElementById('create-kit'), DATA.kitColors, draft.kit,
      id => { draft.kit = id; repaint(); });
    pill(document.getElementById('create-formation'),
      Object.keys(DATA.formations).map(id => ({ id, name: DATA.formations[id].label })),
      draft.formation, id => draft.formation = id);
    pill(document.getElementById('create-style'), DATA.tacticStyles, draft.tacticStyle,
      id => draft.tacticStyle = id);

    renderCreateSquad();
  }

  document.getElementById('btn-create-team').addEventListener('click', () => {
    Save.createTeam({
      clubName: draft.clubName || 'FC Аврора',
      kit: draft.kit, formation: draft.formation, tacticStyle: draft.tacticStyle
    });
    const st0 = Save.teamStrength();
    Save.data.rating = Math.round((st0.attack + st0.defense) / 2);
    Save.persist();
    Account.scheduleSync();
    showToast('Клуб основан');
    showScreen('menu');
  });

  // ---------------- КУБКИ ----------------
  let cupTab = 'cup';
  document.querySelectorAll('.cup-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.cup-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      cupTab = tab.dataset.cup;
      renderCups();
    });
  });

  function renderCups() {
    if (!Save.data) return;
    const wrap = document.getElementById('bracket-wrap');
    const br = cupTab === 'cup' ? Save.data.cup : Save.data.world;
    wrap.innerHTML = '';

    if (!br) {
      wrap.innerHTML = '<p class="locked-note">Чемпионат мира проводится раз в четыре сезона. ' +
        'Ближайший — в сезоне ' + (Save.data.season + (4 - Save.data.season % 4) % 4 || 4) + '.</p>';
      return;
    }

    if (br.winner) {
      wrap.insertAdjacentHTML('beforeend', `
        <div class="bracket-champion">
          ${icon('trophy', 'ic-lg')}
          <div><b>${clubName(br.winner)}</b><small>обладатель трофея</small></div>
        </div>`);
    }

    br.ties.forEach((ties, stage) => {
      const box = document.createElement('div');
      box.className = 'bracket-stage';
      box.innerHTML = `<h3>${DATA.knockoutStages[stage] || 'Стадия ' + (stage + 1)}</h3>`;
      const res = br.results[stage];
      ties.forEach(([a, b], i) => {
        const r = res && res[i];
        const tie = document.createElement('div');
        tie.className = 'tie' + (a === 'user' || b === 'user' ? ' mine' : '');
        tie.innerHTML =
          side(a, r) + side(b, r) +
          (r && r.shootout ? '<div class="tie-note">по пенальти</div>' : '') +
          (!r ? '<div class="tie-pending">матч ещё не сыгран</div>' : '');
        box.appendChild(tie);
      });
      wrap.appendChild(box);
    });
  }

  function side(id, r) {
    const goals = !r ? '' : (r.a === id ? r.ga : r.gb);
    const cls = !r ? '' : (r.winner === id ? ' win' : ' lose');
    return `<div class="tie-side${cls}">
      <i class="club-dot" style="background:${clubColor(id)}"></i>
      <span class="tn">${clubName(id)}</span>
      <span class="tg">${goals}</span></div>`;
  }

  // ---------------- ТРОФЕИ ----------------
  function renderTrophies() {
    if (!Save.data) return;
    const list = document.getElementById('trophy-list');
    const trophies = Save.data.trophies || [];
    document.getElementById('trophy-count').textContent = trophies.length
      ? trophies.length + ' шт.' : 'пока пусто';
    list.innerHTML = '';
    if (!trophies.length) {
      list.innerHTML = '<p class="locked-note">Витрина пуста. Выиграйте чемпионат, кубок или мировой турнир.</p>';
    }
    trophies.slice().reverse().forEach(t => {
      const title = t.type === 'league'
        ? 'Чемпион · ' + (DATA.divisions.find(d => d.id === t.division) || {}).name
        : DATA.competitions[t.type].name;
      const row = document.createElement('div');
      row.className = 'player-row trophy-row';
      row.innerHTML = `
        <div class="player-pos">${icon('trophy', 'ic-sm')}</div>
        <div class="player-info"><b>${title}</b>
          <div class="player-meta"><span>сезон ${t.season}</span></div></div>`;
      list.appendChild(row);
    });

    const block = document.getElementById('leaderboard-block');
    if (!Account.isRemote()) { block.style.display = 'none'; return; }
    block.style.display = '';
    const lb = document.getElementById('leaderboard-list');
    lb.innerHTML = '<p class="locked-note">Загружаем…</p>';
    Net.leaderboard().then(data => {
      lb.innerHTML = '';
      if (!data.rows.length) { lb.innerHTML = '<p class="locked-note">Пока никого.</p>'; return; }
      data.rows.forEach((r, i) => {
        const row = document.createElement('div');
        row.className = 'player-row';
        row.innerHTML = `
          <div class="player-pos">${i + 1}</div>
          <div class="player-info"><b>${r.clubName}</b>
            <div class="player-meta"><span>${r.manager}</span><span>сезон ${r.season}</span></div></div>
          <div class="player-ovr ovr-hi">${r.trophies}</div>`;
        lb.appendChild(row);
      });
    }).catch(e => { lb.innerHTML = `<p class="locked-note">${e.message}</p>`; });
  }

  function paintAccountBar() {
    const label = document.getElementById('account-label');
    const dot = document.getElementById('sync-dot');
    if (!label) return;
    label.textContent = Account.displayName() +
      (Account.isRemote() ? ' · сервер' : ' · на устройстве');
    dot.className = 'sync-dot ' + (Account.isRemote() ? Account.syncState === 'idle'
      ? 'remote' : Account.syncState : '');
  }
  Account.onSyncChange = paintAccountBar;


  // ---------------- ПОДГОТОВКА К МАТЧУ ----------------
  let pendingMatch = null;

  function formStrip(el, list) {
    el.innerHTML = '';
    const marks = { w: 'В', d: 'Н', l: 'П' };
    if (!list.length) {
      el.innerHTML = '<i class="none">—</i>';
      return;
    }
    list.forEach(r => {
      const i = document.createElement('i');
      i.className = r;
      i.textContent = marks[r] || '—';
      el.appendChild(i);
    });
  }

  /* Сила соперника: у клуба это его power, у живого менеджера — рейтинг
     состава, присланный сервером. */
  function rivalStrength(ctx) {
    if (ctx.rivalRating) return { attack: ctx.rivalRating, defense: ctx.rivalRating };
    const c = DATA.findClub(ctx.opponentId);
    const p = c ? c.power : 60;
    return { attack: p, defense: p };
  }

  function openPreMatch(ctx) {
    pendingMatch = ctx;
    showScreen('prematch');
  }

  function renderPreMatch() {
    const ctx = pendingMatch;
    if (!ctx) { showScreen('menu'); return; }

    document.getElementById('pm-competition').textContent =
      ctx.competition ? DATA.competitions[ctx.competition].name : 'Товарищеский матч';
    document.getElementById('pm-stage').textContent = ctx.label || '';

    document.getElementById('pm-home-crest').innerHTML = crestMarkup(Save.data.clubName, kitHex());
    document.getElementById('pm-home-name').textContent = Save.data.clubName;
    const awayName = ctx.rivalName || clubName(ctx.opponentId);
    document.getElementById('pm-away-crest').innerHTML =
      crestMarkup(awayName, ctx.rivalColor || clubColor(ctx.opponentId));
    document.getElementById('pm-away-name').textContent = awayName;

    formStrip(document.getElementById('pm-home-form'), Save.formGuide(5));
    // Форма живого менеджера приходит с сервера, у клубов-ботов она своя.
    formStrip(document.getElementById('pm-away-form'),
      ctx.rivalForm || (ctx.rivalRating ? [] : Save.rivalForm(ctx.opponentId, 5)));

    const us = Save.teamStrength();
    const them = rivalStrength(ctx);
    const setRow = (key, ourVal, theirVal) => {
      document.getElementById(`pm-${key}-us`).textContent = Math.round(ourVal);
      document.getElementById(`pm-${key}-them`).textContent = Math.round(theirVal);
      const share = ourVal + theirVal > 0 ? ourVal / (ourVal + theirVal) * 100 : 50;
      document.getElementById(`pm-${key}-bar`).style.width = share + '%';
    };
    setRow('atk', us.attack, them.defense);
    setRow('def', us.defense, them.attack);

    const diff = (us.attack + us.defense) / 2 - (them.attack + them.defense) / 2;
    const verdict = document.getElementById('pm-verdict');
    verdict.textContent = diff > 6 ? 'мы сильнее' : diff < -6 ? 'соперник сильнее' : 'силы равны';

    pill(document.getElementById('pm-tactic'), DATA.tacticStyles, Save.data.tacticStyle,
      id => { Save.data.tacticStyle = id; Save.persist(); renderPreMatch(); });

    const xi = us.xi;
    document.getElementById('pm-xi-count').textContent = xi.all.length + ' из 11';
    const grid = document.getElementById('pm-xi');
    grid.innerHTML = '';
    xi.all.forEach(p => {
      const cell = document.createElement('div');
      cell.className = 'xi-cell';
      cell.innerHTML = `<div class="player-pos ${p.pos}">${p.pos}</div>
        <span>${p.name}</span><b>${overall(p)}</b>`;
      grid.appendChild(cell);
    });

    const out = Save.data.squad.filter(p => !Save.isAvailable(p));
    document.getElementById('pm-missing').textContent = out.length
      ? 'Не сыграют: ' + out.map(p => p.name).join(', ')
      : 'Все игроки в строю.';
  }

  document.getElementById('btn-kickoff').addEventListener('click', () => {
    if (pendingMatch) launchMatch(pendingMatch);
  });

  // ---------------- ИСТОРИЯ ----------------
  function renderHistory() {
    const list = document.getElementById('history-list');
    const hist = Save.data.history || [];
    const w = hist.filter(h => h.result === 'w').length;
    const d = hist.filter(h => h.result === 'd').length;
    document.getElementById('history-summary').textContent = hist.length
      ? [plural(w, ['победа', 'победы', 'побед']),
         plural(d, ['ничья', 'ничьи', 'ничьих']),
         plural(hist.length - w - d, ['поражение', 'поражения', 'поражений'])].join(' · ')
      : 'пока пусто';

    list.innerHTML = '';
    if (!hist.length) {
      list.innerHTML = '<p class="locked-note">Матчей ещё не было.</p>';
      return;
    }
    const marks = { w: 'В', d: 'Н', l: 'П' };
    hist.forEach(h => {
      const comp = h.competition === 'friendly'
        ? 'Товарищеский'
        : (DATA.competitions[h.competition] || {}).name || h.competition;
      const row = document.createElement('div');
      row.className = 'hist-row';
      const color = h.opponentColor || colorFromName(h.opponent);
      row.innerHTML = `
        <span class="hist-mark ${h.result}">${marks[h.result]}</span>
        <svg class="hist-crest" viewBox="0 0 48 48">${crestMarkup(h.opponent, color)}</svg>
        <div class="hist-info">
          <b>${h.opponent}</b>
          <small>${comp} · сезон ${h.season}</small>
        </div>
        <span class="hist-score">${h.gf}:${h.ga}</span>`;
      list.appendChild(row);
    });
  }

  // ---------------- ПРОФИЛЬ ----------------
  function renderProfile() {
    const d = Save.data;
    document.getElementById('pf-crest').innerHTML = crestMarkup(d.clubName, kitHex());
    document.getElementById('pf-club').textContent = d.clubName;
    document.getElementById('pf-manager').textContent = Account.displayName();
    const where = document.getElementById('pf-where');
    where.textContent = Account.isRemote() ? 'аккаунт на сервере' : 'сохранение на устройстве';
    where.className = 'profile-badge' + (Account.isRemote() ? ' cloud' : '');

    document.getElementById('pf-level').textContent = d.level;
    const need = Save.xpForNextLevel(d.level);
    document.getElementById('pf-xp').textContent = `${d.xp} / ${need} опыта`;
    document.getElementById('pf-xp-bar').style.width = Math.min(100, d.xp / need * 100) + '%';

    const st = d.stats || { matches: 0, wins: 0, goals: 0 };
    document.getElementById('pf-seasons').textContent = d.season;
    document.getElementById('pf-matches').textContent = st.matches;
    document.getElementById('pf-wins').textContent = st.wins;
    document.getElementById('pf-winrate').textContent =
      st.matches ? Math.round(st.wins / st.matches * 100) + '%' : '0%';
    document.getElementById('pf-goals').textContent = st.goals;
    document.getElementById('pf-trophies').textContent = (d.trophies || []).length;

    const table = sortedTable();
    const me = table.find(r => r.id === 'user');
    document.getElementById('pf-division').textContent =
      DATA.divisions.find(x => x.id === d.division).name;
    document.getElementById('pf-place').textContent =
      me && me.played ? (table.findIndex(r => r.id === 'user') + 1) + ' место' : 'сезон не начат';
    const s = Save.teamStrength();
    document.getElementById('pf-rating').textContent = Math.round((s.attack + s.defense) / 2);
    document.getElementById('pf-squad').textContent = d.squad.length;
    document.getElementById('pf-coins').textContent = d.coins;

    // Легенда клуба — лучшие по голам за всю карьеру, а не за сезон.
    const legend = document.getElementById('pf-legend');
    legend.innerHTML = '';
    const best = d.squad.slice()
      .map(p => ({ p, total: p.careerGoals + p.goals }))
      .filter(x => x.total > 0)
      .sort((a, b) => b.total - a.total)
      .slice(0, 3);
    if (!best.length) {
      legend.innerHTML = '<p class="locked-note">Голов пока никто не забил.</p>';
    }
    best.forEach(({ p, total }) => {
      const row = document.createElement('div');
      row.className = 'player-row';
      row.innerHTML = `
        <div class="player-pos ${p.pos}">${p.pos}</div>
        <div class="player-info"><b>${p.name}</b>
          <div class="player-meta"><span>матчей ${p.apps}</span><span>${p.age} лет</span></div></div>
        <div class="player-ovr ovr-hi">${total}</div>`;
      legend.appendChild(row);
    });
  }

  document.getElementById('btn-profile-logout').addEventListener('click', async () => {
    await Account.logout();
    authMode = (Account.serverDetected || Net.enabled()) ? 'remote' : 'local';
    showScreen('auth');
  });

  document.getElementById('club-head').addEventListener('click', () => showScreen('profile'));

  // ---------------- ВЫЗОВ МЕНЕДЖЕРАМ ----------------
  function renderRivals() {
    const list = document.getElementById('rivals-list');
    const count = document.getElementById('rivals-count');
    if (!Account.isRemote()) {
      count.textContent = '';
      list.innerHTML = '<p class="locked-note">Нужен аккаунт на сервере: только так видно клубы других менеджеров.</p>';
      return;
    }
    list.innerHTML = '<p class="locked-note">Загружаем…</p>';
    Net.rivals().then(data => {
      list.innerHTML = '';
      count.textContent = data.rows.length
        ? plural(data.rows.length, ['клуб', 'клуба', 'клубов']) : '';
      if (!data.rows.length) {
        list.innerHTML = '<p class="locked-note">Пока вы единственный менеджер на сервере.</p>';
        return;
      }
      data.rows.forEach(r => {
        const color = colorFromName(r.clubName + r.manager);
        const row = document.createElement('div');
        row.className = 'player-row rival-row';
        row.innerHTML = `
          <svg class="rival-crest" viewBox="0 0 48 48">${crestMarkup(r.clubName, color)}</svg>
          <div class="player-info"><b>${r.clubName}</b>
            <div class="player-meta"><span>${r.manager}</span>
              <span>${(DATA.divisions.find(x => x.id === r.division) || {}).short || ''}</span>
              <span>трофеев ${r.trophies}</span></div>
            <div class="form-strip sm"></div></div>
          <div class="player-ovr">${r.rating}</div>
          <button class="rival-play">Вызвать</button>`;
        formStrip(row.querySelector('.form-strip'), r.form || []);
        row.querySelector('.rival-play').addEventListener('click', () => {
          openPreMatch({
            opponentId: 'rival:' + r.id,
            rivalName: r.clubName,
            rivalRating: r.rating,
            rivalForm: r.form || [],
            rivalColor: color,
            label: 'Товарищеский матч · ' + r.manager
          });
        });
        list.appendChild(row);
      });
    }).catch(e => { list.innerHTML = `<p class="locked-note">${e.message}</p>`; });
  }

  // ---------------- ЭФИР МАТЧА ----------------
  const EVENT_ICON = {
    goal: 'ball', save: 'shield', miss: 'miss', card: 'card',
    injury: 'injury', boost: 'flame', chance: 'attack', info: 'whistle'
  };

  function pushCommentary(ev) {
    const feed = document.getElementById('commentary-feed');
    const div = document.createElement('div');
    div.className = 'cfeed-item ' + (ev.kind || 'info');
    div.innerHTML = `<span class="cmin">${ev.minute}'</span>` +
      `<span class="cico">${icon(EVENT_ICON[ev.kind] || 'whistle', 'ic-sm')}</span>` +
      `<span class="ctext">${ev.text}</span>`;
    feed.appendChild(div);
    feed.scrollTop = feed.scrollHeight;
  }

  function paintTimeline(minute, scorers) {
    document.getElementById('tl-fill').style.width =
      Math.min(100, minute / 90 * 100) + '%';
    if (!scorers) return;
    const marks = document.getElementById('tl-marks');
    marks.innerHTML = '';
    scorers.forEach(g => {
      const i = document.createElement('i');
      i.style.left = Math.min(100, g.minute / 90 * 100) + '%';
      i.style.background = g.side === 'home' ? kitHex() : clubColor(activeMatchCtx.opponentId);
      marks.appendChild(i);
    });
  }

  function renderInterventionButtons() {
    const row = document.getElementById('intervention-row');
    row.innerHTML = '';
    DATA.interventions.forEach(iv => {
      if (iv.id === 'masterclass') return;           // пассивное, срабатывает при смене тактики
      if (!Save.data.ownedInterventions.includes(iv.id)) return;
      const b = document.createElement('button');
      b.className = 'mgr-intervention-btn';
      b.innerHTML = icon(iv.ic, 'ic-sm') + iv.short;
      b.addEventListener('click', () => {
        const ok = iv.id === 'speech' ? MatchEngine.useSpeech() : MatchEngine.useIronwall();
        if (ok) b.disabled = true;
        else showToast('Уже использовано в этом матче');
      });
      row.appendChild(b);
    });
  }

  function launchMatch(ctx) {
    activeMatchCtx = ctx;
    lastScore = { home: 0, away: 0 };
    showScreen('match');
    document.getElementById('commentary-feed').innerHTML = '';
    document.getElementById('hud-home-name').textContent = Save.data.clubName;
    const oppLabel = ctx.rivalName || clubName(ctx.opponentId);
    document.getElementById('hud-away-name').textContent = oppLabel;
    document.getElementById('bb-home-dot').style.background = kitHex();
    document.getElementById('bb-away-dot').style.background =
      ctx.rivalColor || clubColor(ctx.opponentId);
    document.getElementById('hud-score').textContent = '0:0';
    document.getElementById('hud-minute').textContent = "0'";
    document.getElementById('tl-fill').style.width = '0%';
    document.getElementById('tl-marks').innerHTML = '';
    document.getElementById('btn-sub').disabled = false;
    document.querySelectorAll('.speed-btn[data-speed]')
      .forEach(b => b.classList.toggle('active', b.dataset.speed === '1'));
    document.querySelectorAll('.mgr-tactic-btn')
      .forEach(b => b.classList.toggle('active', b.dataset.tactic === Save.data.tacticStyle));
    renderInterventionButtons();

    MatchEngine.init();
    MatchEngine.start({
      opponentId: ctx.opponentId,
      rivalName: ctx.rivalName,
      rivalRating: ctx.rivalRating,
      rivalColor: ctx.rivalColor,
      stadiumId: Save.data.stadiumId,
      weatherId: Save.data.weatherId,
      onCommentary: pushCommentary,
      onScore: score => {
        document.getElementById('hud-score').textContent = `${score.home}:${score.away}`;
        if (score.home > lastScore.home) flashGoal();
        lastScore = { home: score.home, away: score.away };
      },
      onMinute: m => {
        document.getElementById('hud-minute').textContent = m + "'";
        paintLiveStats();
        paintTimeline(m, MatchEngine.getScorers());
      },
      onFinish: result => onMatchFinish(result, ctx)
    });
    paintLiveStats();
  }

  function paintLiveStats() {
    const s = MatchEngine.getStats();
    if (!s) return;
    document.getElementById('poss-home').textContent = s.possHome + '%';
    document.getElementById('poss-away').textContent = (100 - s.possHome) + '%';
    document.getElementById('poss-fill').style.width = s.possHome + '%';
    document.getElementById('shots-home').textContent = s.home.shots;
    document.getElementById('shots-away').textContent = s.away.shots;
    document.getElementById('target-home').textContent = s.home.onTarget;
    document.getElementById('target-away').textContent = s.away.onTarget;
  }

  function flashGoal() {
    const screen = document.getElementById('screen-match');
    const flash = document.createElement('div');
    flash.className = 'goal-flash';
    screen.appendChild(flash);
    setTimeout(() => flash.remove(), 520);
  }

  document.querySelectorAll('.speed-btn[data-speed]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.speed-btn[data-speed]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      MatchEngine.setSpeed(Number(btn.dataset.speed));
    });
  });
  document.getElementById('btn-skip').addEventListener('click', () => MatchEngine.skip());
  document.querySelectorAll('.mgr-tactic-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      MatchEngine.setTactic(btn.dataset.tactic);
      document.querySelectorAll('.mgr-tactic-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });
  document.getElementById('btn-sub').addEventListener('click', e => {
    if (MatchEngine.substitute()) {
      if (MatchEngine.getSubsUsed() >= 3) e.currentTarget.disabled = true;
    } else showToast('Некого менять — все свежие');
  });

  document.getElementById('btn-pause').addEventListener('click', () => {
    MatchEngine.pause();
    document.getElementById('overlay-pause').classList.remove('hidden');
  });
  document.getElementById('btn-resume').addEventListener('click', () => {
    MatchEngine.resume();
    document.getElementById('overlay-pause').classList.add('hidden');
  });
  document.getElementById('btn-quit-match').addEventListener('click', () => {
    document.getElementById('overlay-pause').classList.add('hidden');
    MatchEngine.stop();
    showScreen('menu');
  });

  function onMatchFinish(result, ctx) {
    const { score } = result;
    const win = score.home > score.away;
    const draw = score.home === score.away;
    let seasonSummary = null;

    if (ctx.competition) {
      const ev = Save.currentEvent();
      if (ctx.competition === 'league') {
        if (ctx.userIsHome) Save.recordResult('user', ctx.opponentId, score.home, score.away);
        else Save.recordResult(ctx.opponentId, 'user', score.away, score.home);
        const top = sortedTable()[0];
        if (top && top.id === 'user') Save.unlockAchievement('top_table');
      }
      seasonSummary = Save.advanceAfterUserMatch(ev, {
        userGoals: score.home, oppGoals: score.away
      });
    }
    pendingSeasonSummary = seasonSummary;

    renderResultDetails(result, ctx);

    Save.data.stats.matches++;
    Save.data.stats.goals += score.home;
    if (win) Save.data.stats.wins++;
    if (score.away === 0) Save.unlockAchievement('clean_sheet');
    if (score.home > 0) Save.unlockAchievement('first_goal');
    if (win) Save.unlockAchievement('first_win');
    if (win && score.home - score.away >= 3) Save.unlockAchievement('hat_trick');

    let coins = 40 + score.home * 15;
    let xp = 40 + score.home * 12;
    if (win) { coins += 80; xp += 40; } else if (draw) { coins += 25; xp += 15; }

    Save.addXp(xp);
    Save.addCoins(coins);

    Save.recordMatch({
      competition: ctx.competition || 'friendly',
      opponent: ctx.rivalName || clubName(ctx.opponentId),
      opponentColor: ctx.rivalColor || clubColor(ctx.opponentId),
      gf: score.home, ga: score.away
    });

    // Рейтинг состава уходит на сервер: по нему другие менеджеры видят силу клуба.
    const st = Save.teamStrength();
    Save.data.rating = Math.round((st.attack + st.defense) / 2);

    const title = document.getElementById('result-title');
    title.textContent = win ? 'Победа' : draw ? 'Ничья' : 'Поражение';
    title.className = 'result-verdict ' + (win ? 'win' : draw ? 'draw' : 'loss');
    document.getElementById('result-score').textContent = `${score.home}:${score.away}`;
    document.getElementById('stat-xp').textContent = '+' + xp;
    document.getElementById('stat-coins').textContent = '+' + coins;
    document.getElementById('stat-goals').textContent = score.home;
    document.getElementById('overlay-result').classList.remove('hidden');
    Save.persist();
  }

  function renderResultDetails(result, ctx) {
    const oppName = clubName(ctx.opponentId);
    const list = document.getElementById('result-scorers');
    list.innerHTML = '';
    result.scorers
      .slice()
      .sort((a, b) => a.minute - b.minute)
      .forEach(g => {
        const d = document.createElement('div');
        if (g.side === 'home') d.className = 'mine';
        d.innerHTML = `<span class="num">${g.minute}'</span>${g.name}`;
        list.appendChild(d);
      });
    if (!result.scorers.length) {
      list.innerHTML = '<div>Голов не было</div>';
    }

    const s = result.stats;
    document.getElementById('result-match-stats').innerHTML = `
      ${statRow(s.possHome + '%', 'Владение', (100 - s.possHome) + '%')}
      ${statRow(s.home.shots, 'Удары', s.away.shots)}
      ${statRow(s.home.onTarget, 'В створ', s.away.onTarget)}`;
    document.getElementById('hud-away-name').textContent = oppName;
  }

  function statRow(a, label, b) {
    return `<div class="ms-row"><b>${a}</b><span>${label}</span><b>${b}</b></div>`;
  }

  document.getElementById('btn-result-continue').addEventListener('click', () => {
    document.getElementById('overlay-result').classList.add('hidden');
    MatchEngine.stop();
    if (pendingSeasonSummary) {
      showSeasonSummary(pendingSeasonSummary);
      return;
    }
    showScreen(activeMatchCtx && activeMatchCtx.competition ? 'menu' : 'menu');
  });

  // ---------------- ИТОГИ СЕЗОНА ----------------
  function showSeasonSummary(sum) {
    const verdict = document.getElementById('season-verdict');
    verdict.textContent = sum.rank === 1 ? 'Чемпион' : `Сезон ${sum.season} завершён`;
    // тревожный цвет — только за провал внизу таблицы, а не за середину
    const total = sum.standings.length;
    verdict.className = 'result-verdict ' +
      (sum.rank <= 3 ? 'win' : sum.rank >= total - 1 ? 'loss' : 'draw');

    document.getElementById('season-place').textContent = sum.rank;
    document.getElementById('season-champ').innerHTML = sum.championIsUser
      ? 'Титул остаётся дома'
      : `Чемпион — <b>${sum.champion}</b>`;
    document.getElementById('season-record').textContent =
      `${sum.record.w}-${sum.record.d}-${sum.record.l}`;
    const diff = sum.record.gf - sum.record.ga;
    document.getElementById('season-diff').textContent = (diff > 0 ? '+' : '') + diff;

    const sc = document.getElementById('season-scorer');
    sc.innerHTML = sum.topScorer
      ? `Лучший бомбардир клуба<b>${sum.topScorer.name} — ${sum.topScorer.goals}</b>`
      : 'Клуб остался без забивных игроков';

    const changes = document.getElementById('season-changes');
    changes.innerHTML = '';
    const line = (cls, mark, name, note) => {
      const d = document.createElement('div');
      d.className = 'os-line ' + cls;
      d.innerHTML = `<span class="os-mark">${mark}</span>
        <span class="os-name">${name}</span><span class="os-note">${note}</span>`;
      changes.appendChild(d);
    };
    line('up', '+' + sum.prize, 'Призовые за сезон', 'монет');
    (sum.grew || []).forEach(p => p.youth
      ? line('up', '·', p.name, `новичок, ${p.age} лет`)
      : line('up', '+' + p.delta, p.name, `прогресс, ${p.age} лет`));
    (sum.declined || []).forEach(p => line('down', p.delta, p.name, `спад, ${p.age} лет`));
    (sum.retired || []).forEach(p => line('gone', '—', p.name, `завершил карьеру в ${p.age}`));

    const table = document.getElementById('season-table');
    table.innerHTML = '';
    sum.standings.forEach((r, i) => {
      const row = document.createElement('div');
      row.className = 'ft-row' + (r.id === 'user' ? ' me' : '');
      row.innerHTML = `<span class="ft-pos">${i + 1}</span>
        <i class="club-dot" style="background:${r.color}"></i>
        <span class="ft-name">${r.name}</span><span class="ft-pts">${r.pts}</span>`;
      table.appendChild(row);
    });

    document.getElementById('overlay-season').classList.remove('hidden');
  }

  document.getElementById('btn-season-continue').addEventListener('click', () => {
    document.getElementById('overlay-season').classList.add('hidden');
    pendingSeasonSummary = null;
    showScreen('menu');
  });

  /* Любое сохранение подхватывается фоновой отправкой на сервер. */
  const basePersist = Save.persist.bind(Save);
  Save.persist = function () { basePersist(); Account.scheduleSync(); };

  // ---------------- ЗАПУСК ----------------
  window.addEventListener('load', async () => {
    MatchEngine.init();
    Account.init();
    document.body.addEventListener('pointerdown', () => SFX.unlock(), { once: true });

    let p = 0;
    const fill = document.getElementById('boot-fill');
    const iv = setInterval(() => {
      p += 9 + Math.random() * 11;
      if (p >= 100) p = 100;
      fill.style.width = p + '%';
      if (p >= 100) clearInterval(iv);
    }, 85);

    // Игра, открытая со своего сервера, подхватывает его адрес сама.
    await Account.autodetect();

    // Пробуем восстановить серверную сессию, иначе — локальный профиль.
    let signedIn = await Account.resume();
    if (!signedIn) signedIn = !!Save.load();

    setTimeout(() => {
      if (signedIn && Save.data) afterSignIn();
      else {
        authMode = (Account.serverDetected || Net.enabled()) ? 'remote' : 'local';
        showScreen('auth');
      }
    }, 900);
  });
})();

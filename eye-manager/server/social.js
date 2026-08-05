'use strict';

/**
 * Press / news feed + lobby chat for EYE XI.
 */

const crypto = require('crypto');

function uid(prefix) {
  return prefix + '_' + crypto.randomBytes(4).toString('hex');
}

function createSocialModule({ store }) {
  function loadNews() {
    return store.loadNews ? store.loadNews() : { items: [] };
  }
  function saveNews(data) {
    if (store.saveNews) store.saveNews(data);
  }
  function loadChat() {
    return store.loadChat ? store.loadChat() : { messages: [] };
  }
  function saveChat(data) {
    if (store.saveChat) store.saveChat(data);
  }

  function pushNews(item) {
    const data = loadNews();
    data.items = Array.isArray(data.items) ? data.items : [];
    data.items.unshift({
      id: uid('news'),
      at: Date.now(),
      ...item
    });
    if (data.items.length > 120) data.items.length = 120;
    saveNews(data);
    return data.items[0];
  }

  function listNews({ limit = 40, tag } = {}) {
    let items = loadNews().items || [];
    if (tag) items = items.filter((n) => n.tag === tag);
    return items.slice(0, limit);
  }

  function newsFromMatch(match) {
    if (!match?.score) return null;
    const [hg, ag] = match.score;
    const upset = Math.abs(hg - ag) >= 3;
    const comp = match.competition === 'league' ? 'Лига' : match.competition === 'cup' ? 'Кубок' : 'Товарищеский';
    const prefix = match.derby ? `${match.derby}: ` : '';
    const title = upset
      ? `Разгром: ${prefix}${match.home?.name} ${hg}:${ag} ${match.away?.name}`
      : `${match.derby ? match.derby : comp}: ${match.home?.name} ${hg}:${ag} ${match.away?.name}`;
    return pushNews({
      tag: match.derby ? 'derby' : (match.competition || 'match'),
      title,
      body: match.leagueName || match.cupName || (match.derby ? 'Принципиальный матч' : 'Матч завершён'),
      matchId: match.id,
      home: match.home?.name,
      away: match.away?.name,
      score: match.score,
      derby: match.derby || null
    });
  }

  function newsTransfer({ player, buyer, seller, value }) {
    return pushNews({
      tag: 'transfer',
      title: `${player} переходит в ${buyer}`,
      body: seller ? `Из ${seller} · ${value} ¤` : `${value} ¤`,
      value
    });
  }

  function newsLeague({ title, body, leagueId, tag = 'league' }) {
    return pushNews({ tag, title, body, leagueId });
  }

  function newsCup({ title, body, cupId }) {
    return pushNews({ tag: 'cup', title, body, cupId });
  }

  function postChat({ userId, login, name, clubName, text }) {
    const msg = String(text || '').trim().slice(0, 200);
    if (!msg) return { ok: false, error: 'Пустое сообщение' };
    if (msg.length < 1) return { ok: false, error: 'Слишком коротко' };
    const data = loadChat();
    data.messages = Array.isArray(data.messages) ? data.messages : [];
    // rate: max 1 msg / 3s per user
    const last = data.messages.find((m) => m.userId === userId);
    if (last && Date.now() - (last.at || 0) < 3000) {
      return { ok: false, error: 'Подождите пару секунд' };
    }
    data.messages.unshift({
      id: uid('chat'),
      at: Date.now(),
      userId,
      login,
      name,
      clubName,
      text: msg
    });
    if (data.messages.length > 100) data.messages.length = 100;
    saveChat(data);
    return { ok: true, message: data.messages[0] };
  }

  function listChat({ limit = 40, after } = {}) {
    let list = loadChat().messages || [];
    if (after) list = list.filter((m) => m.at > Number(after));
    return list.slice(0, limit);
  }

  const PRESS_OPTIONS = [
    { id: 'confident', label: 'Мы готовы к любому сопернику', morale: 2, fame: 0 },
    { id: 'humble', label: 'Уважаем соперника, работаем дальше', morale: 1, fame: 1 },
    { id: 'fire', label: 'Сегодня только победа!', morale: 3, fame: 0, fitness: 1.05 },
    { id: 'calm', label: 'Главное — дисциплина и терпение', morale: 1, fitness: 0.97 }
  ];

  function pressOptions() {
    return PRESS_OPTIONS.map(({ id, label }) => ({ id, label }));
  }

  function applyPress(club, user, optionId) {
    const opt = PRESS_OPTIONS.find((o) => o.id === optionId);
    if (!opt) return { ok: false, error: 'Нет такого ответа' };
    const now = Date.now();
    if (club.lastPressAt && now - club.lastPressAt < 30 * 60e3) {
      const left = Math.ceil((30 * 60e3 - (now - club.lastPressAt)) / 60000);
      return { ok: false, error: `Следующая пресс-конференция через ~${left} мин` };
    }
    club.lastPressAt = now;
    club.pressBuff = {
      fitness: opt.fitness || 1,
      until: now + 2 * 3600e3,
      label: opt.label
    };
    (club.players || []).forEach((p) => {
      p.morale = Math.max(-20, Math.min(25, (p.morale || 0) + (opt.morale || 0)));
    });
    if (user && opt.fame) user.fame = (user.fame || 0) + opt.fame;
    pushNews({
      tag: 'press',
      title: `Пресс-конференция: ${club.name}`,
      body: `«${opt.label}» — ${user?.name || 'менеджер'}`,
      clubName: club.name
    });
    return { ok: true, option: opt, club, user };
  }

  return {
    pushNews,
    listNews,
    newsFromMatch,
    newsTransfer,
    newsLeague,
    newsCup,
    postChat,
    listChat,
    pressOptions,
    applyPress
  };
}

module.exports = { createSocialModule };

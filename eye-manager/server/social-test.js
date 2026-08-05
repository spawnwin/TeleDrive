'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { createSocialModule } = require('./social');
const G = require('./game');

function memStore() {
  const news = { items: [] };
  const chat = { messages: [] };
  return {
    loadNews: () => news,
    saveNews: (d) => { news.items = d.items || []; },
    loadChat: () => chat,
    saveChat: (d) => { chat.messages = d.messages || []; },
    _news: news,
    _chat: chat
  };
}

describe('social module', () => {
  it('pushes match and transfer news', () => {
    const store = memStore();
    const social = createSocialModule({ store });
    social.newsFromMatch({
      competition: 'league',
      score: [3, 0],
      home: { name: 'А' },
      away: { name: 'Б' },
      leagueName: 'Лига 1'
    });
    social.newsTransfer({ player: 'Иванов', buyer: 'А', seller: 'Б', value: 50000 });
    const items = social.listNews({ limit: 10 });
    assert.ok(items.length >= 2);
    assert.equal(items[0].tag, 'transfer');
    assert.ok(items.some((n) => n.tag === 'league' || n.title.includes('Разгром')));
  });

  it('chat rate-limits and stores messages', () => {
    const store = memStore();
    const social = createSocialModule({ store });
    const a = social.postChat({ userId: 'u1', login: 'a', name: 'A', clubName: 'FC', text: 'Привет' });
    assert.equal(a.ok, true);
    const b = social.postChat({ userId: 'u1', login: 'a', name: 'A', clubName: 'FC', text: 'Снова' });
    assert.equal(b.ok, false);
    assert.equal(social.listChat().length, 1);
  });

  it('press applies cooldown and morale', () => {
    const store = memStore();
    const social = createSocialModule({ store });
    const club = G.defaultClub({ id: 'u', login: 't', name: 'T', clubName: 'T FC' });
    const user = { id: 'u', name: 'T', fame: 0 };
    const r = social.applyPress(club, user, 'confident');
    assert.equal(r.ok, true);
    assert.ok(club.pressBuff);
    assert.ok(club.lastPressAt);
    const again = social.applyPress(club, user, 'humble');
    assert.equal(again.ok, false);
    assert.ok(social.listNews({ tag: 'press' }).length >= 1);
  });
});

describe('training sessions', () => {
  it('trainSession grants xp and sets cooldown', () => {
    const club = G.defaultClub({ id: 'u', login: 't', name: 'T', clubName: 'T FC' });
    const p = club.players[0];
    const before = p.xpPool || 0;
    const r = G.trainSession(club, p.id, 'technical');
    assert.equal(r.ok, true);
    assert.ok(r.xpGain > 0);
    assert.equal(p.xpPool, before + r.xpGain);
    assert.ok(p.trainCdUntil > Date.now());
    const again = G.trainSession(club, p.id, 'technical');
    assert.equal(again.ok, false);
  });

  it('recovery restores fitness when tired', () => {
    const club = G.defaultClub({ id: 'u2', login: 't2', name: 'T2', clubName: 'T2 FC' });
    const p = club.players[1];
    p.fitness = 30;
    let paid = 0;
    const r = G.trainSession(club, p.id, 'recovery', {
      spendUserMoney: (c) => { paid = c; return true; }
    });
    assert.equal(r.ok, true);
    assert.equal(paid, 4000);
    assert.ok(p.fitness > 30);
  });
});

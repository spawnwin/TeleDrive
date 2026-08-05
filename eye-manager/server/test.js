'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

function get(port, urlPath, headers = {}) {
  return new Promise((resolve, reject) => {
    http.get({ host: '127.0.0.1', port, path: urlPath, headers }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString('utf8') }));
    }).on('error', reject);
  });
}

function post(port, urlPath, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body || {});
    const req = http.request({
      host: '127.0.0.1', port, path: urlPath, method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data), ...headers }
    }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString('utf8') }));
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

describe('eye xi server', () => {
  it('boots, registers, plays friendly, staff, stadium, lineup, cup', async () => {
    const port = 19142;
    const dataDir = path.join(__dirname, 'data-test-xi');
    fs.rmSync(dataDir, { recursive: true, force: true });
    const dbFile = path.join(dataDir, 'eye.db');
    const child = spawn(process.execPath, [path.join(__dirname, 'server.js')], {
      env: { ...process.env, EYE_PORT: String(port), EYE_DATA: dataDir, DATABASE_URL: `file:${dbFile}` },
      stdio: ['ignore', 'pipe', 'pipe']
    });
    let ready = false;
    for (let i = 0; i < 50 && !ready; i++) {
      await new Promise((r) => setTimeout(r, 300));
      try {
        const health = await get(port, '/api/health');
        if (health.status === 200) ready = true;
      } catch {}
    }
    try {
      assert.equal(ready, true, 'server ready');
      const health = await get(port, '/api/health');
      assert.match(health.body, /EYE XI|eye-manager/);
      const index = await get(port, '/');
      assert.match(index.body, /EYE XI/);

      const reg = await post(port, '/api/register', {
        login: 'tester1', password: 'test1234', name: 'Тестер', clubName: 'Тест FC'
      });
      assert.equal(reg.status, 200, reg.body);
      const regData = JSON.parse(reg.body);
      assert.ok(regData.token);
      assert.ok(regData.club?.players?.length >= 16);
      const auth = { Authorization: 'Bearer ' + regData.token };
      const lineupBefore = [...(regData.club.lineupIds || [])];
      assert.equal(lineupBefore.length, 11);

      const match = await post(port, '/api/friendly/bot', {}, auth);
      assert.equal(match.status, 200, match.body);
      const m = JSON.parse(match.body);
      assert.ok(m.match?.score);

      const recover0 = await post(port, '/api/players/recover', { booster: true }, auth);
      assert.equal(recover0.status, 200, recover0.body);
      const healthyClub = JSON.parse(recover0.body).club;

      const staff = await post(port, '/api/club/staff', { role: 'coach' }, auth);
      assert.equal(staff.status, 200, staff.body);
      const staffData = JSON.parse(staff.body);
      assert.ok((staffData.club.staff.coach || 0) >= 2);

      const stadium = await post(port, '/api/club/stadium', {}, auth);
      assert.equal(stadium.status, 200, stadium.body);
      const st = JSON.parse(stadium.body);
      assert.equal(st.club.stadiumLevel, 2);

      const baseLineup = healthyClub.lineupIds || lineupBefore;
      const spare = healthyClub.players.find((p) => !baseLineup.includes(p.id) && p.pos !== 'Gk' && !(p.injuredHours > 0));
      const dropIdx = baseLineup.findIndex((id) => {
        const pl = healthyClub.players.find((x) => x.id === id);
        return pl && pl.pos !== 'Gk' && !(pl.injuredHours > 0);
      });
      const rotated = [...baseLineup];
      if (spare && dropIdx >= 0) rotated[dropIdx] = spare.id;
      const lineup = await post(port, '/api/club/lineup', { lineupIds: rotated }, auth);
      assert.equal(lineup.status, 200, lineup.body);
      const lu = JSON.parse(lineup.body);
      assert.deepEqual(lu.club.lineupIds, rotated);

      const me = await get(port, '/api/me', auth);
      assert.equal(me.status, 200);
      const meData = JSON.parse(me.body);
      assert.deepEqual(meData.club.lineupIds, rotated, 'lineup persists after /api/me');

      const recover = await post(port, '/api/players/recover', {}, auth);
      assert.equal(recover.status, 200, recover.body);

      // auto-lineup rebuild without formation change
      const auto = await post(port, '/api/club', { formation: lu.club.formation, rebuildLineup: true }, auth);
      assert.equal(auto.status, 200, auto.body);
      assert.equal(JSON.parse(auto.body).club.lineupIds.length, 11);

      const openCups = await get(port, '/api/cups?status=open', auth);
      assert.equal(openCups.status, 200, openCups.body);
      const cupsBody = JSON.parse(openCups.body);
      const cup = (cupsBody.cups || [])[0];
      if (cup) {
        const join = await post(port, `/api/cups/${cup.id}/join`, {}, auth);
        assert.equal(join.status, 200, join.body);
        const detail = await get(port, `/api/cups/${cup.id}`, auth);
        assert.equal(detail.status, 200, detail.body);
        const d = JSON.parse(detail.body);
        assert.ok((d.cup.entrants || []).some((e) => e.clubName === 'Тест FC' || !e.isBot));
      }

      // challenge request → accept (not instant)
      const reg2 = await post(port, '/api/register', {
        login: 'tester2', password: 'test1234', name: 'Тестер2', clubName: 'Тест2 FC'
      });
      assert.equal(reg2.status, 200, reg2.body);
      const reg2Data = JSON.parse(reg2.body);
      const auth2 = { Authorization: 'Bearer ' + reg2Data.token };
      await get(port, '/api/me', auth);
      await get(port, '/api/me', auth2);
      const chal = await post(port, '/api/friendly/challenge', { userId: reg2Data.user.id }, auth);
      assert.equal(chal.status, 200, chal.body);
      const chalBody = JSON.parse(chal.body);
      assert.ok(chalBody.entry?.id);
      assert.equal(chalBody.match, undefined);

      const fr = JSON.parse((await get(port, '/api/friendly', auth2)).body);
      assert.ok((fr.challenges || []).some((c) => c.id === chalBody.entry.id));
      const acceptCh = await post(port, `/api/friendly/challenge/${chalBody.entry.id}/accept`, {}, auth2);
      assert.equal(acceptCh.status, 200, acceptCh.body);
      assert.ok(JSON.parse(acceptCh.body).match?.score);

      await post(port, '/api/friendly', {}, auth);
      const cancel = await post(port, '/api/friendly/cancel', {}, auth);
      assert.equal(cancel.status, 200, cancel.body);

      const rating = await get(port, '/api/rating', auth);
      assert.equal(rating.status, 200);

      const market = await get(port, '/api/transfers', auth);
      assert.equal(market.status, 200, market.body);
      assert.ok(Array.isArray(JSON.parse(market.body).list));

      // also clamp money after staff hire path is already checked
      const buyBoost = await post(port, '/api/bonus/buy', { qty: 1 }, auth);
      assert.equal(buyBoost.status, 200, buyBoost.body);
      const bb = JSON.parse(buyBoost.body);
      assert.ok((bb.user.boosters || 0) >= 1);

      // lineup requires GK
      const noGk = lu.club.players.filter((p) => p.pos !== 'Gk').slice(0, 11).map((p) => p.id);
      if (noGk.length === 11) {
        const badLu = await post(port, '/api/club/lineup', { lineupIds: noGk }, auth);
        assert.equal(badLu.status, 400);
      }

      const staff1 = await post(port, '/api/club/staff', { role: 'scout' }, auth);
      assert.equal(staff1.status, 200, staff1.body);

      // bot match cooldown (~90s)
      const bot2 = await post(port, '/api/friendly/bot', {}, auth);
      assert.equal(bot2.status, 429, bot2.body);

      const logout = await post(port, '/api/logout', {}, auth);
      assert.equal(logout.status, 200);
      const meAfter = await get(port, '/api/me', auth);
      assert.equal(meAfter.status, 401);
    } finally {
      child.kill('SIGTERM');
    }
  });
});

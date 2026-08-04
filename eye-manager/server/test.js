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
  it('boots, registers, plays friendly bot', async () => {
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
      const match = await post(port, '/api/friendly/bot', {}, {
        Authorization: 'Bearer ' + regData.token
      });
      assert.equal(match.status, 200, match.body);
      const m = JSON.parse(match.body);
      assert.ok(m.match?.score);
    } finally {
      child.kill('SIGTERM');
    }
  });
});

'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const { spawn } = require('child_process');
const path = require('path');

function get(port, urlPath) {
  return new Promise((resolve, reject) => {
    http.get({ host: '127.0.0.1', port, path: urlPath }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString('utf8') }));
    }).on('error', reject);
  });
}

describe('eye server', () => {
  it('serves health and index', async () => {
    const port = 19140;
    const dataDir = path.join(__dirname, 'data-test');
    const dbFile = path.join(dataDir, 'eye.db');
    const child = spawn(process.execPath, [path.join(__dirname, 'server.js')], {
      env: {
        ...process.env,
        EYE_PORT: String(port),
        EYE_DATA: dataDir,
        DATABASE_URL: `file:${dbFile}`
      },
      stdio: ['ignore', 'pipe', 'pipe']
    });
    let ready = false;
    for (let i = 0; i < 40 && !ready; i++) {
      await new Promise((r) => setTimeout(r, 250));
      try {
        const health = await get(port, '/api/health');
        if (health.status === 200) ready = true;
      } catch { /* wait for boot / schema push */ }
    }
    try {
      assert.equal(ready, true, 'server did not become ready');
      const health = await get(port, '/api/health');
      assert.equal(health.status, 200);
      assert.match(health.body, /eye-manager/);
      assert.match(health.body, /sqlite/);
      const index = await get(port, '/');
      assert.equal(index.status, 200);
      assert.match(index.body, /EYE/);
    } finally {
      child.kill('SIGTERM');
    }
  });
});

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
    const child = spawn(process.execPath, [path.join(__dirname, 'server.js')], {
      env: { ...process.env, EYE_PORT: String(port), EYE_DATA: path.join(__dirname, 'data-test') },
      stdio: ['ignore', 'pipe', 'pipe']
    });
    await new Promise((r) => setTimeout(r, 400));
    try {
      const health = await get(port, '/api/health');
      assert.equal(health.status, 200);
      assert.match(health.body, /eye-manager/);
      const index = await get(port, '/');
      assert.equal(index.status, 200);
      assert.match(index.body, /EYE/);
    } finally {
      child.kill('SIGTERM');
    }
  });
});

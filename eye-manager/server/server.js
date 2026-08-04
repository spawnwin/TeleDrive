#!/usr/bin/env node
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { URL } = require('url');

const PORT = Number(process.env.EYE_PORT || 9140);
const ROOT = path.resolve(__dirname, '..');
const DATA_DIR = process.env.EYE_DATA || path.join(__dirname, 'data');
const SAVES = path.join(DATA_DIR, 'saves');

fs.mkdirSync(SAVES, { recursive: true });

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json'
};

function send(res, code, body, headers = {}) {
  const data = typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body);
  res.writeHead(code, {
    'Cache-Control': code === 200 && headers['Content-Type']?.includes('text/html') ? 'no-cache' : 'public, max-age=3600',
    ...headers,
    'Content-Length': Buffer.byteLength(data)
  });
  res.end(data);
}

function json(res, code, obj) {
  send(res, code, JSON.stringify(obj), {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS'
  });
}

function safeJoin(root, reqPath) {
  const decoded = decodeURIComponent(reqPath.split('?')[0]);
  const clean = path.normalize(decoded).replace(/^(\.\.[/\\])+/, '');
  const full = path.join(root, clean);
  if (!full.startsWith(root)) return null;
  return full;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > 2e6) { reject(new Error('too large')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function listSaves() {
  return fs.readdirSync(SAVES)
    .filter((f) => f.endsWith('.json'))
    .map((f) => {
      try {
        const j = JSON.parse(fs.readFileSync(path.join(SAVES, f), 'utf8'));
        return { id: f.replace(/\.json$/, ''), manager: j.manager, updatedAt: j.updatedAt, season: j.state?.season };
      } catch { return null; }
    })
    .filter(Boolean)
    .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = url.pathname;

  if (req.method === 'OPTIONS') {
    return json(res, 204, {});
  }

  if (pathname === '/api/health') {
    return json(res, 200, { ok: true, service: 'eye-manager', ts: Date.now() });
  }

  if (pathname === '/api/saves' && req.method === 'GET') {
    return json(res, 200, { saves: listSaves() });
  }

  if (pathname === '/api/save' && req.method === 'POST') {
    try {
      const raw = await readBody(req);
      const body = JSON.parse(raw.toString('utf8'));
      if (!body || !body.state) return json(res, 400, { error: 'state required' });
      const id = crypto.createHash('sha1')
        .update(String(body.manager || body.state.managerName || 'coach') + '|' + (body.state.clubId || ''))
        .digest('hex')
        .slice(0, 16);
      const payload = {
        id,
        manager: body.manager || body.state.managerName,
        updatedAt: Date.now(),
        state: body.state
      };
      fs.writeFileSync(path.join(SAVES, id + '.json'), JSON.stringify(payload));
      return json(res, 200, { ok: true, id });
    } catch (e) {
      return json(res, 500, { error: String(e.message || e) });
    }
  }

  if (pathname.startsWith('/api/save/') && req.method === 'GET') {
    const id = pathname.split('/').pop().replace(/[^a-z0-9]/gi, '');
    const file = path.join(SAVES, id + '.json');
    if (!fs.existsSync(file)) return json(res, 404, { error: 'not found' });
    return json(res, 200, JSON.parse(fs.readFileSync(file, 'utf8')));
  }

  // static
  let target = pathname === '/' ? '/index.html' : pathname;
  let file = safeJoin(ROOT, target);
  if (!file) return send(res, 403, 'Forbidden');
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) {
    file = path.join(file, 'index.html');
  }
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
    // SPA fallback
    file = path.join(ROOT, 'index.html');
  }
  // never serve server/data
  if (file.startsWith(path.join(ROOT, 'server', 'data'))) {
    return send(res, 404, 'Not found');
  }
  const ext = path.extname(file);
  const type = MIME[ext] || 'application/octet-stream';
  const cache = ext === '.html' || ext === '.js' || ext === '.css' ? 'no-cache' : 'public, max-age=86400';
  send(res, 200, fs.readFileSync(file), { 'Content-Type': type, 'Cache-Control': cache });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[EYE] listening on http://0.0.0.0:${PORT}`);
  console.log(`[EYE] root ${ROOT}`);
  console.log(`[EYE] saves ${SAVES}`);
});

const API = process.env.API_URL || 'http://127.0.0.1:8787';

async function req(path: string, opts: RequestInit & { userId?: string } = {}) {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(opts.headers as Record<string, string>),
  };
  if (opts.userId) headers['X-User-Id'] = opts.userId;
  const res = await fetch(`${API}${path}`, { ...opts, headers });
  const body = await res.json();
  if (!res.ok) throw new Error(`${path} -> ${res.status} ${JSON.stringify(body)}`);
  return body;
}

async function main() {
  const health = await req('/health');
  console.log('health', health);

  const auth = await req('/v1/auth/guest', { method: 'POST', body: JSON.stringify({ nickname: 'Smoke' }) });
  const userId = auth.userId as string;
  console.log('guest', userId, 'resources', auth.state.resources);

  let state = await req('/v1/base', { userId });
  const warehouse = state.buildings.find((b: any) => b.type === 'warehouse');
  const tutorial = state.requests.find((r: any) => r.type === 'tutorial_delivery');
  if (!tutorial) throw new Error('tutorial request missing');

  state = await req(`/v1/requests/${tutorial.id}/start`, { method: 'POST', userId, body: '{}' });
  console.log('started tutorial');

  // wait for ready
  for (let i = 0; i < 20; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    state = await req('/v1/base', { userId });
    const t = state.requests.find((r: any) => r.id === tutorial.id);
    if (!t || t.status === 'ready' || t.status === 'claimed') break;
  }

  const ready = (await req('/v1/base', { userId })).requests.find((r: any) => r.id === tutorial.id);
  if (ready?.status === 'ready') {
    state = await req(`/v1/requests/${tutorial.id}/claim`, { method: 'POST', userId, body: '{}' });
    console.log('claimed', state.lastQuality);
  }

  state = await req(`/v1/buildings/${warehouse.id}/upgrade`, { method: 'POST', userId, body: '{}' });
  console.log('warehouse upgrading', state.buildings.find((b: any) => b.id === warehouse.id).state);

  await req('/v1/tutorial/advance', { method: 'POST', userId, body: JSON.stringify({ step: 8 }) });
  state = await req('/v1/base', { userId });
  console.log('tutorial done', state.user.tutorialDone, 'level', state.user.level);
  console.log('SMOKE OK');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

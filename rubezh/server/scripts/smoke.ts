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
  console.log('guest', userId, 'buildings', auth.state.buildings.length, 'ops', auth.state.availableOperations?.length);

  let state = await req('/v1/base', { userId });
  const warehouse = state.buildings.find((b: any) => b.type === 'warehouse');
  const tutorial = state.requests.find((r: any) => r.type === 'tutorial_delivery');
  if (!tutorial) throw new Error('tutorial request missing');

  state = await req(`/v1/requests/${tutorial.id}/start`, { method: 'POST', userId, body: '{}' });
  console.log('started tutorial');

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

  state = await req('/v1/operations/op_first_column/start', { method: 'POST', userId, body: '{}' });
  const startedOp = state.operations.find((o: any) => o.def_id === 'op_first_column');
  if (!startedOp || startedOp.status !== 'in_progress') throw new Error('operation not started');
  console.log('operation started', startedOp.title, 'score preview', startedOp.result_label);

  // Fast-forward claim path is covered by unit of settle; here verify shop/achievements without 90s wait.
  const first = state.achievements.find((a: any) => a.id === 'first_cargo');
  if (first?.unlocked && !first.claimed) {
    state = await req(`/v1/achievements/first_cargo/claim`, { method: 'POST', userId, body: '{}' });
    console.log('achievement claimed');
  }

  state = await req('/v1/shop/pack_materials/buy', { method: 'POST', userId, body: '{}' });
  console.log('shop buy ok', state.resources.materials);

  const command = state.buildings.find((b: any) => b.type === 'command');
  try {
    state = await req(`/v1/buildings/${command.id}/upgrade`, { method: 'POST', userId, body: '{}' });
  } catch {
    /* ignore */
  }

  state = await req('/v1/base', { userId });
  if (state.automation.unlockAutoCollect) {
    state = await req('/v1/automation', {
      method: 'POST',
      userId,
      body: JSON.stringify({ autoCollect: true }),
    });
    console.log('autoCollect', state.automation.autoCollect);
  }

  console.log(
    'final',
    'tutorial',
    state.user.tutorialDone,
    'buildings',
    state.buildings.length,
    'achievements',
    state.achievements.filter((a: any) => a.unlocked).length,
    'story',
    state.story.chapter,
  );
  console.log('SMOKE OK');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

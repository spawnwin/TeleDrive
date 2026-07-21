import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import { migrate } from './db.js';
import {
  advanceStory,
  advanceTutorial,
  assignSpecialist,
  buyShopItem,
  claimAchievement,
  claimOffline,
  claimOperation,
  claimQuest,
  claimRequest,
  collectAll,
  collectBuilding,
  createGuest,
  getBaseState,
  setAutomation,
  startOperation,
  startRequest,
  upgradeBuilding,
} from './economy.js';
import {
  claimWeeklyClanReward,
  createClan,
  getSocialState,
  helpClanMember,
  joinClan,
  leaveClan,
  postClanMessage,
} from './social.js';

migrate();

const app = Fastify({ logger: true });
await app.register(cors, { origin: true });

const serverRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
function loadAppVersion() {
  return JSON.parse(readFileSync(join(serverRoot, 'config/app-version.json'), 'utf8')) as {
    versionName: string;
    versionCode: number;
    apkUrl: string;
    force: boolean;
    changelog: string[];
  };
}

function userId(req: { headers: Record<string, unknown> }): string {
  const id = req.headers['x-user-id'];
  if (typeof id !== 'string' || !id) {
    throw Object.assign(new Error('Требуется заголовок X-User-Id'), { statusCode: 401 });
  }
  return id;
}

function sendError(reply: any, err: any) {
  const status = err.statusCode || 500;
  reply.code(status).send({ error: err.message || 'Ошибка сервера' });
}

function withSocial(uid: string, state: any) {
  return { ...state, social: getSocialState(uid) };
}

app.get('/health', async () => ({ ok: true, service: 'rubezh-server' }));

app.get('/v1/app/version', async () => loadAppVersion());

app.post('/v1/auth/guest', async (req, reply) => {
  try {
    const body = (req.body || {}) as { nickname?: string };
    const state = createGuest(body.nickname);
    return { token: state.user.id, userId: state.user.id, state: withSocial(state.user.id, state) };
  } catch (err) {
    sendError(reply, err);
  }
});

app.get('/v1/base', async (req, reply) => {
  try {
    const uid = userId(req as any);
    return withSocial(uid, getBaseState(uid));
  } catch (err) {
    sendError(reply, err);
  }
});

app.post('/v1/buildings/:id/upgrade', async (req, reply) => {
  try {
    const { id } = req.params as { id: string };
    return upgradeBuilding(userId(req as any), id);
  } catch (err) {
    sendError(reply, err);
  }
});

app.post('/v1/buildings/:id/collect', async (req, reply) => {
  try {
    const { id } = req.params as { id: string };
    return collectBuilding(userId(req as any), id);
  } catch (err) {
    sendError(reply, err);
  }
});

app.post('/v1/buildings/collect-all', async (req, reply) => {
  try {
    return collectAll(userId(req as any));
  } catch (err) {
    sendError(reply, err);
  }
});

app.post('/v1/requests/:id/start', async (req, reply) => {
  try {
    const { id } = req.params as { id: string };
    const body = (req.body || {}) as { vehicleId?: string };
    return startRequest(userId(req as any), id, body.vehicleId);
  } catch (err) {
    sendError(reply, err);
  }
});

app.post('/v1/requests/:id/claim', async (req, reply) => {
  try {
    const { id } = req.params as { id: string };
    return claimRequest(userId(req as any), id);
  } catch (err) {
    sendError(reply, err);
  }
});

app.post('/v1/offline/claim', async (req, reply) => {
  try {
    return claimOffline(userId(req as any));
  } catch (err) {
    sendError(reply, err);
  }
});

app.post('/v1/specialists/:id/assign', async (req, reply) => {
  try {
    const { id } = req.params as { id: string };
    const body = (req.body || {}) as { buildingId?: string | null };
    return assignSpecialist(userId(req as any), id, body.buildingId ?? null);
  } catch (err) {
    sendError(reply, err);
  }
});

app.get('/v1/quests', async (req, reply) => {
  try {
    const state = getBaseState(userId(req as any));
    return { quests: state.quests };
  } catch (err) {
    sendError(reply, err);
  }
});

app.post('/v1/quests/:id/claim', async (req, reply) => {
  try {
    const { id } = req.params as { id: string };
    return claimQuest(userId(req as any), id);
  } catch (err) {
    sendError(reply, err);
  }
});

app.post('/v1/tutorial/advance', async (req, reply) => {
  try {
    const body = (req.body || {}) as { step?: number };
    return advanceTutorial(userId(req as any), body.step ?? 1);
  } catch (err) {
    sendError(reply, err);
  }
});

app.post('/v1/operations/:defId/start', async (req, reply) => {
  try {
    const { defId } = req.params as { defId: string };
    return startOperation(userId(req as any), defId);
  } catch (err) {
    sendError(reply, err);
  }
});

app.post('/v1/operations/:id/claim', async (req, reply) => {
  try {
    const { id } = req.params as { id: string };
    return claimOperation(userId(req as any), id);
  } catch (err) {
    sendError(reply, err);
  }
});

app.post('/v1/automation', async (req, reply) => {
  try {
    const body = (req.body || {}) as { autoCollect?: boolean; autoSimpleRequests?: boolean };
    return setAutomation(userId(req as any), body);
  } catch (err) {
    sendError(reply, err);
  }
});

app.post('/v1/achievements/:id/claim', async (req, reply) => {
  try {
    const { id } = req.params as { id: string };
    return claimAchievement(userId(req as any), id);
  } catch (err) {
    sendError(reply, err);
  }
});

app.post('/v1/shop/:id/buy', async (req, reply) => {
  try {
    const { id } = req.params as { id: string };
    return buyShopItem(userId(req as any), id);
  } catch (err) {
    sendError(reply, err);
  }
});

app.post('/v1/story/advance', async (req, reply) => {
  try {
    return advanceStory(userId(req as any));
  } catch (err) {
    sendError(reply, err);
  }
});

app.get('/v1/social', async (req, reply) => {
  try {
    return getSocialState(userId(req as any));
  } catch (err) {
    sendError(reply, err);
  }
});

app.post('/v1/clans', async (req, reply) => {
  try {
    const body = (req.body || {}) as { name?: string; tag?: string; motto?: string };
    return createClan(userId(req as any), body.name || '', body.tag || '', body.motto || '');
  } catch (err) {
    sendError(reply, err);
  }
});

app.post('/v1/clans/:id/join', async (req, reply) => {
  try {
    const { id } = req.params as { id: string };
    return joinClan(userId(req as any), id);
  } catch (err) {
    sendError(reply, err);
  }
});

app.post('/v1/clans/leave', async (req, reply) => {
  try {
    return leaveClan(userId(req as any));
  } catch (err) {
    sendError(reply, err);
  }
});

app.post('/v1/clans/chat', async (req, reply) => {
  try {
    const body = (req.body || {}) as { message?: string };
    const social = postClanMessage(userId(req as any), body.message || '');
    return { social };
  } catch (err) {
    sendError(reply, err);
  }
});

app.post('/v1/clans/help/:targetUserId', async (req, reply) => {
  try {
    const { targetUserId } = req.params as { targetUserId: string };
    return helpClanMember(userId(req as any), targetUserId);
  } catch (err) {
    sendError(reply, err);
  }
});

app.post('/v1/clans/weekly-claim', async (req, reply) => {
  try {
    return claimWeeklyClanReward(userId(req as any));
  } catch (err) {
    sendError(reply, err);
  }
});

const port = Number(process.env.PORT || 8787);
app.listen({ port, host: '0.0.0.0' }).then(() => {
  console.log(`Rubezh server on http://0.0.0.0:${port}`);
});

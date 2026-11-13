import Fastify, { type FastifyRequest } from 'fastify';
import fastifyStatic from '@fastify/static';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { QUICK_PROMPTS, findSimilar, noteRu } from '@veroniks/shared';
import { autocomplete, getMeta, getPerfume, listPerfumes, openDb, seedIfEmpty } from './db';
import { Catalog } from './catalog';
import { createAdvisor } from './advisor';
import { createBot, startBot } from './bot';
import { RateLimiter } from './rate-limit';
import {
  isAllowed,
  issueAccessKey,
  parseAllowedIds,
  validateInitData,
  verifyAccessKey,
} from './telegram-auth';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
dotenv.config({ path: path.join(ROOT, '.env') });

const PORT = Number(process.env.PORT ?? 8787);
const DB_PATH = process.env.DATABASE_PATH
  ? path.resolve(ROOT, process.env.DATABASE_PATH)
  : path.join(ROOT, 'data', 'veroniks.db');
const BOT_TOKEN = process.env.BOT_TOKEN?.trim() ?? '';
/** Публичный адрес: из .env, иначе тот, что сообщает хостинг (Render, Railway). */
function detectWebappUrl(): string | null {
  const explicit = process.env.WEBAPP_URL?.trim();
  if (explicit) return explicit.replace(/\/$/, '');
  const render = process.env.RENDER_EXTERNAL_URL?.trim();
  if (render) return render.replace(/\/$/, '');
  const railway = process.env.RAILWAY_PUBLIC_DOMAIN?.trim();
  if (railway) return `https://${railway}`;
  return null;
}
const WEBAPP_URL = detectWebappUrl();
const ALLOWED = parseAllowedIds(process.env.ALLOWED_USER_IDS);
const BOT_MODE: 'webhook' | 'polling' =
  process.env.BOT_MODE === 'webhook' || (process.env.NODE_ENV === 'production' && process.env.BOT_MODE !== 'polling')
    ? 'webhook'
    : 'polling';

const db = openDb(DB_PATH);
seedIfEmpty(db);
const catalog = new Catalog(db);

const app = Fastify({
  logger: {
    level: 'info',
    // секреты не должны попадать в логи
    redact: ['req.headers["x-telegram-init-data"]', 'req.headers["x-veroniks-key"]'],
  },
});
const log = (msg: string) => app.log.info(msg);
const advisor = createAdvisor(log);

// ---------- Доступ: белый список ----------

const apiLimiter = new RateLimiter(240, 60_000);
const advisorLimiter = new RateLimiter(20, 60_000);
const OPEN_ROUTES = new Set(['/api/health', '/api/config', '/api/auth/key']);

function resolveUser(req: FastifyRequest): number | null {
  const initData = req.headers['x-telegram-init-data'];
  if (typeof initData === 'string' && BOT_TOKEN) {
    const user = validateInitData(initData, BOT_TOKEN);
    if (user) return user.id;
  }
  const key = req.headers['x-veroniks-key'];
  if (typeof key === 'string' && BOT_TOKEN) return verifyAccessKey(key, BOT_TOKEN);
  return null;
}

app.addHook('onRequest', async (req, reply) => {
  if (!req.url.startsWith('/api/')) return;
  const route = req.url.split('?')[0];
  const userId = resolveUser(req);
  const who = userId ? `u${userId}` : `ip${req.ip}`;
  if (!apiLimiter.take(who)) {
    return reply.code(429).send({ error: 'Слишком много запросов. Переведите дух, сэр.' });
  }
  if (OPEN_ROUTES.has(route) || ALLOWED.size === 0) return;
  if (!isAllowed(userId ?? undefined, ALLOWED)) {
    return reply.code(401).send({
      error: 'Клуб закрытый. Откройте приложение через бота @veroniksparfbot.',
      code: 'auth',
    });
  }
});

// ---------- API ----------

app.get('/api/health', async () => ({ ok: true }));

app.get('/api/config', async () => ({
  restricted: ALLOWED.size > 0,
  advisorEngine: advisor.kind,
  quickPrompts: QUICK_PROMPTS,
}));

/** Обмен initData на постоянный ключ — для установки PWA вне Telegram. */
app.post<{ Body: { initData?: string } }>('/api/auth/key', async (req, reply) => {
  const user = BOT_TOKEN ? validateInitData(req.body?.initData ?? '', BOT_TOKEN) : null;
  if (!user || !isAllowed(user.id, ALLOWED)) {
    return reply.code(401).send({ error: 'Не удалось подтвердить членство в клубе.', code: 'auth' });
  }
  return { key: issueAccessKey(user.id, BOT_TOKEN) };
});

app.get('/api/meta', async () => getMeta(db));

interface ListQuery {
  q?: string;
  family?: string;
  gender?: string;
  season?: string;
  occasion?: string;
  accord?: string;
  note?: string;
  excludeNote?: string;
  sort?: 'rating' | 'year' | 'name';
  offset?: string;
  limit?: string;
}

app.get<{ Querystring: ListQuery }>('/api/perfumes', async (req) => {
  const q = req.query;
  return listPerfumes(db, {
    q: q.q,
    family: q.family,
    gender: q.gender,
    season: q.season,
    occasion: q.occasion,
    accord: q.accord,
    note: q.note,
    excludeNote: q.excludeNote,
    sort: q.sort,
    offset: q.offset ? Number(q.offset) : 0,
    limit: q.limit ? Number(q.limit) : 30,
  });
});

app.get<{ Params: { id: string } }>('/api/perfumes/:id', async (req, reply) => {
  const p = getPerfume(db, req.params.id);
  if (!p) return reply.code(404).send({ error: 'Аромат не найден' });
  return p;
});

app.get<{ Querystring: { q?: string } }>('/api/autocomplete', async (req) => {
  return autocomplete(db, req.query.q ?? '');
});

app.get<{ Querystring: { id?: string; limit?: string } }>('/api/similar', async (req, reply) => {
  const id = req.query.id;
  if (!id) return reply.code(400).send({ error: 'Укажите id аромата' });
  const target = catalog.get(id);
  if (!target) return reply.code(404).send({ error: 'Аромат не найден' });
  const limit = req.query.limit ? Math.min(Number(req.query.limit), 20) : 10;
  const results = findSimilar(target, catalog.all(), { limit, noteIndex: catalog.index() });
  return results.map((r) => ({
    perfume: r.perfume,
    matchPercent: r.matchPercent,
    commonNotes: r.commonNotes,
    commonNotesRu: r.commonNotes.map(noteRu),
  }));
});

app.post<{ Body: { message?: string; context?: string } }>('/api/advisor', async (req, reply) => {
  const message = (req.body?.message ?? '').trim().slice(0, 500);
  const context = req.body?.context?.trim().slice(0, 500) || undefined;
  if (!message) return reply.code(400).send({ error: 'Пустой запрос' });
  const who = resolveUser(req) ?? req.ip;
  if (!advisorLimiter.take(String(who))) {
    return reply.code(429).send({ error: 'Не так быстро, сэр. Минутку на раздумья.' });
  }
  const r = await advisor.reply({ message, context }, catalog);
  return {
    ...r,
    picks: r.picks.map((p) => ({ ...p, matchedNotesRu: p.matchedNotes.map(noteRu) })),
  };
});

// ---------- Статика (собранный фронт) ----------

const webDist = path.join(ROOT, 'web', 'dist');
if (fs.existsSync(webDist)) {
  app.register(fastifyStatic, { root: webDist, wildcard: false });
  app.setNotFoundHandler((req, reply) => {
    if (req.url.startsWith('/api/')) reply.code(404).send({ error: 'Не найдено' });
    else reply.sendFile('index.html');
  });
}

// ---------- Бот ----------

if (BOT_TOKEN) {
  const bot = createBot({ token: BOT_TOKEN, webappUrl: WEBAPP_URL, allowed: ALLOWED, catalog, advisor, log });
  startBot(bot, app, WEBAPP_URL, BOT_MODE, log).catch((e) =>
    app.log.error(`Бот не запустился: ${e instanceof Error ? e.message : e}`),
  );
} else {
  log('BOT_TOKEN не задан — бот выключен, работает только веб-приложение');
}

log(WEBAPP_URL ? `Адрес приложения: ${WEBAPP_URL}` : 'Адрес приложения не задан (WEBAPP_URL)');
if (ALLOWED.size === 0) log('ALLOWED_USER_IDS пуст — доступ открыт всем (режим для тестов)');
else log(`Белый список: ${ALLOWED.size} участник(ов)`);

app
  .listen({ port: PORT, host: '0.0.0.0' })
  .then(() => log(`Veroniks: http://localhost:${PORT}`))
  .catch((err) => {
    app.log.error(err);
    process.exit(1);
  });

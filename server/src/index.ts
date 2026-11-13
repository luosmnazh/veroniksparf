import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import 'dotenv/config';
import { findSimilar, noteRu } from '@veroniks/shared';
import {
  autocomplete,
  getMeta,
  getPerfume,
  listPerfumes,
  openDb,
  seedIfEmpty,
} from './db';
import { Catalog } from './catalog';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');

const PORT = Number(process.env.PORT ?? 8787);
const DB_PATH = process.env.DATABASE_PATH
  ? path.resolve(ROOT, process.env.DATABASE_PATH)
  : path.join(ROOT, 'data', 'veroniks.db');

const db = openDb(DB_PATH);
seedIfEmpty(db);
const catalog = new Catalog(db);

const app = Fastify({ logger: { level: 'info' } });

// ---------- API ----------

app.get('/api/health', async () => ({ ok: true }));

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

// ---------- Статика (собранный фронт) ----------

const webDist = path.join(ROOT, 'web', 'dist');
if (fs.existsSync(webDist)) {
  app.register(fastifyStatic, { root: webDist, wildcard: false });
  app.setNotFoundHandler((req, reply) => {
    if (req.url.startsWith('/api/')) {
      reply.code(404).send({ error: 'Не найдено' });
    } else {
      reply.sendFile('index.html');
    }
  });
}

app
  .listen({ port: PORT, host: '0.0.0.0' })
  .then(() => {
    app.log.info(`Veroniks server: http://localhost:${PORT}`);
  })
  .catch((err) => {
    app.log.error(err);
    process.exit(1);
  });

import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import type { Perfume, Tier } from '@veroniks/shared';
import { DESCRIBE_TEMPLATE_VERSION, SEED_PERFUMES, describePerfume } from '@veroniks/shared';
import crypto from 'node:crypto';
import type { LoadedCatalog } from './catalog-file';

export type DB = Database.Database;

export function openDb(dbPath: string): DB {
  fs.mkdirSync(path.dirname(path.resolve(dbPath)), { recursive: true });
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  migrate(db);
  return db;
}

function migrate(db: DB): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS perfumes (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      brand TEXT NOT NULL,
      year INTEGER,
      gender TEXT NOT NULL,
      family TEXT NOT NULL DEFAULT '',
      accords TEXT NOT NULL DEFAULT '[]',
      seasons TEXT NOT NULL DEFAULT '[]',
      occasions TEXT NOT NULL DEFAULT '[]',
      rating REAL,
      votes INTEGER,
      description TEXT,
      description_source TEXT NOT NULL DEFAULT 'template',
      fragrantica_url TEXT,
      image_url TEXT
    );

    CREATE TABLE IF NOT EXISTS notes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE
    );

    CREATE TABLE IF NOT EXISTS perfume_notes (
      perfume_id TEXT NOT NULL REFERENCES perfumes(id) ON DELETE CASCADE,
      note_id INTEGER NOT NULL REFERENCES notes(id),
      tier TEXT NOT NULL CHECK (tier IN ('top','heart','base')),
      PRIMARY KEY (perfume_id, note_id, tier)
    );

    CREATE INDEX IF NOT EXISTS idx_perfume_notes_note ON perfume_notes(note_id);
    CREATE INDEX IF NOT EXISTS idx_perfume_notes_perfume ON perfume_notes(perfume_id);
    CREATE INDEX IF NOT EXISTS idx_perfumes_name ON perfumes(name);
    CREATE INDEX IF NOT EXISTS idx_perfumes_brand ON perfumes(brand);
    CREATE INDEX IF NOT EXISTS idx_perfumes_rating ON perfumes(rating);
  `);
}

/** Подготовленные запросы — по одному набору на базу, чтобы массовая вставка была быстрой. */
const statements = new WeakMap<DB, ReturnType<typeof prepareStatements>>();

function prepareStatements(db: DB) {
  return {
    upsert: db.prepare(
      `INSERT INTO perfumes (id, name, brand, year, gender, family, accords, seasons, occasions,
         rating, votes, description, description_source, fragrantica_url, image_url)
       VALUES (@id, @name, @brand, @year, @gender, @family, @accords, @seasons, @occasions,
         @rating, @votes, @description, @descriptionSource, @fragranticaUrl, @imageUrl)
       ON CONFLICT(id) DO UPDATE SET
         name=excluded.name, brand=excluded.brand, year=excluded.year, gender=excluded.gender,
         family=excluded.family, accords=excluded.accords, seasons=excluded.seasons,
         occasions=excluded.occasions, rating=excluded.rating, votes=excluded.votes,
         description=excluded.description, description_source=excluded.description_source,
         fragrantica_url=excluded.fragrantica_url,
         image_url=COALESCE(excluded.image_url, perfumes.image_url)`,
    ),
    deleteLinks: db.prepare('DELETE FROM perfume_notes WHERE perfume_id = ?'),
    insertNote: db.prepare('INSERT OR IGNORE INTO notes (name) VALUES (?)'),
    getNote: db.prepare('SELECT id FROM notes WHERE name = ?'),
    insertLink: db.prepare(
      'INSERT OR IGNORE INTO perfume_notes (perfume_id, note_id, tier) VALUES (?, ?, ?)',
    ),
  };
}

function stmts(db: DB) {
  let s = statements.get(db);
  if (!s) statements.set(db, (s = prepareStatements(db)));
  return s;
}

export function upsertPerfume(
  db: DB,
  p: Perfume,
  imageUrl?: string | null,
  descriptionSource: 'template' | 'ai' = 'template',
  noteIds?: Map<string, number>,
): void {
  const st = stmts(db);
  st.upsert.run({
    id: p.id,
    name: p.name,
    brand: p.brand,
    year: p.year,
    gender: p.gender,
    family: p.family,
    accords: JSON.stringify(p.accords),
    seasons: JSON.stringify(p.seasons),
    occasions: JSON.stringify(p.occasions),
    rating: p.rating,
    votes: p.votes,
    description: p.description,
    descriptionSource,
    fragranticaUrl: p.fragranticaUrl,
    imageUrl: imageUrl ?? null,
  });

  st.deleteLinks.run(p.id);
  const noteId = (n: string): number => {
    const cached = noteIds?.get(n);
    if (cached) return cached;
    st.insertNote.run(n);
    const id = (st.getNote.get(n) as { id: number }).id;
    noteIds?.set(n, id);
    return id;
  };
  const tiers: [Tier, string[]][] = [
    ['top', p.notesTop],
    ['heart', p.notesHeart],
    ['base', p.notesBase],
  ];
  for (const [tier, notes] of tiers) {
    for (const n of notes) st.insertLink.run(p.id, noteId(n), tier);
  }
}

/** Ароматы, из которых собирается база: встроенные (с данными датасета) + большой каталог. */
export function catalogPerfumes(catalog: LoadedCatalog | null): {
  perfumes: { perfume: Perfume; imageUrl: string | null }[];
  fingerprint: string;
} {
  const seedHash = crypto.createHash('sha1').update(JSON.stringify(SEED_PERFUMES)).digest('hex').slice(0, 12);
  const overrides = catalog?.data.overrides ?? {};
  const out: { perfume: Perfume; imageUrl: string | null }[] = SEED_PERFUMES.map((p) => {
    const o = overrides[p.id];
    return {
      perfume: o
        ? {
            ...p,
            rating: o.rating ?? p.rating,
            votes: o.votes ?? p.votes,
            year: p.year ?? o.year,
            fragranticaUrl: o.fragranticaUrl ?? p.fragranticaUrl,
          }
        : p,
      imageUrl: o?.imageUrl ?? null,
    };
  });
  for (const p of catalog?.data.perfumes ?? []) out.push({ perfume: p, imageUrl: null });
  return {
    perfumes: out,
    fingerprint: `${seedHash}:${catalog?.fingerprint ?? 'none'}:t${DESCRIBE_TEMPLATE_VERSION}`,
  };
}

/**
 * Приводит базу в соответствие с каталогом. Пересборка — только если
 * изменился встроенный набор или файл data/catalog.json.gz. ИИ-описания
 * переживают пересборку.
 */
export function syncCatalog(db: DB, catalog: LoadedCatalog | null, log: (m: string) => void = () => {}): void {
  db.exec('CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)');
  const { perfumes, fingerprint } = catalogPerfumes(catalog);
  const current = db.prepare(`SELECT value FROM meta WHERE key = 'catalog'`).get() as
    | { value: string }
    | undefined;
  const { c } = db.prepare('SELECT COUNT(*) AS c FROM perfumes').get() as { c: number };
  if (current?.value === fingerprint && c > 0) return;

  const started = Date.now();
  const aiDescriptions = new Map(
    (
      db
        .prepare(`SELECT id, description FROM perfumes WHERE description_source = 'ai'`)
        .all() as { id: string; description: string }[]
    ).map((r) => [r.id, r.description]),
  );
  const tx = db.transaction(() => {
    db.exec('DELETE FROM perfume_notes; DELETE FROM perfumes; DELETE FROM notes;');
    const noteIds = new Map<string, number>();
    for (const { perfume, imageUrl } of perfumes) {
      const ai = aiDescriptions.get(perfume.id);
      const description = ai ?? perfume.description ?? describePerfume(perfume);
      upsertPerfume(db, { ...perfume, description }, imageUrl, ai ? 'ai' : 'template', noteIds);
    }
    db.prepare(`INSERT INTO meta (key, value) VALUES ('catalog', ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value`).run(fingerprint);
  });
  tx();
  log(`Каталог загружен: ${perfumes.length} ароматов за ${((Date.now() - started) / 1000).toFixed(1)} с`);
}

/** Совместимость: база только из встроенного набора (для тестов и скриптов). */
export function seedIfEmpty(db: DB): void {
  const { c } = db.prepare('SELECT COUNT(*) AS c FROM perfumes').get() as { c: number };
  if (c === 0) syncCatalog(db, null);
}

interface PerfumeRow {
  id: string;
  name: string;
  brand: string;
  year: number | null;
  gender: string;
  family: string;
  accords: string;
  seasons: string;
  occasions: string;
  rating: number | null;
  votes: number | null;
  description: string | null;
  fragrantica_url: string | null;
  image_url: string | null;
}

export interface PerfumeWithImage extends Perfume {
  imageUrl: string | null;
}

export function rowToPerfume(db: DB, row: PerfumeRow): PerfumeWithImage {
  const notes = db
    .prepare(
      `SELECT n.name, pn.tier FROM perfume_notes pn JOIN notes n ON n.id = pn.note_id
       WHERE pn.perfume_id = ?`,
    )
    .all(row.id) as { name: string; tier: Tier }[];
  return {
    id: row.id,
    name: row.name,
    brand: row.brand,
    year: row.year,
    gender: row.gender as Perfume['gender'],
    family: row.family,
    accords: JSON.parse(row.accords),
    notesTop: notes.filter((n) => n.tier === 'top').map((n) => n.name),
    notesHeart: notes.filter((n) => n.tier === 'heart').map((n) => n.name),
    notesBase: notes.filter((n) => n.tier === 'base').map((n) => n.name),
    seasons: JSON.parse(row.seasons),
    occasions: JSON.parse(row.occasions),
    rating: row.rating,
    votes: row.votes,
    description: row.description,
    fragranticaUrl: row.fragrantica_url,
    imageUrl: row.image_url,
  };
}

export function getPerfume(db: DB, id: string): PerfumeWithImage | null {
  const row = db.prepare('SELECT * FROM perfumes WHERE id = ?').get(id) as PerfumeRow | undefined;
  return row ? rowToPerfume(db, row) : null;
}

export function getPerfumes(db: DB, ids: string[]): PerfumeWithImage[] {
  if (ids.length === 0) return [];
  const placeholders = ids.map(() => '?').join(',');
  const rows = db
    .prepare(`SELECT * FROM perfumes WHERE id IN (${placeholders})`)
    .all(...ids) as PerfumeRow[];
  return rows.map((r) => rowToPerfume(db, r));
}

export interface ListFilters {
  q?: string;
  family?: string;
  gender?: string;
  season?: string;
  occasion?: string;
  accord?: string;
  note?: string;
  excludeNote?: string;
  sort?: 'rating' | 'year' | 'name';
  offset?: number;
  limit?: number;
}

export function listPerfumes(
  db: DB,
  f: ListFilters,
): { items: PerfumeWithImage[]; total: number } {
  const where: string[] = [];
  const params: Record<string, unknown> = {};

  if (f.q) {
    where.push(`(
      name LIKE @q COLLATE NOCASE
      OR brand LIKE @q COLLATE NOCASE
      OR (name || ' ' || brand) LIKE @q COLLATE NOCASE
      OR (brand || ' ' || name) LIKE @q COLLATE NOCASE
      OR EXISTS (
        SELECT 1 FROM perfume_notes pn JOIN notes n ON n.id = pn.note_id
        WHERE pn.perfume_id = perfumes.id AND n.name LIKE @q COLLATE NOCASE
      )
    )`);
    params.q = `%${f.q}%`;
  }
  if (f.family) {
    where.push('family = @family');
    params.family = f.family;
  }
  if (f.gender) {
    where.push('gender = @gender');
    params.gender = f.gender;
  }
  if (f.season) {
    where.push(`EXISTS (SELECT 1 FROM json_each(perfumes.seasons) WHERE json_each.value = @season)`);
    params.season = f.season;
  }
  if (f.occasion) {
    where.push(
      `EXISTS (SELECT 1 FROM json_each(perfumes.occasions) WHERE json_each.value = @occasion)`,
    );
    params.occasion = f.occasion;
  }
  if (f.accord) {
    where.push(
      `EXISTS (SELECT 1 FROM json_each(perfumes.accords) WHERE json_extract(json_each.value, '$.name') = @accord)`,
    );
    params.accord = f.accord;
  }
  if (f.note) {
    where.push(
      `EXISTS (SELECT 1 FROM perfume_notes pn JOIN notes n ON n.id = pn.note_id
        WHERE pn.perfume_id = perfumes.id AND n.name = @note)`,
    );
    params.note = f.note;
  }
  if (f.excludeNote) {
    where.push(
      `NOT EXISTS (SELECT 1 FROM perfume_notes pn JOIN notes n ON n.id = pn.note_id
        WHERE pn.perfume_id = perfumes.id AND n.name = @excludeNote)`,
    );
    params.excludeNote = f.excludeNote;
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const orderSql =
    f.sort === 'year'
      ? 'ORDER BY year DESC NULLS LAST, COALESCE(votes, 0) DESC'
      : f.sort === 'name'
        ? 'ORDER BY name COLLATE NOCASE ASC'
        : // взвешенный рейтинг: 4.9 от 30 голосов не обгоняет 4.3 от 20 000
          'ORDER BY (COALESCE(votes, 0) * COALESCE(rating, 3.9) + 300 * 3.9) / (COALESCE(votes, 0) + 300) DESC, votes DESC';

  const { c } = db
    .prepare(`SELECT COUNT(*) AS c FROM perfumes ${whereSql}`)
    .get(params) as { c: number };

  const limit = Math.min(Math.max(f.limit ?? 30, 1), 100);
  const offset = Math.max(f.offset ?? 0, 0);
  const rows = db
    .prepare(`SELECT * FROM perfumes ${whereSql} ${orderSql} LIMIT @limit OFFSET @offset`)
    .all({ ...params, limit, offset }) as PerfumeRow[];

  return { items: rows.map((r) => rowToPerfume(db, r)), total: c };
}

export function allPerfumes(db: DB): PerfumeWithImage[] {
  const rows = db.prepare('SELECT * FROM perfumes').all() as PerfumeRow[];
  return rows.map((r) => rowToPerfume(db, r));
}

export interface MetaInfo {
  families: string[];
  accords: string[];
  notes: { name: string; count: number }[];
  total: number;
}

export function getMeta(db: DB): MetaInfo {
  const families = (
    db
      .prepare(`SELECT DISTINCT family FROM perfumes WHERE family != '' ORDER BY family`)
      .all() as { family: string }[]
  ).map((r) => r.family);
  const accords = (
    db
      .prepare(
        `SELECT DISTINCT json_extract(json_each.value, '$.name') AS name
         FROM perfumes, json_each(perfumes.accords) ORDER BY name`,
      )
      .all() as { name: string }[]
  ).map((r) => r.name);
  const notes = db
    .prepare(
      `SELECT n.name, COUNT(DISTINCT pn.perfume_id) AS count
       FROM notes n JOIN perfume_notes pn ON pn.note_id = n.id
       GROUP BY n.id ORDER BY count DESC, n.name`,
    )
    .all() as { name: string; count: number }[];
  const { c } = db.prepare('SELECT COUNT(*) AS c FROM perfumes').get() as { c: number };
  return { families, accords, notes, total: c };
}

export function autocomplete(db: DB, q: string, limit = 8): { id: string; name: string; brand: string }[] {
  if (!q.trim()) return [];
  return db
    .prepare(
      `SELECT id, name, brand FROM perfumes
       WHERE name LIKE @q COLLATE NOCASE OR brand LIKE @q COLLATE NOCASE
         OR (brand || ' ' || name) LIKE @q COLLATE NOCASE
         OR (name || ' ' || brand) LIKE @q COLLATE NOCASE
       ORDER BY COALESCE(votes, 0) DESC
       LIMIT @limit`,
    )
    .all({ q: `%${q.trim()}%`, limit }) as { id: string; name: string; brand: string }[];
}

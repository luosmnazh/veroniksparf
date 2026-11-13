import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import type { Perfume, Tier } from '@veroniks/shared';
import { SEED_PERFUMES, describePerfume } from '@veroniks/shared';

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

export function upsertPerfume(db: DB, p: Perfume, imageUrl?: string | null): void {
  db.prepare(
    `INSERT INTO perfumes (id, name, brand, year, gender, family, accords, seasons, occasions,
       rating, votes, description, fragrantica_url, image_url)
     VALUES (@id, @name, @brand, @year, @gender, @family, @accords, @seasons, @occasions,
       @rating, @votes, @description, @fragranticaUrl, @imageUrl)
     ON CONFLICT(id) DO UPDATE SET
       name=excluded.name, brand=excluded.brand, year=excluded.year, gender=excluded.gender,
       family=excluded.family, accords=excluded.accords, seasons=excluded.seasons,
       occasions=excluded.occasions, rating=excluded.rating, votes=excluded.votes,
       description=excluded.description, fragrantica_url=excluded.fragrantica_url,
       image_url=COALESCE(excluded.image_url, perfumes.image_url)`,
  ).run({
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
    fragranticaUrl: p.fragranticaUrl,
    imageUrl: imageUrl ?? null,
  });

  db.prepare('DELETE FROM perfume_notes WHERE perfume_id = ?').run(p.id);
  const insNote = db.prepare('INSERT OR IGNORE INTO notes (name) VALUES (?)');
  const getNote = db.prepare('SELECT id FROM notes WHERE name = ?');
  const insLink = db.prepare(
    'INSERT OR IGNORE INTO perfume_notes (perfume_id, note_id, tier) VALUES (?, ?, ?)',
  );
  const tiers: [Tier, string[]][] = [
    ['top', p.notesTop],
    ['heart', p.notesHeart],
    ['base', p.notesBase],
  ];
  for (const [tier, notes] of tiers) {
    for (const n of notes) {
      insNote.run(n);
      const row = getNote.get(n) as { id: number };
      insLink.run(p.id, row.id, tier);
    }
  }
}

export function seedIfEmpty(db: DB): void {
  const { c } = db.prepare('SELECT COUNT(*) AS c FROM perfumes').get() as { c: number };
  if (c > 0) return;
  const tx = db.transaction(() => {
    for (const p of SEED_PERFUMES) {
      const withDescription: Perfume = {
        ...p,
        description: p.description ?? describePerfume(p),
      };
      upsertPerfume(db, withDescription);
    }
  });
  tx();
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
      ? 'ORDER BY year DESC NULLS LAST, rating DESC'
      : f.sort === 'name'
        ? 'ORDER BY name COLLATE NOCASE ASC'
        : 'ORDER BY (rating IS NULL), rating DESC, votes DESC';

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
       ORDER BY (rating IS NULL), rating DESC, votes DESC
       LIMIT @limit`,
    )
    .all({ q: `%${q.trim()}%`, limit }) as { id: string; name: string; brand: string }[];
}

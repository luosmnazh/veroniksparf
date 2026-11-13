import type { Perfume, Tier } from '@veroniks/shared';
import { buildNoteIndex } from '@veroniks/shared';
import type { DB } from './db';

/**
 * Кэш каталога в памяти для алгоритма похожести:
 * два запроса к БД вместо тысяч, пересборка — по требованию.
 */
export class Catalog {
  private perfumes: Perfume[] = [];
  private byId = new Map<string, Perfume>();
  private noteIndex = new Map<string, Set<string>>();
  private loaded = false;

  constructor(private db: DB) {}

  invalidate(): void {
    this.loaded = false;
  }

  private load(): void {
    if (this.loaded) return;
    const rows = this.db
      .prepare(
        `SELECT id, name, brand, year, gender, family, accords, seasons, occasions,
                rating, votes, description, fragrantica_url AS fragranticaUrl
         FROM perfumes`,
      )
      .all() as (Omit<Perfume, 'accords' | 'seasons' | 'occasions' | 'notesTop' | 'notesHeart' | 'notesBase'> & {
      accords: string;
      seasons: string;
      occasions: string;
    })[];
    const links = this.db
      .prepare(
        `SELECT pn.perfume_id AS pid, n.name, pn.tier
         FROM perfume_notes pn JOIN notes n ON n.id = pn.note_id`,
      )
      .all() as { pid: string; name: string; tier: Tier }[];

    const notesByPerfume = new Map<string, { top: string[]; heart: string[]; base: string[] }>();
    for (const l of links) {
      let entry = notesByPerfume.get(l.pid);
      if (!entry) notesByPerfume.set(l.pid, (entry = { top: [], heart: [], base: [] }));
      entry[l.tier].push(l.name);
    }

    this.perfumes = rows.map((r) => {
      const n = notesByPerfume.get(r.id) ?? { top: [], heart: [], base: [] };
      return {
        ...r,
        accords: JSON.parse(r.accords),
        seasons: JSON.parse(r.seasons),
        occasions: JSON.parse(r.occasions),
        notesTop: n.top,
        notesHeart: n.heart,
        notesBase: n.base,
      } as Perfume;
    });
    this.byId = new Map(this.perfumes.map((p) => [p.id, p]));
    this.noteIndex = buildNoteIndex(this.perfumes);
    this.loaded = true;
  }

  all(): Perfume[] {
    this.load();
    return this.perfumes;
  }

  get(id: string): Perfume | undefined {
    this.load();
    return this.byId.get(id);
  }

  index(): Map<string, Set<string>> {
    this.load();
    return this.noteIndex;
  }
}

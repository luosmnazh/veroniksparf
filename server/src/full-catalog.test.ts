import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { RuleAdvisor, buildNoteIndex, findSimilar } from '@veroniks/shared';
import { loadCatalogFile } from './catalog-file';
import { catalogPerfumes } from './db';

/** Критерии ТЗ на полном каталоге (~24 000 ароматов), если файл каталога собран. */
const file = path.resolve(__dirname, '../../data/catalog.json.gz');
const loaded = loadCatalogFile(file);
const perfumes = loaded ? catalogPerfumes(loaded).perfumes.map((x) => x.perfume) : [];
const index = buildNoteIndex(perfumes);
const byId = new Map(perfumes.map((p) => [p.id, p]));
const catalog = { all: () => perfumes, index: () => index, byId: () => byId };

describe.skipIf(!loaded)('полный каталог', () => {
  it('в каталоге больше 20 000 ароматов без дублей', () => {
    expect(perfumes.length).toBeGreaterThan(20000);
    expect(new Set(perfumes.map((p) => p.id)).size).toBe(perfumes.length);
  });

  it('встроенные ароматы получили реальные голоса из датасета', () => {
    expect(byId.get('creed-aventus')!.votes).toBeGreaterThan(10000);
  });

  it('Aventus → Club de Nuit Intense Man в топ-5, быстрее 500 мс', () => {
    const aventus = byId.get('creed-aventus')!;
    const started = performance.now();
    const res = findSimilar(aventus, perfumes, { limit: 10, noteIndex: index, byId });
    const ms = performance.now() - started;
    expect(res.slice(0, 5).map((r) => r.perfume.id)).toContain('armaf-club-de-nuit-intense-man');
    expect(res[0].commonNotes.slice(0, 4)).toEqual(expect.arrayContaining(['birch', 'pineapple']));
    expect(ms).toBeLessThan(500);
  });

  it('«тёплое, дымное, зимний вечер, не слишком сладкое» — без сладких бомб, известные ароматы', async () => {
    const r = await new RuleAdvisor().reply(
      { message: 'тёплое, дымное, на зимний вечер, не слишком сладкое' },
      catalog,
    );
    expect(r.picks.length).toBeGreaterThanOrEqual(3);
    for (const p of r.picks) {
      const sweet = p.perfume.accords
        .filter((a) => ['сладкий', 'ванильный', 'гурманский', 'карамельный'].includes(a.name))
        .reduce((s, a) => s + a.weight, 0);
      expect(sweet, p.perfume.name).toBeLessThan(1);
      expect(p.perfume.seasons).toContain('зима');
      expect(p.perfume.votes ?? 0, p.perfume.name).toBeGreaterThan(100);
    }
  });

  it('«что-то как Aventus» — похожие на Aventus', async () => {
    const r = await new RuleAdvisor().reply({ message: 'что-то как Aventus' }, catalog);
    expect(r.picks.map((p) => p.perfume.id).slice(0, 3)).toContain('armaf-club-de-nuit-intense-man');
  });
});

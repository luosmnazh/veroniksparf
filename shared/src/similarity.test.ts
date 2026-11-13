import { describe, expect, it } from 'vitest';
import { SEED_PERFUMES } from './seed/perfumes';
import {
  accordCosine,
  commonNotes,
  findSimilar,
  noteWeights,
  similarityScore,
  weightedJaccard,
} from './similarity';

const byId = (id: string) => {
  const p = SEED_PERFUMES.find((x) => x.id === id);
  if (!p) throw new Error(`нет аромата ${id} в seed`);
  return p;
};

describe('weightedJaccard', () => {
  it('равен 1 для идентичных наборов', () => {
    const a = byId('creed-aventus');
    expect(weightedJaccard(noteWeights(a), noteWeights(a))).toBe(1);
  });

  it('равен 0 без общих нот', () => {
    const a = new Map([['vanilla', 2]]);
    const b = new Map([['lemon', 1]]);
    expect(weightedJaccard(a, b)).toBe(0);
  });

  it('учитывает вес яруса: общая нота в базе даёт больше, чем в верхушке', () => {
    const base = { ...byId('creed-aventus') };
    const inBase = { ...base, id: 'x1', notesTop: [], notesHeart: [], notesBase: ['vanilla'] };
    const inTop = { ...base, id: 'x2', notesTop: ['vanilla'], notesHeart: [], notesBase: [] };
    const ref = { ...base, id: 'ref', notesTop: [], notesHeart: [], notesBase: ['vanilla'] };
    const sBase = weightedJaccard(noteWeights(ref), noteWeights(inBase));
    const sTop = weightedJaccard(noteWeights(ref), noteWeights(inTop));
    expect(sBase).toBeGreaterThan(sTop);
  });
});

describe('accordCosine', () => {
  it('симметрична и равна 1 для одинаковых аккордов', () => {
    const a = byId('tom-ford-tobacco-vanille');
    const b = byId('pdm-herod');
    expect(accordCosine(a, a)).toBeCloseTo(1, 5);
    expect(accordCosine(a, b)).toBeCloseTo(accordCosine(b, a), 10);
  });
});

describe('similarityScore / findSimilar', () => {
  it('Club de Nuit Intense Man — в топ-3 похожих на Aventus', () => {
    const aventus = byId('creed-aventus');
    const results = findSimilar(aventus, SEED_PERFUMES, { limit: 10 });
    const ids = results.map((r) => r.perfume.id);
    expect(ids.slice(0, 3)).toContain('armaf-club-de-nuit-intense-man');
  });

  it('у Aventus и CDNIM общие ноты включают ананас и берёзу', () => {
    const common = commonNotes(byId('creed-aventus'), byId('armaf-club-de-nuit-intense-man'));
    expect(common).toContain('pineapple');
    expect(common).toContain('birch');
  });

  it('не возвращает сам аромат', () => {
    const aventus = byId('creed-aventus');
    const results = findSimilar(aventus, SEED_PERFUMES);
    expect(results.map((r) => r.perfume.id)).not.toContain('creed-aventus');
  });

  it('похожесть симметрична', () => {
    const a = byId('tom-ford-tobacco-vanille');
    const b = byId('pdm-herod');
    expect(similarityScore(a, b)).toBeCloseTo(similarityScore(b, a), 10);
  });

  it('гурманы ближе к гурманам, чем к акватике', () => {
    const tv = byId('tom-ford-tobacco-vanille');
    const herod = byId('pdm-herod');
    const aqua = byId('armani-acqua-di-gio-profumo');
    expect(similarityScore(tv, herod)).toBeGreaterThan(similarityScore(tv, aqua));
  });

  it('у всех seed-ароматов есть пирамида и аккорды', () => {
    for (const p of SEED_PERFUMES) {
      const total = p.notesTop.length + p.notesHeart.length + p.notesBase.length;
      expect(total, p.id).toBeGreaterThan(0);
      expect(p.accords.length, p.id).toBeGreaterThan(0);
      expect(p.seasons.length, p.id).toBeGreaterThan(0);
      expect(p.occasions.length, p.id).toBeGreaterThan(0);
    }
  });

  it('id в seed уникальны', () => {
    const ids = SEED_PERFUMES.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

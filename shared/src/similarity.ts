import type { Perfume, SimilarResult, Tier } from './types';

/** Веса ярусов: база важнее сердца, сердце важнее верха. */
export const TIER_WEIGHTS: Record<Tier, number> = {
  top: 1,
  heart: 1.5,
  base: 2,
};

const W_NOTES = 0.55;
const W_ACCORDS = 0.35;
const W_FAMILY = 0.1;

/** Карта «нота → вес» для аромата. Если нота в нескольких ярусах — берём максимум. */
const noteWeightCache = new WeakMap<Perfume, Map<string, number>>();
const accordCache = new WeakMap<Perfume, { vec: Map<string, number>; norm: number }>();

/** Карта «нота → вес» (кэшируется: каталог большой, а ароматы неизменяемы). */
export function noteWeights(p: Perfume): Map<string, number> {
  const cached = noteWeightCache.get(p);
  if (cached) return cached;
  const m = new Map<string, number>();
  noteWeightCache.set(p, m);
  const put = (notes: string[], w: number) => {
    for (const n of notes) m.set(n, Math.max(m.get(n) ?? 0, w));
  };
  put(p.notesTop, TIER_WEIGHTS.top);
  put(p.notesHeart, TIER_WEIGHTS.heart);
  put(p.notesBase, TIER_WEIGHTS.base);
  return m;
}

/** Взвешенный Жаккар: sum(min) / sum(max) по объединению нот. */
export function weightedJaccard(a: Map<string, number>, b: Map<string, number>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  let union = 0;
  const seen = new Set<string>();
  for (const [note, wa] of a) {
    const wb = b.get(note) ?? 0;
    inter += Math.min(wa, wb);
    union += Math.max(wa, wb);
    seen.add(note);
  }
  for (const [note, wb] of b) {
    if (!seen.has(note)) union += wb;
  }
  return union === 0 ? 0 : inter / union;
}

/** Косинусная близость векторов аккордов (имя → вес). */
function accordVector(p: Perfume): { vec: Map<string, number>; norm: number } {
  let v = accordCache.get(p);
  if (!v) {
    const vec = new Map(p.accords.map((x) => [x.name, x.weight]));
    const norm = Math.sqrt(p.accords.reduce((s, x) => s + x.weight * x.weight, 0));
    accordCache.set(p, (v = { vec, norm }));
  }
  return v;
}

export function accordCosine(a: Perfume, b: Perfume): number {
  if (a.accords.length === 0 || b.accords.length === 0) return 0;
  const va = accordVector(a);
  const vb = accordVector(b);
  if (va.norm === 0 || vb.norm === 0) return 0;
  let dot = 0;
  for (const [name, w] of va.vec) {
    const w2 = vb.vec.get(name);
    if (w2) dot += w * w2;
  }
  return dot / (va.norm * vb.norm);
}

/** Итоговая близость двух ароматов, 0..1. */
export function similarityScore(a: Perfume, b: Perfume): number {
  const jac = weightedJaccard(noteWeights(a), noteWeights(b));
  const cos = accordCosine(a, b);
  const fam = a.family && a.family === b.family ? 1 : 0;
  return W_NOTES * jac + W_ACCORDS * cos + W_FAMILY * fam;
}

/** Общие ноты двух ароматов, отсортированы по важности яруса. */
export function commonNotes(a: Perfume, b: Perfume): string[] {
  const wa = noteWeights(a);
  const wb = noteWeights(b);
  const common = [...wa.keys()].filter((n) => wb.has(n));
  return common.sort((x, y) => (wb.get(y)! + wa.get(y)!) - (wb.get(x)! + wa.get(x)!));
}

/** Индекс «нота → множество id ароматов» для быстрого отбора кандидатов. */
export function buildNoteIndex(perfumes: Perfume[]): Map<string, Set<string>> {
  const idx = new Map<string, Set<string>>();
  for (const p of perfumes) {
    for (const n of new Set([...p.notesTop, ...p.notesHeart, ...p.notesBase])) {
      let set = idx.get(n);
      if (!set) idx.set(n, (set = new Set()));
      set.add(p.id);
    }
  }
  return idx;
}

export interface FindSimilarOptions {
  limit?: number;
  /** Готовый индекс нот (если база большая и индекс переиспользуется). */
  noteIndex?: Map<string, Set<string>>;
  /** Готовая карта id → аромат (чтобы не строить её на каждый запрос). */
  byId?: Map<string, Perfume>;
}

/**
 * Топ похожих ароматов. Сначала кандидаты по общим нотам (через индекс),
 * потом точный скоринг.
 */
/**
 * Небольшой бонус за известность (число голосов) — только для порядка выдачи:
 * из почти одинаково похожих выше окажется тот, что знаком людям.
 * Процент совпадения на экране остаётся честным.
 */
export function popularityBonus(votes: number | null): number {
  return votes && votes > 0 ? 0.015 * Math.log10(votes + 1) : 0;
}

/**
 * Топ похожих ароматов. Сначала кандидаты по общим нотам (через индекс),
 * потом точный скоринг; общие ноты считаются только для победителей.
 */
export function findSimilar(
  target: Perfume,
  all: Perfume[],
  opts: FindSimilarOptions = {},
): SimilarResult[] {
  const limit = opts.limit ?? 10;
  const idx = opts.noteIndex ?? buildNoteIndex(all);
  const byId = opts.byId ?? new Map(all.map((p) => [p.id, p]));

  const candidateIds = new Set<string>();
  for (const n of new Set([...target.notesTop, ...target.notesHeart, ...target.notesBase])) {
    const set = idx.get(n);
    if (set) for (const id of set) candidateIds.add(id);
  }
  candidateIds.delete(target.id);

  const scored: { p: Perfume; score: number; rank: number }[] = [];
  for (const id of candidateIds) {
    const p = byId.get(id);
    if (!p) continue;
    const score = similarityScore(target, p);
    if (score <= 0.02) continue;
    scored.push({ p, score, rank: score + popularityBonus(p.votes) });
  }
  scored.sort((a, b) => b.rank - a.rank);

  // редкие ноты информативнее: ананас и берёза важнее мускуса и ванили
  const total = all.length || 1;
  const rarity = (n: string) => Math.log((total + 1) / ((idx.get(n)?.size ?? 0) + 1)) + 0.5;
  const tw = noteWeights(target);
  return scored.slice(0, limit).map(({ p, score }) => {
    const wp = noteWeights(p);
    const weight = (n: string) => ((tw.get(n) ?? 0) + (wp.get(n) ?? 0)) * rarity(n);
    return {
      perfume: p,
      matchPercent: Math.round(Math.min(1, score) * 100),
      commonNotes: commonNotes(target, p).sort((x, y) => weight(y) - weight(x)),
    };
  });
}

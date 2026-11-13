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
export function noteWeights(p: Perfume): Map<string, number> {
  const m = new Map<string, number>();
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
export function accordCosine(a: Perfume, b: Perfume): number {
  if (a.accords.length === 0 || b.accords.length === 0) return 0;
  const va = new Map(a.accords.map((x) => [x.name, x.weight]));
  const vb = new Map(b.accords.map((x) => [x.name, x.weight]));
  let dot = 0;
  for (const [name, w] of va) {
    const w2 = vb.get(name);
    if (w2) dot += w * w2;
  }
  const na = Math.sqrt([...va.values()].reduce((s, w) => s + w * w, 0));
  const nb = Math.sqrt([...vb.values()].reduce((s, w) => s + w * w, 0));
  return na === 0 || nb === 0 ? 0 : dot / (na * nb);
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
}

/**
 * Топ похожих ароматов. Сначала кандидаты по общим нотам (через индекс),
 * потом точный скоринг.
 */
export function findSimilar(
  target: Perfume,
  all: Perfume[],
  opts: FindSimilarOptions = {},
): SimilarResult[] {
  const limit = opts.limit ?? 10;
  const idx = opts.noteIndex ?? buildNoteIndex(all);
  const byId = new Map(all.map((p) => [p.id, p]));

  const candidateIds = new Set<string>();
  for (const n of new Set([...target.notesTop, ...target.notesHeart, ...target.notesBase])) {
    const set = idx.get(n);
    if (set) for (const id of set) candidateIds.add(id);
  }
  candidateIds.delete(target.id);

  // редкие ноты информативнее: ананас и берёза важнее мускуса и ванили
  const total = all.length || 1;
  const rarity = (n: string) => Math.log((total + 1) / ((idx.get(n)?.size ?? 0) + 1)) + 0.5;
  const tw = noteWeights(target);

  const results: SimilarResult[] = [];
  for (const id of candidateIds) {
    const p = byId.get(id);
    if (!p) continue;
    const score = similarityScore(target, p);
    if (score <= 0.02) continue;
    results.push({
      perfume: p,
      matchPercent: Math.round(Math.min(1, score) * 100),
      commonNotes: commonNotes(target, p).sort((x, y) => {
        const wp = noteWeights(p);
        const sx = ((tw.get(x) ?? 0) + (wp.get(x) ?? 0)) * rarity(x);
        const sy = ((tw.get(y) ?? 0) + (wp.get(y) ?? 0)) * rarity(y);
        return sy - sx;
      }),
    });
  }
  results.sort(
    (a, b) =>
      b.matchPercent - a.matchPercent ||
      (b.perfume.rating ?? 0) - (a.perfume.rating ?? 0),
  );
  return results.slice(0, limit);
}

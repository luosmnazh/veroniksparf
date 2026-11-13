import type { Accord, Occasion, Perfume, Season } from './types';

/**
 * Эвристика: сезоны и поводы из аккордов, когда их нет в данных.
 * Аккорды — канонические русские имена (см. seed и импорт).
 */

const WARM = new Set([
  'сладкий',
  'ванильный',
  'гурманский',
  'амбровый',
  'тёплый пряный',
  'пряный',
  'табачный',
  'дымный',
  'кожаный',
  'смолистый',
  'ромовый',
  'кофейный',
  'шоколадный',
  'ореховый',
  'коричный',
]);

const FRESH = new Set([
  'цитрусовый',
  'свежий',
  'водный',
  'морской',
  'озоновый',
  'зелёный',
  'ароматический',
  'фужерный',
  'свежий пряный',
  'мятный',
  'фруктовый',
]);

function weightOf(accords: Accord[], names: Set<string>): number {
  let s = 0;
  for (const a of accords) if (names.has(a.name)) s += a.weight;
  return s;
}

export function inferSeasons(accords: Accord[]): Season[] {
  const warm = weightOf(accords, WARM);
  const fresh = weightOf(accords, FRESH);
  const seasons: Season[] = [];
  if (warm > fresh * 1.3) {
    seasons.push('осень', 'зима');
  } else if (fresh > warm * 1.3) {
    seasons.push('весна', 'лето');
  } else {
    seasons.push('весна', 'осень');
    if (warm > 0.5) seasons.push('зима');
    if (fresh > 0.5) seasons.push('лето');
  }
  return [...new Set(seasons)];
}

export function inferOccasions(accords: Accord[]): Occasion[] {
  const warm = weightOf(accords, WARM);
  const fresh = weightOf(accords, FRESH);
  const sweet = weightOf(accords, new Set(['сладкий', 'ванильный', 'гурманский']));
  const occ: Occasion[] = [];
  if (fresh >= warm) occ.push('день');
  if (warm > 0.4 || sweet > 0.4) occ.push('вечер');
  if (fresh > 0.6 && sweet < 0.6) occ.push('офис');
  if (sweet > 0.5 || warm > 0.8) occ.push('свидание');
  if (occ.length === 0) occ.push('день');
  return [...new Set(occ)];
}

/** Заполняет пустые сезоны/поводы эвристикой. */
export function fillHeuristics(p: Perfume): Perfume {
  return {
    ...p,
    seasons: p.seasons.length ? p.seasons : inferSeasons(p.accords),
    occasions: p.occasions.length ? p.occasions : inferOccasions(p.accords),
  };
}

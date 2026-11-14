import type { Perfume } from './types';
import { noteRu } from './notes-ru';
import { GENDER_RU } from './types';

/**
 * Шаблонный генератор описаний в стиле персоны:
 * сдержанный британский джентльмен-парфюмер, владелец клуба Veroniks.
 * 2–3 предложения на русском. Детерминирован по id аромата,
 * чтобы описание не менялось от запуска к запуску.
 */

function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(rnd: () => number, arr: T[]): T {
  return arr[Math.floor(rnd() * arr.length)];
}

function listRu(notes: string[], max: number): string {
  const ru = notes.slice(0, max).map(noteRu);
  if (ru.length <= 1) return ru.join('');
  return ru.slice(0, -1).join(', ') + ' и ' + ru[ru.length - 1];
}

const OPENINGS: ((p: Perfume, fam: string) => string)[] = [
  (p, fam) => `${p.name} — ${fam}, без лишних слов.`,
  (p, fam) => `В клубе ${p.name} держат на верхней полке: ${fam}, уверенный в себе.`,
  (p, fam) => `${p.name} от ${p.brand} — ${fam}, как хороший костюм: ничего случайного.`,
  (p, fam) => `Досье на ${p.name}: ${fam}, репутация безупречная.`,
  (p, fam) => `${p.name} не торопится нравиться: ${fam}, который знает себе цену.`,
  (p, fam) => `Если коротко, ${p.name} — ${fam}, с правильной выправкой.`,
  (p, fam) => `${p.brand} сделали ${p.name} таким: ${fam}, без компромиссов.`,
];

// Все шаблоны построены так, чтобы ноты стояли в именительном падеже.
const MIDDLES: ((p: Perfume) => string)[] = [
  (p) =>
    `Открывают его ${listRu(p.notesTop, 3)}; в сердце — ${listRu(p.notesHeart, 3)}, а база (${listRu(p.notesBase, 3)}) остаётся с вами до конца вечера.`,
  (p) =>
    `Сначала звучат ${listRu(p.notesTop, 3)}, затем проступают ${listRu(p.notesHeart, 3)}, и всё это держит основательный фундамент: ${listRu(p.notesBase, 3)}.`,
  (p) =>
    `Верх — ${listRu(p.notesTop, 3)} — быстро уступает место сердцу (${listRu(p.notesHeart, 3)}), а в базе хозяйничают ${listRu(p.notesBase, 3)}.`,
  (p) =>
    `На старте — ${listRu(p.notesTop, 2)}, в середине — ${listRu(p.notesHeart, 2)}, в основании — ${listRu(p.notesBase, 3)}.`,
  (p) =>
    `Пирамида простая и честная: сверху ${listRu(p.notesTop, 3)}, в сердце ${listRu(p.notesHeart, 3)}, в базе ${listRu(p.notesBase, 3)}.`,
];

const CLOSERS: ((p: Perfume) => string)[] = [
  (p) => closeBySeason(p),
  (p) => closeByOccasion(p),
  (p) => `Носите уверенно — ${p.name} сделает остальное.`,
  () => `Рекомендую не распыляться — пары нажатий достаточно.`,
  () => `Такие вещи не выходят из моды, они её переживают.`,
];

function closeBySeason(p: Perfume): string {
  const s = new Set(p.seasons);
  if (s.has('зима') && s.has('осень')) return 'Его время — холодный воздух: осень, зима и поднятый воротник.';
  if (s.has('лето') && s.has('весна')) return 'Создан для тёплого сезона: весна, лето и открытые окна.';
  if (s.has('зима')) return 'Зимний вечер — его законная территория.';
  if (s.has('лето')) return 'Летом раскрывается в полную силу.';
  return 'Работает в любой сезон — редкое качество.';
}

function closeByOccasion(p: Perfume): string {
  const o = new Set(p.occasions);
  if (o.has('свидание') && o.has('вечер')) return 'На вечер и свидание — именно то, что доктор прописал.';
  if (o.has('офис')) return 'В офисе не кричит, но его замечают. Так и надо.';
  if (o.has('вечер')) return 'Приберегите его для вечера — днём он скучает.';
  if (o.has('свидание')) return 'На свидание — смело. Комплименты берёт на себя.';
  return 'Уместен почти везде, где уместны вы.';
}

const FAMILY_ADJ: Record<string, string> = {
  шипровый: 'шипровый характер старой школы',
  фужерный: 'классический фужер',
  древесный: 'древесный и собранный',
  амбровый: 'тёплый амбровый тип',
  цветочный: 'цветочный, но без сантиментов',
  гурманский: 'гурманский соблазн из тех, что подают после ужина',
  цитрусовый: 'звонкий цитрусовый характер',
  фруктовый: 'сочный фруктовый характер, без детской наивности',
  кожаный: 'кожаный клубный завсегдатай',
  акватический: 'свежий характер морской закалки',
  ароматический: 'ароматический тип травяной выучки',
};

/** Меняйте при правке шаблонов — база пересоберёт описания. */
export const DESCRIBE_TEMPLATE_VERSION = 2;

export function describePerfume(p: Perfume): string {
  const rnd = mulberry32(hashString(p.id));
  const fam = FAMILY_ADJ[p.family] ?? 'аромат';
  const opening = pick(rnd, OPENINGS)(p, fam);
  const middle = pick(rnd, MIDDLES)(p);
  const closer = pick(rnd, CLOSERS)(p);
  return [opening, middle, closer].join(' ');
}

/** Короткая сводка для текстовых ответов бота. */
export function perfumeSummaryLine(p: Perfume): string {
  const bits = [p.brand, p.year ? String(p.year) : null, GENDER_RU[p.gender], p.family].filter(Boolean);
  return `${p.name} (${bits.join(', ')})`;
}

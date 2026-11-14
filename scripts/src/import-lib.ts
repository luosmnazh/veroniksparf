/**
 * Чистая логика импорта датасета (без ввода-вывода) — покрыта тестами.
 */
import type { Accord, Gender, Perfume } from '@veroniks/shared';
import {
  fillHeuristics,
  fragranticaSearchUrl,
  normalizeAccordName,
  normalizeNotes,
} from '@veroniks/shared';

/** Определение разделителя CSV по строке заголовка. */
export function detectDelimiter(headerLine: string): ',' | ';' | '\t' {
  const counts: [',' | ';' | '\t', number][] = [
    [',', (headerLine.match(/,/g) ?? []).length],
    [';', (headerLine.match(/;/g) ?? []).length],
    ['\t', (headerLine.match(/\t/g) ?? []).length],
  ];
  counts.sort((a, b) => b[1] - a[1]);
  return counts[0][1] > 0 ? counts[0][0] : ',';
}

/** Приведение пола к канону. */
export function parseGender(raw: string | null | undefined): Gender {
  const s = (raw ?? '').toLowerCase().trim();
  if (['male', 'men', 'man', 'for men', 'м', 'мужской'].includes(s)) return 'male';
  if (['female', 'women', 'woman', 'for women', 'ж', 'женский'].includes(s)) return 'female';
  return 'unisex';
}

/** Разбор списка значений из ячейки: "a, b, c" | "a; b" | JSON-массив. */
export function splitList(raw: string | null | undefined): string[] {
  const s = (raw ?? '').trim();
  if (!s || s === '-' || s.toLowerCase() === 'nan' || s.toLowerCase() === 'null') return [];
  if (s.startsWith('[')) {
    try {
      const arr = JSON.parse(s.replace(/'/g, '"')) as unknown[];
      return arr.map(String).map((x) => x.trim()).filter(Boolean);
    } catch {
      /* падаем на обычный разбор */
    }
  }
  const sep = s.includes(';') && !s.includes(',') ? ';' : ',';
  return s
    .split(sep)
    .map((x) => x.trim())
    .filter(Boolean);
}

/** Число из ячейки: поддержка запятой как десятичного разделителя. */
export function parseNumber(raw: string | number | null | undefined): number | null {
  if (raw === null || raw === undefined || raw === '') return null;
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
  const n = Number(String(raw).replace(',', '.').replace(/\s/g, ''));
  return Number.isFinite(n) ? n : null;
}

/** Год: отбрасываем мусор вне разумного диапазона. */
export function parseYear(raw: string | number | null | undefined): number | null {
  const n = parseNumber(raw);
  if (n === null) return null;
  const y = Math.round(n);
  return y >= 1700 && y <= 2100 ? y : null;
}

/** Slug для id: нижний регистр, латиница/цифры/дефисы. */
export function slugify(...parts: (string | null | undefined)[]): string {
  return parts
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9а-яё]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

/** Ключ для поиска дубликатов и сопоставления: бренд+название без пунктуации и диакритики. */
export function matchKey(brand: string, name: string): string {
  const clean = (s: string) =>
    s
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9а-яё ]+/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  return `${clean(brand)}|${clean(name)}`;
}

/**
 * Маппинг колонок датасета на поля модели.
 * Ключ — поле модели, значение — список возможных имён колонок (без регистра).
 */
export const COLUMN_ALIASES: Record<string, string[]> = {
  name: ['name', 'perfume', 'perfume_name', 'title', 'fragrance', 'название'],
  brand: ['brand', 'brand_name', 'house', 'designer', 'company', 'бренд'],
  year: ['year', 'release_year', 'launch_year', 'год'],
  gender: ['gender', 'sex', 'for_gender', 'пол'],
  rating: ['rating', 'rating_value', 'rating value', 'score', 'рейтинг'],
  votes: ['votes', 'rating_count', 'rating count', 'ratings_count', 'ratings count', 'number_votes', 'голоса'],
  accords: ['accords', 'main_accords', 'mainaccords', 'main accords', 'аккорды'],
  notesTop: ['top', 'top_notes', 'notes_top', 'top notes', 'верхние ноты'],
  notesHeart: ['middle', 'middle_notes', 'heart', 'heart_notes', 'middle notes', 'ноты сердца'],
  notesBase: ['base', 'base_notes', 'notes_base', 'base notes', 'базовые ноты'],
  notesAll: ['notes', 'all_notes', 'ноты'],
  url: ['perfume_url', 'url', 'link', 'fragrantica_url', 'page_url', 'ссылка'],
  imageUrl: ['image_url', 'image', 'img_url', 'picture', 'thumbnail'],
  description: ['description', 'about', 'описание'],
  family: ['family', 'olfactive_family', 'группа', 'семейство'],
};

export interface ColumnMapping {
  [field: string]: string | undefined;
}

/** Автоматический подбор маппинга по заголовкам файла. */
export function buildMapping(headers: string[]): ColumnMapping {
  const mapping: ColumnMapping = {};
  const lower = headers.map((h) => h.toLowerCase().trim());
  // аккорды по отдельным колонкам: mainaccord1…mainaccord5 → «a|b|c»
  const accordCols = headers
    .filter((h) => /^main[ _]?accord[ _]?\d+$/i.test(h.trim()))
    .sort((a, b) => Number(a.replace(/\D/g, '')) - Number(b.replace(/\D/g, '')));
  if (accordCols.length) mapping.accords = accordCols.join('|');
  for (const [field, aliases] of Object.entries(COLUMN_ALIASES)) {
    if (mapping[field]) continue;
    for (const alias of aliases) {
      const idx = lower.indexOf(alias);
      if (idx >= 0) {
        mapping[field] = headers[idx];
        break;
      }
    }
  }
  return mapping;
}

export type RawRow = Record<string, string | number | null | undefined>;

/** Есть ли в датасете хоть какие-то колонки нот. */
export function hasNotesColumns(mapping: ColumnMapping): boolean {
  return Boolean(mapping.notesTop || mapping.notesHeart || mapping.notesBase || mapping.notesAll);
}

function cell(row: RawRow, col: string | undefined): string {
  if (!col) return '';
  // несколько колонок через «|» — склеиваем значения через запятую
  if (col.includes('|')) {
    return col
      .split('|')
      .map((c) => cell(row, c))
      .filter(Boolean)
      .join(', ');
  }
  const v = row[col];
  if (v === null || v === undefined) return '';
  const s = String(v).trim();
  const low = s.toLowerCase();
  return low === 'nan' || low === 'unknown' || low === 'n/a' ? '' : s;
}

/** Разбор аккордов: "woody, sweet" или "woody:0.9, sweet:0.5". */
export function parseAccords(raw: string): Accord[] {
  const parts = splitList(raw);
  const out: Accord[] = [];
  const seen = new Set<string>();
  parts.forEach((part, i) => {
    const m = part.match(/^(.*?)[:=]\s*([\d.,]+)$/);
    const name = normalizeAccordName((m ? m[1] : part).trim());
    if (!name || seen.has(name)) return;
    seen.add(name);
    let weight = m ? parseNumber(m[2]) ?? 0.5 : Math.max(0.25, 0.9 - i * 0.1);
    if (weight > 1) weight = weight > 100 ? 1 : weight / 100;
    out.push({ name, weight: Math.round(weight * 100) / 100 });
  });
  return out;
}

export interface MappedRow {
  perfume: Perfume;
  imageUrl: string | null;
  hasNotes: boolean;
}

/** Декодирование файла: UTF-8, а если он «битый» — Windows-1252 (типично для выгрузок Kaggle). */
export function decodeText(buf: Uint8Array, encoding?: string): { text: string; encoding: string } {
  let text: string;
  let used: string;
  if (encoding && encoding !== 'auto') {
    text = new TextDecoder(encoding === 'cp1251' ? 'windows-1251' : encoding).decode(buf);
    used = encoding;
  } else {
    try {
      text = new TextDecoder('utf-8', { fatal: true }).decode(buf);
      used = 'utf-8';
    } catch {
      text = new TextDecoder('windows-1252').decode(buf);
      used = 'windows-1252';
    }
  }
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  return { text, encoding: used };
}

/** Бренды, которые из «слага» не восстановить механически. */
const BRAND_NAMES: Record<string, string> = {
  'dolce-gabbana': 'Dolce & Gabbana',
  'viktor-rolf': 'Viktor & Rolf',
  'abercrombie-fitch': 'Abercrombie & Fitch',
  'penhaligon-s': "Penhaligon's",
  hermes: 'Hermès',
  lancome: 'Lancôme',
  'maison-martin-margiela': 'Maison Margiela',
  'by-kilian': 'By Kilian',
  kilian: 'Kilian',
  'yves-saint-laurent': 'Yves Saint Laurent',
  'giorgio-armani': 'Giorgio Armani',
  'jean-paul-gaultier': 'Jean Paul Gaultier',
  'maison-francis-kurkdjian': 'Maison Francis Kurkdjian',
  'parfums-de-marly': 'Parfums de Marly',
  'acqua-di-parma': 'Acqua di Parma',
  'comme-des-garcons': 'Comme des Garçons',
  'l-artisan-parfumeur': "L'Artisan Parfumeur",
  'l-occitane-en-provence': "L'Occitane en Provence",
  'serge-lutens': 'Serge Lutens',
  'frederic-malle': 'Frédéric Malle',
  'tom-ford': 'Tom Ford',
  'le-labo': 'Le Labo',
  'jo-malone-london': 'Jo Malone London',
  'carolina-herrera': 'Carolina Herrera',
  'paco-rabanne': 'Paco Rabanne',
  'rabanne': 'Rabanne',
  'escentric-molecules': 'Escentric Molecules',
  'al-haramain-perfumes': 'Al Haramain',
  'maison-alhambra': 'Maison Alhambra',
  'ex-nihilo': 'Ex Nihilo',
  'd-s-durga': 'D.S. & Durga',
  'ysl': 'Yves Saint Laurent',
};

const KEEP_UPPER = new Set(['edp', 'edt', 'edc', 'ii', 'iii', 'iv', 'vi', 'vii', 'viii', 'ix', 'xi', 'xx', 'xxi', 'cdnim', 'ck', 'dkny', 'usa', 'uk']);
const KEEP_LOWER = new Set(['de', 'du', 'des', 'la', 'le', 'les', 'di', 'da', 'del', 'of', 'the', 'and', 'et', 'en', 'pour', 'a', 'au', 'aux', 'for', 'in', 'on', 'von', 'van', 'y']);

/**
 * «club-de-nuit-intense-man» → «Club de Nuit Intense Man»,
 * «terre-d-hermes» → «Terre d'Hermes». Обычные названия не трогаем.
 */
export function prettifyName(raw: string, kind: 'name' | 'brand' = 'name'): string {
  const s = raw.trim();
  if (!/^[a-z0-9-]+$/.test(s) || !s) return s;
  if (kind === 'brand' && BRAND_NAMES[s]) return BRAND_NAMES[s];
  const words = s.split('-').filter(Boolean);
  const out: string[] = [];
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    const next = words[i + 1];
    // d' / l' перед следующим словом: terre-d-hermes, l-eau
    if ((w === 'd' || w === 'l') && next && i < words.length - 1) {
      const glued = (i === 0 ? w.toUpperCase() : w) + "'" + next.charAt(0).toUpperCase() + next.slice(1);
      out.push(glued);
      i++;
      continue;
    }
    if (KEEP_UPPER.has(w)) out.push(w.toUpperCase());
    else if (i > 0 && KEEP_LOWER.has(w)) out.push(w);
    else out.push(w.charAt(0).toUpperCase() + w.slice(1));
  }
  return out.join(' ');
}

/** Семейство по главному аккорду, если в датасете его нет. */
const FAMILY_BY_ACCORD: Record<string, string> = {
  цитрусовый: 'цитрусовый',
  древесный: 'древесный',
  удовый: 'древесный',
  землистый: 'древесный',
  пачулевый: 'шипровый',
  мшистый: 'шипровый',
  амбровый: 'амбровый',
  'тёплый пряный': 'амбровый',
  бальзамический: 'амбровый',
  смолистый: 'амбровый',
  ладанный: 'амбровый',
  дымный: 'древесный',
  табачный: 'амбровый',
  сладкий: 'гурманский',
  ванильный: 'гурманский',
  карамельный: 'гурманский',
  шоколадный: 'гурманский',
  кофейный: 'гурманский',
  миндальный: 'гурманский',
  ореховый: 'гурманский',
  медовый: 'гурманский',
  кокосовый: 'гурманский',
  вишнёвый: 'гурманский',
  молочный: 'гурманский',
  ромовый: 'амбровый',
  цветочный: 'цветочный',
  белоцветочный: 'цветочный',
  жёлтоцветочный: 'цветочный',
  розовый: 'цветочный',
  ирисовый: 'цветочный',
  фиалковый: 'цветочный',
  туберозовый: 'цветочный',
  пудровый: 'цветочный',
  мускусный: 'цветочный',
  альдегидный: 'цветочный',
  фруктовый: 'фруктовый',
  тропический: 'фруктовый',
  кожаный: 'кожаный',
  анималистический: 'кожаный',
  водный: 'акватический',
  морской: 'акватический',
  озоновый: 'акватический',
  солёный: 'акватический',
  ароматический: 'ароматический',
  лавандовый: 'фужерный',
  травяной: 'ароматический',
  мятный: 'ароматический',
  зелёный: 'ароматический',
  'свежий пряный': 'ароматический',
  свежий: 'ароматический',
  пряный: 'амбровый',
  коричный: 'амбровый',
  хвойный: 'древесный',
};

export function familyFromAccords(accords: Accord[]): string {
  for (const a of [...accords].sort((x, y) => y.weight - x.weight)) {
    const fam = FAMILY_BY_ACCORD[a.name];
    if (fam) return fam;
  }
  return '';
}

/** Превращение строки датасета в модель Perfume. */
export function mapRow(row: RawRow, mapping: ColumnMapping): MappedRow | null {
  const name = prettifyName(cell(row, mapping.name), 'name');
  const brand = prettifyName(cell(row, mapping.brand), 'brand');
  if (!name || !brand) return null;

  const notesTop = normalizeNotes(splitList(cell(row, mapping.notesTop)));
  const notesHeart = normalizeNotes(splitList(cell(row, mapping.notesHeart)));
  let notesBase = normalizeNotes(splitList(cell(row, mapping.notesBase)));
  // датасет с одной колонкой нот: складываем всё в «базу» с пометкой hasNotes
  if (!notesTop.length && !notesHeart.length && !notesBase.length && mapping.notesAll) {
    notesBase = normalizeNotes(splitList(cell(row, mapping.notesAll)));
  }

  const accords = parseAccords(cell(row, mapping.accords));
  const url = cell(row, mapping.url) || null;
  const rating = parseNumber(cell(row, mapping.rating));

  const perfume: Perfume = fillHeuristics({
    id: slugify(brand, name),
    name,
    brand,
    year: parseYear(cell(row, mapping.year)),
    gender: parseGender(cell(row, mapping.gender)),
    family: cell(row, mapping.family) || familyFromAccords(accords),
    accords,
    notesTop,
    notesHeart,
    notesBase,
    seasons: [],
    occasions: [],
    rating: rating !== null ? Math.min(Math.max(rating, 0), 5) : null,
    votes: parseNumber(cell(row, mapping.votes)),
    description: cell(row, mapping.description) || null,
    fragranticaUrl: url ?? fragranticaSearchUrl(brand, name),
  });

  return {
    perfume,
    imageUrl: cell(row, mapping.imageUrl) || null,
    hasNotes: notesTop.length + notesHeart.length + notesBase.length > 0,
  };
}

/**
 * Дедупликация: при совпадении ключа «бренд+название» остаётся запись,
 * у которой больше данных (ноты, рейтинг).
 */
export function dedupeRows(rows: MappedRow[]): MappedRow[] {
  const byKey = new Map<string, MappedRow>();
  const score = (r: MappedRow) =>
    (r.hasNotes ? 10 : 0) +
    (r.perfume.rating !== null ? 2 : 0) +
    (r.perfume.year !== null ? 1 : 0) +
    r.perfume.accords.length;
  for (const r of rows) {
    const key = matchKey(r.perfume.brand, r.perfume.name);
    const prev = byKey.get(key);
    if (!prev || score(r) > score(prev)) byKey.set(key, r);
  }
  return [...byKey.values()];
}

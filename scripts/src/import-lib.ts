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
  rating: ['rating', 'rating_value', 'score', 'рейтинг'],
  votes: ['votes', 'rating_count', 'ratings_count', 'number_votes', 'голоса'],
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
  for (const [field, aliases] of Object.entries(COLUMN_ALIASES)) {
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
  const v = row[col];
  if (v === null || v === undefined) return '';
  const s = String(v).trim();
  return s.toLowerCase() === 'nan' ? '' : s;
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

/** Превращение строки датасета в модель Perfume. */
export function mapRow(row: RawRow, mapping: ColumnMapping): MappedRow | null {
  const name = cell(row, mapping.name);
  const brand = cell(row, mapping.brand);
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
    family: cell(row, mapping.family),
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

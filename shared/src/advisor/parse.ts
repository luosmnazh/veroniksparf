import type { Gender, Occasion, Perfume, Season } from '../types';
import { LEXICON, NEGATORS, type LexEffect } from './lexicon';

/** Результат разбора запроса пользователя. */
export interface ParsedQuery {
  notes: string[];
  accords: string[];
  families: string[];
  seasons: Season[];
  occasions: Occasion[];
  gender: Gender | null;
  avoidNotes: string[];
  avoidAccords: string[];
  avoidFamilies: string[];
  /** Аромат, на который ссылается запрос («как Aventus»). */
  reference: { id: string; name: string; brand: string } | null;
  /** Модификаторы к референсу и запросу в целом. */
  cheaper: boolean;
  softer: boolean;
  /** Сработавшие выражения — для отладки и тестов. */
  matched: string[];
}

export function emptyQuery(): ParsedQuery {
  return {
    notes: [],
    accords: [],
    families: [],
    seasons: [],
    occasions: [],
    gender: null,
    avoidNotes: [],
    avoidAccords: [],
    avoidFamilies: [],
    reference: null,
    cheaper: false,
    softer: false,
    matched: [],
  };
}

/** Нижний регистр, «ё» → «е», пунктуация (кроме разделителей фраз) → пробел. */
export function normalizeText(s: string): string {
  return s
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[«»"“”'’`]/g, ' ')
    .replace(/[^a-zа-я0-9,.;!?\s-]/g, ' ')
    .replace(/-/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const LETTER = 'a-zа-я0-9';

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Компиляция ключа лексикона в регулярное выражение.
 * «a|b» — варианты; часть с «$» на конце — целое слово, без «$» — начало слова;
 * несколько слов через пробел — фраза.
 */
function compileKey(key: string): RegExp {
  const alts = key
    .trim()
    .split('|')
    .map((alt) => {
      const parts = alt.trim().split(/\s+/).filter(Boolean);
      const body = parts
        .map((part) => {
          const exact = part.endsWith('$');
          const stem = escapeRe((exact ? part.slice(0, -1) : part).replace(/ё/g, 'е'));
          return exact ? `${stem}(?![${LETTER}])` : `${stem}[${LETTER}]*`;
        })
        .join('\\s+');
      return body;
    });
  return new RegExp(`(?<![${LETTER}])(?:${alts.join('|')})`, 'g');
}

const COMPILED: { key: string; re: RegExp; effect: LexEffect }[] = Object.entries(LEXICON).map(
  ([key, effect]) => ({ key, re: compileKey(key), effect }),
);

const NEGATOR_RE = new RegExp(
  `(?<![${LETTER}])(?:${NEGATORS.map((n) => escapeRe(n.trim())).join('|')})(?![${LETTER}])`,
  'g',
);

/** Деление на фразы: отрицание действует только до конца своей фразы. */
function splitClauses(text: string): string[] {
  return text
    .split(/[,.;!?]|\s(?:но|а|зато|однако|и при этом)\s/)
    .map((c) => c.trim())
    .filter(Boolean);
}

const CHEAPER_RE = /(?<![a-zа-я])(дешевл|бюджетн|недорог|подешевл|доступн|аналог|клон|замен)/;
const SOFTER_RE = /(?<![a-zа-я])(мягч|легч|тише|спокойн|деликатн|скромн)/;

function pushUnique<T>(arr: T[], ...items: T[]): void {
  for (const it of items) if (!arr.includes(it)) arr.push(it);
}

function applyEffect(q: ParsedQuery, e: LexEffect, negated: boolean): void {
  if (negated) {
    if (e.notes) pushUnique(q.avoidNotes, ...e.notes);
    if (e.accords) pushUnique(q.avoidAccords, ...e.accords);
    if (e.families) pushUnique(q.avoidFamilies, ...e.families);
    return;
  }
  if (e.notes) pushUnique(q.notes, ...e.notes);
  if (e.accords) pushUnique(q.accords, ...e.accords);
  if (e.families) pushUnique(q.families, ...e.families);
  if (e.seasons) pushUnique(q.seasons, ...e.seasons);
  if (e.occasions) pushUnique(q.occasions, ...e.occasions);
  if (e.gender) q.gender = e.gender;
}

/** Русские прозвища известных ароматов → id. */
export const PERFUME_ALIASES: Record<string, string> = {
  авентус: 'creed-aventus',
  'клаб де нюи': 'armaf-club-de-nuit-intense-man',
  'клаб де нуи': 'armaf-club-de-nuit-intense-man',
  cdnim: 'armaf-club-de-nuit-intense-man',
  саваж: 'dior-sauvage',
  соваж: 'dior-sauvage',
  'блю де шанель': 'chanel-bleu-de-chanel-edp',
  'блю шанель': 'chanel-bleu-de-chanel-edp',
  баккара: 'mfk-baccarat-rouge-540',
  'баккара руж': 'mfk-baccarat-rouge-540',
  br540: 'mfk-baccarat-rouge-540',
  'тобакко ваниль': 'tom-ford-tobacco-vanille',
  'табако ваниль': 'tom-ford-tobacco-vanille',
  'уд вуд': 'tom-ford-oud-wood',
  'терр дермес': 'hermes-terre-dhermes',
  'тер дермес': 'hermes-terre-dhermes',
  хальфети: 'penhaligons-halfeti',
  эндимион: 'penhaligons-endymion',
  хамра: 'lattafa-khamrah',
  хамрах: 'lattafa-khamrah',
  'энджелс шер': 'kilian-angels-share',
  'ангелс шер': 'kilian-angels-share',
  'лост черри': 'tom-ford-lost-cherry',
  'джаз клаб': 'margiela-jazz-club',
  'у камина': 'margiela-by-the-fireplace',
  'бай зе файрплейс': 'margiela-by-the-fireplace',
  'сантал 33': 'le-labo-santal-33',
  'сантал': 'le-labo-santal-33',
  'спайсбомб': 'viktor-rolf-spicebomb-extreme',
  'эрос': 'versace-eros',
  'инвиктус': 'paco-rabanne-invictus',
  'ван миллион': 'paco-rabanne-1-million',
  'лейтон': 'pdm-layton',
  'хачиват': 'nishane-hacivat',
  'хасиват': 'nishane-hacivat',
  'акваджо': 'armani-acqua-di-gio-profumo',
  'аква ди джо': 'armani-acqua-di-gio-profumo',
  'фаренгейт': 'dior-fahrenheit',
  'шалимар': 'guerlain-shalimar',
  'блэк опиум': 'ysl-black-opium',
  'ла ви ест бель': 'lancome-la-vie-est-belle',
  'жадор': 'dior-jadore',
  'коко мадмуазель': 'chanel-coco-mademoiselle',
  'делина': 'pdm-delina',
  'энкр нуар': 'lalique-encre-noire',
  'молекула': 'escentric-molecules-molecule-01',
};

/** Индекс для поиска упоминаний ароматов в тексте. */
export interface MentionIndex {
  /** нормализованная фраза → id (сортировано по убыванию длины). */
  phrases: { phrase: string; id: string }[];
}

export function buildMentionIndex(perfumes: Perfume[]): MentionIndex {
  const phrases: { phrase: string; id: string }[] = [];
  const nameCount = new Map<string, number>();
  for (const p of perfumes) {
    const n = normalizeText(p.name);
    nameCount.set(n, (nameCount.get(n) ?? 0) + 1);
  }
  const ids = new Set(perfumes.map((p) => p.id));
  for (const p of perfumes) {
    const name = normalizeText(p.name);
    const brand = normalizeText(p.brand);
    phrases.push({ phrase: `${brand} ${name}`, id: p.id });
    // само имя — только если оно достаточно длинное и уникальное
    if (name.length >= 5 && nameCount.get(name) === 1) phrases.push({ phrase: name, id: p.id });
    // короткая версия длинного имени: «Bleu de Chanel Eau de Parfum» → «bleu de chanel»
    const short = name.replace(/\s(eau de parfum|eau de toilette|edp|edt|parfum|intense man)$/, '');
    if (short !== name && short.length >= 5) phrases.push({ phrase: short, id: p.id });
  }
  for (const [alias, id] of Object.entries(PERFUME_ALIASES)) {
    if (ids.has(id)) phrases.push({ phrase: alias, id });
  }
  phrases.sort((a, b) => b.phrase.length - a.phrase.length);
  return { phrases };
}

function findMention(
  text: string,
  index: MentionIndex,
): { id: string; start: number; end: number } | null {
  const padded = ` ${text.replace(/[,.;!?]/g, ' ')} `;
  for (const { phrase, id } of index.phrases) {
    const at = padded.indexOf(` ${phrase} `);
    if (at >= 0) return { id, start: at, end: at + phrase.length };
  }
  return null;
}

/**
 * Разбор запроса на русском в набор признаков.
 * `perfumes` и `index` нужны для распознавания упоминаний конкретных ароматов.
 */
export function parseQuery(
  raw: string,
  perfumes: Perfume[] = [],
  index?: MentionIndex,
): ParsedQuery {
  const q = emptyQuery();
  const text = normalizeText(raw);
  if (!text) return q;

  // упоминание аромата — вырезаем его из текста, чтобы название не сработало как признаки
  let rest = text;
  if (perfumes.length) {
    const idx = index ?? buildMentionIndex(perfumes);
    const m = findMention(text, idx);
    if (m) {
      const p = perfumes.find((x) => x.id === m.id);
      if (p) {
        q.reference = { id: p.id, name: p.name, brand: p.brand };
        const padded = ` ${text.replace(/[,.;!?]/g, ' ')} `;
        rest = (padded.slice(0, m.start) + ' ' + padded.slice(m.end + 1)).trim();
      }
    }
  }

  q.cheaper = CHEAPER_RE.test(rest);
  q.softer = SOFTER_RE.test(rest);

  for (const clause of splitClauses(rest)) {
    NEGATOR_RE.lastIndex = 0;
    const neg = NEGATOR_RE.exec(clause);
    const negAt = neg ? neg.index : Infinity;
    for (const { key, re, effect } of COMPILED) {
      re.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = re.exec(clause))) {
        applyEffect(q, effect, m.index > negAt);
        if (!q.matched.includes(key)) q.matched.push(key);
      }
    }
  }

  // если что-то и желаемо, и запрещено — запрет сильнее
  q.notes = q.notes.filter((n) => !q.avoidNotes.includes(n));
  q.accords = q.accords.filter((a) => !q.avoidAccords.includes(a));
  q.families = q.families.filter((f) => !q.avoidFamilies.includes(f));
  return q;
}

/** Есть ли в запросе хоть один содержательный признак. */
export function hasSignal(q: ParsedQuery): boolean {
  return (
    q.reference !== null ||
    q.notes.length > 0 ||
    q.accords.length > 0 ||
    q.families.length > 0 ||
    q.avoidNotes.length > 0 ||
    q.avoidAccords.length > 0
  );
}

/** Есть ли хоть какой-то контекст (повод, сезон, пол) — для уточняющего вопроса. */
export function hasContext(q: ParsedQuery): boolean {
  return q.seasons.length > 0 || q.occasions.length > 0 || q.gender !== null;
}

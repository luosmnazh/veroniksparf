import type { Perfume } from '../types';
import { noteRu } from '../notes-ru';
import { findSimilar } from '../similarity';
import {
  buildMentionIndex,
  hasContext,
  hasSignal,
  parseQuery,
  type MentionIndex,
  type ParsedQuery,
} from './parse';

// ─── Общий интерфейс советника (его же реализует ИИ-версия) ───

export interface AdvisorRequest {
  message: string;
  /** Предыдущий запрос, к которому относится ответ на уточняющий вопрос. */
  context?: string;
}

export interface AdvisorPick {
  perfume: Perfume;
  reason: string;
  matchedNotes: string[];
}

export interface ClarifyOption {
  label: string;
  /** Текст, который уйдёт советнику при нажатии. */
  value: string;
}

export interface AdvisorReply {
  text: string;
  picks: AdvisorPick[];
  clarify?: { question: string; options: ClarifyOption[] };
  /** Какой движок ответил: 'rules' или 'llm'. */
  engine: 'rules' | 'llm';
}

export interface AdvisorCatalog {
  all(): Perfume[];
  index?(): Map<string, Set<string>>;
}

export interface AdvisorEngine {
  readonly kind: 'rules' | 'llm';
  reply(req: AdvisorRequest, catalog: AdvisorCatalog): Promise<AdvisorReply>;
}

/** Быстрые подсказки под полем ввода. */
export const QUICK_PROMPTS: ClarifyOption[] = [
  { label: 'На свидание', value: 'Что-нибудь соблазнительное на свидание вечером' },
  { label: 'В офис', value: 'Сдержанный свежий аромат для офиса' },
  { label: 'Зимний вечер', value: 'Тёплое, дымное, на зимний вечер, не слишком сладкое' },
  { label: 'Летний день', value: 'Свежее и лёгкое на жаркий летний день' },
  { label: 'Похожее на…', value: 'Что-то как Aventus' },
];

// ─── Детерминированный «случай» для разнообразия фраз ───

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function pick<T>(arr: T[], seed: string): T {
  return arr[hash(seed) % arr.length];
}

function listRu(items: string[]): string {
  if (items.length <= 1) return items.join('');
  return items.slice(0, -1).join(', ') + ' и ' + items[items.length - 1];
}

// ─── Скоринг ───

const SWEET_ACCORDS = ['сладкий', 'ванильный', 'гурманский', 'карамельный', 'шоколадный'];
const HEAVY_ACCORDS = ['амбровый', 'удовый', 'сладкий', 'гурманский', 'смолистый', 'табачный'];
const LIGHT_ACCORDS = ['свежий', 'цитрусовый', 'мускусный', 'водный', 'ароматический', 'зелёный'];

/** Бренды, которые обычно стоят заметно дешевле нишевой классики. */
export const AFFORDABLE_BRANDS = new Set(
  [
    'armaf',
    'lattafa',
    'zara',
    'afnan',
    'rasasi',
    'al haramain',
    'maison alhambra',
    'paco rabanne',
    'versace',
    'jean paul gaultier',
    'montale',
    'mancera',
    'escentric molecules',
    'dolce & gabbana',
    'prada',
    'giorgio armani',
    'yves saint laurent',
    'carolina herrera',
    'mugler',
    'lalique',
  ].map((b) => b.toLowerCase()),
);

function allNotes(p: Perfume): Set<string> {
  return new Set([...p.notesTop, ...p.notesHeart, ...p.notesBase]);
}

function accordWeight(p: Perfume, names: string[]): number {
  let s = 0;
  for (const a of p.accords) if (names.includes(a.name)) s += a.weight;
  return s;
}

interface Scored {
  perfume: Perfume;
  score: number;
  /** Сила совпадения по содержательным признакам (без рейтинга). */
  signal: number;
  matchedNotes: string[];
  matchedAccords: string[];
}

export function scorePerfume(p: Perfume, q: ParsedQuery): Scored {
  const notes = allNotes(p);
  const matchedNotes = q.notes.filter((n) => notes.has(n));
  const matchedAccords = q.accords.filter((a) => p.accords.some((x) => x.name === a));

  let signal = 0;
  signal += matchedNotes.length * 1.2;
  for (const a of p.accords) if (q.accords.includes(a.name)) signal += a.weight * 1.6;
  if (p.family && q.families.includes(p.family)) signal += 1;

  let score = signal;

  // запреты
  for (const n of q.avoidNotes) if (notes.has(n)) score -= 3;
  const avoidSweet = q.avoidAccords.filter((a) => SWEET_ACCORDS.includes(a));
  for (const a of p.accords) {
    if (q.avoidAccords.includes(a.name)) score -= a.weight * (avoidSweet.length ? 4 : 3);
  }
  if (p.family && q.avoidFamilies.includes(p.family)) score -= 2;

  // контекст
  for (const s of q.seasons) score += p.seasons.includes(s) ? 0.9 : -0.8;
  for (const o of q.occasions) score += p.occasions.includes(o) ? 0.8 : -0.5;
  if (q.gender) {
    if (q.gender !== 'unisex' && p.gender !== 'unisex' && p.gender !== q.gender) score -= 100;
    else if (p.gender === q.gender) score += 0.3;
  }

  // модификаторы
  if (q.softer) {
    score -= accordWeight(p, HEAVY_ACCORDS) * 0.8;
    score += accordWeight(p, LIGHT_ACCORDS) * 0.5;
  }
  if (q.cheaper && AFFORDABLE_BRANDS.has(p.brand.toLowerCase())) score += 1.5;

  // репутация: небольшой бонус, чтобы при равенстве побеждала классика
  if (p.rating) score += (p.rating - 3.8) * 0.8;
  if (p.votes) score += Math.min(Math.log10(p.votes), 5) * 0.05;

  return { perfume: p, score, signal, matchedNotes, matchedAccords };
}

// ─── Тексты персоны ───

const INTROS_BY_THEME: Record<string, string[]> = {
  дымный: [
    'Дым и тепло? Сэр, у меня для вас камин во флаконе.',
    'Дымный вечер — понимаю. Пройдёмте к дальней полке.',
    'Огонь, дерево и немного тайны. Вот что я держу для таких случаев.',
  ],
  сладкий: [
    'Сладкое? Хорошо, но без приторности — у нас приличный клуб.',
    'Десерт после ужина, во флаконе. Выбирайте с умом.',
  ],
  свежий: [
    'Свежесть — дело тонкое. Вот что не скиснет к обеду.',
    'Лёгкость, чистота и ни грамма суеты. Извольте.',
    'Открою окно. Вот что звучит, как утро без забот.',
  ],
  кожаный: [
    'Кожа — материал для взрослых. Вот лучшие экземпляры.',
    'Запах хорошего кресла и старых денег. Прошу.',
  ],
  цветочный: [
    'Цветы — но без сантиментов. Вот достойный букет.',
    'Цветочное, говорите? У меня есть кое-что получше открытки.',
  ],
  древесный: [
    'Дерево — честный материал. Вот что из него вышло лучшего.',
    'Древесные — основа хорошего гардероба. Взгляните.',
  ],
  амбровый: [
    'Тепло и густо — как плед у камина. Вот кандидаты.',
    'Амбра и уют. Сэр знает толк в зимних вечерах.',
  ],
  default: [
    'Посмотрим, что у нас на полках.',
    'Хороший запрос. Вот что я бы взял сам.',
    'Позвольте предложить небольшую подборку.',
    'Вот что я держу именно для таких случаев.',
  ],
};

const THEME_ORDER = ['кожаный', 'дымный', 'сладкий', 'свежий', 'цветочный', 'амбровый', 'древесный'];
const THEME_TRIGGERS: Record<string, string[]> = {
  дымный: ['дымный', 'ладанный', 'табачный'],
  кожаный: ['кожаный'],
  сладкий: ['сладкий', 'гурманский', 'ванильный'],
  свежий: ['свежий', 'цитрусовый', 'водный', 'морской', 'озоновый'],
  цветочный: ['цветочный', 'белоцветочный', 'розовый'],
  амбровый: ['амбровый', 'тёплый пряный'],
  древесный: ['древесный'],
};

function introFor(q: ParsedQuery, seed: string): string {
  for (const theme of THEME_ORDER) {
    if (q.accords.some((a) => THEME_TRIGGERS[theme].includes(a))) {
      return pick(INTROS_BY_THEME[theme], seed);
    }
  }
  return pick(INTROS_BY_THEME.default, seed);
}

const REASON_NOTES = [
  (n: string) => `В составе то, что вы заказывали: ${n}.`,
  (n: string) => `Нужные ноты на месте: ${n}.`,
  (n: string) => `Берите ради нот: ${n}.`,
  (n: string) => `Главный аргумент — ${n}, и он убедителен.`,
  (n: string) => `Совпадение по нотам: ${n}. Попадание точное.`,
];

const REASON_ACCORDS = [
  (a: string) => `Характер — ${a}, без фальши.`,
  (a: string) => `По характеру — ${a}; спорить не о чем.`,
  (a: string) => `Ведущая тема: ${a}. Ровно по заказу.`,
];

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function contextPhrase(p: Perfume, q: ParsedQuery, seed: string): string | null {
  const s = q.seasons.find((x) => p.seasons.includes(x));
  const o = q.occasions.find((x) => p.occasions.includes(x));
  if (s && o) return pick([`Для сезона «${s}» и повода «${o}» — в самый раз.`, `${cap(s)}, ${o} — его стихия.`], seed);
  if (s) return pick([`${cap(s)} — его сезон.`, `В сезон «${s}» раскрывается лучше всего.`], seed);
  if (o) return pick([`Повод «${o}» он не подведёт.`, `Уместен: ${o}.`], seed);
  return null;
}

function avoidPhrase(p: Perfume, q: ParsedQuery): string | null {
  const sweetAvoided = q.avoidAccords.some((a) => SWEET_ACCORDS.includes(a));
  if (sweetAvoided && accordWeight(p, SWEET_ACCORDS) < 0.5) return 'И без приторности — как просили.';
  if (q.avoidNotes.length) {
    const notes = allNotes(p);
    const clean = q.avoidNotes.filter((n) => !notes.has(n));
    if (clean.length === q.avoidNotes.length) return `Нежеланного (${q.avoidNotes.map(noteRu).slice(0, 2).join(', ')}) здесь нет — слово джентльмена.`;
  }
  return null;
}

export function buildReason(s: Scored, q: ParsedQuery, seed: string): string {
  const p = s.perfume;
  const parts: string[] = [];
  const notesRu = s.matchedNotes.slice(0, 3).map(noteRu);
  if (notesRu.length) parts.push(pick(REASON_NOTES, seed + p.id)(listRu(notesRu)));
  else if (s.matchedAccords.length) {
    parts.push(pick(REASON_ACCORDS, seed + p.id)(listRu(s.matchedAccords.slice(0, 2))));
  }
  const ctx = contextPhrase(p, q, seed + p.id);
  if (ctx) parts.push(ctx);
  const av = avoidPhrase(p, q);
  if (av) parts.push(av);
  if (q.cheaper && AFFORDABLE_BRANDS.has(p.brand.toLowerCase())) {
    parts.push('И кошелёк не пострадает.');
  }
  if (!parts.length) parts.push('Проверенная классика клуба.');
  return parts.join(' ');
}

// ─── Уточняющий вопрос ───

function clarifyFor(q: ParsedQuery, message: string): AdvisorReply['clarify'] {
  const hasSeason = q.seasons.length > 0;
  const hasOccasion = q.occasions.length > 0;
  if (!hasSeason && !hasOccasion) {
    return {
      question: 'На какой случай? Сезон и повод меняют всё.',
      options: [
        { label: 'Зимний вечер', value: 'тёплое на зимний вечер' },
        { label: 'Летний день', value: 'свежее на летний день' },
        { label: 'Офис', value: 'сдержанное для офиса' },
        { label: 'Свидание', value: 'соблазнительное на свидание' },
      ],
    };
  }
  return {
    question: 'А настроение? Сладкое, свежее или с дымком?',
    options: [
      { label: 'Сладкое', value: 'сладкое, уютное' },
      { label: 'Свежее', value: 'свежее, цитрусовое' },
      { label: 'Дымное', value: 'дымное, древесное' },
      { label: 'Цветочное', value: 'цветочное, нежное' },
    ],
  };
  void message;
}

// ─── Движок правил ───

export class RuleAdvisor implements AdvisorEngine {
  readonly kind = 'rules' as const;
  private mentionCache: { perfumes: Perfume[]; index: MentionIndex } | null = null;

  private mentionIndex(perfumes: Perfume[]): MentionIndex {
    if (!this.mentionCache || this.mentionCache.perfumes !== perfumes) {
      this.mentionCache = { perfumes, index: buildMentionIndex(perfumes) };
    }
    return this.mentionCache.index;
  }

  parse(req: AdvisorRequest, catalog: AdvisorCatalog): ParsedQuery {
    const perfumes = catalog.all();
    const text = req.context ? `${req.context}, ${req.message}` : req.message;
    return parseQuery(text, perfumes, this.mentionIndex(perfumes));
  }

  async reply(req: AdvisorRequest, catalog: AdvisorCatalog): Promise<AdvisorReply> {
    return this.replySync(req, catalog);
  }

  replySync(req: AdvisorRequest, catalog: AdvisorCatalog): AdvisorReply {
    const perfumes = catalog.all();
    const q = this.parse(req, catalog);
    const seed = normalizeSeed(req);

    if (!hasSignal(q)) {
      if (!hasContext(q)) {
        return {
          engine: 'rules',
          text: pick(
            [
              'Простите, не уловил. Опишите, чего хочется: сладкое, свежее, дымное? Или назовите аромат, который нравится.',
              'Боюсь, я не расслышал заказа. Подскажите настроение или любимый аромат — дальше моя забота.',
            ],
            seed,
          ),
          picks: [],
          clarify: {
            question: 'С чего начнём?',
            options: [
              { label: 'Сладкое', value: 'сладкое и уютное' },
              { label: 'Свежее', value: 'свежее и лёгкое' },
              { label: 'Дымное', value: 'дымное и древесное' },
              { label: 'Как Aventus', value: 'что-то как Aventus' },
            ],
          },
        };
      }
      // есть контекст, но нет настроения — спросим настроение, а пока покажем лучшее
      const clarify = clarifyFor(q, req.message);
      const scored = perfumes.map((p) => scorePerfume(p, q)).sort((a, b) => b.score - a.score);
      return {
        engine: 'rules',
        text: 'Понял повод. Вот что подходит наверняка — а если уточните настроение, подберу точнее.',
        picks: scored.slice(0, 3).map((s) => ({
          perfume: s.perfume,
          reason: buildReason(s, q, seed),
          matchedNotes: s.matchedNotes,
        })),
        clarify,
      };
    }

    // «как X» — похожие на референс с учётом остальных пожеланий
    if (q.reference) {
      const target = perfumes.find((p) => p.id === q.reference!.id)!;
      const similar = findSimilar(target, perfumes, {
        limit: 40,
        noteIndex: catalog.index?.(),
      });
      const ranked = similar
        .map((r) => {
          const s = scorePerfume(r.perfume, q);
          // похожесть — главный критерий, остальное корректирует
          const rating = r.perfume.rating ? (r.perfume.rating - 3.8) * 0.8 : 0;
          const extras = s.score - s.signal - rating;
          return { r, s, total: r.matchPercent / 10 + extras + s.signal * 0.5 };
        })
        .filter((x) => x.total > -50)
        .sort((a, b) => b.total - a.total)
        .slice(0, 5);

      const mods: string[] = [];
      if (q.cheaper) mods.push('цен в архиве я не держу, но доступные дома отметил');
      if (q.softer) mods.push('выбрал те, что потише');
      const head = pick(
        [
          `${q.reference.name}? Достойный вкус. Вот кто ходит с ним в одном клубе`,
          `Похожее на ${q.reference.name} — извольте`,
          `${q.reference.name} знаю лично. Вот его ближайшая родня`,
        ],
        seed,
      );
      return {
        engine: 'rules',
        text: `${head}${mods.length ? ` (${mods.join('; ')})` : ''}.`,
        picks: ranked.map(({ r, s }) => {
          const common = r.commonNotes.slice(0, 3).map(noteRu);
          const base = common.length
            ? `Совпадение ${r.matchPercent}%: общие ${listRu(common)}.`
            : `Совпадение ${r.matchPercent}% по характеру.`;
          const extra = buildReason(s, { ...q, notes: [], accords: [] }, seed);
          return {
            perfume: r.perfume,
            reason: extra === 'Проверенная классика клуба.' ? base : `${base} ${extra}`,
            matchedNotes: r.commonNotes,
          };
        }),
      };
    }

    const scored = perfumes
      .map((p) => scorePerfume(p, q))
      .filter((s) => s.signal > 0 && s.score > 0)
      .sort((a, b) => b.score - a.score);

    if (scored.length === 0) {
      return {
        engine: 'rules',
        text: 'Признаюсь, в архиве нет ничего, что прошло бы все ваши условия. Ослабьте одно — и я найду.',
        picks: [],
        clarify: clarifyFor(q, req.message),
      };
    }

    // разнообразие: не больше двух ароматов одного бренда
    const picks: Scored[] = [];
    const brands = new Map<string, number>();
    for (const s of scored) {
      const c = brands.get(s.perfume.brand) ?? 0;
      if (c >= 2) continue;
      brands.set(s.perfume.brand, c + 1);
      picks.push(s);
      if (picks.length >= 5) break;
    }
    // если лидеры сильно оторвались — показываем 3–4, а не 5
    const top = picks[0].score;
    const trimmed = picks.filter((s, i) => i < 3 || s.score >= top * 0.55);

    return {
      engine: 'rules',
      text: introFor(q, seed),
      picks: trimmed.map((s) => ({
        perfume: s.perfume,
        reason: buildReason(s, q, seed),
        matchedNotes: s.matchedNotes,
      })),
    };
  }
}

function normalizeSeed(req: AdvisorRequest): string {
  return `${req.context ?? ''}|${req.message}`.toLowerCase();
}

import { NOTES_RU, RU_TO_EN } from './notes-ru';

/**
 * Синонимы и варианты написания нот → каноническое имя.
 * Применяется после приведения к нижнему регистру и обрезки пробелов.
 */
export const NOTE_SYNONYMS: Record<string, string> = {
  // уд
  agarwood: 'oud',
  'oud wood': 'oud',
  'agarwood (oud)': 'oud',
  aoud: 'oud',
  // ладан
  olibanum: 'incense',
  frankincense: 'incense',
  // кедр
  cedarwood: 'cedar',
  'virginia cedar': 'cedar',
  'atlas cedar': 'cedar',
  'virginian cedar': 'cedar',
  'texas cedar': 'cedar',
  // сандал
  'australian sandalwood': 'sandalwood',
  'indian sandalwood': 'sandalwood',
  // ветивер
  'haitian vetiver': 'vetiver',
  'bourbon vetiver': 'vetiver',
  'java vetiver': 'vetiver',
  // ваниль
  'bourbon vanilla': 'vanilla',
  'tahitian vanilla': 'vanilla',
  'madagascar vanilla': 'vanilla',
  'vanilla absolute': 'vanilla',
  'vanille': 'vanilla',
  // тонка
  tonka: 'tonka bean',
  'roasted tonka bean': 'tonka bean',
  'tonka beans': 'tonka bean',
  // мускус
  'white musk': 'musk',
  musks: 'musk',
  // мох
  'oak moss': 'oakmoss',
  'tree moss': 'moss',
  // амбра
  'grey amber': 'ambergris',
  ambroxide: 'ambroxan',
  'ambrette (musk mallow)': 'ambrette',
  'musk mallow': 'ambrette',
  // цитрусы
  'calabrian bergamot': 'bergamot',
  'italian bergamot': 'bergamot',
  'sicilian lemon': 'lemon',
  'amalfi lemon': 'lemon',
  'italian lemon': 'lemon',
  'sweet orange': 'orange',
  'orange bigarade': 'bitter orange',
  bigarade: 'bitter orange',
  'mandarin orange': 'mandarin',
  clementine: 'mandarin',
  'lemon verbena': 'verbena',
  // перцы
  'black pepper': 'pepper',
  'white pepper': 'pepper',
  'sichuan pepper': 'pepper',
  'chinese pepper': 'pepper',
  peppercorn: 'pepper',
  'pink peppercorn': 'pink pepper',
  'red pepper': 'pink pepper',
  // жасмин/роза и цветы
  'moroccan jasmine': 'jasmine',
  'egyptian jasmine': 'jasmine',
  'indian jasmine': 'jasmine',
  'night blooming jasmine': 'jasmine',
  'turkish rose': 'rose',
  'damask rose': 'rose',
  'bulgarian rose': 'rose',
  'grasse rose': 'rose',
  'may rose': 'rose',
  'taif rose': 'rose',
  'rose petals': 'rose',
  'african orange flower': 'orange blossom',
  'orange flower': 'orange blossom',
  neroli_flower: 'neroli',
  'lily-of-the-valley': 'lily of the valley',
  muguet: 'lily of the valley',
  'ylang ylang': 'ylang-ylang',
  ylang: 'ylang-ylang',
  'iris root': 'iris',
  'orris root': 'iris',
  orris: 'iris',
  'violet leaves': 'violet leaf',
  'fig leaves': 'fig leaf',
  // полынь
  wormwood: 'artemisia',
  // гвоздика
  'clove buds': 'clove',
  cloves: 'clove',
  carnation_flower: 'carnation',
  // можжевельник
  'juniper berries': 'juniper',
  'juniper berry': 'juniper',
  // смородина
  'blackcurrant': 'black currant',
  'cassis': 'black currant',
  'black currant leaf': 'black currant',
  'currant': 'black currant',
  // яблоко/прочие фрукты
  'red apple': 'apple',
  'granny smith apple': 'green apple',
  lychee: 'litchi',
  'coco': 'coconut',
  'coconut milk': 'coconut',
  'dried fruit': 'dried fruits',
  'dry fruits': 'dried fruits',
  dates: 'date',
  // морские
  'marine notes': 'sea notes',
  'water notes': 'sea notes',
  'aquatic notes': 'sea notes',
  'sea breeze': 'sea notes',
  'ocean notes': 'sea notes',
  seawater: 'sea water',
  'ozonic notes': 'ozone',
  // дым и табак
  'smoky notes': 'smoke',
  'birch tar': 'birch',
  'tobacco leaves': 'tobacco leaf',
  'tobacco leaf absolute': 'tobacco leaf',
  // кофе/какао
  'coffee beans': 'coffee',
  'roasted coffee': 'coffee',
  cocoa: 'cacao',
  'cocoa butter': 'cacao',
  'dark chocolate': 'chocolate',
  // карамель и сладкое
  'salted caramel': 'caramel',
  caramelized_sugar: 'caramel',
  'burnt sugar': 'caramel',
  'candy floss': 'cotton candy',
  'almond milk': 'almond',
  'sweet almond': 'almond',
  // напитки
  'whiskey': 'whisky',
  'bourbon whiskey': 'whisky',
  'rhum': 'rum',
  'dark rum': 'rum',
  // травы
  'green tea leaves': 'green tea',
  'mate absolute': 'mate',
  'wild mint': 'mint',
  peppermint: 'mint',
  spearmint: 'mint',
  'french lavender': 'lavender',
  lavandin: 'lavender',
  'wild lavender': 'lavender',
  // пудра и чистота
  'powdery notes': 'powdery notes',
  // гальбанум/зелень
  'green leaves': 'green notes',
  greens: 'green notes',
  'leafy green notes': 'green notes',
  // кожа
  'leather notes': 'leather',
  'suede notes': 'suede',
  // прочее
  'guaiacwood': 'guaiac wood',
  'guaiac': 'guaiac wood',
  'palo santo': 'guaiac wood',
  'brazilian rosewood': 'rosewood',
  'fir balsam': 'fir resin',
  'pine tree': 'pine',
  'pine needle': 'pine needles',
  'siberian pine': 'pine',
  heliotropin: 'heliotrope',
  'iso e super': 'iso e super',
  'sweet notes': 'sugar',
  'sea salt accord': 'sea salt',
  'tangerine': 'mandarin',
  'osmanthus absolute': 'osmanthus',
  'immortelle (helichrysum)': 'immortelle',
  helichrysum: 'immortelle',
  'everlasting flower': 'immortelle',
  'opoponax (sweet myrrh)': 'opoponax',
  'sweet myrrh': 'opoponax',
  'styrax (benzoin)': 'styrax',
  'peru balsam oil': 'peru balsam',
  'amber wood': 'amberwood',
  'cashmere woods': 'cashmeran',
  'cashmere wood': 'cashmeran',
  'musk ambrette': 'ambrette',
  'ambrette seeds': 'ambrette',
  'ambrette seed': 'ambrette',
  // варианты и опечатки из датасета Fragrantica
  woodsy: 'woody notes',
  'woodsy notes': 'woody notes',
  'precious woods': 'woody notes',
  'exotic woods': 'woody notes',
  spices: 'spicy notes',
  passionfruit: 'passion fruit',
  'palisander rosewood': 'rosewood',
  watery: 'sea notes',
  'pink grapefruit': 'grapefruit',
  sandalowood: 'sandalwood',
  myrhh: 'myrrh',
  'french labdanum': 'labdanum',
  'balsam fir': 'fir resin',
  sweet: 'sugar',
  'red fruits': 'red berries',
  vetyver: 'vetiver',
  'teak wood': 'teak',
  vanila: 'vanilla',
  'sicilian bergamot': 'bergamot',
  'indonesian patchouli leaf': 'patchouli',
  'patchouli leaf': 'patchouli',
  'white peach': 'peach',
  'elemi resin': 'elemi',
  fruits: 'fruity notes',
  'white rose': 'rose',
  'white cedar extract': 'cedar',
  'vanilla orchid': 'vanilla',
  hiacynth: 'hyacinth',
  'italian mandarin': 'mandarin',
  'cacao pod': 'cacao',
  flowers: 'floral notes',
  'big strawberry': 'strawberry',
  pelargonium: 'geranium',
  'jasmine tea': 'tea',
  'madagascar vanilla absolute': 'vanilla',
  'vanilla bean': 'vanilla',
  'virginia cedarwood': 'cedar',
  'oak moss absolute': 'oakmoss',
  'siam benzoin': 'benzoin',
  'laotian benzoin': 'benzoin',
  'blonde woods': 'white woods',
  'blond woods': 'white woods',
  'light woods': 'white woods',
  'sea water': 'sea notes',
  'mandarin leaf': 'petitgrain',
  'orange leaf': 'petitgrain',
  'lemon leaf': 'petitgrain',
  'rose de mai': 'rose',
  'white wood': 'white woods',
  resin: 'resins',
  'lime (linden) blossom': 'linden blossom',
  grapes: 'grape',
  'iris flower': 'iris',
  'rose water': 'rose',
  civetta: 'civet',
  rhuburb: 'rhubarb',
  'coconut nectar': 'coconut',
  'carambola (star fruit)': 'carambola',
  'mastic or lentisque': 'mastic',
  'wild berries': 'red berries',
};

/**
 * Нормализация имени ноты: нижний регистр, обрезка пробелов и мусора,
 * синонимы, перевод русского ввода в канон.
 */
export function normalizeNote(raw: string): string {
  let s = raw
    .toLowerCase()
    .replace(/ /g, ' ')
    .replace(/[“”"«»]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!s) return '';
  // «нота X» / «X note(s)» по краям
  s = s.replace(/^note of /, '').replace(/ notes?$/, (m) => (keepNotesSuffix.has(s) ? m : ''));
  s = s.trim();
  if (RU_TO_EN[s]) s = RU_TO_EN[s];
  if (NOTE_SYNONYMS[s]) s = NOTE_SYNONYMS[s];
  if (!NOTES_RU[s]) s = stripQualifiers(s);
  return s;
}

/** Происхождение и форма сырья, которые не меняют сути ноты. */
const ORIGIN_RE =
  /^(indian|cambodian|laotian|thai|malaysian|vietnamese|moroccan|tunisian|egyptian|turkish|bulgarian|damask|sicilian|calabrian|italian|guatemalan|brazilian|madagascar|madagascan|bourbon|haitian|javanese|indonesian|mysore|australian|virginian|virginia|atlas|texas|french|spanish|tahitian|mexican|chinese|japanese|sri lankan|ceylon|persian|siberian|canadian|african|arabian|omani|somalian|grasse|may|wild|fresh|black|white|red|pink|green|crystal|dark|sweet|bitter|smoky|golden)\s+(.+)$/;
const FORM_RE = /^(.+?)\s+(absolute|oil|essential oil|extract|essence|accord|resinoid|co2|tincture|husk|pod|flower|blossom water|leaves|leaf absolute)$/;
const TINCTURE_RE = /^tincture of (.+)$/;

function stripQualifiers(s: string): string {
  const resolve = (x: string): string | null => {
    const y = NOTE_SYNONYMS[x] ?? x;
    return NOTES_RU[y] ? y : null;
  };
  let m = s.match(TINCTURE_RE);
  if (m && resolve(m[1])) return resolve(m[1])!;
  m = s.match(FORM_RE);
  if (m && resolve(m[1])) return resolve(m[1])!;
  m = s.match(ORIGIN_RE);
  if (m) {
    const rest = resolve(m[2]) ?? stripQualifiers(m[2]);
    if (NOTES_RU[rest]) return rest;
  }
  return s;
}

/** Ноты, у которых слово notes — часть имени, его нельзя отрезать. */
const keepNotesSuffix = new Set([
  'green notes',
  'sea notes',
  'marine notes',
  'water notes',
  'woody notes',
  'floral notes',
  'fruity notes',
  'spicy notes',
  'powdery notes',
  'earthy notes',
  'mineral notes',
  'animal notes',
  'rain notes',
  'ozonic notes',
  'smoky notes',
  'aromatic notes',
  'herbal notes',
  'balsamic notes',
  'metallic notes',
  'fresh notes',
  'solar notes',
  'nutty notes',
  'sour notes',
  'aquatic notes',
  'leather notes',
  'ocean notes',
]);

export function normalizeNotes(list: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of list) {
    const n = normalizeNote(raw);
    if (n && !seen.has(n)) {
      seen.add(n);
      out.push(n);
    }
  }
  return out;
}

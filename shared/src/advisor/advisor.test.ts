import { describe, expect, it } from 'vitest';
import { SEED_PERFUMES } from '../seed/perfumes';
import { LEXICON } from './lexicon';
import { normalizeText, parseQuery } from './parse';
import { RuleAdvisor } from './engine';

const catalog = { all: () => SEED_PERFUMES };
const advisor = new RuleAdvisor();
const parse = (s: string) => parseQuery(s, SEED_PERFUMES);

describe('лексикон', () => {
  it('содержит не меньше 150 выражений', () => {
    const count = Object.keys(LEXICON).reduce((n, k) => n + k.split('|').length, 0);
    expect(count).toBeGreaterThanOrEqual(150);
  });
});

describe('normalizeText', () => {
  it('ё → е, нижний регистр, пунктуация', () => {
    expect(normalizeText('Тёплое, «ДЫМНОЕ»!')).toBe('теплое, дымное !');
  });
});

describe('parseQuery', () => {
  it('сладкий → ваниль и гурманские аккорды', () => {
    const q = parse('хочу что-то сладкое');
    expect(q.accords).toContain('сладкий');
    expect(q.accords).toContain('ванильный');
  });

  it('свежий → цитрусы', () => {
    expect(parse('свежий аромат').accords).toContain('цитрусовый');
  });

  it('дымный → ладан, берёза', () => {
    const q = parse('дымный');
    expect(q.notes).toEqual(expect.arrayContaining(['incense', 'birch']));
  });

  it('«как после дождя» → озон', () => {
    expect(parse('пахнет как после дождя').notes).toContain('ozone');
  });

  it('отрицание «не слишком сладкое»', () => {
    const q = parse('тёплое, дымное, на зимний вечер, не слишком сладкое');
    expect(q.avoidAccords).toContain('сладкий');
    expect(q.accords).not.toContain('сладкий');
    expect(q.accords).toContain('дымный');
    expect(q.seasons).toContain('зима');
    expect(q.occasions).toContain('вечер');
  });

  it('отрицание «без уда» действует только в своей фразе', () => {
    const q = parse('древесное без уда, на осень');
    expect(q.avoidNotes).toContain('oud');
    expect(q.accords).toContain('древесный');
    expect(q.seasons).toContain('осень');
  });

  it('«ром» не срабатывает внутри «романтичный»', () => {
    const q = parse('романтичный');
    expect(q.notes).not.toContain('rum');
    expect(q.occasions).toContain('свидание');
  });

  it('пол', () => {
    expect(parse('подарок мужу').gender).toBe('male');
    expect(parse('для девушки').gender).toBe('female');
  });

  it('упоминание аромата латиницей и по-русски', () => {
    expect(parse('что-то как Aventus').reference?.id).toBe('creed-aventus');
    expect(parse('хочу как авентус, но дешевле').reference?.id).toBe('creed-aventus');
    expect(parse('хочу как авентус, но дешевле').cheaper).toBe(true);
    expect(parse('похожее на Baccarat Rouge 540, но мягче').softer).toBe(true);
  });

  it('название аромата не превращается в признаки', () => {
    // «Tobacco Vanille» не должен добавлять ваниль как пожелание
    const q = parse('как Tobacco Vanille');
    expect(q.reference?.id).toBe('tom-ford-tobacco-vanille');
    expect(q.notes).not.toContain('vanilla');
  });
});

describe('RuleAdvisor', () => {
  it('тёплое дымное на зимний вечер, не слишком сладкое — без гурманских бомб', async () => {
    const r = await advisor.reply(
      { message: 'тёплое, дымное, на зимний вечер, не слишком сладкое' },
      catalog,
    );
    expect(r.picks.length).toBeGreaterThanOrEqual(3);
    expect(r.picks.length).toBeLessThanOrEqual(5);
    const ids = r.picks.map((p) => p.perfume.id);
    for (const bomb of ['kilian-angels-share', 'lattafa-khamrah', 'mugler-angel', 'tom-ford-lost-cherry']) {
      expect(ids).not.toContain(bomb);
    }
    // у каждого выбранного есть зимний сезон и обоснование через ноты или характер
    for (const p of r.picks) {
      expect(p.perfume.seasons).toContain('зима');
      expect(p.reason.length).toBeGreaterThan(10);
    }
    // хотя бы у одного обоснование называет совпавшие ноты
    expect(r.picks.some((p) => p.matchedNotes.length > 0)).toBe(true);
  });

  it('«что-то как Aventus» — похожие на Aventus, CDNIM в топе', async () => {
    const r = await advisor.reply({ message: 'что-то как Aventus' }, catalog);
    const ids = r.picks.map((p) => p.perfume.id);
    expect(ids).not.toContain('creed-aventus');
    expect(ids.slice(0, 3)).toContain('armaf-club-de-nuit-intense-man');
    expect(r.text).toMatch(/Aventus/);
  });

  it('непонятный запрос → уточняющий вопрос с вариантами', async () => {
    const r = await advisor.reply({ message: 'ну привет' }, catalog);
    expect(r.picks).toHaveLength(0);
    expect(r.clarify?.options.length).toBeGreaterThanOrEqual(3);
  });

  it('ответ на уточнение использует контекст', async () => {
    const r = await advisor.reply({ message: 'свежее, цитрусовое', context: 'на летний день' }, catalog);
    expect(r.picks.length).toBeGreaterThan(0);
    for (const p of r.picks) expect(p.perfume.seasons).toContain('лето');
  });

  it('пол уважается', async () => {
    const r = await advisor.reply({ message: 'сладкий подарок жене на свидание' }, catalog);
    for (const p of r.picks) expect(p.perfume.gender).not.toBe('male');
  });

  it('свежее для офиса — без тяжёлых ароматов', async () => {
    const r = await advisor.reply({ message: 'свежий сдержанный для офиса' }, catalog);
    expect(r.picks.length).toBeGreaterThan(0);
    for (const p of r.picks) expect(p.perfume.occasions).toContain('офис');
  });
});

import { describe, expect, it } from 'vitest';
import {
  buildMapping,
  dedupeRows,
  detectDelimiter,
  hasNotesColumns,
  mapRow,
  matchKey,
  parseAccords,
  parseGender,
  parseNumber,
  parseYear,
  slugify,
  splitList,
} from './import-lib';

describe('detectDelimiter', () => {
  it('запятая', () => expect(detectDelimiter('a,b,c')).toBe(','));
  it('точка с запятой', () => expect(detectDelimiter('a;b;c')).toBe(';'));
  it('табуляция', () => expect(detectDelimiter('a\tb\tc')).toBe('\t'));
  it('по умолчанию запятая', () => expect(detectDelimiter('abc')).toBe(','));
});

describe('parseGender', () => {
  it('варианты male', () => {
    expect(parseGender('male')).toBe('male');
    expect(parseGender('for men')).toBe('male');
  });
  it('варианты female', () => {
    expect(parseGender('WOMEN')).toBe('female');
  });
  it('неизвестное → unisex', () => {
    expect(parseGender('')).toBe('unisex');
    expect(parseGender('for women and men')).toBe('unisex');
  });
});

describe('splitList', () => {
  it('запятые', () => expect(splitList('a, b , c')).toEqual(['a', 'b', 'c']));
  it('точки с запятой', () => expect(splitList('a; b')).toEqual(['a', 'b']));
  it('json-массив', () => expect(splitList("['Rose', 'Oud']")).toEqual(['Rose', 'Oud']));
  it('пустые значения', () => {
    expect(splitList('')).toEqual([]);
    expect(splitList('nan')).toEqual([]);
    expect(splitList(null)).toEqual([]);
  });
});

describe('parseNumber / parseYear', () => {
  it('запятая как десятичный разделитель', () => expect(parseNumber('4,35')).toBe(4.35));
  it('мусор → null', () => expect(parseNumber('abc')).toBeNull());
  it('год в диапазоне', () => expect(parseYear('2015.0')).toBe(2015));
  it('год вне диапазона → null', () => expect(parseYear('15')).toBeNull());
});

describe('slugify / matchKey', () => {
  it('диакритика и пунктуация', () => {
    expect(slugify('Hermès', "Terre d'Hermès")).toBe('hermes-terre-d-hermes');
  });
  it('matchKey совпадает при разном написании', () => {
    expect(matchKey('Hermès', "Terre d'Hermès")).toBe(matchKey('Hermes', 'Terre d Hermes'));
    expect(matchKey('Giorgio Armani', 'Acqua di Giò Profumo')).toBe(
      matchKey('Giorgio Armani', 'Acqua di Gio Profumo'),
    );
  });
});

describe('parseAccords', () => {
  it('перевод и убывающие веса', () => {
    const a = parseAccords('woody, sweet, citrus');
    expect(a[0]).toEqual({ name: 'древесный', weight: 0.9 });
    expect(a[1].name).toBe('сладкий');
    expect(a[1].weight).toBeLessThan(a[0].weight);
  });
  it('явные веса', () => {
    const a = parseAccords('woody: 0.8, sweet: 55');
    expect(a[0]).toEqual({ name: 'древесный', weight: 0.8 });
    expect(a[1]).toEqual({ name: 'сладкий', weight: 0.55 });
  });
});

describe('buildMapping / mapRow', () => {
  const headers = ['brand', 'name', 'year', 'gender', 'image_url', 'perfume_url', 'scraped_at'];
  it('маппинг файла без нот', () => {
    const m = buildMapping(headers);
    expect(m.name).toBe('name');
    expect(m.brand).toBe('brand');
    expect(m.url).toBe('perfume_url');
    expect(hasNotesColumns(m)).toBe(false);
  });

  it('маппинг файла с нотами', () => {
    const m = buildMapping(['Brand', 'Perfume', 'Top Notes', 'Middle Notes', 'Base Notes', 'Rating Value']);
    expect(hasNotesColumns(m)).toBe(true);
  });

  it('mapRow собирает модель', () => {
    const m = buildMapping(['brand', 'name', 'year', 'gender', 'top', 'middle', 'base', 'accords', 'rating']);
    const row = {
      brand: 'Creed',
      name: 'Aventus',
      year: '2010',
      gender: 'male',
      top: 'Pineapple, Bergamot',
      middle: 'Birch, Patchouli',
      base: 'Oak Moss, Musk',
      accords: 'fruity, smoky',
      rating: '4,35',
    };
    const res = mapRow(row, m)!;
    expect(res.perfume.id).toBe('creed-aventus');
    expect(res.perfume.notesTop).toEqual(['pineapple', 'bergamot']);
    expect(res.perfume.notesBase).toEqual(['oakmoss', 'musk']);
    expect(res.perfume.accords[0].name).toBe('фруктовый');
    expect(res.perfume.rating).toBe(4.35);
    expect(res.hasNotes).toBe(true);
    expect(res.perfume.seasons.length).toBeGreaterThan(0);
  });

  it('mapRow без названия → null', () => {
    const m = buildMapping(['brand', 'name']);
    expect(mapRow({ brand: 'X', name: '' }, m)).toBeNull();
  });
});

describe('dedupeRows', () => {
  it('остаётся запись с нотами', () => {
    const m = buildMapping(['brand', 'name', 'top']);
    const a = mapRow({ brand: 'Creed', name: 'Aventus', top: '' }, m)!;
    const b = mapRow({ brand: 'Creed', name: 'Aventus', top: 'Pineapple' }, m)!;
    const out = dedupeRows([a, b]);
    expect(out).toHaveLength(1);
    expect(out[0].hasNotes).toBe(true);
  });
});

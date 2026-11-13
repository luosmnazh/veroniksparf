import { describe, expect, it } from 'vitest';
import { normalizeNote, normalizeNotes } from './normalize';
import { noteRu } from './notes-ru';

describe('normalizeNote', () => {
  it('приводит к нижнему регистру и обрезает пробелы', () => {
    expect(normalizeNote('  Bergamot ')).toBe('bergamot');
    expect(normalizeNote('PINEAPPLE')).toBe('pineapple');
  });

  it('применяет синонимы', () => {
    expect(normalizeNote('Agarwood (Oud)')).toBe('oud');
    expect(normalizeNote('agarwood')).toBe('oud');
    expect(normalizeNote('Olibanum')).toBe('incense');
    expect(normalizeNote('Virginia Cedar')).toBe('cedar');
    expect(normalizeNote('Oak Moss')).toBe('oakmoss');
    expect(normalizeNote('Lily-of-the-Valley')).toBe('lily of the valley');
    expect(normalizeNote('Black Pepper')).toBe('pepper');
    expect(normalizeNote('Calabrian bergamot')).toBe('bergamot');
    expect(normalizeNote('Tonka')).toBe('tonka bean');
  });

  it('не отрезает слово notes у составных имён', () => {
    expect(normalizeNote('Green Notes')).toBe('green notes');
    expect(normalizeNote('Sea Notes')).toBe('sea notes');
  });

  it('понимает русский ввод', () => {
    expect(normalizeNote('Ваниль')).toBe('vanilla');
    expect(normalizeNote('берёза')).toBe('birch');
    expect(normalizeNote('уд')).toBe('oud');
  });

  it('убирает дубликаты после нормализации', () => {
    expect(normalizeNotes(['Oud', 'Agarwood', 'agarwood (oud)'])).toEqual(['oud']);
  });
});

describe('noteRu', () => {
  it('переводит известные ноты', () => {
    expect(noteRu('pineapple')).toBe('ананас');
    expect(noteRu('birch')).toBe('берёза');
    expect(noteRu('tonka bean')).toBe('бобы тонка');
  });

  it('оставляет неизвестные в оригинале', () => {
    expect(noteRu('mystery substance')).toBe('mystery substance');
  });
});

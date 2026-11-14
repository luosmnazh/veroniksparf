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

describe('нормализация нот из датасета', () => {
  it('сводит происхождение и форму сырья к базовой ноте', () => {
    expect(normalizeNote('Indian Oud')).toBe('oud');
    expect(normalizeNote('Moroccan Rose')).toBe('rose');
    expect(normalizeNote('Sicilian Mandarin')).toBe('mandarin');
    expect(normalizeNote('vanilla absolute')).toBe('vanilla');
    expect(normalizeNote('tincture of rose')).toBe('rose');
    expect(normalizeNote('Black Vanilla Husk')).toBe('vanilla');
  });
  it('исправляет опечатки датасета', () => {
    expect(normalizeNote('sandalowood')).toBe('sandalwood');
    expect(normalizeNote('vanila')).toBe('vanilla');
    expect(normalizeNote('Agarwood (Oud)')).toBe('oud');
  });
  it('не портит составные ноты, у которых есть свой перевод', () => {
    expect(normalizeNote('orange blossom')).toBe('orange blossom');
    expect(normalizeNote('pink pepper')).toBe('pink pepper');
    expect(normalizeNote('green tea')).toBe('green tea');
    expect(normalizeNote('black currant')).toBe('black currant');
  });
});

export type Tier = 'top' | 'heart' | 'base';
export type Gender = 'male' | 'female' | 'unisex';

export type Season = 'зима' | 'весна' | 'лето' | 'осень';
export type Occasion = 'день' | 'вечер' | 'офис' | 'свидание';

/** Аккорд с весом 0..1 (насколько он выражен в аромате). */
export interface Accord {
  name: string;
  weight: number;
}

export interface Perfume {
  id: string;
  name: string;
  brand: string;
  year: number | null;
  gender: Gender;
  family: string;
  accords: Accord[];
  /** Канонические английские имена нот (нижний регистр). Перевод — через notes-ru. */
  notesTop: string[];
  notesHeart: string[];
  notesBase: string[];
  seasons: Season[];
  occasions: Occasion[];
  rating: number | null;
  votes: number | null;
  description: string | null;
  fragranticaUrl: string | null;
}

export interface SimilarResult {
  perfume: Perfume;
  /** 0..100 */
  matchPercent: number;
  /** Общие ноты (канонические английские имена). */
  commonNotes: string[];
}

export const SEASONS: Season[] = ['зима', 'весна', 'лето', 'осень'];
export const OCCASIONS: Occasion[] = ['день', 'вечер', 'офис', 'свидание'];

export const GENDER_RU: Record<Gender, string> = {
  male: 'мужской',
  female: 'женский',
  unisex: 'унисекс',
};

/** Ссылка на поиск Fragrantica по названию — когда точного URL нет. */
export function fragranticaSearchUrl(brand: string, name: string): string {
  return `https://www.fragrantica.com/search/?query=${encodeURIComponent(`${brand} ${name}`)}`;
}

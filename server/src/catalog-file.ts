import fs from 'node:fs';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import type { Perfume } from '@veroniks/shared';

/** Версия формата data/catalog.json.gz. */
export const CATALOG_FORMAT = 1;

/** Реальные данные датасета для встроенного аромата. */
export interface SeedOverride {
  rating: number | null;
  votes: number | null;
  fragranticaUrl: string | null;
  year: number | null;
  imageUrl: string | null;
}

export interface CatalogFile {
  format: number;
  source: string;
  generatedAt: string;
  overrides: Record<string, SeedOverride>;
  perfumes: Perfume[];
}

export interface LoadedCatalog {
  data: CatalogFile;
  /** Отпечаток файла: при изменении каталога база пересобирается. */
  fingerprint: string;
}

export function loadCatalogFile(file: string): LoadedCatalog | null {
  if (!fs.existsSync(file)) return null;
  const gz = fs.readFileSync(file);
  const data = JSON.parse(zlib.gunzipSync(gz).toString('utf-8')) as CatalogFile;
  if (data.format !== CATALOG_FORMAT) return null;
  const fingerprint = crypto.createHash('sha1').update(gz).digest('hex').slice(0, 16);
  return { data, fingerprint };
}

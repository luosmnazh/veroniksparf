/**
 * Сборка большого каталога из датасета в data/raw → data/catalog.json.gz.
 *
 * Запуск: npm run build-catalog [-- --min-votes 10]
 *
 * Файл каталога хранится в репозитории и загружается сервером при старте,
 * поэтому каталог доступен и на хостинге без постоянного диска.
 * Встроенные ароматы (seed) остаются как есть — у них выверенные пирамиды
 * и аккорды; из датасета им достаются реальные рейтинг, голоса и ссылка.
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { NOTES_RU, SEED_PERFUMES, type Perfume } from '@veroniks/shared';
import { readRows } from './read-table';
import {
  buildMapping,
  dedupeRows,
  hasNotesColumns,
  mapRow,
  matchKey,
  type MappedRow,
} from './import-lib';
import { CATALOG_FORMAT, type CatalogFile, type SeedOverride } from '../../server/src/catalog-file';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');

/** Встроенные ароматы, чьё название в датасете отличается. seedId → id в датасете. */
export const SEED_ALIASES: Record<string, string> = {
  'chanel-bleu-de-chanel-edp': 'chanel-bleu-de-chanel-eau-de-parfum',
  'mfk-baccarat-rouge-540': 'maison-francis-kurkdjian-baccarat-rouge-540',
  'kilian-angels-share': 'by-kilian-angels-share',
  'margiela-jazz-club': 'maison-margiela-replica-jazz-club',
  'margiela-by-the-fireplace': 'maison-margiela-replica-by-the-fireplace',
  'armani-acqua-di-gio-profumo': 'giorgio-armani-acqua-di-gio-profumo',
  'armani-si': 'giorgio-armani-si',
  'ysl-la-nuit-de-lhomme': 'yves-saint-laurent-la-nuit-de-l-homme',
  'ysl-y-edp': 'yves-saint-laurent-y-eau-de-parfum',
  'ysl-black-opium': 'yves-saint-laurent-black-opium',
  'ysl-libre': 'yves-saint-laurent-libre',
  'pdm-layton': 'parfums-de-marly-layton',
  'pdm-pegasus': 'parfums-de-marly-pegasus',
  'pdm-herod': 'parfums-de-marly-herod',
  'pdm-delina': 'parfums-de-marly-delina',
  'jpg-le-male': 'jean-paul-gaultier-le-male',
  'dg-light-blue': 'dolce-gabbana-light-blue',
  'viktor-rolf-spicebomb-extreme': 'viktor-rolf-spicebomb-extreme',
  'hermes-terre-dhermes': 'hermes-terre-d-hermes',
  'dior-homme-intense': 'dior-dior-homme-intense-2011',
  'dior-miss-dior-edp': 'dior-miss-dior-eau-de-parfum-2017',
  'dior-jadore': 'dior-j-adore',
  'chanel-chance-eau-tendre': 'chanel-chance-eau-tendre',
  'nasomatto-black-afgano': 'nasomatto-black-afgano',
  'guerlain-habit-rouge': 'guerlain-habit-rouge-eau-de-toilette',
  'lattafa-khamrah': 'lattafa-perfumes-khamrah',
  'armani-stronger-with-you-intensely': 'giorgio-armani-emporio-armani-stronger-with-you-intensely',
  'tom-ford-ombre-leather': 'tom-ford-ombre-leather-2018',
  'guerlain-shalimar': 'guerlain-shalimar-eau-de-parfum',
  'initio-oud-for-greatness': 'initio-parfums-prives-oud-for-greatness',
  'diptyque-fleur-de-peau': 'diptyque-fleur-de-peau-eau-de-parfum',
};

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

/** id в датасете по «слагу» из ссылки Fragrantica. */
function datasetSlugId(m: MappedRow): string {
  const url = m.perfume.fragranticaUrl ?? '';
  const match = url.match(/\/perfume\/([^/]+)\/([^/]+?)-\d+\.html/i);
  return match ? `${match[1]}-${match[2]}`.toLowerCase() : m.perfume.id;
}

function main() {
  const minVotes = Number(arg('min-votes') ?? 10);
  const rawDir = path.join(ROOT, 'data', 'raw');
  const files = fs
    .readdirSync(rawDir)
    .filter((f) => /\.(csv|xlsx|xls)$/i.test(f))
    .map((f) => path.join(rawDir, f));

  let rows: MappedRow[] = [];
  const sources: string[] = [];
  for (const file of files) {
    const { headers, rows: raw } = readRows(file, 'auto');
    const mapping = buildMapping(headers);
    if (!hasNotesColumns(mapping)) {
      console.log(`Пропускаю ${path.basename(file)}: в нём нет нот`);
      continue;
    }
    console.log(`Читаю ${path.basename(file)}: ${raw.length} строк`);
    sources.push(path.basename(file));
    for (const r of raw) {
      const m = mapRow(r, mapping);
      if (m && m.hasNotes && (m.perfume.votes ?? 0) >= minVotes) rows.push(m);
    }
  }
  if (!rows.length) {
    console.log('В data/raw нет файла с нотами (колонки верх/сердце/база). Каталог не собран.');
    process.exit(1);
  }
  rows = dedupeRows(rows);
  console.log(`Ароматов с нотами (от ${minVotes} голосов): ${rows.length}`);

  // сопоставление со встроенными ароматами
  const byKey = new Map<string, MappedRow>();
  const bySlug = new Map<string, MappedRow>();
  for (const m of rows) {
    byKey.set(matchKey(m.perfume.brand, m.perfume.name), m);
    bySlug.set(datasetSlugId(m), m);
  }
  const overrides: Record<string, SeedOverride> = {};
  const used = new Set<MappedRow>();
  const unmatched: string[] = [];
  for (const s of SEED_PERFUMES) {
    const m =
      bySlug.get(SEED_ALIASES[s.id] ?? '') ??
      byKey.get(matchKey(s.brand, s.name)) ??
      bySlug.get(s.id);
    if (!m) {
      unmatched.push(s.id);
      continue;
    }
    used.add(m);
    overrides[s.id] = {
      rating: m.perfume.rating,
      votes: m.perfume.votes,
      fragranticaUrl: m.perfume.fragranticaUrl,
      year: s.year ?? m.perfume.year,
      imageUrl: m.imageUrl,
    };
  }
  console.log(`Встроенных ароматов найдено в датасете: ${Object.keys(overrides).length}/${SEED_PERFUMES.length}`);
  if (unmatched.length) console.log(`Не найдены (останутся со своими данными): ${unmatched.join(', ')}`);

  // id встроенных ароматов не должны пересекаться с новыми
  const seedIds = new Set(SEED_PERFUMES.map((p) => p.id));
  const perfumes: Perfume[] = rows
    .filter((m) => !used.has(m) && !seedIds.has(m.perfume.id))
    .map((m) => ({ ...m.perfume, description: null }));

  // ноты без перевода — подсказка, что добавить в notes-ru.ts
  const counts = new Map<string, number>();
  for (const p of perfumes) {
    for (const n of new Set([...p.notesTop, ...p.notesHeart, ...p.notesBase])) {
      counts.set(n, (counts.get(n) ?? 0) + 1);
    }
  }
  const untranslated = [...counts.entries()]
    .filter(([n]) => !NOTES_RU[n])
    .sort((a, b) => b[1] - a[1]);
  const covered = [...counts.entries()].reduce((s, [n, c]) => s + (NOTES_RU[n] ? c : 0), 0);
  const total = [...counts.values()].reduce((s, c) => s + c, 0);
  console.log(`Нот всего: ${counts.size}, упоминаний переведено: ${((covered / total) * 100).toFixed(1)}%`);
  console.log(`Самые частые без перевода: ${untranslated.slice(0, 40).map(([n, c]) => `${n}(${c})`).join(', ')}`);

  const file: CatalogFile = {
    format: CATALOG_FORMAT,
    source: `Fragrantica.com Fragrance Dataset (Kaggle): ${sources.join(', ')}`,
    generatedAt: new Date().toISOString().slice(0, 10),
    overrides,
    perfumes,
  };
  const out = path.join(ROOT, 'data', 'catalog.json.gz');
  const gz = zlib.gzipSync(JSON.stringify(file), { level: 9 });
  fs.writeFileSync(out, gz);
  console.log(`Готово: ${path.relative(ROOT, out)} — ${perfumes.length} ароматов, ${(gz.length / 1024 / 1024).toFixed(1)} МБ`);
}

main();

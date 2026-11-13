/**
 * Импорт датасета ароматов (CSV или XLSX) из data/raw в SQLite.
 *
 * Запуск:
 *   npm run import-csv                    — найти файлы, показать структуру и импортировать
 *   npm run import-csv -- --dry           — только показать заголовки и первые строки
 *   npm run import-csv -- --file data/raw/x.csv --limit 500
 *   npm run import-csv -- --mode enrich   — только дополнить существующие записи (url, картинка)
 *   npm run import-csv -- --encoding cp1251
 *
 * Режимы:
 *   auto (по умолчанию): если в файле есть ноты — полный импорт, иначе enrich;
 *   full: импортировать все строки как новые ароматы;
 *   enrich: сопоставить по «бренд+название» и дополнить существующие записи.
 */
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'csv-parse/sync';
import * as XLSX from 'xlsx';
import { describePerfume } from '@veroniks/shared';
import { openDb, seedIfEmpty, upsertPerfume } from '../../server/src/db';
import {
  buildMapping,
  dedupeRows,
  detectDelimiter,
  hasNotesColumns,
  mapRow,
  matchKey,
  type MappedRow,
  type RawRow,
} from './import-lib';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const hasFlag = (name: string) => process.argv.includes(`--${name}`);

function readRows(file: string, encoding: string): { headers: string[]; rows: RawRow[] } {
  const ext = path.extname(file).toLowerCase();
  if (ext === '.xlsx' || ext === '.xls') {
    const wb = XLSX.read(fs.readFileSync(file));
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json<RawRow>(sheet, { defval: '' });
    const headers = rows.length ? Object.keys(rows[0]) : [];
    return { headers, rows };
  }
  const buf = fs.readFileSync(file);
  let text: string;
  if (encoding === 'cp1251') {
    text = new TextDecoder('windows-1251').decode(buf);
  } else {
    text = buf.toString('utf-8');
  }
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1); // BOM
  const firstLine = text.slice(0, text.indexOf('\n'));
  const delimiter = detectDelimiter(firstLine);
  const rows = parse(text, {
    columns: true,
    delimiter,
    skip_empty_lines: true,
    relax_quotes: true,
    relax_column_count: true,
    trim: true,
  }) as RawRow[];
  const headers = rows.length ? Object.keys(rows[0]) : [];
  console.log(`Разделитель: «${delimiter === '\t' ? 'таб' : delimiter}»`);
  return { headers, rows };
}

function main() {
  const fileArg = arg('file');
  const limit = arg('limit') ? Number(arg('limit')) : undefined;
  const mode = (arg('mode') ?? 'auto') as 'auto' | 'full' | 'enrich';
  const encoding = arg('encoding') ?? 'utf-8';
  const dry = hasFlag('dry');

  const rawDir = path.join(ROOT, 'data', 'raw');
  const files = fileArg
    ? [path.resolve(ROOT, fileArg)]
    : fs
        .readdirSync(rawDir)
        .filter((f) => /\.(csv|xlsx|xls)$/i.test(f))
        .map((f) => path.join(rawDir, f));

  if (files.length === 0) {
    console.log('В data/raw нет файлов CSV или XLSX. Положите датасет туда и повторите.');
    process.exit(1);
  }

  for (const file of files) {
    console.log(`\n=== Файл: ${path.relative(ROOT, file)} ===`);
    const { headers, rows } = readRows(file, encoding);
    console.log(`Строк: ${rows.length}`);
    console.log(`Колонки: ${headers.join(', ')}`);

    const mapping = buildMapping(headers);
    console.log('Маппинг колонок:');
    for (const [field, col] of Object.entries(mapping)) {
      if (col) console.log(`  ${field} ← «${col}»`);
    }
    const unmapped = headers.filter((h) => !Object.values(mapping).includes(h));
    if (unmapped.length) console.log(`Не используются: ${unmapped.join(', ')}`);

    console.log('Первые строки:');
    for (const row of rows.slice(0, 3)) {
      console.log(
        '  ' +
          headers
            .slice(0, 6)
            .map((h) => `${h}=${String(row[h]).slice(0, 40)}`)
            .join(' | '),
      );
    }

    if (dry) continue;

    const withNotes = hasNotesColumns(mapping);
    const effectiveMode = mode === 'auto' ? (withNotes ? 'full' : 'enrich') : mode;
    console.log(`Режим импорта: ${effectiveMode}${withNotes ? '' : ' (в файле нет колонок нот)'}`);

    let mapped: MappedRow[] = [];
    let skipped = 0;
    for (const row of rows.slice(0, limit)) {
      const m = mapRow(row, mapping);
      if (m) mapped.push(m);
      else skipped++;
    }
    const before = mapped.length;
    mapped = dedupeRows(mapped);
    console.log(
      `Разобрано: ${before}, пропущено пустых: ${skipped}, дубликатов убрано: ${before - mapped.length}`,
    );

    const db = openDb(process.env.DATABASE_PATH ?? path.join(ROOT, 'data', 'veroniks.db'));
    seedIfEmpty(db);

    if (effectiveMode === 'enrich') {
      const existing = db.prepare('SELECT id, name, brand FROM perfumes').all() as {
        id: string;
        name: string;
        brand: string;
      }[];
      const byKey = new Map(existing.map((e) => [matchKey(e.brand, e.name), e.id]));
      const upd = db.prepare(
        `UPDATE perfumes SET fragrantica_url = COALESCE(@url, fragrantica_url),
           image_url = COALESCE(@img, image_url),
           year = COALESCE(year, @year)
         WHERE id = @id`,
      );
      let enriched = 0;
      const tx = db.transaction(() => {
        for (const m of mapped) {
          const id = byKey.get(matchKey(m.perfume.brand, m.perfume.name));
          if (!id) continue;
          upd.run({
            id,
            url: m.perfume.fragranticaUrl?.includes('/perfume/') ? m.perfume.fragranticaUrl : null,
            img: m.imageUrl,
            year: m.perfume.year,
          });
          enriched++;
        }
      });
      tx();
      console.log(`Дополнено существующих записей: ${enriched} из ${mapped.length} строк файла.`);
    } else {
      let inserted = 0;
      const tx = db.transaction(() => {
        for (const m of mapped) {
          const p = m.hasNotes
            ? { ...m.perfume, description: m.perfume.description ?? describePerfume(m.perfume) }
            : m.perfume;
          upsertPerfume(db, p, m.imageUrl);
          inserted++;
          if (inserted % 2000 === 0) console.log(`  …${inserted}`);
        }
      });
      tx();
      console.log(`Импортировано ароматов: ${inserted}.`);
    }
    db.close();
  }
  console.log('\nГотово. Перезапустите сервер, чтобы каталог подхватил изменения.');
}

main();

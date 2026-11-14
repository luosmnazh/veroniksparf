import fs from 'node:fs';
import path from 'node:path';
import { parse } from 'csv-parse/sync';
import * as XLSX from 'xlsx';
import { decodeText, detectDelimiter, type RawRow } from './import-lib';

/** Чтение CSV (любой разделитель и кодировка) или XLSX в массив строк. */
export function readRows(file: string, encoding: string): { headers: string[]; rows: RawRow[] } {
  const ext = path.extname(file).toLowerCase();
  if (ext === '.xlsx' || ext === '.xls') {
    const wb = XLSX.read(fs.readFileSync(file));
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json<RawRow>(sheet, { defval: '' });
    const headers = rows.length ? Object.keys(rows[0]) : [];
    return { headers, rows };
  }
  const decoded = decodeText(fs.readFileSync(file), encoding);
  const text = decoded.text;
  console.log(`Кодировка: ${decoded.encoding}`);
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

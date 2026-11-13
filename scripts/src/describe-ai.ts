/**
 * Переписывание описаний ароматов через Claude API.
 *
 * Запуск:  npm run describe-ai -- --limit 20
 * Флаги:   --limit N   — сколько описаний переписать за запуск (по умолчанию 50)
 *          --force     — переписать и те, что уже сгенерированы ИИ
 *
 * Требуется ANTHROPIC_API_KEY в .env. Без ключа скрипт ничего не ломает:
 * объясняет ситуацию и выходит. Готовые описания кэшируются в БД
 * (description_source = 'ai'), поэтому повторный запуск не тратит деньги
 * на уже обработанные ароматы.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import 'dotenv/config';
import { GENDER_RU, noteRu, type Perfume } from '@veroniks/shared';
import { openDb } from '../../server/src/db';
import { Catalog } from '../../server/src/catalog';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');

const PERSONA = `Ты — сдержанный британский джентльмен-парфюмер, владелец закрытого клуба Veroniks.
Сухая ирония, уверенность, лёгкая дерзость, без грубости. Пишешь по-русски, коротко и по делу.
Напиши описание аромата: ровно 2–3 предложения. Упомяни характер звучания и 2–4 ключевые ноты.
Не используй слова «пирамида», «верхние ноты», «аккорды». Не выдумывай ноты, которых нет в списке.
Ответь только текстом описания, без кавычек и пояснений.`;

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function perfumePrompt(p: Perfume): string {
  const notes = (list: string[]) => list.map(noteRu).join(', ') || '—';
  return [
    `Аромат: ${p.name} (${p.brand}${p.year ? `, ${p.year}` : ''})`,
    `Пол: ${GENDER_RU[p.gender]}. Семейство: ${p.family || 'не указано'}.`,
    `Верх: ${notes(p.notesTop)}.`,
    `Сердце: ${notes(p.notesHeart)}.`,
    `База: ${notes(p.notesBase)}.`,
    `Аккорды: ${p.accords.map((a) => a.name).join(', ') || '—'}.`,
    `Сезоны: ${p.seasons.join(', ')}. Поводы: ${p.occasions.join(', ')}.`,
  ].join('\n');
}

async function main() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.log(
      'ANTHROPIC_API_KEY не задан в .env — работаем на шаблонных описаниях.\n' +
        'Когда появится ключ, впишите его в .env и запустите скрипт ещё раз.',
    );
    return;
  }

  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  const client = new Anthropic({ apiKey });
  const model = process.env.ANTHROPIC_MODEL || 'claude-opus-5-5';

  const limit = arg('limit') ? Number(arg('limit')) : 50;
  const force = process.argv.includes('--force');

  const db = openDb(process.env.DATABASE_PATH ?? path.join(ROOT, 'data', 'veroniks.db'));
  const catalog = new Catalog(db);
  const done = new Set(
    (
      db
        .prepare(`SELECT id FROM perfumes WHERE description_source = 'ai'`)
        .all() as { id: string }[]
    ).map((r) => r.id),
  );

  const targets = catalog
    .all()
    .filter((p) => p.notesTop.length + p.notesHeart.length + p.notesBase.length > 0)
    .filter((p) => force || !done.has(p.id))
    .slice(0, limit);

  console.log(`Модель: ${model}. К обработке: ${targets.length} (кэш пропустил ${done.size}).`);

  const upd = db.prepare(
    `UPDATE perfumes SET description = ?, description_source = 'ai' WHERE id = ?`,
  );

  let ok = 0;
  for (const p of targets) {
    try {
      const response = await client.messages.create({
        model,
        max_tokens: 1024,
        system: PERSONA,
        messages: [{ role: 'user', content: perfumePrompt(p) }],
      });
      if (response.stop_reason === 'refusal') {
        console.warn(`  ${p.id}: модель отказалась, оставляем шаблонное описание`);
        continue;
      }
      const text = response.content
        .filter((b): b is { type: 'text'; text: string } & typeof b => b.type === 'text')
        .map((b) => b.text)
        .join(' ')
        .trim();
      if (text) {
        upd.run(text, p.id);
        ok++;
        console.log(`  ✓ ${p.brand} ${p.name}`);
      }
    } catch (e) {
      console.error(`  ✗ ${p.id}: ${e instanceof Error ? e.message : e}`);
    }
  }
  console.log(`Готово: обновлено ${ok} описаний.`);
  db.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

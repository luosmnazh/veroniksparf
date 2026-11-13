import { Bot, InlineKeyboard, webhookCallback, type Context } from 'grammy';
import type { UserFromGetMe } from 'grammy/types';
import type { FastifyInstance } from 'fastify';
import crypto from 'node:crypto';
import {
  GENDER_RU,
  findSimilar,
  noteRu,
  normalizeText,
  parseQuery,
  type AdvisorEngine,
  type AdvisorReply,
  type ClarifyOption,
  type Perfume,
} from '@veroniks/shared';
import type { Catalog } from './catalog';
import { isAllowed } from './telegram-auth';
import { RateLimiter } from './rate-limit';

interface BotDeps {
  token: string;
  webappUrl: string | null;
  allowed: Set<number>;
  catalog: Catalog;
  advisor: AdvisorEngine;
  log: (msg: string) => void;
  /** Для тестов: сведения о боте без запроса getMe. */
  botInfo?: UserFromGetMe;
}

const REFUSALS = [
  'Прошу прощения, сэр, но клуб Veroniks закрытый. Членство — только по приглашению.',
  'Боюсь, вашего имени нет в списке гостей. Дверь, к сожалению, закрыта.',
  'Клуб для своих. Если вас кто-то пригласил — пусть замолвит словечко владельцу.',
];

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Поиск аромата по названию: точное совпадение → упоминание → подстрока. */
export function findPerfumeByName(query: string, perfumes: Perfume[]): Perfume | null {
  const q = normalizeText(query);
  if (!q) return null;
  const exact = perfumes.find(
    (p) => normalizeText(p.name) === q || normalizeText(`${p.brand} ${p.name}`) === q,
  );
  if (exact) return exact;
  const ref = parseQuery(query, perfumes).reference;
  if (ref) return perfumes.find((p) => p.id === ref.id) ?? null;
  const partial = perfumes
    .filter((p) => normalizeText(`${p.brand} ${p.name}`).includes(q))
    .sort((a, b) => (b.votes ?? 0) - (a.votes ?? 0));
  return partial[0] ?? null;
}

function pyramidText(p: Perfume): string {
  const line = (title: string, notes: string[]) =>
    `<b>${title}:</b> ${notes.length ? esc(notes.map(noteRu).join(', ')) : '—'}`;
  return [
    `🔺 ${line('Верх', p.notesTop)}`,
    `♦️ ${line('Сердце', p.notesHeart)}`,
    `🟫 ${line('База', p.notesBase)}`,
  ].join('\n');
}

function perfumeCard(p: Perfume): string {
  const meta = [p.brand, p.year, GENDER_RU[p.gender], p.family].filter(Boolean).join(' · ');
  const accords = p.accords
    .slice()
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 5)
    .map((a) => a.name)
    .join(', ');
  return [
    `<b>${esc(p.name)}</b>`,
    `<i>${esc(meta)}</i>${p.rating ? ` · ★ ${p.rating.toFixed(1)}` : ''}`,
    '',
    pyramidText(p),
    accords ? `\n<b>Аккорды:</b> ${esc(accords)}` : '',
    `<b>Сезон:</b> ${p.seasons.join(', ')} · <b>Повод:</b> ${p.occasions.join(', ')}`,
    p.description ? `\n${esc(p.description)}` : '',
  ]
    .filter((x) => x !== '')
    .join('\n');
}

function advisorText(r: AdvisorReply): string {
  const lines = [esc(r.text)];
  r.picks.forEach((p, i) => {
    lines.push('', `<b>${i + 1}. ${esc(p.perfume.name)}</b> — ${esc(p.perfume.brand)}`, esc(p.reason));
  });
  if (r.clarify) lines.push('', `<i>${esc(r.clarify.question)}</i>`);
  return lines.join('\n');
}

export function createBot(deps: BotDeps): Bot {
  const { catalog, advisor, allowed, webappUrl, log } = deps;
  const bot = new Bot(deps.token, deps.botInfo ? { botInfo: deps.botInfo } : undefined);
  const limiter = new RateLimiter(20, 60_000);
  /** Незавершённые уточнения: chatId → контекст и варианты. */
  const pending = new Map<number, { context: string; options: ClarifyOption[] }>();
  const httpsApp = webappUrl?.startsWith('https://') ? webappUrl.replace(/\/$/, '') : null;

  // /id — работает для всех: так друзья узнают свой ID для белого списка
  bot.command('id', (ctx) =>
    ctx.reply(`Ваш Telegram ID: <code>${ctx.from?.id}</code>\nПередайте его владельцу клуба.`, {
      parse_mode: 'HTML',
    }),
  );

  // белый список и rate limit
  bot.use(async (ctx, next) => {
    const id = ctx.from?.id;
    if (!isAllowed(id, allowed)) {
      if (ctx.callbackQuery) await ctx.answerCallbackQuery({ text: 'Клуб закрыт для гостей.' });
      else if (ctx.message) await ctx.reply(REFUSALS[(id ?? 0) % REFUSALS.length]);
      return;
    }
    if (id && !limiter.take(String(id))) {
      if (ctx.message) await ctx.reply('Не так быстро, сэр. Хороший парфюм не терпит суеты — минутку.');
      return;
    }
    await next();
  });

  const appButton = (path = '/', text = 'Войти в клуб') =>
    httpsApp ? new InlineKeyboard().webApp(text, `${httpsApp}${path}`) : undefined;

  bot.command('start', async (ctx) => {
    const payload = ctx.match?.trim();
    if (payload?.startsWith('p_')) {
      const p = catalog.get(payload.slice(2));
      if (p) {
        await ctx.reply(perfumeCard(p), {
          parse_mode: 'HTML',
          reply_markup: appButton(`/p/${p.id}`, 'Открыть в приложении'),
        });
        return;
      }
    }
    const name = ctx.from?.first_name ? `, ${esc(ctx.from.first_name)}` : '';
    await ctx.reply(
      [
        `Добрый вечер${name}. Добро пожаловать в Veroniks.`,
        '',
        'Здесь не продают парфюм — здесь его понимают. Опишите, чего хочется, и я подберу: «тёплое, дымное, на зимний вечер». Или спросите прямо:',
        '/similar Aventus — похожие ароматы',
        '/perfume Sauvage — досье и пирамида',
        '',
        httpsApp ? 'А полная библиотека — за дверью ниже.' : '(Приложение откроется, когда владелец укажет WEBAPP_URL.)',
      ].join('\n'),
      { parse_mode: 'HTML', reply_markup: appButton() },
    );
  });

  bot.command('help', (ctx) =>
    ctx.reply(
      'Пишите свободно: «свежее для офиса», «что-то как Aventus, но дешевле», «кожаное без уда».\n/similar <название> — похожие\n/perfume <название> — досье аромата\n/id — ваш Telegram ID',
    ),
  );

  bot.command('similar', async (ctx) => {
    const query = ctx.match?.trim();
    if (!query) return ctx.reply('Назовите аромат: /similar Aventus');
    const target = findPerfumeByName(query, catalog.all());
    if (!target) return ctx.reply(`«${query}» в архиве не значится. Проверьте написание.`);
    const res = findSimilar(target, catalog.all(), { limit: 5, noteIndex: catalog.index() });
    if (!res.length) return ctx.reply(`Для ${target.name} достойной компании в архиве пока нет.`);
    const lines = [`Похожие на <b>${esc(target.name)}</b> (${esc(target.brand)}):`, ''];
    res.forEach((r, i) => {
      const common = r.commonNotes.slice(0, 4).map(noteRu).join(', ');
      lines.push(
        `${i + 1}. <b>${esc(r.perfume.name)}</b> — ${esc(r.perfume.brand)} · <b>${r.matchPercent}%</b>`,
        common ? `   общие ноты: ${esc(common)}` : '',
      );
    });
    await ctx.reply(lines.filter(Boolean).join('\n'), {
      parse_mode: 'HTML',
      reply_markup: appButton(`/similar/${target.id}`, 'Открыть в приложении'),
    });
  });

  bot.command('perfume', async (ctx) => {
    const query = ctx.match?.trim();
    if (!query) return ctx.reply('Назовите аромат: /perfume Sauvage');
    const p = findPerfumeByName(query, catalog.all());
    if (!p) return ctx.reply(`«${query}» в архиве не значится. Проверьте написание.`);
    await ctx.reply(perfumeCard(p), {
      parse_mode: 'HTML',
      reply_markup: appButton(`/p/${p.id}`, 'Открыть в приложении'),
    });
  });

  async function answerAdvisor(ctx: Context, message: string, context?: string) {
    await ctx.replyWithChatAction('typing');
    const r = await advisor.reply({ message, context }, catalog);
    const kb = new InlineKeyboard();
    const chatId = ctx.chat!.id;
    if (r.clarify) {
      pending.set(chatId, { context: context ? `${context}, ${message}` : message, options: r.clarify.options });
      r.clarify.options.forEach((o, i) => kb.text(o.label, `c:${i}`).row());
    } else {
      pending.delete(chatId);
    }
    if (httpsApp && r.picks.length) kb.webApp('Открыть советника', `${httpsApp}/advisor`);
    await ctx.reply(advisorText(r), {
      parse_mode: 'HTML',
      reply_markup: kb.inline_keyboard.length ? kb : undefined,
    });
  }

  bot.callbackQuery(/^c:(\d+)$/, async (ctx) => {
    const chatId = ctx.chat?.id;
    const state = chatId ? pending.get(chatId) : undefined;
    const opt = state?.options[Number(ctx.match![1])];
    await ctx.answerCallbackQuery();
    if (!state || !opt) return ctx.reply('Этот вопрос уже устарел — напишите заново.');
    await answerAdvisor(ctx, opt.value, state.context);
  });

  bot.on('message:text', async (ctx) => {
    if (ctx.message.text.startsWith('/')) return ctx.reply('Не знаю такой команды. /help — список.');
    await answerAdvisor(ctx, ctx.message.text);
  });

  bot.catch((err) => log(`Ошибка бота: ${err.error instanceof Error ? err.error.message : String(err.error)}`));
  return bot;
}

/** Настройка команд и кнопки меню (Mini App). */
export async function configureBot(bot: Bot, webappUrl: string | null, log: (m: string) => void) {
  await bot.api.setMyCommands([
    { command: 'start', description: 'Войти в клуб' },
    { command: 'similar', description: 'Похожие ароматы: /similar Aventus' },
    { command: 'perfume', description: 'Досье аромата: /perfume Sauvage' },
    { command: 'id', description: 'Мой Telegram ID' },
    { command: 'help', description: 'Как пользоваться' },
  ]);
  if (webappUrl?.startsWith('https://')) {
    await bot.api.setChatMenuButton({
      menu_button: { type: 'web_app', text: 'Клуб', web_app: { url: webappUrl } },
    });
    log(`Кнопка меню бота → ${webappUrl}`);
  } else {
    log('WEBAPP_URL не задан или не https — кнопку меню не ставлю');
  }
}

/** Запуск: webhook (хостинг) или long polling (свой компьютер). */
export async function startBot(
  bot: Bot,
  app: FastifyInstance,
  webappUrl: string | null,
  mode: 'webhook' | 'polling',
  log: (m: string) => void,
): Promise<void> {
  const useWebhook = mode === 'webhook' && webappUrl?.startsWith('https://');
  const secret = crypto.createHash('sha256').update(bot.token).digest('hex').slice(0, 32);
  const path = `/tg/webhook/${secret}`;
  // маршрут регистрируется синхронно — до app.listen
  if (useWebhook) app.post(path, webhookCallback(bot, 'fastify', { secretToken: secret }));

  await configureBot(bot, webappUrl, log);
  if (useWebhook) {
    await bot.api.setWebhook(`${webappUrl!.replace(/\/$/, '')}${path}`, { secret_token: secret });
    log('Бот: режим webhook');
  } else {
    await bot.api.deleteWebhook();
    bot.start({ onStart: (me) => log(`Бот @${me.username}: режим long polling`) }).catch((e) => {
      log(`Бот остановлен: ${e instanceof Error ? e.message : e}`);
    });
  }
}

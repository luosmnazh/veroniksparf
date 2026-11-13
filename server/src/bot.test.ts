import { describe, expect, it } from 'vitest';
import { RuleAdvisor, SEED_PERFUMES, buildNoteIndex } from '@veroniks/shared';
import { createBot } from './bot';
import type { Catalog } from './catalog';

const catalog = {
  all: () => SEED_PERFUMES,
  get: (id: string) => SEED_PERFUMES.find((p) => p.id === id),
  index: () => buildNoteIndex(SEED_PERFUMES),
} as unknown as Catalog;

const botInfo = {
  id: 1,
  is_bot: true as const,
  first_name: 'Veroniks',
  username: 'veroniksparfbot',
  can_join_groups: false,
  can_read_all_group_messages: false,
  supports_inline_queries: false,
  can_connect_to_business: false,
  has_main_web_app: false,
  has_topics_enabled: false,
  allows_users_to_create_topics: false,
  can_manage_bots: false,
  supports_join_request_queries: false,
};

/** Бот с перехватом исходящих вызовов API вместо сети. */
function makeBot(allowed: number[]) {
  const sent: { method: string; payload: Record<string, unknown> }[] = [];
  const bot = createBot({
    token: '1:TEST',
    webappUrl: 'https://club.example.com',
    allowed: new Set(allowed),
    catalog,
    advisor: new RuleAdvisor(),
    log: () => {},
    botInfo,
  });
  bot.api.config.use(async (_prev, method, payload) => {
    sent.push({ method, payload: payload as Record<string, unknown> });
    return { ok: true, result: true } as never;
  });
  return { bot, sent };
}

let updateId = 1;
function textUpdate(userId: number, text: string) {
  const isCommand = text.startsWith('/');
  const cmdLen = isCommand ? text.split(' ')[0].length : 0;
  return {
    update_id: updateId++,
    message: {
      message_id: updateId,
      date: Math.floor(Date.now() / 1000),
      chat: { id: userId, type: 'private' as const, first_name: 'Гость' },
      from: { id: userId, is_bot: false, first_name: 'Гость' },
      text,
      ...(isCommand ? { entities: [{ type: 'bot_command' as const, offset: 0, length: cmdLen }] } : {}),
    },
  };
}

const replies = (sent: { method: string; payload: Record<string, unknown> }[]) =>
  sent.filter((s) => s.method === 'sendMessage').map((s) => String(s.payload.text));

describe('бот @veroniksparfbot', () => {
  it('посторонний получает вежливый отказ', async () => {
    const { bot, sent } = makeBot([111]);
    await bot.handleUpdate(textUpdate(999, 'тёплое и дымное'));
    await bot.handleUpdate(textUpdate(999, '/start'));
    const r = replies(sent);
    expect(r).toHaveLength(2);
    for (const t of r) expect(t).toMatch(/клуб|список|Дверь/i);
    expect(r.join(' ')).not.toMatch(/Добро пожаловать/);
  });

  it('/id работает и для посторонних', async () => {
    const { bot, sent } = makeBot([111]);
    await bot.handleUpdate(textUpdate(999, '/id'));
    expect(replies(sent)[0]).toContain('999');
  });

  it('свой получает приветствие с кнопкой «Войти в клуб»', async () => {
    const { bot, sent } = makeBot([111]);
    await bot.handleUpdate(textUpdate(111, '/start'));
    const msg = sent.find((s) => s.method === 'sendMessage')!;
    expect(String(msg.payload.text)).toMatch(/Добро пожаловать/);
    expect(JSON.stringify(msg.payload.reply_markup)).toContain('Войти в клуб');
    expect(JSON.stringify(msg.payload.reply_markup)).toContain('https://club.example.com');
  });

  it('пустой белый список — бот открыт всем', async () => {
    const { bot, sent } = makeBot([]);
    await bot.handleUpdate(textUpdate(555, '/start'));
    expect(replies(sent)[0]).toMatch(/Добро пожаловать/);
  });

  it('/similar Aventus — CDNIM в ответе', async () => {
    const { bot, sent } = makeBot([111]);
    await bot.handleUpdate(textUpdate(111, '/similar Aventus'));
    const t = replies(sent)[0];
    expect(t).toContain('Club de Nuit Intense Man');
    expect(t).toContain('ананас');
  });

  it('/perfume — пирамида и кнопка в приложение', async () => {
    const { bot, sent } = makeBot([111]);
    await bot.handleUpdate(textUpdate(111, '/perfume Sauvage'));
    const msg = sent.find((s) => s.method === 'sendMessage')!;
    expect(String(msg.payload.text)).toMatch(/Верх.*бергамот/s);
    expect(JSON.stringify(msg.payload.reply_markup)).toContain('/p/dior-sauvage');
  });

  it('свободный текст → советник прямо в чате', async () => {
    const { bot, sent } = makeBot([111]);
    await bot.handleUpdate(textUpdate(111, 'тёплое, дымное, на зимний вечер, не слишком сладкое'));
    const t = replies(sent)[0];
    expect(t).toMatch(/1\. /);
    expect(t).toMatch(/2\. /);
  });
});

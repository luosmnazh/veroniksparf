import crypto from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { SEED_PERFUMES } from '@veroniks/shared';
import {
  isAllowed,
  issueAccessKey,
  parseAllowedIds,
  validateInitData,
  verifyAccessKey,
} from './telegram-auth';
import { RateLimiter } from './rate-limit';
import { findPerfumeByName } from './bot';

const TOKEN = '123456:TEST-token-not-real';

function signInitData(fields: Record<string, string>, token = TOKEN): string {
  const dcs = Object.keys(fields)
    .sort()
    .map((k) => `${k}=${fields[k]}`)
    .join('\n');
  const secret = crypto.createHmac('sha256', 'WebAppData').update(token).digest();
  const hash = crypto.createHmac('sha256', secret).update(dcs).digest('hex');
  return new URLSearchParams({ ...fields, hash }).toString();
}

const now = () => String(Math.floor(Date.now() / 1000));

describe('validateInitData', () => {
  it('принимает корректную подпись', () => {
    const data = signInitData({ auth_date: now(), user: JSON.stringify({ id: 42, first_name: 'V' }) });
    expect(validateInitData(data, TOKEN)?.id).toBe(42);
  });

  it('отклоняет подпись чужим токеном', () => {
    const data = signInitData({ auth_date: now(), user: JSON.stringify({ id: 42 }) }, '999:other');
    expect(validateInitData(data, TOKEN)).toBeNull();
  });

  it('отклоняет подделанного пользователя', () => {
    const data = signInitData({ auth_date: now(), user: JSON.stringify({ id: 42 }) });
    const forged = data.replace(encodeURIComponent('"id":42'), encodeURIComponent('"id":43'));
    expect(validateInitData(forged, TOKEN)).toBeNull();
  });

  it('отклоняет просроченные данные', () => {
    const old = String(Math.floor(Date.now() / 1000) - 3 * 86400);
    const data = signInitData({ auth_date: old, user: JSON.stringify({ id: 42 }) });
    expect(validateInitData(data, TOKEN)).toBeNull();
  });
});

describe('белый список', () => {
  it('разбор списка ID', () => {
    expect([...parseAllowedIds(' 1, 2 ;3  abc')]).toEqual([1, 2, 3]);
  });
  it('пустой список — открыт всем', () => {
    expect(isAllowed(777, new Set())).toBe(true);
  });
  it('посторонний получает отказ', () => {
    const allowed = parseAllowedIds('111,222');
    expect(isAllowed(111, allowed)).toBe(true);
    expect(isAllowed(333, allowed)).toBe(false);
    expect(isAllowed(undefined, allowed)).toBe(false);
  });
});

describe('ключ доступа PWA', () => {
  it('выдаётся и проверяется', () => {
    const key = issueAccessKey(42, TOKEN);
    expect(verifyAccessKey(key, TOKEN)).toBe(42);
  });
  it('нельзя подставить чужой ID', () => {
    const key = issueAccessKey(42, TOKEN);
    expect(verifyAccessKey(key.replace(/^42/, '43'), TOKEN)).toBeNull();
    expect(verifyAccessKey(key, '999:other')).toBeNull();
  });
});

describe('RateLimiter', () => {
  it('режет лишнее и восстанавливается после окна', () => {
    const rl = new RateLimiter(2, 1000);
    expect(rl.take('a', 0)).toBe(true);
    expect(rl.take('a', 10)).toBe(true);
    expect(rl.take('a', 20)).toBe(false);
    expect(rl.take('b', 20)).toBe(true);
    expect(rl.take('a', 1500)).toBe(true);
  });
});

describe('findPerfumeByName', () => {
  it('находит по названию, бренду и прозвищу', () => {
    expect(findPerfumeByName('Aventus', SEED_PERFUMES)?.id).toBe('creed-aventus');
    expect(findPerfumeByName('dior sauvage', SEED_PERFUMES)?.id).toBe('dior-sauvage');
    expect(findPerfumeByName('авентус', SEED_PERFUMES)?.id).toBe('creed-aventus');
    expect(findPerfumeByName('khamr', SEED_PERFUMES)?.id).toBe('lattafa-khamrah');
    expect(findPerfumeByName('неизвестное нечто', SEED_PERFUMES)).toBeNull();
  });
});

describe('диагностика запуска бота', async () => {
  const { checkTokenFormat, describeBotError, redactToken } = await import('./bot');
  const { HttpError, GrammyError } = await import('grammy');
  const good = '1234567890:AAH2abcdefghijklmnopqrstuvwxyz012345';

  it('корректный токен проходит проверку формата', () => {
    expect(checkTokenFormat(good)).toBeNull();
  });

  it('подсказывает про пробел внутри и обрезанный токен', () => {
    expect(checkTokenFormat('1234567890:AAH2abc defghijklmnopqrstuvwxyz012345')).toMatch(/пробел/);
    expect(checkTokenFormat('1234567890:AAH2')).toMatch(/длина/);
  });

  it('токен никогда не попадает в текст ошибки', () => {
    expect(redactToken(`request to https://api.telegram.org/bot${good}/getMe failed`)).not.toContain(good);
    const net = new HttpError('Network request for \'getMe\' failed!', new Error(`fetch https://api.telegram.org/bot${good}/getMe ECONNRESET`));
    const msg = describeBotError(net);
    expect(msg).toMatch(/нет связи с Telegram/);
    expect(msg).toContain('ECONNRESET');
    expect(msg).not.toContain(good);
  });

  it('маскирует и «битый» токен с пробелом внутри (%20 в адресе)', () => {
    const bad = 'request to https://api.telegram.org/bot1234567890:AAHfake%20fakefake/getMe failed';
    const out = redactToken(bad);
    expect(out).not.toContain('AAHfake');
    expect(out).toContain('/bot<токен>/getMe');
  });

  it('401 объясняется по-человечески', () => {
    const e = new GrammyError("Call to 'getMe' failed!", { ok: false, error_code: 401, description: 'Unauthorized' }, 'getMe', {});
    expect(describeBotError(e)).toMatch(/BOT_TOKEN/);
  });
});

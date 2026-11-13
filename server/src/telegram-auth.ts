import crypto from 'node:crypto';

export interface TelegramUser {
  id: number;
  first_name?: string;
  username?: string;
}

/**
 * Проверка Telegram WebApp initData (HMAC-SHA256 по токену бота).
 * https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
 */
export function validateInitData(
  initData: string,
  botToken: string,
  maxAgeSec = 24 * 60 * 60,
): TelegramUser | null {
  if (!initData || !botToken) return null;
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash) return null;
  params.delete('hash');

  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join('\n');

  const secret = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
  const expected = crypto.createHmac('sha256', secret).update(dataCheckString).digest('hex');

  const a = Buffer.from(expected, 'hex');
  const b = Buffer.from(hash, 'hex');
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

  const authDate = Number(params.get('auth_date'));
  if (!authDate || Date.now() / 1000 - authDate > maxAgeSec) return null;

  try {
    const user = JSON.parse(params.get('user') ?? 'null') as TelegramUser | null;
    return user?.id ? user : null;
  } catch {
    return null;
  }
}

/**
 * Ключ доступа для PWA вне Telegram: выдаётся проверенному участнику,
 * подписан токеном бота, без срока годности (отзывается сменой токена или
 * удалением ID из белого списка).
 */
export function issueAccessKey(userId: number, botToken: string): string {
  const sig = crypto
    .createHmac('sha256', botToken)
    .update(`veroniks-access:${userId}`)
    .digest('base64url')
    .slice(0, 32);
  return `${userId}.${sig}`;
}

export function verifyAccessKey(key: string, botToken: string): number | null {
  const [idPart] = key.split('.');
  const id = Number(idPart);
  if (!Number.isSafeInteger(id) || id <= 0) return null;
  const expected = issueAccessKey(id, botToken);
  const a = Buffer.from(expected);
  const b = Buffer.from(key);
  return a.length === b.length && crypto.timingSafeEqual(a, b) ? id : null;
}

/** Разбор ALLOWED_USER_IDS. Пустое множество = доступ открыт всем. */
export function parseAllowedIds(raw: string | undefined): Set<number> {
  return new Set(
    (raw ?? '')
      .split(/[,\s;]+/)
      .map((s) => Number(s.trim()))
      .filter((n) => Number.isSafeInteger(n) && n > 0),
  );
}

export function isAllowed(userId: number | undefined, allowed: Set<number>): boolean {
  if (allowed.size === 0) return true;
  return userId !== undefined && allowed.has(userId);
}

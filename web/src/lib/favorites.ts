/**
 * Избранное и «мой гардероб».
 * Внутри Telegram — CloudStorage, иначе localStorage.
 */

export type ListKind = 'favorites' | 'wardrobe';

const KEYS: Record<ListKind, string> = {
  favorites: 'veroniks:favorites',
  wardrobe: 'veroniks:wardrobe',
};

function cloud(): TelegramWebApp['CloudStorage'] | undefined {
  return window.Telegram?.WebApp?.CloudStorage;
}

function readLocal(kind: ListKind): string[] {
  try {
    const raw = localStorage.getItem(KEYS[kind]);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

function writeLocal(kind: ListKind, ids: string[]): void {
  try {
    localStorage.setItem(KEYS[kind], JSON.stringify(ids));
  } catch {
    /* приватный режим — молча пропускаем */
  }
}

export async function getList(kind: ListKind): Promise<string[]> {
  const cs = cloud();
  if (cs) {
    return new Promise((resolve) => {
      cs.getItem(KEYS[kind], (_err, value) => {
        if (value) {
          try {
            resolve(JSON.parse(value) as string[]);
            return;
          } catch {
            /* игнорируем битые данные */
          }
        }
        resolve(readLocal(kind));
      });
    });
  }
  return readLocal(kind);
}

export async function toggleInList(kind: ListKind, id: string): Promise<string[]> {
  const list = await getList(kind);
  const next = list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
  writeLocal(kind, next);
  cloud()?.setItem(KEYS[kind], JSON.stringify(next));
  return next;
}

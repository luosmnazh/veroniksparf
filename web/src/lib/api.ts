import type { AdvisorReply, ClarifyOption, Perfume } from '@veroniks/shared';

export interface PerfumeDto extends Perfume {
  imageUrl?: string | null;
}

export interface ListResponse {
  items: PerfumeDto[];
  total: number;
}

export interface SimilarDto {
  perfume: PerfumeDto;
  matchPercent: number;
  commonNotes: string[];
  commonNotesRu: string[];
}

export interface MetaDto {
  families: string[];
  accords: string[];
  notes: { name: string; count: number }[];
  total: number;
}

export interface AutocompleteItem {
  id: string;
  name: string;
  brand: string;
}

export interface ConfigDto {
  restricted: boolean;
  advisorEngine: 'rules' | 'llm';
  quickPrompts: ClarifyOption[];
}

export type AdvisorReplyDto = AdvisorReply & {
  picks: (AdvisorReply['picks'][number] & { matchedNotesRu: string[] })[];
};

const KEY_STORAGE = 'veroniks:key';

export function getAccessKey(): string | null {
  try {
    return localStorage.getItem(KEY_STORAGE);
  } catch {
    return null;
  }
}

export function setAccessKey(key: string): void {
  try {
    localStorage.setItem(KEY_STORAGE, key);
  } catch {
    /* приватный режим */
  }
}

/** Ошибка доступа: клуб закрыт, а пользователь не подтверждён. */
export class AuthError extends Error {}

function authHeaders(): Record<string, string> {
  const headers: Record<string, string> = {};
  const initData = window.Telegram?.WebApp?.initData;
  if (initData) headers['X-Telegram-Init-Data'] = initData;
  const key = getAccessKey();
  if (key) headers['X-Veroniks-Key'] = key;
  return headers;
}

async function request<T>(url: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { ...authHeaders(), ...(init.headers as Record<string, string> | undefined) },
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string; code?: string } | null;
    if (res.status === 401 && body?.code === 'auth') {
      window.dispatchEvent(new CustomEvent('veroniks:auth-required'));
      throw new AuthError(body.error ?? 'Нужен вход через Telegram');
    }
    throw new Error(body?.error ?? `Ошибка запроса (${res.status})`);
  }
  return res.json() as Promise<T>;
}

const post = <T>(url: string, body: unknown) =>
  request<T>(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

export const api = {
  config: () => request<ConfigDto>('/api/config'),
  meta: () => request<MetaDto>('/api/meta'),
  perfumes: (params: Record<string, string | number | undefined>) => {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== '') qs.set(k, String(v));
    }
    return request<ListResponse>(`/api/perfumes?${qs}`);
  },
  perfume: (id: string) => request<PerfumeDto>(`/api/perfumes/${encodeURIComponent(id)}`),
  similar: (id: string) => request<SimilarDto[]>(`/api/similar?id=${encodeURIComponent(id)}`),
  autocomplete: (q: string) =>
    request<AutocompleteItem[]>(`/api/autocomplete?q=${encodeURIComponent(q)}`),
  advisor: (message: string, context?: string) =>
    post<AdvisorReplyDto>('/api/advisor', { message, context }),
  accessKey: (initData: string) => post<{ key: string }>('/api/auth/key', { initData }),
};

/**
 * Получение ключа доступа:
 * — из ссылки «Открыть в браузере» (?key=…),
 * — или обменом initData, если приложение открыто в Telegram.
 */
export async function bootstrapAccess(): Promise<void> {
  const url = new URL(window.location.href);
  const fromUrl = url.searchParams.get('key');
  if (fromUrl) {
    setAccessKey(fromUrl);
    url.searchParams.delete('key');
    window.history.replaceState(null, '', url.pathname + url.search + url.hash);
  }
  const initData = window.Telegram?.WebApp?.initData;
  if (initData && !getAccessKey()) {
    try {
      const { key } = await api.accessKey(initData);
      setAccessKey(key);
    } catch {
      /* открытый режим или бот не настроен — не страшно */
    }
  }
}

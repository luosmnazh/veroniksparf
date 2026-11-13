import type { Perfume } from '@veroniks/shared';

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

async function get<T>(url: string): Promise<T> {
  const headers: Record<string, string> = {};
  const initData = window.Telegram?.WebApp?.initData;
  if (initData) headers['X-Telegram-Init-Data'] = initData;
  const res = await fetch(url, { headers });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? `Ошибка запроса (${res.status})`);
  }
  return res.json() as Promise<T>;
}

export const api = {
  meta: () => get<MetaDto>('/api/meta'),
  perfumes: (params: Record<string, string | number | undefined>) => {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== '') qs.set(k, String(v));
    }
    return get<ListResponse>(`/api/perfumes?${qs}`);
  },
  perfume: (id: string) => get<PerfumeDto>(`/api/perfumes/${encodeURIComponent(id)}`),
  similar: (id: string) => get<SimilarDto[]>(`/api/similar?id=${encodeURIComponent(id)}`),
  autocomplete: (q: string) =>
    get<AutocompleteItem[]>(`/api/autocomplete?q=${encodeURIComponent(q)}`),
};

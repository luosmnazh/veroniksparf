import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { GENDER_RU, noteRu, OCCASIONS, SEASONS } from '@veroniks/shared';
import { api, type MetaDto, type PerfumeDto } from '../lib/api';
import { PageHeader } from '../components/PageHeader';
import { PerfumeListItem } from '../components/PerfumeListItem';
import './LibraryPage.css';

const PAGE = 30;

interface Filters {
  gender: string;
  season: string;
  occasion: string;
  family: string;
  accord: string;
  note: string;
  excludeNote: string;
  sort: 'rating' | 'year' | 'name';
}

const EMPTY: Filters = {
  gender: '',
  season: '',
  occasion: '',
  family: '',
  accord: '',
  note: '',
  excludeNote: '',
  sort: 'rating',
};

export function LibraryPage() {
  const [q, setQ] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  const [filters, setFilters] = useState<Filters>(EMPTY);
  const [showFilters, setShowFilters] = useState(false);
  const [meta, setMeta] = useState<MetaDto | null>(null);
  const [items, setItems] = useState<PerfumeDto[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sentinel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q), 300);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    api.meta().then(setMeta).catch(() => {});
  }, []);

  const params = useMemo(
    () => ({
      q: debouncedQ || undefined,
      gender: filters.gender || undefined,
      season: filters.season || undefined,
      occasion: filters.occasion || undefined,
      family: filters.family || undefined,
      accord: filters.accord || undefined,
      note: filters.note || undefined,
      excludeNote: filters.excludeNote || undefined,
      sort: filters.sort,
    }),
    [debouncedQ, filters],
  );

  const loadPage = useCallback(
    async (offset: number) => {
      setLoading(true);
      setError(null);
      try {
        const res = await api.perfumes({ ...params, offset, limit: PAGE });
        setTotal(res.total);
        setItems((prev) => (offset === 0 ? res.items : [...prev, ...res.items]));
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Ошибка загрузки');
      } finally {
        setLoading(false);
      }
    },
    [params],
  );

  useEffect(() => {
    setItems([]);
    loadPage(0);
  }, [loadPage]);

  // бесконечная прокрутка
  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const io = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting && !loading && items.length < total) {
        loadPage(items.length);
      }
    });
    io.observe(el);
    return () => io.disconnect();
  }, [items.length, total, loading, loadPage]);

  const set = (patch: Partial<Filters>) => setFilters((f) => ({ ...f, ...patch }));
  const activeCount = Object.entries(filters).filter(
    ([k, v]) => k !== 'sort' && v !== '',
  ).length;

  return (
    <main className="page">
      <PageHeader title="Библиотека" subtitle={meta ? `${meta.total} досье в архиве` : 'архив клуба'} />

      <input
        className="input"
        type="search"
        placeholder="Название, бренд или нота…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        aria-label="Поиск"
      />

      <div className="lib__chips">
        {(['male', 'female', 'unisex'] as const).map((g) => (
          <button
            key={g}
            className={`chip${filters.gender === g ? ' chip--active' : ''}`}
            onClick={() => set({ gender: filters.gender === g ? '' : g })}
          >
            {GENDER_RU[g]}
          </button>
        ))}
        {SEASONS.map((s) => (
          <button
            key={s}
            className={`chip${filters.season === s ? ' chip--active' : ''}`}
            onClick={() => set({ season: filters.season === s ? '' : s })}
          >
            {s}
          </button>
        ))}
        <button
          className={`chip${showFilters || activeCount > 0 ? ' chip--active' : ''}`}
          onClick={() => setShowFilters((v) => !v)}
        >
          Фильтры{activeCount ? ` · ${activeCount}` : ''}
        </button>
      </div>

      {showFilters && meta && (
        <div className="panel lib__filters rise">
          <label className="lib__filter">
            <span className="label">Семейство</span>
            <select
              className="input"
              value={filters.family}
              onChange={(e) => set({ family: e.target.value })}
            >
              <option value="">любое</option>
              {meta.families.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
          </label>
          <label className="lib__filter">
            <span className="label">Повод</span>
            <select
              className="input"
              value={filters.occasion}
              onChange={(e) => set({ occasion: e.target.value })}
            >
              <option value="">любой</option>
              {OCCASIONS.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
          </label>
          <label className="lib__filter">
            <span className="label">Аккорд</span>
            <select
              className="input"
              value={filters.accord}
              onChange={(e) => set({ accord: e.target.value })}
            >
              <option value="">любой</option>
              {meta.accords.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </label>
          <label className="lib__filter">
            <span className="label">Содержит ноту</span>
            <select
              className="input"
              value={filters.note}
              onChange={(e) => set({ note: e.target.value })}
            >
              <option value="">неважно</option>
              {meta.notes.slice(0, 120).map((n) => (
                <option key={n.name} value={n.name}>
                  {noteRu(n.name)} ({n.count})
                </option>
              ))}
            </select>
          </label>
          <label className="lib__filter">
            <span className="label">Без ноты</span>
            <select
              className="input"
              value={filters.excludeNote}
              onChange={(e) => set({ excludeNote: e.target.value })}
            >
              <option value="">неважно</option>
              {meta.notes.slice(0, 120).map((n) => (
                <option key={n.name} value={n.name}>
                  {noteRu(n.name)} ({n.count})
                </option>
              ))}
            </select>
          </label>
          <label className="lib__filter">
            <span className="label">Сортировка</span>
            <select
              className="input"
              value={filters.sort}
              onChange={(e) => set({ sort: e.target.value as Filters['sort'] })}
            >
              <option value="rating">по рейтингу</option>
              <option value="year">по году</option>
              <option value="name">А–Я</option>
            </select>
          </label>
          {activeCount > 0 && (
            <button className="btn btn--ghost" onClick={() => setFilters({ ...EMPTY, sort: filters.sort })}>
              Сбросить фильтры
            </button>
          )}
        </div>
      )}

      <div className="lib__list">
        {items.map((p) => (
          <PerfumeListItem key={p.id} perfume={p} />
        ))}
      </div>

      {error && <div className="panel">{error}</div>}
      {loading && <div className="lib__status label">Листаем архив…</div>}
      {!loading && items.length === 0 && !error && (
        <div className="panel">По такому запросу в архиве пусто. Попробуйте иначе.</div>
      )}
      <div ref={sentinel} style={{ height: 1 }} />
    </main>
  );
}

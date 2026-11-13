import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api, type AutocompleteItem, type PerfumeDto, type SimilarDto } from '../lib/api';
import { PageHeader } from '../components/PageHeader';
import { PerfumeListItem } from '../components/PerfumeListItem';
import './SimilarPage.css';

export function SimilarPage() {
  const { id } = useParams<{ id?: string }>();
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [options, setOptions] = useState<AutocompleteItem[]>([]);
  const [target, setTarget] = useState<PerfumeDto | null>(null);
  const [results, setResults] = useState<SimilarDto[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const blurTimer = useRef<number>();

  // автодополнение
  useEffect(() => {
    if (!q.trim() || (target && q === `${target.brand} ${target.name}`)) {
      setOptions([]);
      return;
    }
    const t = setTimeout(() => {
      api.autocomplete(q).then(setOptions).catch(() => setOptions([]));
    }, 250);
    return () => clearTimeout(t);
  }, [q, target]);

  // загрузка похожих по id из URL
  useEffect(() => {
    if (!id) {
      setTarget(null);
      setResults(null);
      return;
    }
    setLoading(true);
    setError(null);
    Promise.all([api.perfume(id), api.similar(id)])
      .then(([p, sim]) => {
        setTarget(p);
        setQ(`${p.brand} ${p.name}`);
        setResults(sim);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [id]);

  const choose = (opt: AutocompleteItem) => {
    setOptions([]);
    navigate(`/similar/${opt.id}`);
  };

  return (
    <main className="page">
      <PageHeader title="Похожие" subtitle="найдём достойную замену" />

      <div className="similar__search">
        <input
          className="input"
          type="search"
          placeholder="Введите аромат, например Aventus…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onBlur={() => {
            blurTimer.current = window.setTimeout(() => setOptions([]), 200);
          }}
          onFocus={() => window.clearTimeout(blurTimer.current)}
          aria-label="Какой аромат взять за образец"
        />
        {options.length > 0 && (
          <div className="similar__options panel">
            {options.map((o) => (
              <button key={o.id} className="similar__option" onClick={() => choose(o)}>
                <span className="similar__option-name">{o.name}</span>
                <span className="similar__option-brand">{o.brand}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {loading && <div className="label similar__status">Сверяем досье…</div>}
      {error && <div className="panel">{error}</div>}

      {target && results && !loading && (
        <>
          <div className="label similar__heading">
            Похожие на {target.brand} {target.name}
          </div>
          {results.length === 0 && (
            <div className="panel">Достойных аналогов в архиве пока нет.</div>
          )}
          {results.map((r) => (
            <PerfumeListItem
              key={r.perfume.id}
              perfume={r.perfume}
              badge={`${r.matchPercent}%`}
              extra={
                r.commonNotesRu.length
                  ? `Общие ноты: ${r.commonNotesRu.slice(0, 5).join(', ')}`
                  : undefined
              }
            />
          ))}
        </>
      )}

      {!target && !loading && !error && (
        <div className="panel">
          Назовите аромат — подберу ему достойную компанию из архива клуба.
        </div>
      )}
    </main>
  );
}

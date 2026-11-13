import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { GENDER_RU } from '@veroniks/shared';
import { api, type PerfumeDto } from '../lib/api';
import { AccordBars } from '../components/AccordBars';
import { Pyramid } from '../components/Pyramid';
import { getList, toggleInList, type ListKind } from '../lib/favorites';
import './PerfumePage.css';

export function PerfumePage() {
  const { id } = useParams<{ id: string }>();
  const [p, setP] = useState<PerfumeDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [inFavorites, setInFavorites] = useState(false);
  const [inWardrobe, setInWardrobe] = useState(false);

  useEffect(() => {
    if (!id) return;
    setP(null);
    setError(null);
    api.perfume(id).then(setP).catch((e) => setError(e.message));
    getList('favorites').then((l) => setInFavorites(l.includes(id)));
    getList('wardrobe').then((l) => setInWardrobe(l.includes(id)));
  }, [id]);

  const toggle = async (kind: ListKind) => {
    if (!id) return;
    window.Telegram?.WebApp?.HapticFeedback?.impactOccurred('light');
    const list = await toggleInList(kind, id);
    if (kind === 'favorites') setInFavorites(list.includes(id));
    else setInWardrobe(list.includes(id));
  };

  const share = async () => {
    if (!p) return;
    const url = window.location.href;
    try {
      if (navigator.share) {
        await navigator.share({ title: `${p.brand} — ${p.name}`, url });
      } else {
        await navigator.clipboard.writeText(url);
        alert('Ссылка скопирована');
      }
    } catch {
      /* пользователь отменил */
    }
  };

  if (error) {
    return (
      <main className="page">
        <div className="panel">{error}</div>
      </main>
    );
  }
  if (!p) {
    return (
      <main className="page">
        <div className="label" style={{ textAlign: 'center', padding: 24 }}>
          Достаём досье…
        </div>
      </main>
    );
  }

  return (
    <main className="page">
      <article className="dossier perfume rise">
        <div className="label label--ink">Досье № {p.id}</div>
        <h1 className="perfume__name">{p.name}</h1>
        <div className="perfume__brand">
          {p.brand}
          {p.year ? ` · ${p.year}` : ''}
        </div>

        <div className="perfume__tags">
          <span className="tag">{GENDER_RU[p.gender]}</span>
          {p.family && <span className="tag">{p.family}</span>}
          {p.rating != null && (
            <span className="tag">
              ★ {p.rating.toFixed(1)}
              {p.votes ? ` · ${p.votes.toLocaleString('ru-RU')} голосов` : ''}
            </span>
          )}
        </div>

        {p.description && <p className="perfume__description">{p.description}</p>}

        <hr className="rule" />
        <div className="label label--ink">Пирамида</div>
        <Pyramid top={p.notesTop} heart={p.notesHeart} base={p.notesBase} />

        {p.accords.length > 0 && (
          <>
            <hr className="rule" />
            <div className="label label--ink">Аккорды</div>
            <AccordBars accords={p.accords} />
          </>
        )}

        <hr className="rule" />
        <div className="perfume__tags">
          <span className="label label--ink">Сезон:</span>
          {p.seasons.map((s) => (
            <span key={s} className="tag">
              {s}
            </span>
          ))}
        </div>
        <div className="perfume__tags">
          <span className="label label--ink">Повод:</span>
          {p.occasions.map((o) => (
            <span key={o} className="tag">
              {o}
            </span>
          ))}
        </div>

        <div className="perfume__actions">
          <Link to={`/similar/${p.id}`} className="btn btn--brass">
            Похожие
          </Link>
          <button className={`btn${inFavorites ? ' btn--bordeaux' : ''}`} onClick={() => toggle('favorites')}>
            {inFavorites ? '♥ В избранном' : '♡ В избранное'}
          </button>
          <button className={`btn${inWardrobe ? ' btn--bordeaux' : ''}`} onClick={() => toggle('wardrobe')}>
            {inWardrobe ? '✓ В гардеробе' : 'В гардероб'}
          </button>
          <button className="btn btn--ghost" onClick={share}>
            Поделиться
          </button>
          {p.fragranticaUrl && (
            <a className="btn btn--ghost" href={p.fragranticaUrl} target="_blank" rel="noreferrer">
              Открыть на Fragrantica ↗
            </a>
          )}
        </div>
      </article>
    </main>
  );
}

import { Link } from 'react-router-dom';
import { GENDER_RU, noteRu } from '@veroniks/shared';
import type { PerfumeDto } from '../lib/api';
import './PerfumeListItem.css';

interface Props {
  perfume: PerfumeDto;
  /** Дополнительная строка, например «Совпадение 78% · ананас, берёза». */
  extra?: string;
  badge?: string;
}

export function PerfumeListItem({ perfume: p, extra, badge }: Props) {
  const topNotes = [...p.notesBase, ...p.notesHeart, ...p.notesTop].slice(0, 3).map(noteRu);
  return (
    <Link to={`/p/${p.id}`} className="pitem dossier rise">
      <div className="pitem__head">
        <div>
          <div className="label label--ink">
            {p.brand}
            {p.year ? ` · ${p.year}` : ''}
          </div>
          <h3 className="pitem__name">{p.name}</h3>
        </div>
        {badge ? (
          <span className="pitem__badge">{badge}</span>
        ) : p.rating != null ? (
          <span className="pitem__rating">★ {p.rating.toFixed(1)}</span>
        ) : null}
      </div>
      <div className="pitem__meta">
        <span className="tag">{GENDER_RU[p.gender]}</span>
        {p.family && <span className="tag">{p.family}</span>}
        {topNotes.map((n) => (
          <span key={n} className="tag tag--note">
            {n}
          </span>
        ))}
      </div>
      {extra && <div className="pitem__extra">{extra}</div>}
    </Link>
  );
}

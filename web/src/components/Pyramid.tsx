import { noteRu } from '@veroniks/shared';
import './Pyramid.css';

interface Props {
  top: string[];
  heart: string[];
  base: string[];
}

const TIERS = [
  { key: 'top', title: 'Верхние ноты', clip: 'polygon(50% 0, 72% 100%, 28% 100%)' },
  { key: 'heart', title: 'Сердце', clip: 'polygon(28% 0, 72% 0, 88% 100%, 12% 100%)' },
  { key: 'base', title: 'База', clip: 'polygon(12% 0, 88% 0, 100% 100%, 0 100%)' },
] as const;

export function Pyramid({ top, heart, base }: Props) {
  const notesByTier = { top, heart, base };
  return (
    <div className="pyramid">
      {TIERS.map((tier, i) => {
        const notes = notesByTier[tier.key];
        return (
          <div
            key={tier.key}
            className="pyramid__row"
            /* раскрытие снизу вверх: база появляется первой */
            style={{ animationDelay: `${(TIERS.length - 1 - i) * 0.14}s` }}
          >
            <div className="pyramid__shape-col">
              <div className={`pyramid__shape pyramid__shape--${tier.key}`} style={{ clipPath: tier.clip }} />
            </div>
            <div className="pyramid__notes-col">
              <div className="label label--ink">{tier.title}</div>
              <div className="pyramid__notes">
                {notes.length === 0 ? (
                  <span className="pyramid__empty">—</span>
                ) : (
                  notes.map((n) => (
                    <span key={n} className="tag">
                      {noteRu(n)}
                    </span>
                  ))
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

import type { Accord } from '@veroniks/shared';
import './AccordBars.css';

/** Цвета по смыслу аккорда; остальным — латунь. */
const ACCORD_COLORS: Record<string, string> = {
  цитрусовый: '#d9a62e',
  фруктовый: '#c0612f',
  сладкий: '#a8552e',
  ванильный: '#c89b62',
  гурманский: '#8a4a26',
  карамельный: '#b06a2c',
  шоколадный: '#5d3a21',
  кофейный: '#4e342a',
  древесный: '#6b4f31',
  удовый: '#53391f',
  дымный: '#4a443c',
  ладанный: '#5a5248',
  табачный: '#6e4b2a',
  кожаный: '#59331f',
  смолистый: '#705426',
  пряный: '#92492a',
  'тёплый пряный': '#8c3f24',
  'свежий пряный': '#5c7a4a',
  свежий: '#4f7d6b',
  водный: '#3f6f7d',
  морской: '#2f5f72',
  озоновый: '#5f7f8c',
  зелёный: '#4c6b3c',
  ароматический: '#5a7050',
  мятный: '#3f7a5e',
  лавандовый: '#6c6391',
  цветочный: '#9a5f74',
  белоцветочный: '#b08f8f',
  розовый: '#a24d64',
  ирисовый: '#7a6a8a',
  фиалковый: '#6d5e86',
  пудровый: '#a98f84',
  мускусный: '#8d7d6b',
  амбровый: '#9c6f3a',
  землистый: '#5e4f3a',
  минеральный: '#6d6d64',
  мшистый: '#4e5c38',
  хвойный: '#3c5a40',
  миндальный: '#a98558',
  ореховый: '#8a6a44',
  вишнёвый: '#7c2733',
  ромовый: '#7c4a22',
  чайный: '#7a6c42',
};

export function AccordBars({ accords }: { accords: Accord[] }) {
  const sorted = [...accords].sort((a, b) => b.weight - a.weight);
  return (
    <div className="accords">
      {sorted.map((a) => (
        <div key={a.name} className="accords__row">
          <div
            className="accords__bar"
            style={{
              width: `${Math.round(30 + a.weight * 70)}%`,
              background: ACCORD_COLORS[a.name] ?? 'var(--brass-dim)',
            }}
          >
            <span className="accords__name">{a.name}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

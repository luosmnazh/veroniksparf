import { Monogram } from '../components/Monogram';
import { AccordBars } from '../components/AccordBars';
import { Pyramid } from '../components/Pyramid';
import './StyleguidePage.css';

const SWATCHES = [
  ['Racing green deep', '#14231B'],
  ['Racing green', '#1E3328'],
  ['Латунь', '#C9A45C'],
  ['Бордо', '#6E1F1F'],
  ['Кремовая бумага', '#EFE6D2'],
  ['Тёмная кожа', '#2A1D16'],
] as const;

export function StyleguidePage() {
  return (
    <main className="page">
      <header className="sg__header">
        <Monogram size={64} />
        <h1>Veroniks</h1>
        <div className="label">дизайн-система клуба</div>
      </header>

      <section className="sg__section">
        <h2>Палитра</h2>
        <div className="sg__swatches">
          {SWATCHES.map(([name, hex]) => (
            <div key={hex} className="sg__swatch">
              <div className="sg__swatch-color" style={{ background: hex }} />
              <div className="sg__swatch-name">{name}</div>
              <div className="label">{hex}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="sg__section">
        <h2>Типографика</h2>
        <div className="dossier">
          <h1>Заголовок Playfair</h1>
          <h3>Подзаголовок досье</h3>
          <p>Основной текст набран шрифтом Inter: читается легко даже на холоде.</p>
          <div className="label label--ink">Моноширинная метка досье</div>
        </div>
      </section>

      <section className="sg__section">
        <h2>Кнопки</h2>
        <div className="sg__row">
          <button className="btn">Обычная</button>
          <button className="btn btn--brass">Латунная</button>
          <button className="btn btn--bordeaux">Бордо</button>
          <button className="btn btn--ghost">Призрак</button>
        </div>
      </section>

      <section className="sg__section">
        <h2>Теги и чипы</h2>
        <div className="sg__row">
          <span className="tag tag--dark">зима</span>
          <span className="tag tag--dark">вечер</span>
          <button className="chip">чип</button>
          <button className="chip chip--active">активный чип</button>
        </div>
      </section>

      <section className="sg__section">
        <h2>Карточка-досье с пирамидой</h2>
        <div className="dossier">
          <div className="label label--ink">Досье № creed-aventus</div>
          <h3>Aventus</h3>
          <Pyramid
            top={['pineapple', 'bergamot', 'black currant']}
            heart={['birch', 'patchouli', 'rose']}
            base={['musk', 'oakmoss', 'vanilla']}
          />
          <hr className="rule" />
          <div className="label label--ink">Аккорды</div>
          <AccordBars
            accords={[
              { name: 'фруктовый', weight: 0.9 },
              { name: 'дымный', weight: 0.7 },
              { name: 'древесный', weight: 0.6 },
              { name: 'мускусный', weight: 0.5 },
            ]}
          />
        </div>
      </section>
    </main>
  );
}

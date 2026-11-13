import { PageHeader } from '../components/PageHeader';
import './AdvisorPage.css';

/**
 * Фаза 3: здесь появится чат с советником на движке правил.
 * Пока — визитная карточка персоны, чтобы вкладка не пустовала.
 */
export function AdvisorPage() {
  return (
    <main className="page">
      <PageHeader title="Советник" subtitle="владелец клуба на месте" />
      <div className="dossier advisor__card rise">
        <div className="label label--ink">Записка от владельца</div>
        <p className="advisor__quote">
          «Добрый вечер. Кабинет советника откроется со дня на день — я как раз
          заканчиваю раскладывать ароматы по полкам. Пока осмотритесь в библиотеке:
          поиск, фильтры и похожие ароматы уже к вашим услугам.»
        </p>
        <p className="advisor__sign">— V.</p>
      </div>
    </main>
  );
}

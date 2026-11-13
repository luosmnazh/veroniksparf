import { useEffect, useState } from 'react';
import { api, type PerfumeDto } from '../lib/api';
import { PageHeader } from '../components/PageHeader';
import { PerfumeListItem } from '../components/PerfumeListItem';
import { getList, type ListKind } from '../lib/favorites';
import './FavoritesPage.css';

export function FavoritesPage() {
  const [kind, setKind] = useState<ListKind>('favorites');
  const [items, setItems] = useState<PerfumeDto[] | null>(null);

  useEffect(() => {
    setItems(null);
    getList(kind).then(async (ids) => {
      const loaded = await Promise.all(
        ids.map((id) => api.perfume(id).catch(() => null)),
      );
      setItems(loaded.filter((p): p is PerfumeDto => p !== null));
    });
  }, [kind]);

  return (
    <main className="page">
      <PageHeader title="Избранное" subtitle="личная коллекция" />

      <div className="fav__tabs">
        <button
          className={`chip${kind === 'favorites' ? ' chip--active' : ''}`}
          onClick={() => setKind('favorites')}
        >
          Хочу попробовать
        </button>
        <button
          className={`chip${kind === 'wardrobe' ? ' chip--active' : ''}`}
          onClick={() => setKind('wardrobe')}
        >
          Мой гардероб
        </button>
      </div>

      {items === null && <div className="label fav__status">Открываем сейф…</div>}
      {items !== null && items.length === 0 && (
        <div className="panel">
          {kind === 'favorites'
            ? 'Пока пусто. Отмечайте ароматы сердцем в карточке — они появятся здесь.'
            : 'Гардероб пуст. В карточке аромата нажмите «В гардероб», если он у вас уже есть.'}
        </div>
      )}
      {items?.map((p) => <PerfumeListItem key={p.id} perfume={p} />)}
    </main>
  );
}

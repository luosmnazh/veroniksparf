import { useEffect, useState } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { BottomNav } from './components/BottomNav';
import { Monogram } from './components/Monogram';
import { bootstrapAccess } from './lib/api';
import { AdvisorPage } from './pages/AdvisorPage';
import { FavoritesPage } from './pages/FavoritesPage';
import { LibraryPage } from './pages/LibraryPage';
import { PerfumePage } from './pages/PerfumePage';
import { SimilarPage } from './pages/SimilarPage';
import { StyleguidePage } from './pages/StyleguidePage';

const ROOT_PATHS = ['/library', '/advisor', '/similar', '/favorites'];

function ClosedClub() {
  return (
    <main className="page closed">
      <div className="dossier closed__card rise">
        <Monogram size={72} />
        <h1>Клуб закрыт</h1>
        <p>
          Veroniks — клуб для своих. Откройте приложение через бота{' '}
          <a href="https://t.me/veroniksparfbot">@veroniksparfbot</a> в Telegram.
        </p>
        <p className="label label--ink">Если вас пригласили — попросите владельца добавить ваш ID.</p>
      </div>
    </main>
  );
}

export function App() {
  const navigate = useNavigate();
  const location = useLocation();
  const [ready, setReady] = useState(false);
  const [locked, setLocked] = useState(false);

  useEffect(() => {
    bootstrapAccess().finally(() => setReady(true));
    const onAuth = () => setLocked(true);
    window.addEventListener('veroniks:auth-required', onAuth);
    return () => window.removeEventListener('veroniks:auth-required', onAuth);
  }, []);

  // deep link из Telegram: startapp=p_<id>
  useEffect(() => {
    const start = window.Telegram?.WebApp?.initDataUnsafe?.start_param;
    if (start?.startsWith('p_')) navigate(`/p/${start.slice(2)}`, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // кнопка «Назад» в Telegram
  useEffect(() => {
    const tg = window.Telegram?.WebApp;
    if (!tg) return;
    const onBack = () => navigate(-1);
    if (ROOT_PATHS.includes(location.pathname)) {
      tg.BackButton.hide();
    } else {
      tg.BackButton.show();
      tg.BackButton.onClick(onBack);
    }
    return () => tg.BackButton.offClick(onBack);
  }, [location.pathname, navigate]);

  if (!ready) return null;
  if (locked) return <ClosedClub />;

  return (
    <>
      <Routes>
        <Route path="/" element={<Navigate to="/advisor" replace />} />
        <Route path="/library" element={<LibraryPage />} />
        <Route path="/advisor" element={<AdvisorPage />} />
        <Route path="/similar" element={<SimilarPage />} />
        <Route path="/similar/:id" element={<SimilarPage />} />
        <Route path="/favorites" element={<FavoritesPage />} />
        <Route path="/p/:id" element={<PerfumePage />} />
        <Route path="/styleguide" element={<StyleguidePage />} />
        <Route path="*" element={<Navigate to="/advisor" replace />} />
      </Routes>
      <BottomNav />
    </>
  );
}

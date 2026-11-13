import { useEffect } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { BottomNav } from './components/BottomNav';
import { AdvisorPage } from './pages/AdvisorPage';
import { FavoritesPage } from './pages/FavoritesPage';
import { LibraryPage } from './pages/LibraryPage';
import { PerfumePage } from './pages/PerfumePage';
import { SimilarPage } from './pages/SimilarPage';
import { StyleguidePage } from './pages/StyleguidePage';

export function App() {
  const navigate = useNavigate();
  const location = useLocation();

  // deep link из Telegram: startapp=p_<id>
  useEffect(() => {
    const start = window.Telegram?.WebApp?.initDataUnsafe?.start_param;
    if (start?.startsWith('p_')) {
      navigate(`/p/${start.slice(2)}`, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Кнопка «Назад» в Telegram
  useEffect(() => {
    const tg = window.Telegram?.WebApp;
    if (!tg) return;
    const isRoot = ['/library', '/advisor', '/similar', '/favorites'].includes(location.pathname);
    const onBack = () => navigate(-1);
    if (isRoot) {
      tg.BackButton.hide();
    } else {
      tg.BackButton.show();
      tg.BackButton.onClick(onBack);
    }
    return () => tg.BackButton.offClick(onBack);
  }, [location.pathname, navigate]);

  return (
    <>
      <Routes>
        <Route path="/" element={<Navigate to="/library" replace />} />
        <Route path="/library" element={<LibraryPage />} />
        <Route path="/advisor" element={<AdvisorPage />} />
        <Route path="/similar" element={<SimilarPage />} />
        <Route path="/similar/:id" element={<SimilarPage />} />
        <Route path="/favorites" element={<FavoritesPage />} />
        <Route path="/p/:id" element={<PerfumePage />} />
        <Route path="/styleguide" element={<StyleguidePage />} />
        <Route path="*" element={<Navigate to="/library" replace />} />
      </Routes>
      <BottomNav />
    </>
  );
}

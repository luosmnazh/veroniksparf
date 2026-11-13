import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import '@fontsource/playfair-display/cyrillic-700.css';
import '@fontsource/playfair-display/latin-700.css';
import '@fontsource/inter/cyrillic-400.css';
import '@fontsource/inter/cyrillic-600.css';
import '@fontsource/inter/latin-400.css';
import '@fontsource/inter/latin-600.css';
import '@fontsource/jetbrains-mono/cyrillic-500.css';
import '@fontsource/jetbrains-mono/latin-500.css';
import './styles/tokens.css';
import './styles/base.css';
import { App } from './App';
import { api } from './lib/api';

const tg = window.Telegram?.WebApp;
if (tg) {
  tg.ready();
  tg.expand();
  try {
    tg.setHeaderColor('#14231B');
    tg.setBackgroundColor('#14231B');
  } catch {
    /* старые клиенты Telegram */
  }
}

/**
 * Прогрев офлайн-кэша: первые страницы библиотеки в том же виде,
 * в каком их запрашивает LibraryPage, плюс справочники фильтров.
 */
function warmOfflineCache() {
  if (!('serviceWorker' in navigator) || !navigator.onLine) return;
  const run = async () => {
    await navigator.serviceWorker.ready;
    for (const offset of [0, 30, 60, 90]) {
      await api.perfumes({ sort: 'rating', offset, limit: 30 }).catch(() => undefined);
    }
    await api.meta().catch(() => undefined);
    await api.config().catch(() => undefined);
  };
  const idle = (window as Window & { requestIdleCallback?: (cb: () => void) => void })
    .requestIdleCallback;
  setTimeout(() => (idle ? idle(() => void run()) : void run()), 3000);
}
warmOfflineCache();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
);

import { NavLink } from 'react-router-dom';
import './BottomNav.css';

const TABS = [
  {
    to: '/advisor',
    title: 'Советник',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M4 6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H9l-4 4v-4H6a2 2 0 0 1-2-2z" />
        <path d="M8 9h8M8 12h5" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    to: '/library',
    title: 'Библиотека',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M4 5a1 1 0 0 1 1-1h3v16H5a1 1 0 0 1-1-1z" />
        <path d="M10 4h4v16h-4z" />
        <path d="M16 5l4 1-3.2 14.6L13 19.4z" />
      </svg>
    ),
  },
  {
    to: '/similar',
    title: 'Похожие',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <circle cx="9" cy="12" r="5" />
        <circle cx="15" cy="12" r="5" />
      </svg>
    ),
  },
  {
    to: '/favorites',
    title: 'Избранное',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M12 20s-7-4.6-9.2-9A5.2 5.2 0 0 1 12 6.4 5.2 5.2 0 0 1 21.2 11C19 15.4 12 20 12 20z" />
      </svg>
    ),
  },
];

export function BottomNav() {
  return (
    <nav className="bottom-nav">
      {TABS.map((t) => (
        <NavLink
          key={t.to}
          to={t.to}
          className={({ isActive }) => `bottom-nav__item${isActive ? ' bottom-nav__item--active' : ''}`}
          onClick={() => window.Telegram?.WebApp?.HapticFeedback?.selectionChanged()}
        >
          <span className="bottom-nav__icon">{t.icon}</span>
          <span className="bottom-nav__title">{t.title}</span>
        </NavLink>
      ))}
    </nav>
  );
}

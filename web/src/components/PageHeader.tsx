import { Monogram } from './Monogram';
import './PageHeader.css';

export function PageHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <header className="page-header">
      <Monogram size={40} />
      <div>
        <h1 className="page-header__title">{title}</h1>
        {subtitle && <div className="label">{subtitle}</div>}
      </div>
    </header>
  );
}

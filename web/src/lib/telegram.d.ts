interface TelegramWebApp {
  initData: string;
  initDataUnsafe: { start_param?: string };
  ready(): void;
  expand(): void;
  openLink(url: string): void;
  setHeaderColor(color: string): void;
  setBackgroundColor(color: string): void;
  BackButton: {
    show(): void;
    hide(): void;
    onClick(cb: () => void): void;
    offClick(cb: () => void): void;
  };
  HapticFeedback?: {
    impactOccurred(style: 'light' | 'medium' | 'heavy'): void;
    selectionChanged(): void;
  };
  CloudStorage?: {
    getItem(key: string, cb: (err: string | null, value?: string) => void): void;
    setItem(key: string, value: string, cb?: (err: string | null, ok?: boolean) => void): void;
  };
}

interface Window {
  Telegram?: { WebApp?: TelegramWebApp };
}

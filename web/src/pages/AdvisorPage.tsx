import { useEffect, useState } from 'react';
import { QUICK_PROMPTS, type ClarifyOption } from '@veroniks/shared';
import { api, type AdvisorReplyDto } from '../lib/api';
import { PageHeader } from '../components/PageHeader';
import { PerfumeListItem } from '../components/PerfumeListItem';
import './AdvisorPage.css';

type ChatItem =
  | { role: 'user'; text: string }
  | { role: 'advisor'; reply: AdvisorReplyDto; context: string }
  | { role: 'error'; text: string };

const GREETING =
  'Добрый вечер. Опишите, чего хочется, — «тёплое и дымное на зимний вечер» или «как Aventus, но дешевле». Остальное — моя забота.';

const STORAGE = 'veroniks:chat';

function loadChat(): ChatItem[] {
  try {
    const raw = sessionStorage.getItem(STORAGE);
    return raw ? (JSON.parse(raw) as ChatItem[]) : [];
  } catch {
    return [];
  }
}

export function AdvisorPage() {
  const [items, setItems] = useState<ChatItem[]>(loadChat);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [quick, setQuick] = useState<ClarifyOption[]>(QUICK_PROMPTS);

  useEffect(() => {
    api.config().then((c) => setQuick(c.quickPrompts)).catch(() => {});
  }, []);

  useEffect(() => {
    try {
      sessionStorage.setItem(STORAGE, JSON.stringify(items.slice(-20)));
    } catch {
      /* не критично */
    }
    if (items.length || busy) {
      // до конца страницы: нижний отступ страницы уже учитывает поле ввода и навигацию
      requestAnimationFrame(() =>
        window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'smooth' }),
      );
    }
  }, [items, busy]);

  async function send(message: string, context?: string) {
    const text = message.trim();
    if (!text || busy) return;
    window.Telegram?.WebApp?.HapticFeedback?.impactOccurred('light');
    setItems((prev) => [...prev, { role: 'user', text }]);
    setInput('');
    setBusy(true);
    try {
      const reply = await api.advisor(text, context);
      setItems((prev) => [
        ...prev,
        { role: 'advisor', reply, context: context ? `${context}, ${text}` : text },
      ]);
    } catch (e) {
      setItems((prev) => [
        ...prev,
        { role: 'error', text: e instanceof Error ? e.message : 'Что-то пошло не так.' },
      ]);
    } finally {
      setBusy(false);
    }
  }

  const last = items[items.length - 1];

  return (
    <main className="page advisor">
      <PageHeader title="Советник" subtitle="владелец клуба на месте" />

      <div className="advisor__chat">
        <div className="advisor__bubble advisor__bubble--host rise">{GREETING}</div>

        {items.map((it, i) => {
          if (it.role === 'user') {
            return (
              <div key={i} className="advisor__bubble advisor__bubble--user rise">
                {it.text}
              </div>
            );
          }
          if (it.role === 'error') {
            return (
              <div key={i} className="advisor__bubble advisor__bubble--host rise">
                {it.text}
              </div>
            );
          }
          const isLast = i === items.length - 1;
          return (
            <div key={i} className="advisor__answer rise">
              <div className="advisor__bubble advisor__bubble--host">{it.reply.text}</div>
              {it.reply.picks.map((p) => (
                <div key={p.perfume.id} className="advisor__pick">
                  <PerfumeListItem perfume={p.perfume} extra={p.reason} />
                </div>
              ))}
              {it.reply.clarify && (
                <div className="advisor__clarify">
                  <div className="label">{it.reply.clarify.question}</div>
                  <div className="advisor__options">
                    {it.reply.clarify.options.map((o) => (
                      <button
                        key={o.label}
                        className="chip"
                        disabled={!isLast || busy}
                        onClick={() => send(o.value, it.context)}
                      >
                        {o.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {busy && <div className="advisor__typing label">Владелец задумчиво перебирает флаконы…</div>}
      </div>

      <div className="advisor__composer">
        {(!last || last.role !== 'advisor' || !last.reply.clarify) && (
          <div className="advisor__quick">
            {quick.map((q) => (
              <button key={q.label} className="chip" disabled={busy} onClick={() => send(q.value)}>
                {q.label}
              </button>
            ))}
          </div>
        )}
        <form
          className="advisor__form"
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
        >
          <input
            className="input"
            placeholder="Чего изволите?"
            value={input}
            maxLength={500}
            onChange={(e) => setInput(e.target.value)}
            aria-label="Запрос советнику"
          />
          <button className="btn btn--brass" type="submit" disabled={busy || !input.trim()}>
            ➤
          </button>
        </form>
      </div>
    </main>
  );
}

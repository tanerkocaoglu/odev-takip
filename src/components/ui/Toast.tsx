/**
 * Geri bildirim (toast) — kısa, kendiliğinden kaybolan işlem sonucu.
 * Kalıcı hata/uyarı için `InlineNotice` veya `FormError` kullanılır; toast
 * yalnızca "oldu" bilgisi ve geçici hatalar içindir.
 * Ekran okuyucuya `aria-live` bölgesiyle iletilir; hata toast'ı 7 sn, diğerleri 4 sn.
 */

import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { CircleAlert, CircleCheck, Info, X } from 'lucide-react';
import { cx } from './cx';
import { ToastContext, type ToastApi, type ToastTone } from './toastContext';

interface ToastItem {
  id: number;
  tone: ToastTone;
  message: string;
}

const STYLE: Record<ToastTone, { icon: typeof Info; cls: string }> = {
  success: { icon: CircleCheck, cls: 'text-success' },
  error: { icon: CircleAlert, cls: 'text-danger' },
  info: { icon: Info, cls: 'text-info' },
};

let nextId = 1;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const dismiss = useCallback((id: number) => {
    setItems((list) => list.filter((t) => t.id !== id));
  }, []);

  const push = useCallback(
    (tone: ToastTone, message: string) => {
      const id = nextId++;
      setItems((list) => [...list.slice(-2), { id, tone, message }]);
      window.setTimeout(() => dismiss(id), tone === 'error' ? 7000 : 4000);
    },
    [dismiss],
  );

  const api = useMemo<ToastApi>(
    () => ({
      success: (m) => push('success', m),
      error: (m) => push('error', m),
      info: (m) => push('info', m),
    }),
    [push],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        role="status"
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-0 z-[60] flex flex-col items-center gap-2 px-4 pb-[calc(1rem+env(safe-area-inset-bottom))]"
      >
        {items.map((t) => {
          const { icon: Icon, cls } = STYLE[t.tone];
          return (
            <div
              key={t.id}
              className="toast-in pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-md border border-border bg-surface p-3 shadow-float"
            >
              <Icon size={18} aria-hidden="true" className={cx('mt-px shrink-0', cls)} />
              <p className="min-w-0 flex-1 text-sm text-text">{t.message}</p>
              <button
                type="button"
                onClick={() => dismiss(t.id)}
                aria-label="Bildirimi kapat"
                className="-m-2 flex h-11 w-11 shrink-0 items-center justify-center text-muted hover:text-text md:h-9 md:w-9"
              >
                <X size={16} aria-hidden="true" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

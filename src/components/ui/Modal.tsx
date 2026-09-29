/**
 * Modal — ortalanmış diyalog (dar ekranda kenarlara yakın, kaydırılabilir).
 * Odak tuzağı, Escape, odak geri dönüşü `useDialogBehavior`'dandır.
 * Başlık `aria-labelledby` ile bağlanır. Eylem düğmelerini çağıran taraf
 * `children` içinde, sağa hizalı bir satırla verir.
 */

import { useId, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { cx } from './cx';
import { useDialogBehavior } from './useDialogBehavior';

interface ModalProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  size?: 'md' | 'lg';
}

export default function Modal({ open, title, onClose, children, size = 'md' }: ModalProps) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useDialogBehavior(ref, open, onClose);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-[var(--backdrop)] p-3 sm:p-4 sm:pt-16"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={cx(
          'my-auto w-full rounded-lg border border-border bg-surface p-5 shadow-modal sm:my-0',
          size === 'lg' ? 'max-w-2xl' : 'max-w-md',
        )}
      >
        <div className="flex items-start justify-between gap-3">
          <h2 id={titleId} className="text-base font-semibold text-text">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Kapat"
            className="-mr-2 -mt-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-muted transition-colors hover:bg-subtle hover:text-text md:h-9 md:w-9"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>
        <div data-dialog-body className="mt-3">
          {children}
        </div>
      </div>
    </div>
  );
}

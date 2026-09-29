/**
 * Diyalog davranışı — Modal ve mobil çekmece TEK yerden kullanır:
 * - açılınca odak diyaloğun ilk odaklanabilir öğesine gider,
 * - Tab/Shift+Tab diyalog içinde döner (focus trap),
 * - Escape kapatır,
 * - kapanınca odak diyaloğu açan öğeye döner,
 * - açıkken arka plan kaymaz.
 */

import { useEffect, type RefObject } from 'react';

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function useDialogBehavior(
  ref: RefObject<HTMLElement | null>,
  open: boolean,
  onClose: () => void,
) {
  useEffect(() => {
    if (!open) return;
    const container = ref.current;
    if (!container) return;

    const opener = document.activeElement as HTMLElement | null;
    const focusables = () => Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE));

    // İlk odak: [data-autofocus] işaretli öğe; yoksa gövdedeki ilk odaklanabilir
    // öğe ([data-dialog-body], başlıktaki kapat düğmesi değil); yoksa kapsayıcı.
    const body = container.querySelector<HTMLElement>('[data-dialog-body]') ?? container;
    const first =
      container.querySelector<HTMLElement>('[data-autofocus]') ??
      body.querySelector<HTMLElement>(FOCUSABLE) ??
      container;
    first.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== 'Tab') return;
      const items = focusables();
      if (items.length === 0) {
        e.preventDefault();
        return;
      }
      const firstEl = items[0];
      const lastEl = items[items.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === firstEl || !container.contains(active))) {
        e.preventDefault();
        lastEl.focus();
      } else if (!e.shiftKey && (active === lastEl || !container.contains(active))) {
        e.preventDefault();
        firstEl.focus();
      }
    };
    document.addEventListener('keydown', onKey);

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
      if (opener && document.contains(opener)) opener.focus();
    };
    // onClose kimliği değişse de odak yeniden alınmasın diye bilinçli hariç.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, ref]);
}

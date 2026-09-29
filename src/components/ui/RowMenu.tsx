/**
 * Satır eylem menüsü ("⋯") — liste satırındaki tüm eylemleri tek desende toplar.
 *
 * - Açılır menü `document.body` altına portal edilir (tablo kapsayıcısının
 *   `overflow` kırpması menüyü kesmez); konum tetikleyiciden hesaplanır, altta yer
 *   yoksa yukarı açılır; kaydırma/yeniden boyutlandırmada kapanır.
 * - Klavye: tetikleyicide Enter/Boşluk/↓ açar (↑ sonuncuyu odaklar); menüde ↑/↓ gezer
 *   (devre dışı öğeler atlanır), Home/End, harf tuşu ilk eşleşene atlar, Escape ve Tab
 *   kapatır; kapanınca odak tetikleyiciye döner. Bir eylem seçilince de odak önce
 *   tetikleyiciye alınır (eylemin açtığı Modal odağı buraya geri verir).
 * - Dokunma: tetikleyici ve öğeler dar ekranda ≥ 44px.
 * - Yıkıcı eylem `danger: true` (danger tonu, üstte ayırıcı); onay/geri alma çağıran
 *   tarafın işidir (ConfirmDialog) — menü asla doğrudan silmez.
 */

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { MoreHorizontal, type LucideIcon } from 'lucide-react';
import { cx } from './cx';

export interface RowMenuItem {
  label: string;
  onSelect: () => void;
  danger?: boolean;
  disabled?: boolean;
  icon?: LucideIcon;
}

export function RowMenu({ label, items }: { label: string; items: RowMenuItem[] }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const focusOnOpen = useRef<'first' | 'last'>('first');
  const menuId = useId();

  const enabled = items.map((it, i) => (it.disabled ? -1 : i)).filter((i) => i >= 0);

  const close = useCallback((returnFocus = true) => {
    setOpen(false);
    setPos(null);
    if (returnFocus) triggerRef.current?.focus();
  }, []);

  // Konum: tetikleyici sağına hizalı, taşarsa yukarı / sola
  useLayoutEffect(() => {
    if (!open) return;
    const trigger = triggerRef.current;
    const menu = menuRef.current;
    if (!trigger || !menu) return;
    const r = trigger.getBoundingClientRect();
    const mw = menu.offsetWidth;
    const mh = menu.offsetHeight;
    let top = r.bottom + 4;
    if (top + mh > window.innerHeight - 8) top = Math.max(8, r.top - mh - 4);
    const left = Math.min(Math.max(8, r.right - mw), window.innerWidth - mw - 8);
    setPos({ top, left });
  }, [open]);

  // İlk odak
  useEffect(() => {
    if (!open || !pos) return;
    const target = focusOnOpen.current === 'last' ? enabled[enabled.length - 1] : enabled[0];
    if (target !== undefined) itemRefs.current[target]?.focus();
    // yalnızca konum hazır olunca bir kez
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, pos !== null]);

  // Dışarı tıklama / kaydırma / yeniden boyutlandırma kapatır
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (menuRef.current?.contains(t) || triggerRef.current?.contains(t)) return;
      close(false);
    };
    const onScroll = () => close(false);
    document.addEventListener('mousedown', onDown);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onScroll);
    return () => {
      document.removeEventListener('mousedown', onDown);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onScroll);
    };
  }, [open, close]);

  function focusIndex(i: number) {
    itemRefs.current[i]?.focus();
  }

  function onMenuKeyDown(e: React.KeyboardEvent) {
    const current = itemRefs.current.findIndex((el) => el === document.activeElement);
    const pos = enabled.indexOf(current);
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      focusIndex(enabled[(pos + 1) % enabled.length]);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      focusIndex(enabled[(pos - 1 + enabled.length) % enabled.length]);
    } else if (e.key === 'Home') {
      e.preventDefault();
      focusIndex(enabled[0]);
    } else if (e.key === 'End') {
      e.preventDefault();
      focusIndex(enabled[enabled.length - 1]);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      close();
    } else if (e.key === 'Tab') {
      e.preventDefault();
      close();
    } else if (e.key.length === 1 && /\p{L}/u.test(e.key)) {
      const ch = e.key.toLocaleLowerCase('tr');
      const hit = enabled.find((i) => items[i].label.toLocaleLowerCase('tr').startsWith(ch));
      if (hit !== undefined) focusIndex(hit);
    }
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={`${label} için işlemler`}
        onClick={() => {
          focusOnOpen.current = 'first';
          setOpen((o) => !o);
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault();
            focusOnOpen.current = e.key === 'ArrowUp' ? 'last' : 'first';
            setOpen(true);
          }
        }}
        className="flex h-8 w-8 items-center justify-center rounded-md text-muted transition-colors hover:bg-subtle hover:text-text max-md:h-11 max-md:w-11"
      >
        <MoreHorizontal size={18} aria-hidden="true" />
      </button>

      {open &&
        createPortal(
          <div
            ref={menuRef}
            id={menuId}
            role="menu"
            aria-label={`${label} işlemleri`}
            onKeyDown={onMenuKeyDown}
            style={{
              position: 'fixed',
              top: pos?.top ?? 0,
              left: pos?.left ?? 0,
              visibility: pos ? 'visible' : 'hidden',
            }}
            className="z-50 min-w-48 rounded-md border border-border bg-surface py-1 shadow-float"
          >
            {items.map((item, i) => {
              const Icon = item.icon;
              const prevDanger = i > 0 && !items[i - 1].danger && item.danger;
              return (
                <div key={item.label}>
                  {prevDanger && <div role="separator" className="my-1 border-t border-border" />}
                  <button
                    ref={(el) => {
                      itemRefs.current[i] = el;
                    }}
                    type="button"
                    role="menuitem"
                    tabIndex={-1}
                    disabled={item.disabled}
                    onClick={() => {
                      close();
                      item.onSelect();
                    }}
                    className={cx(
                      'flex w-full items-center gap-2 px-3 text-left text-sm font-medium transition-colors disabled:opacity-50',
                      'h-9 max-md:h-11',
                      item.danger
                        ? 'text-danger hover:bg-danger/5 focus:bg-danger/5'
                        : 'text-text hover:bg-subtle focus:bg-subtle',
                    )}
                  >
                    {Icon && <Icon size={16} aria-hidden="true" className="shrink-0" />}
                    {item.label}
                  </button>
                </div>
              );
            })}
          </div>,
          document.body,
        )}
    </>
  );
}

/**
 * Müşteri yüzü kabuğu (öğrenci / veli) — telefon öncelikli.
 *
 * - Üstte 56px marka şeridi; sayfa kaydırılınca blur + kenarlık alır, aşağı
 *   kaydırınca gizlenir (yalnızca en üste yaklaşınca geri gelir).
 * - Altta tam genişlik sabit gezinme çubuğu (56px + iOS güvenli alan). İçerik alt
 *   boşluğu çubuk yüksekliğine göre `calc(5rem + env(safe-area-inset-bottom))`
 *   ayrılır → çubuk hiçbir kartı/yükleme alanını örtmez. Ekran klavyesi açıkken
 *   (`useKeyboardOpen`: metin alanı odakta) çubuk render edilmez.
 * - Kullanıcı bilgisi ve çıkış, "Hesap" sekmesinin arkasındaki alttan açılan
 *   diyalogtadır; odak tuzağı/Escape/odak geri dönüşü `useDialogBehavior`'dandır.
 */

import { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { BookOpen, FileText, LogOut, UserRound, X } from 'lucide-react';
import BrandLogo from '../BrandLogo';
import { useAuth } from '../../context/AuthContext';
import { useKeyboardOpen } from '../../hooks/useKeyboardOpen';
import { cx, useDialogBehavior } from '../ui';

const ROLE_LABELS: Record<string, string> = {
  student: 'Öğrenci',
  guardian: 'Veli',
};

export default function CustomerShell() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [scrolled, setScrolled] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const keyboardOpen = useKeyboardOpen();
  const accountRef = useRef<HTMLDivElement>(null);
  useDialogBehavior(accountRef, accountOpen, () => setAccountOpen(false));

  useEffect(() => {
    // Aşağı kaydırınca gizle; yalnızca kullanıcı en üste YAKLAŞINCA geri getir.
    // Küçük yukarı hareketler şeridi geri getirmez (isteğe göre davranış).
    // Histerezis: göster eşiği < gizle eşiği → sınırda zıplama olmaz.
    const REVEAL_AT = 96;
    const HIDE_AT = 140;
    let lastY = window.scrollY;
    let ticking = false;
    const update = () => {
      ticking = false;
      const y = window.scrollY;
      setScrolled(y > 8);
      if (y <= REVEAL_AT) {
        setHidden(false);
      } else if (y > HIDE_AT && y > lastY) {
        setHidden(true);
      }
      lastY = y;
    };
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      window.requestAnimationFrame(update);
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Hesap paneli açıkken üst şerit gizli kalmamalı.
  useEffect(() => {
    if (accountOpen) setHidden(false);
  }, [accountOpen]);

  const isStudent = user?.role === 'student';
  const navItem = isStudent
    ? { to: '/student', label: 'Ödevlerim', Icon: BookOpen }
    : { to: '/guardian', label: 'Raporlarım', Icon: FileText };
  const NavIcon = navItem.Icon;

  function handleLogout() {
    logout();
    navigate('/login', { replace: true });
  }

  return (
    <div className="min-h-dvh bg-bg">
      {/* Üst şerit: yalnızca marka. Başlangıçta saydam; kaydırılınca belirginleşir. */}
      <header
        data-testid="customer-topbar"
        className={cx(
          'fixed inset-x-0 top-0 z-30 transition-all duration-300',
          hidden ? '-translate-y-full' : 'translate-y-0',
          scrolled
            ? 'border-b border-border bg-surface/90 backdrop-blur-md'
            : 'border-b border-transparent bg-transparent',
        )}
      >
        <div className="mx-auto flex h-14 max-w-2xl items-center px-4 lg:max-w-5xl">
          <BrandLogo size="sm" />
        </div>
      </header>

      <main className="mx-auto w-full max-w-2xl px-4 pb-[calc(5rem+env(safe-area-inset-bottom))] pt-[4.5rem] lg:max-w-5xl">
        <Outlet />
      </main>

      {/* Alt gezinme çubuğu — 56px sekmeler + güvenli alan */}
      {!keyboardOpen && (
        <nav
          aria-label="Ana gezinme"
          className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-surface pb-[env(safe-area-inset-bottom)]"
        >
          <div className="mx-auto flex max-w-md">
            <NavLink
              to={navItem.to}
              className={({ isActive }) =>
                cx(
                  'flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-xs font-medium transition-colors',
                  isActive ? 'text-accent' : 'text-muted hover:text-text',
                )
              }
            >
              <NavIcon size={20} aria-hidden="true" />
              {navItem.label}
            </NavLink>
            <button
              type="button"
              onClick={() => setAccountOpen(true)}
              className="flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-xs font-medium text-muted transition-colors hover:text-text"
            >
              <UserRound size={20} aria-hidden="true" />
              Hesap
            </button>
          </div>
        </nav>
      )}

      {accountOpen && (
        <div className="fixed inset-x-0 top-0 z-40 flex h-dvh items-end justify-center sm:items-center">
          <button
            type="button"
            tabIndex={-1}
            aria-label="Menüyü kapat"
            onClick={() => setAccountOpen(false)}
            className="absolute inset-0 bg-[var(--backdrop)]"
          />
          <div
            ref={accountRef}
            role="dialog"
            aria-modal="true"
            aria-label="Hesap"
            tabIndex={-1}
            className="relative max-h-[85dvh] w-full max-w-md overflow-y-auto rounded-t-lg border border-border bg-surface px-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] pt-4 shadow-modal sm:rounded-lg"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-base font-semibold text-text">{user?.full_name}</p>
                <p className="text-sm text-muted">{user ? ROLE_LABELS[user.role] : ''}</p>
              </div>
              <button
                type="button"
                onClick={() => setAccountOpen(false)}
                aria-label="Kapat"
                className="-mr-2 -mt-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-muted transition-colors hover:bg-subtle hover:text-text"
              >
                <X size={18} aria-hidden="true" />
              </button>
            </div>
            <button
              type="button"
              onClick={handleLogout}
              className="mt-5 flex min-h-12 w-full items-center justify-center gap-2 rounded-md border border-danger/30 text-sm font-medium text-danger transition-colors hover:bg-danger/5"
            >
              <LogOut size={17} aria-hidden="true" />
              Çıkış yap
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

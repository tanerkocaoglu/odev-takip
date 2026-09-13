/**
 * Müşteri yüzü kabuğu (öğrenci / veli) — AppLayout'tan tamamen ayrı bir
 * mimari. Admin/öğretmenin "yatay şerit + sağda isim/çıkış" kalıbını bilinçli
 * olarak terk eder:
 *
 * - Üstte yalnızca marka; sayfa kaydırılınca beliren, blur arka planlı ince şerit.
 * - Altta sabit, büyük dokunma hedefli gezinme "dock"u (asıl kullanım mobil).
 * - Kullanıcı bilgisi ve çıkış, dock'taki "Hesap" sekmesinin arkasındaki
 *   alttan açılan panelde gizlidir.
 *
 * İçerik `.customer-face` kapsayıcısında yaşar: marka mavisi accent ve odak
 * halkası bu alana özgüdür.
 */

import { useEffect, useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { BookOpen, FileText, LogOut, UserRound, X } from 'lucide-react';
import BrandLogo from '../BrandLogo';
import { useAuth } from '../../context/AuthContext';

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

  useEffect(() => {
    if (!accountOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setAccountOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
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
    <div className="customer-face min-h-screen bg-bg">
      {/* Üst şerit: yalnızca marka. Başlangıçta tamamen saydam; sayfa
          kaydırılınca blur + kenarlık ile belirginleşir. */}
      <header
        data-testid="customer-topbar"
        className={
          'fixed inset-x-0 top-0 z-30 transition-all duration-300 ' +
          (hidden ? '-translate-y-full ' : 'translate-y-0 ') +
          (scrolled
            ? 'border-b border-border bg-surface/75 backdrop-blur-md'
            : 'border-b border-transparent bg-transparent')
        }
      >
        <div className="mx-auto flex h-20 max-w-2xl items-center justify-center px-4 lg:max-w-5xl">
          <BrandLogo className="h-16 w-auto object-contain" />
        </div>
      </header>

      <main className="mx-auto w-full max-w-2xl px-4 pb-36 pt-24 lg:max-w-5xl">{<Outlet />}</main>

      {/* Alt dock — mobil öncelikli, büyük dokunma hedefli gezinme. */}
      <nav className="fixed inset-x-0 bottom-0 z-30" aria-label="Ana gezinme">
        <div className="mx-auto max-w-md px-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
          <div className="flex items-stretch gap-1 rounded-2xl border border-border bg-surface/90 p-1.5 shadow-[var(--elevation-3)] backdrop-blur-md">
            <NavLink
              to={navItem.to}
              className={({ isActive }) =>
                'flex min-h-12 flex-1 flex-col items-center justify-center gap-0.5 rounded-xl text-xs font-medium transition-colors ' +
                (isActive
                  ? 'bg-accent/10 text-accent'
                  : 'text-muted hover:bg-bg hover:text-text')
              }
            >
              <NavIcon size={20} aria-hidden="true" />
              {navItem.label}
            </NavLink>
            <button
              type="button"
              onClick={() => setAccountOpen(true)}
              className="flex min-h-12 flex-1 flex-col items-center justify-center gap-0.5 rounded-xl text-xs font-medium text-muted transition-colors hover:bg-bg hover:text-text"
            >
              <UserRound size={20} aria-hidden="true" />
              Hesap
            </button>
          </div>
        </div>
      </nav>

      {accountOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Hesap"
          className="fixed inset-x-0 top-0 z-40 flex h-[100dvh] items-end justify-center sm:inset-0 sm:h-auto sm:items-center"
        >
          <button
            type="button"
            aria-label="Menüyü kapat"
            onClick={() => setAccountOpen(false)}
            className="absolute inset-0 bg-[rgba(22,32,42,0.35)]"
          />
          <div className="relative max-h-[85dvh] w-full max-w-md overflow-y-auto rounded-t-3xl border border-border bg-surface px-5 pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-3 shadow-[var(--elevation-4)] sm:rounded-2xl sm:pb-5 sm:pt-5">
            <span
              className="mx-auto mb-3 block h-1.5 w-10 rounded-full bg-border sm:hidden"
              aria-hidden="true"
            />
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-base font-semibold text-text">
                  {user?.full_name}
                </p>
                <p className="text-sm text-muted">
                  {user ? ROLE_LABELS[user.role] : ''}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setAccountOpen(false)}
                aria-label="Kapat"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted transition-colors hover:bg-bg hover:text-text"
              >
                <X size={18} aria-hidden="true" />
              </button>
            </div>
            <button
              type="button"
              onClick={handleLogout}
              className="mt-5 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-danger/30 text-sm font-medium text-danger transition-colors hover:bg-danger/5"
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

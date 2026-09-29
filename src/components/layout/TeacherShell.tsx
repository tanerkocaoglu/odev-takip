/**
 * Öğretmen kabuğu — mobil öncelikli üst navigasyon.
 *
 * - 56px üst şerit: marka solda, kullanıcı + çıkış sağda.
 * - Masaüstü (md+): sekmeler şeritte ortalanır.
 * - Mobil: şeridin altında yapışkan sekme çubuğu; her sekme ≥ 44px yüksekliğinde,
 *   kısa etiketle sığar ("Geçmiş"); tam ad ekran okuyucuya kalır.
 *
 * İçerik `admin-content` hook'u altında yaşar (satır hover şeridi).
 * Admin kabuğuyla aynı görsel dil: teal accent, aynı token'lar.
 */

import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { ClipboardCheck, History, LayoutDashboard, LogOut, type LucideIcon } from 'lucide-react';
import BrandLogo from '../BrandLogo';
import { useAuth } from '../../context/AuthContext';
import { Button, cx } from '../ui';

const ROLE_LABELS: Record<string, string> = {
  admin: 'Yönetici',
  teacher: 'Öğretmen',
};

const TABS: {
  to: string;
  label: string;
  /** Dar ekranda görünen kısa ad (yoksa `label`). */
  short?: string;
  end?: boolean;
  icon: LucideIcon;
}[] = [
  { to: '/teacher', label: 'Bu hafta', end: true, icon: LayoutDashboard },
  { to: '/teacher/reports/history', label: 'Geçmiş raporlarım', short: 'Geçmiş', icon: History },
  { to: '/teacher/submissions', label: 'Teslimler', icon: ClipboardCheck },
];

export default function TeacherShell() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  function handleLogout() {
    logout();
    navigate('/login', { replace: true });
  }

  return (
    <div className="min-h-dvh bg-bg">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between gap-3 px-4">
          <Link to="/teacher" className="flex shrink-0 items-center">
            <BrandLogo size="sm" />
          </Link>

          {/* Masaüstü: satır içi sekmeler */}
          <nav aria-label="Öğretmen menüsü" className="hidden items-center gap-1 md:flex">
            {TABS.map(({ to, label, end, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                className={({ isActive }) =>
                  cx(
                    'flex h-9 items-center gap-2 whitespace-nowrap rounded-md px-3 text-sm font-medium transition-colors',
                    isActive
                      ? 'bg-accent/10 text-accent'
                      : 'text-muted hover:bg-subtle hover:text-text',
                  )
                }
              >
                <Icon size={17} aria-hidden="true" className="shrink-0" />
                {label}
              </NavLink>
            ))}
          </nav>

          {user && (
            <div className="flex shrink-0 items-center gap-2">
              <span className="hidden text-sm text-muted lg:inline">
                {user.full_name} · {ROLE_LABELS[user.role] ?? user.role}
              </span>
              <Button variant="ghost" size="sm" onClick={handleLogout} aria-label="Çıkış">
                <LogOut size={16} aria-hidden="true" />
                <span className="hidden sm:inline">Çıkış</span>
              </Button>
            </div>
          )}
        </div>
      </header>

      {/* Mobil sekme çubuğu — header'ın DIŞINDA (sticky kapsayıcı yeterince uzun olsun) */}
      <nav
        aria-label="Öğretmen menüsü"
        className="sticky top-0 z-30 flex border-b border-border bg-surface md:hidden"
      >
        {TABS.map(({ to, label, short, end, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            aria-label={label}
            className={({ isActive }) =>
              cx(
                'relative flex min-h-11 flex-1 items-center justify-center gap-2 px-2 text-sm font-medium transition-colors',
                isActive ? 'text-accent' : 'text-muted hover:text-text',
              )
            }
          >
            {({ isActive }) => (
              <>
                {isActive && (
                  <span
                    aria-hidden="true"
                    className="absolute inset-x-3 bottom-0 h-0.5 rounded-full bg-accent"
                  />
                )}
                <Icon size={17} aria-hidden="true" className="shrink-0" />
                <span aria-hidden="true">{short ?? label}</span>
              </>
            )}
          </NavLink>
        ))}
      </nav>

      <main className="admin-content mx-auto max-w-5xl px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}

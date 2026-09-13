/**
 * Öğretmen kabuğu — admin'in iç araç görsel diliyle paylaşılan üst navigasyon.
 *
 * Admin'den bilinçli fark: sol sabit dikey menü YOK. Öğretmen mobil öncelikli
 * olduğu için üst şerit korunur; sekmeler <md ekranda yatay kaydırılabilir
 * şeride döner ve dokunma hedefleri 44px'in altına inmez.
 *
 * İçerik `admin-content` hook'u altında yaşar; admin listelerindeki satır
 * hover'ı (zemin + solda ince accent şerit) öğretmen tablolarında da geçerlidir.
 * Renk/tipografi/marka admin ile aynı: global teal `--accent`, `h-20` şerit,
 * `h-16` logo.
 */

import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import {
  ClipboardCheck,
  History,
  LayoutDashboard,
  type LucideIcon,
} from 'lucide-react';
import BrandLogo from '../BrandLogo';
import { useAuth } from '../../context/AuthContext';

const ROLE_LABELS: Record<string, string> = {
  admin: 'Yönetici',
  teacher: 'Öğretmen',
};

const TABS: { to: string; label: string; end?: boolean; icon: LucideIcon }[] = [
  { to: '/teacher', label: 'Bu hafta', end: true, icon: LayoutDashboard },
  { to: '/teacher/reports/history', label: 'Geçmiş raporlarım', icon: History },
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
    <div className="min-h-screen bg-bg">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex h-20 max-w-5xl items-center justify-between gap-3 px-4">
          <Link
            to="/teacher"
            className="flex shrink-0 items-center transition-opacity hover:opacity-80"
          >
            <BrandLogo className="h-16 w-auto object-contain" />
          </Link>

          {/* Masaüstü: satır içi sekmeler */}
          <nav aria-label="Öğretmen menüsü" className="hidden items-center gap-1 md:flex">
            {TABS.map((tab) => {
              const Icon = tab.icon;
              return (
                <NavLink
                  key={tab.to}
                  to={tab.to}
                  end={tab.end}
                  className={({ isActive }) =>
                    'flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors ' +
                    (isActive
                      ? 'bg-accent/10 text-accent'
                      : 'text-muted hover:bg-bg hover:text-text')
                  }
                >
                  <Icon size={17} aria-hidden="true" className="shrink-0" />
                  {tab.label}
                </NavLink>
              );
            })}
          </nav>

          <div className="flex shrink-0 items-center gap-3">
            {user && (
              <>
                <span className="hidden text-sm text-muted sm:inline">
                  {user.full_name} · {ROLE_LABELS[user.role] ?? user.role}
                </span>
                <button
                  type="button"
                  onClick={handleLogout}
                  className="rounded-md border border-border px-3 py-1.5 text-sm font-medium text-text transition-colors hover:bg-bg"
                >
                  Çıkış
                </button>
              </>
            )}
          </div>
        </div>

        {/* Mobil: yatay kaydırılabilir sekme şeridi (dokunma hedefi ≥44px) */}
        <nav
          aria-label="Öğretmen menüsü"
          className="flex gap-1 overflow-x-auto border-t border-border px-2 md:hidden"
        >
          {TABS.map((tab) => {
            const Icon = tab.icon;
            return (
              <NavLink
                key={tab.to}
                to={tab.to}
                end={tab.end}
                className={({ isActive }) =>
                  'relative flex min-h-[44px] shrink-0 items-center gap-2 rounded-md px-4 text-sm font-medium transition-colors ' +
                  (isActive ? 'text-accent' : 'text-muted hover:text-text')
                }
              >
                {({ isActive }) => (
                  <>
                    {isActive && (
                      <span
                        aria-hidden="true"
                        className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-accent"
                      />
                    )}
                    <Icon size={17} aria-hidden="true" className="shrink-0" />
                    {tab.label}
                  </>
                )}
              </NavLink>
            );
          })}
        </nav>
      </header>

      <main className="admin-content mx-auto max-w-5xl px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}

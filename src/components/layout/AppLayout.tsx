import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import type { ReactNode } from 'react';
import BrandLogo from '../BrandLogo';
import { useAuth } from '../../context/AuthContext';

const ROLE_LABELS: Record<string, string> = {
  admin: 'Yönetici',
  teacher: 'Öğretmen',
  guardian: 'Veli',
  student: 'Öğrenci',
};

export default function AppLayout({ children }: { children?: ReactNode }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  function handleLogout() {
    logout();
    navigate('/login', { replace: true });
  }

  return (
    <div className="min-h-screen bg-bg">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex h-20 max-w-5xl items-center justify-between px-4">
          <Link to="/" className="flex items-center transition-opacity hover:opacity-80">
            <BrandLogo className="h-16 w-auto object-contain" />
          </Link>
          <nav className="flex items-center gap-4">
            {user?.role === 'admin' && (
              <NavLink
                to="/admin"
                className={({ isActive }) =>
                  isActive
                    ? 'text-sm font-medium text-accent'
                    : 'text-sm font-medium text-muted hover:text-text'
                }
              >
                Yönetim
              </NavLink>
            )}
            {user?.role === 'teacher' && (
              <NavLink
                to="/teacher"
                className={({ isActive }) =>
                  isActive
                    ? 'text-sm font-medium text-accent'
                    : 'text-sm font-medium text-muted hover:text-text'
                }
              >
                Bu hafta
              </NavLink>
            )}
            {user?.role === 'teacher' && (
              <NavLink
                to="/teacher/submissions"
                className={({ isActive }) =>
                  isActive
                    ? 'text-sm font-medium text-accent'
                    : 'text-sm font-medium text-muted hover:text-text'
                }
              >
                Teslimler
              </NavLink>
            )}
            {user?.role === 'student' && (
              <NavLink
                to="/student"
                className={({ isActive }) =>
                  isActive
                    ? 'text-sm font-medium text-accent'
                    : 'text-sm font-medium text-muted hover:text-text'
                }
              >
                Ödevlerim
              </NavLink>
            )}
            {user?.role === 'guardian' && (
              <NavLink
                to="/guardian"
                className={({ isActive }) =>
                  isActive
                    ? 'text-sm font-medium text-accent'
                    : 'text-sm font-medium text-muted hover:text-text'
                }
              >
                Raporlarım
              </NavLink>
            )}
            {user && (
              <>
                <span className="hidden text-sm text-muted sm:inline">
                  {user.full_name} · {ROLE_LABELS[user.role]}
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
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-6">
        {children ?? <Outlet />}
      </main>
    </div>
  );
}

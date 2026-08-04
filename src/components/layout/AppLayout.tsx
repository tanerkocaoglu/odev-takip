import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

const ROLE_LABELS: Record<string, string> = {
  admin: 'Yönetici',
  teacher: 'Öğretmen',
  guardian: 'Veli',
  student: 'Öğrenci',
};

export default function AppLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  function handleLogout() {
    logout();
    navigate('/login', { replace: true });
  }

  return (
    <div className="min-h-screen bg-bg">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
          <span className="text-sm font-semibold text-text">
            Dershane Ödev Takip
          </span>
          <nav className="flex items-center gap-4">
            <NavLink
              to="/"
              end
              className={({ isActive }) =>
                isActive
                  ? 'text-sm font-medium text-accent'
                  : 'text-sm font-medium text-muted hover:text-text'
              }
            >
              Ana sayfa
            </NavLink>
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
        <Outlet />
      </main>
    </div>
  );
}

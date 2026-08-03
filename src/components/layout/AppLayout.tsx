import { Outlet, NavLink } from 'react-router-dom';

const navItems = [
  { to: '/', label: 'Ana sayfa' },
  { to: '/login', label: 'Giriş' },
];

export default function AppLayout() {
  return (
    <div className="min-h-screen bg-bg">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
          <span className="text-sm font-semibold text-text">
            Dershane Ödev Takip
          </span>
          <nav className="flex items-center gap-4">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end
                className={({ isActive }) =>
                  isActive
                    ? 'text-sm font-medium text-accent'
                    : 'text-sm font-medium text-muted hover:text-text'
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}
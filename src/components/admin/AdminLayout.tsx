/**
 * Admin kabuğu (masaüstü öncelikli).
 * - lg ve üstü: sol sabit menü (marka, gruplu sekmeler, altta kullanıcı + çıkış).
 * - lg altı: menü GİZLİDİR; üstte yapışkan 56px çubuk (hamburger + marka) ve
 *   soldan açılan çekmece. Çekmece Modal ile aynı odak davranışını kullanır
 *   (`useDialogBehavior`: odak tuzağı, Escape, odak geri dönüşü).
 * Menü sırası kurulum sürecini izler: önce yapı, sonra kişiler, en sonda haftalık
 * döngü; "Panel" her zaman üstte. Rotalar/URL'ler değişmez; içerik
 * `<main class="admin-content">` içindedir (satır hover kuralı buna bağlı).
 */

import { useRef, useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import {
  BookOpen,
  CalendarDays,
  CalendarRange,
  ClipboardList,
  FileText,
  GraduationCap,
  LayoutDashboard,
  Layers,
  LogOut,
  Menu,
  School,
  Send,
  Shuffle,
  UserCog,
  Users,
  X,
  type LucideIcon,
} from 'lucide-react';
import BrandLogo from '../BrandLogo';
import { useAuth } from '../../context/AuthContext';
import { cx, useDialogBehavior } from '../ui';

const ROLE_LABELS: Record<string, string> = {
  admin: 'Yönetici',
  teacher: 'Öğretmen',
  guardian: 'Veli',
  student: 'Öğrenci',
};

interface NavItem {
  to: string;
  label: string;
  end?: boolean;
  icon: LucideIcon;
}

const NAV_GROUPS: { label: string | null; items: NavItem[] }[] = [
  {
    label: null,
    items: [{ to: '/admin', label: 'Panel', end: true, icon: LayoutDashboard }],
  },
  {
    label: 'Kurulum',
    items: [
      { to: '/admin/academic-years', label: 'Eğitim yılı', icon: CalendarRange },
      { to: '/admin/weeks', label: 'Haftalar', icon: CalendarDays },
      { to: '/admin/classes', label: 'Sınıflar', icon: Layers },
      { to: '/admin/courses', label: 'Dersler', icon: BookOpen },
      { to: '/admin/teachers', label: 'Öğretmenler', icon: UserCog },
      { to: '/admin/class-courses', label: 'Atamalar', icon: Shuffle },
    ],
  },
  {
    label: 'Kişiler',
    items: [
      { to: '/admin/schools', label: 'Okullar', icon: School },
      { to: '/admin/guardians', label: 'Veliler', icon: Users },
      { to: '/admin/students', label: 'Öğrenciler', icon: GraduationCap },
    ],
  },
  {
    label: 'Haftalık döngü',
    items: [
      { to: '/admin/reports', label: 'Raporlar', icon: FileText },
      { to: '/admin/digests', label: 'Gönderim', icon: Send },
      { to: '/admin/homework-summary', label: 'Ödev özeti', icon: ClipboardList },
    ],
  },
];

/** Menü gövdesi: kenar çubuğu ve çekmece aynı içeriği kullanır. */
function MenuBody({ touch, onNavigate }: { touch?: boolean; onNavigate?: () => void }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  function handleLogout() {
    logout();
    navigate('/login', { replace: true });
  }

  return (
    <>
      <nav aria-label="Yönetim menüsü" className="flex-1 overflow-y-auto px-3 py-3">
        {NAV_GROUPS.map((group, i) => (
          <div key={group.label ?? 'root'} className={i > 0 ? 'mt-4' : ''}>
            {group.label && (
              <p className="px-2.5 pb-1 text-xs font-medium text-muted">{group.label}</p>
            )}
            {group.items.map(({ to, label, end, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                onClick={onNavigate}
                className={({ isActive }) =>
                  cx(
                    'relative flex items-center gap-3 rounded-md px-2.5 text-sm font-medium transition-colors',
                    touch ? 'min-h-11' : 'min-h-9',
                    isActive
                      ? 'bg-accent/10 text-accent'
                      : 'text-muted hover:bg-subtle hover:text-text',
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    {isActive && (
                      <span
                        aria-hidden="true"
                        className="absolute bottom-1.5 left-0 top-1.5 w-0.5 rounded-full bg-accent"
                      />
                    )}
                    <Icon size={18} aria-hidden="true" className="shrink-0" />
                    <span className="truncate">{label}</span>
                  </>
                )}
              </NavLink>
            ))}
          </div>
        ))}
      </nav>

      {user && (
        <div className="border-t border-border p-3">
          <div className="px-2.5 pb-2">
            <p className="truncate text-sm font-medium text-text">{user.full_name}</p>
            <p className="text-xs text-muted">{ROLE_LABELS[user.role] ?? user.role}</p>
          </div>
          <button
            type="button"
            onClick={handleLogout}
            className={cx(
              'flex w-full items-center gap-3 rounded-md px-2.5 text-sm font-medium text-muted transition-colors hover:bg-subtle hover:text-text',
              touch ? 'min-h-11' : 'min-h-9',
            )}
          >
            <LogOut size={18} aria-hidden="true" className="shrink-0" />
            Çıkış
          </button>
        </div>
      )}
    </>
  );
}

/** Dar ekran çekmecesi — yalnızca açıkken render edilir. */
function Drawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useDialogBehavior(ref, open, onClose);
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 lg:hidden">
      <button
        type="button"
        tabIndex={-1}
        aria-label="Menüyü kapat"
        onClick={onClose}
        className="absolute inset-0 bg-[var(--backdrop)]"
      />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label="Yönetim menüsü"
        tabIndex={-1}
        className="drawer-in absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col bg-surface shadow-float"
      >
        <div className="flex h-14 shrink-0 items-center justify-between border-b border-border pl-4 pr-2">
          <BrandLogo size="sm" />
          <button
            type="button"
            onClick={onClose}
            aria-label="Menüyü kapat"
            className="flex h-11 w-11 items-center justify-center rounded-md text-muted transition-colors hover:bg-subtle hover:text-text"
          >
            <X size={20} aria-hidden="true" />
          </button>
        </div>
        <MenuBody touch onNavigate={onClose} />
      </div>
    </div>
  );
}

export default function AdminLayout() {
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <div className="min-h-screen bg-bg lg:flex">
      {/* Masaüstü kenar çubuğu */}
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-border bg-surface lg:flex">
        <div className="flex h-14 shrink-0 items-center border-b border-border px-4">
          <BrandLogo size="sm" />
        </div>
        <h2 className="sr-only">Yönetim</h2>
        <MenuBody />
      </aside>

      <div className="min-w-0 flex-1">
        {/* Dar ekran üst çubuğu */}
        <header className="sticky top-0 z-30 flex h-14 items-center gap-1 border-b border-border bg-surface px-2 lg:hidden">
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            aria-label="Menüyü aç"
            aria-expanded={drawerOpen}
            className="flex h-11 w-11 items-center justify-center rounded-md text-text transition-colors hover:bg-subtle"
          >
            <Menu size={20} aria-hidden="true" />
          </button>
          <BrandLogo size="sm" />
        </header>

        <main className="admin-content px-4 py-6 lg:px-8">
          <Outlet />
        </main>
      </div>

      <Drawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />
    </div>
  );
}

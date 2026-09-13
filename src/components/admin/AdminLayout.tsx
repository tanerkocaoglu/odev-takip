/**
 * Admin kabuğu — sol sabit dikey menü (desktop-first).
 * Üstte kurum/marka, ortada 12 sekme (ikon + etiket), altta kullanıcı + çıkış.
 * <lg ekranda menü ikon-only şeride daralır; etiketler gizlenir ama erişilebilir
 * ad (`aria-label`) korunur. Rotalar/URL'ler değişmez; içerik
 * `<main class="admin-content">` içindedir (satır hover kuralı buna bağlı).
 */

import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import {
  BookOpen,
  CalendarDays,
  CalendarRange,
  FileText,
  GraduationCap,
  LayoutDashboard,
  Layers,
  LogOut,
  School,
  Send,
  Shuffle,
  UserCog,
  Users,
  type LucideIcon,
} from 'lucide-react';
import BrandLogo from '../BrandLogo';
import { useAuth } from '../../context/AuthContext';

const ROLE_LABELS: Record<string, string> = {
  admin: 'Yönetici',
  teacher: 'Öğretmen',
  guardian: 'Veli',
  student: 'Öğrenci',
};

// Sıralama kurulum sürecini izler: önce yapı (eğitim yılı → haftalar →
// sınıf/ders → öğretmen → atama), sonra kişiler (okul → veli → öğrenci;
// öğrenci mevcut bir veliye bağlandığı için veli önce gelir), en sonda
// haftalık döngü (raporlar → veliye gönderim). Panel her zaman üstte.
const TABS: { to: string; label: string; end?: boolean; icon: LucideIcon }[] = [
  { to: '/admin', label: 'Panel', end: true, icon: LayoutDashboard },
  { to: '/admin/academic-years', label: 'Eğitim yılı', icon: CalendarRange },
  { to: '/admin/weeks', label: 'Haftalar', icon: CalendarDays },
  { to: '/admin/classes', label: 'Sınıflar', icon: Layers },
  { to: '/admin/courses', label: 'Dersler', icon: BookOpen },
  { to: '/admin/teachers', label: 'Öğretmenler', icon: UserCog },
  { to: '/admin/class-courses', label: 'Atamalar', icon: Shuffle },
  { to: '/admin/schools', label: 'Okullar', icon: School },
  { to: '/admin/guardians', label: 'Veliler', icon: Users },
  { to: '/admin/students', label: 'Öğrenciler', icon: GraduationCap },
  { to: '/admin/reports', label: 'Raporlar', icon: FileText },
  { to: '/admin/digests', label: 'Gönderim', icon: Send },
];

export default function AdminLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  function handleLogout() {
    logout();
    navigate('/login', { replace: true });
  }

  return (
    <div className="flex min-h-screen bg-bg">
      <aside className="sticky top-0 flex h-screen w-16 shrink-0 flex-col border-r border-border bg-surface lg:w-60">
        {/* Marka / kurum */}
        <div className="flex h-20 items-center justify-center border-b border-border px-0 lg:justify-start lg:px-4">
          {/* Geniş: contain (h-16); dar: kare merkez kırpma (cover) */}
          <BrandLogo className="h-16 w-16 shrink-0 object-cover lg:w-auto lg:object-contain" />
        </div>

        {/* Alan başlığı — <lg gizli ama ekran okuyucuda her zaman var */}
        <h1 className="sr-only lg:not-sr-only lg:px-4 lg:pb-1 lg:pt-3 lg:text-xs lg:font-semibold lg:uppercase lg:tracking-wide lg:text-muted">
          Yönetim
        </h1>

        <nav aria-label="Yönetim menüsü" className="flex-1 overflow-y-auto p-2">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            return (
              <NavLink
                key={tab.to}
                to={tab.to}
                end={tab.end}
                title={tab.label}
                aria-label={tab.label}
                className={({ isActive }) =>
                  'relative flex items-center justify-center gap-3 rounded-md px-2.5 py-2 text-sm font-medium transition-colors lg:justify-start ' +
                  (isActive
                    ? 'bg-accent/10 text-accent'
                    : 'text-muted hover:bg-bg hover:text-text')
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
                    <span className="hidden truncate lg:inline">{tab.label}</span>
                  </>
                )}
              </NavLink>
            );
          })}
        </nav>

        {/* Kullanıcı + çıkış */}
        <div className="border-t border-border p-2 lg:p-3">
          {user && (
            <>
              <div className="hidden px-1 pb-2 lg:block">
                <p className="truncate text-sm font-medium text-text">{user.full_name}</p>
                <p className="text-xs text-muted">{ROLE_LABELS[user.role] ?? user.role}</p>
              </div>
              <button
                type="button"
                onClick={handleLogout}
                title="Çıkış"
                aria-label="Çıkış"
                className="flex w-full items-center justify-center gap-3 rounded-md px-2.5 py-2 text-sm font-medium text-muted transition-colors hover:bg-bg hover:text-text lg:justify-start"
              >
                <LogOut size={18} aria-hidden="true" className="shrink-0" />
                <span className="hidden lg:inline">Çıkış</span>
              </button>
            </>
          )}
        </div>
      </aside>

      <main className="admin-content min-w-0 flex-1 px-4 py-6 lg:px-8">
        <Outlet />
      </main>
    </div>
  );
}

/**
 * Admin sekmeleri — /admin alt rotaları (yalnızca admin; App.tsx'te
 * ProtectedRoute roles={['admin']} ile korunur).
 */

import { NavLink, Outlet } from 'react-router-dom';
import {
  BookOpen,
  CalendarDays,
  CalendarRange,
  FileText,
  GraduationCap,
  LayoutDashboard,
  Layers,
  School,
  Send,
  Shuffle,
  UserCog,
  Users,
  type LucideIcon,
} from 'lucide-react';

const TABS: { to: string; label: string; end?: boolean; icon: LucideIcon }[] = [
  { to: '/admin', label: 'Panel', end: true, icon: LayoutDashboard },
  { to: '/admin/academic-years', label: 'Eğitim yılı', icon: CalendarRange },
  { to: '/admin/weeks', label: 'Haftalar', icon: CalendarDays },
  { to: '/admin/classes', label: 'Sınıflar', icon: Layers },
  { to: '/admin/courses', label: 'Dersler', icon: BookOpen },
  { to: '/admin/class-courses', label: 'Atamalar', icon: Shuffle },
  { to: '/admin/teachers', label: 'Öğretmenler', icon: UserCog },
  { to: '/admin/students', label: 'Öğrenciler', icon: GraduationCap },
  { to: '/admin/guardians', label: 'Veliler', icon: Users },
  { to: '/admin/schools', label: 'Okullar', icon: School },
  { to: '/admin/reports', label: 'Raporlar', icon: FileText },
  { to: '/admin/digests', label: 'Gönderim', icon: Send },
];

export default function AdminLayout() {
  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-text">Yönetim</h1>
      <nav className="flex flex-wrap gap-1 border-b border-border">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          return (
            <NavLink
              key={tab.to}
              to={tab.to}
              end={tab.end}
              className={({ isActive }) =>
                'inline-flex items-center gap-1.5 rounded-t-md border-b-2 px-3 py-2 text-sm font-medium transition-colors ' +
                (isActive
                  ? 'border-accent text-accent'
                  : 'border-transparent text-muted hover:text-text')
              }
            >
              <Icon size={15} aria-hidden="true" />
              {tab.label}
            </NavLink>
          );
        })}
      </nav>
      <main className="admin-content">
        <Outlet />
      </main>
    </div>
  );
}

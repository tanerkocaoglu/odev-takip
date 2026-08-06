/**
 * Admin sekmeleri — /admin alt rotaları (yalnızca admin; App.tsx'te
 * ProtectedRoute roles={['admin']} ile korunur).
 */

import { NavLink, Outlet } from 'react-router-dom';

const TABS = [
  { to: '/admin', label: 'Panel', end: true },
  { to: '/admin/academic-years', label: 'Eğitim yılı' },
  { to: '/admin/weeks', label: 'Haftalar' },
  { to: '/admin/classes', label: 'Sınıflar' },
  { to: '/admin/courses', label: 'Dersler' },
  { to: '/admin/class-courses', label: 'Atamalar' },
  { to: '/admin/teachers', label: 'Öğretmenler' },
  { to: '/admin/students', label: 'Öğrenciler' },
  { to: '/admin/guardians', label: 'Veliler' },
  { to: '/admin/schools', label: 'Okullar' },
  { to: '/admin/reports', label: 'Raporlar' },
  { to: '/admin/digests', label: 'Gönderim' },
];

export default function AdminLayout() {
  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-text">Yönetim</h1>
      <nav className="flex flex-wrap gap-1 border-b border-border">
        {TABS.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            end={tab.end}
            className={({ isActive }) =>
              'rounded-t-md border-b-2 px-3 py-2 text-sm font-medium transition-colors ' +
              (isActive
                ? 'border-accent text-accent'
                : 'border-transparent text-muted hover:text-text')
            }
          >
            {tab.label}
          </NavLink>
        ))}
      </nav>
      <main>
        <Outlet />
      </main>
    </div>
  );
}

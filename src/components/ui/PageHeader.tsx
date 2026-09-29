/**
 * Sayfa başlığı. `PageTitle` yalnızca başlık (sekme ikonuyla aynı ikon);
 * `PageHeader` başlık + açıklama + sağda eylemler.
 */

import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';

export function PageTitle({
  icon: Icon,
  children,
}: {
  icon?: LucideIcon;
  children: ReactNode;
}) {
  return (
    <h1 className="flex items-center gap-2 text-xl font-semibold text-text">
      {Icon && <Icon size={18} aria-hidden="true" className="shrink-0 text-muted" />}
      {children}
    </h1>
  );
}

export function PageHeader({
  icon,
  title,
  description,
  actions,
}: {
  icon?: LucideIcon;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <PageTitle icon={icon}>{title}</PageTitle>
        {description && <p className="mt-1 text-sm text-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

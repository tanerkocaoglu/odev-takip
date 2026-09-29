/**
 * Liste araç çubuğu — solda arama/filtreler, sağda eylemler (CSV, "Yeni …").
 * Dar ekranda alt alta yığılır; eylemler sarılır. Sayfa gövdesi yatay taşmaz.
 */

import type { ReactNode } from 'react';

export function Toolbar({ filters, actions }: { filters?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
      {filters && <div className="flex flex-wrap items-end gap-3">{filters}</div>}
      {actions && (
        <div className="flex flex-wrap items-center gap-2 lg:shrink-0 lg:flex-nowrap">
          {actions}
        </div>
      )}
    </div>
  );
}

/** Modal/form alt eylem satırı: sağa hizalı; dar ekranda tam genişlik, ana eylem üstte. */
export function FormActions({ children }: { children: ReactNode }) {
  return (
    <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">{children}</div>
  );
}

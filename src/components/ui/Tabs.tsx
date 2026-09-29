/**
 * Sekmeler — bölüm içi geçiş (sayfa değil). Aktif sekme accent alt çizgi;
 * dar ekranda yatay kayar. `aria-selected` durumu ekran okuyucuya iletir.
 */

import type { ReactNode } from 'react';
import { cx } from './cx';

export interface TabItem<T extends string> {
  id: T;
  label: string;
  /** Sayaç rozeti (ör. eksik rapor sayısı). */
  count?: number;
  icon?: ReactNode;
}

export function Tabs<T extends string>({
  items,
  value,
  onChange,
  label,
}: {
  items: TabItem<T>[];
  value: T;
  onChange: (id: T) => void;
  label: string;
}) {
  return (
    <div
      role="tablist"
      aria-label={label}
      className="-mb-px flex gap-1 overflow-x-auto border-b border-border [scrollbar-width:none]"
    >
      {items.map((t) => {
        const active = t.id === value;
        return (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(t.id)}
            className={cx(
              'relative inline-flex min-h-11 shrink-0 items-center gap-2 px-3 text-sm font-medium transition-colors md:min-h-10',
              active ? 'text-accent' : 'text-muted hover:text-text',
            )}
          >
            {t.icon}
            {t.label}
            {t.count !== undefined && (
              <span className="tabular rounded-full bg-subtle px-1.5 text-xs text-muted">
                {t.count}
              </span>
            )}
            {active && (
              <span
                aria-hidden="true"
                className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-accent"
              />
            )}
          </button>
        );
      })}
    </div>
  );
}

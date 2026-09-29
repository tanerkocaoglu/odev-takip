/**
 * Sekmeler — bölüm içi geçiş (sayfa değil). Aktif sekme accent alt çizgi;
 * dar ekranda yatay kayar. `aria-selected` durumu ekran okuyucuya iletir.
 */

import type { ReactNode } from 'react';
import { CountChip } from './CountChip';
import { cx } from './cx';

export interface TabItem<T extends string> {
  id: T;
  label: string;
  /** Dar ekranda (<640px) görünen kısa etiket; tam ad ekran okuyucuya (aria-label) kalır. */
  shortLabel?: string;
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
            aria-label={
              t.shortLabel ? `${t.label}${t.count !== undefined ? ` (${t.count})` : ''}` : undefined
            }
            onClick={() => onChange(t.id)}
            className={cx(
              'relative inline-flex min-h-11 shrink-0 items-center gap-1.5 px-2.5 sm:gap-2 sm:px-3 text-sm font-medium transition-colors md:min-h-10',
              active ? 'text-accent' : 'text-muted hover:text-text',
            )}
          >
            {t.icon && <span className={t.shortLabel ? 'max-sm:hidden' : undefined}>{t.icon}</span>}
            {t.shortLabel ? (
              <>
                <span className="sm:hidden">{t.shortLabel}</span>
                <span className="max-sm:hidden">{t.label}</span>
              </>
            ) : (
              t.label
            )}
            {t.count !== undefined && <CountChip value={t.count} />}
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

/**
 * Tablo yüzeyi. `TableCard` kenarlıklı kapsayıcıdır (yatay taşarsa kendi içinde
 * kayar); `th`/`td` sınıfları yoğunluğa göre verilir:
 * - compact: 13px metin, satır ≈ 36–40px (admin listeleri, rapor girişi)
 * - comfortable: 14px metin, satır ≈ 48px
 * Rakam sütunlarına `tabular` eklenir.
 */

import type { ReactNode } from 'react';
import { cx } from './cx';


export function TableCard({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cx('overflow-x-auto rounded-md border border-border bg-surface', className)}>
      {children}
    </div>
  );
}

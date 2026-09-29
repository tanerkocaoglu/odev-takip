/**
 * Etiketli yatay çip şeridi — dar ekranda filtre seçimi (sınıf, hafta, ders...).
 * Çipler (`FilterChip`) çocuk olarak verilir; şerit kenardan kenara kayar.
 */

import type { ReactNode } from 'react';

export function FilterChipRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="mb-2 text-[13px] font-medium text-muted">{label}</h2>
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
        {children}
      </div>
    </section>
  );
}

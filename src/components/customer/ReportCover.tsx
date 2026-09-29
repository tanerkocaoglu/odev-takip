/**
 * Rapor kapağı — öğrenci adı (h1) + hafta + sınıf + (varsa) gönderim tarihi.
 * Public ve girişli veli görünümü aynı kapağı kullanır; `variant` yalnızca üst
 * etiket metnini değiştirir. Düz beyaz kart: ekran görüntüsünde ve yazdırmada
 * okunaklı kalır (gradyan/renk zemin yok).
 */

import { BookOpen, CalendarDays } from 'lucide-react';
import type { DigestSnapshot } from '../../types';
import { formatDateIst } from '../../utils/date';
import { Card } from '../ui';

export default function ReportCover({
  snapshot,
  variant,
  sentAt,
}: {
  snapshot: DigestSnapshot;
  variant: 'guardian' | 'public';
  sentAt: string | null;
}) {
  return (
    <Card padding="lg" className="print:border-0 print:p-0">
      <header>
        <p className="text-[13px] font-medium text-muted">
          {variant === 'public' ? 'Haftalık ödev takip raporu' : 'Haftalık rapor'}
        </p>
        <h1 className="mt-1 text-2xl font-semibold text-text">{snapshot.student.name}</h1>
        <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-sm text-text">
          <li className="tabular inline-flex items-center gap-1.5">
            <CalendarDays size={15} aria-hidden="true" className="text-muted" />
            {snapshot.week.label}
          </li>
          <li className="inline-flex items-center gap-1.5">
            <BookOpen size={15} aria-hidden="true" className="text-muted" />
            {snapshot.class.name}
          </li>
        </ul>
        {sentAt && (
          <p className="tabular mt-3 text-[13px] text-muted">
            {formatDateIst(sentAt)} tarihinde gönderildi
          </p>
        )}
      </header>
    </Card>
  );
}

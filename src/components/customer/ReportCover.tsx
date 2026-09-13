/**
 * Rapor kapağı — öğrenci adı (h1) + hafta etiketi + sınıf + (varsa) gönderim
 * tarihi. Public ve girişli veli görünümü aynı kapağı kullanır; `variant`
 * yalnızca üst etiket metnini değiştirir.
 */

import { BookOpen, CalendarDays } from 'lucide-react';
import type { DigestSnapshot } from '../../types';

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
    <header className="brand-hero rounded-3xl border border-border px-5 py-6">
      <p className="text-xs font-semibold uppercase tracking-wide text-accent">
        {variant === 'public' ? 'Haftalık ödev takip raporu' : 'Haftalık rapor'}
      </p>
      <h1 className="mt-1 text-2xl font-semibold tracking-tight text-text">
        {snapshot.student.name}
      </h1>
      <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-surface px-2.5 py-1 font-medium text-text">
          <CalendarDays size={14} aria-hidden="true" />
          {snapshot.week.label}
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-surface px-2.5 py-1 font-medium text-text">
          <BookOpen size={14} aria-hidden="true" />
          {snapshot.class.name}
        </span>
      </div>
      {sentAt && (
        <p className="tabular mt-3 text-xs text-muted">
          {new Date(sentAt).toLocaleDateString('tr-TR')} tarihinde gönderildi
        </p>
      )}
    </header>
  );
}

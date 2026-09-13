/**
 * Ödev teslim geçmişi — yalnızca girişli veli detayında (public snapshot'ında
 * dosya yoktur). Ders başına ödev + teslim durumu + dosyalar; salt-okunur.
 */

import { BookOpen } from 'lucide-react';
import type { GuardianReportDetail } from '../../types';
import { formatDate } from '../../utils/date';
import SubmissionFileGrid from '../SubmissionFileGrid';

type SubmissionItem = GuardianReportDetail['submissions'][number];
type SubState = 'uploaded' | 'late' | 'missing';

const SUB_STRIPE: Record<SubState, string> = {
  uploaded: 'border-l-sub-uploaded',
  late: 'border-l-sub-late',
  missing: 'border-l-sub-missing',
};

const SUB_CHIP: Record<SubState, string> = {
  uploaded: 'bg-sub-uploaded/10 text-sub-uploaded',
  late: 'bg-sub-late/10 text-sub-late',
  missing: 'bg-sub-missing/10 text-sub-missing',
};

function subState(sub: SubmissionItem): SubState {
  if (!sub.submission) return 'missing';
  return sub.submission.is_late ? 'late' : 'uploaded';
}

function subLabel(sub: SubmissionItem): string {
  if (!sub.submission) return 'Yüklenmedi';
  if (sub.submission.is_late) return 'Geç yüklendi';
  if (sub.submission.status === 'reviewed') return 'İncelendi';
  return 'Yüklendi';
}

export default function SubmissionHistory({
  submissions,
  onOpenFile,
}: {
  submissions: GuardianReportDetail['submissions'];
  onOpenFile: (key: string) => void;
}) {
  return (
    <section>
      <h2 className="text-lg font-semibold text-text">Ödev teslim geçmişi</h2>
      <div className="mt-4 space-y-4">
        {submissions.map((sub) => {
          const state = subState(sub);
          const reviewed = sub.submission?.status === 'reviewed';
          const chip = reviewed ? 'bg-status-completed/10 text-status-completed' : SUB_CHIP[state];
          return (
            <article
              key={sub.course_name}
              data-status={state}
              className={
                'overflow-hidden rounded-2xl border border-border border-l-4 bg-surface p-4 elevation-1 ' +
                SUB_STRIPE[state]
              }
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="flex items-center gap-2 text-sm font-semibold text-text">
                  <BookOpen size={16} aria-hidden="true" className="shrink-0 text-accent" />
                  {sub.course_name}
                </h3>
                <span
                  className={
                    'inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ' +
                    chip
                  }
                >
                  {subLabel(sub)}
                </span>
              </div>
              <p className="mt-1 text-sm text-muted">
                Ödev: {sub.description || '—'}
                <span className="tabular"> · son tarih: {formatDate(sub.due_date)}</span>
              </p>
              {sub.submission && (
                <div className="mt-3">
                  <SubmissionFileGrid
                    variant="server"
                    files={sub.submission.files}
                    collapsible
                    onOpenPdf={onOpenFile}
                  />
                </div>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}

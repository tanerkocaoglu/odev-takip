/**
 * Ödev teslim geçmişi — yalnızca girişli veli detayında (public snapshot'ında
 * dosya yoktur). Ders başına ödev + teslim durumu + dosyalar; salt-okunur.
 */

import { BookOpen } from 'lucide-react';
import type { GuardianReportDetail } from '../../types';
import { formatDate } from '../../utils/date';
import { Badge, Card, type BadgeTone } from '../ui';
import HomeworkAttachments from '../HomeworkAttachments';
import SubmissionFileGrid from '../SubmissionFileGrid';

type SubmissionItem = GuardianReportDetail['submissions'][number];

function subBadge(sub: SubmissionItem): { tone: BadgeTone; label: string } {
  if (!sub.submission) return { tone: 'danger', label: 'Yüklenmedi' };
  if (sub.submission.is_late) return { tone: 'warning', label: 'Geç yüklendi' };
  if (sub.submission.status === 'reviewed') return { tone: 'info', label: 'İncelendi' };
  return { tone: 'positive', label: 'Yüklendi' };
}

function subState(sub: SubmissionItem): 'uploaded' | 'late' | 'missing' {
  if (!sub.submission) return 'missing';
  return sub.submission.is_late ? 'late' : 'uploaded';
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
      <div className="mt-3 space-y-3">
        {submissions.map((sub) => {
          const { tone, label } = subBadge(sub);
          return (
            <Card key={sub.course_name} data-status={subState(sub)} padding="md" className="break-inside-avoid">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="flex items-center gap-2 text-sm font-semibold text-text">
                  <BookOpen size={16} aria-hidden="true" className="shrink-0 text-muted" />
                  {sub.course_name}
                </h3>
                <Badge tone={tone}>{label}</Badge>
              </div>
              <p className="mt-1 text-sm text-muted">
                Ödev: {sub.description || '—'}
                <span className="tabular block text-[13px]">
                  Son tarih: {formatDate(sub.due_date)}
                </span>
              </p>
              {(sub.attachments ?? []).length > 0 && (
                <div className="mt-2">
                  <HomeworkAttachments attachments={sub.attachments ?? []} onOpen={onOpenFile} />
                </div>
              )}
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
            </Card>
          );
        })}
      </div>
    </section>
  );
}

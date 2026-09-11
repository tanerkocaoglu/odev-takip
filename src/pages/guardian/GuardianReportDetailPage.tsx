/**
 * Veli paneli — rapor detayı (spec.md §6 Veli).
 * `snapshot` (haftalık derslerin raporu, salt-okunur) + ödev teslim geçmişi.
 * Teslim dosyaları korumalı rotadan (Bearer token) açılır.
 */

import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { BookOpen, FileText } from 'lucide-react';
import type { GuardianReportDetail } from '../../types';
import { guardianApi, openProtectedFile, ApiClientError } from '../../services/api';
import ReportSnapshot from '../../components/ReportSnapshot';
import {
  LoadingState,
  EmptyState,
  FormError,
  PageTitle,
  Badge,
  type BadgeTone,
} from '../../components/admin/ui';

type SubmissionItem = GuardianReportDetail['submissions'][number];
type SubState = 'uploaded' | 'late' | 'missing';

/** Sol kenar şeridi — teslim durumundan türetilir (mevcut token'lar). */
const SUB_STRIPE: Record<SubState, string> = {
  uploaded: 'border-l-sub-uploaded',
  late: 'border-l-sub-late',
  missing: 'border-l-sub-missing',
};

function subState(sub: SubmissionItem): SubState {
  if (!sub.submission) return 'missing';
  return sub.submission.is_late ? 'late' : 'uploaded';
}

function subBadge(sub: SubmissionItem): { tone: BadgeTone; label: string } {
  if (!sub.submission) return { tone: 'danger', label: 'Yüklenmedi' };
  if (sub.submission.is_late) return { tone: 'warning', label: 'Geç yüklendi' };
  if (sub.submission.status === 'reviewed') return { tone: 'info', label: 'İncelendi' };
  return { tone: 'positive', label: 'Yüklendi' };
}

export default function GuardianReportDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<GuardianReportDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    guardianApi
      .report(id)
      .then((res) => {
        if (!cancelled) setData(res);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof ApiClientError ? err.message : 'Bir hata oluştu.');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  async function openFile(key: string) {
    try {
      await openProtectedFile(key);
    } catch (err) {
      window.alert(err instanceof ApiClientError ? err.message : 'Dosya açılamadı.');
    }
  }

  if (loading) return <LoadingState />;

  if (error) return <FormError message={error} />;

  if (!data) {
    return <EmptyState message="Rapor bulunamadı." />;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <PageTitle icon={FileText}>{data.digest.week.label} haftalık rapor</PageTitle>
        <span className="tabular text-sm text-muted">
          {new Date(data.digest.sent_at).toLocaleDateString('tr-TR')} tarihinde
          gönderildi
        </span>
      </div>

      <ReportSnapshot snapshot={data.snapshot} showStudent />

      <section>
        <h2 className="text-base font-semibold text-text">Ödev teslim geçmişi</h2>
        <div className="mt-3 space-y-3">
          {data.submissions.map((sub) => {
            const state = subState(sub);
            const badge = subBadge(sub);
            return (
              <div
                key={sub.course_name}
                data-status={state}
                className={
                  'elevation-1 rounded-md border border-border border-l-4 bg-surface p-4 ' +
                  SUB_STRIPE[state]
                }
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="flex items-center gap-2 text-sm font-semibold text-text">
                    <BookOpen size={16} aria-hidden="true" className="shrink-0 text-muted" />
                    {sub.course_name}
                  </h3>
                  <Badge tone={badge.tone}>{badge.label}</Badge>
                </div>
                <p className="mt-1 text-sm text-muted">
                  Ödev: {sub.description || '—'}
                  <span className="tabular"> · son tarih: {sub.due_date}</span>
                </p>
                {sub.submission && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {sub.submission.files.map((file) => (
                      <button
                        key={file.key}
                        type="button"
                        onClick={() => void openFile(file.key)}
                        className="rounded-md border border-border px-3 py-1.5 text-[13px] font-medium text-accent transition-colors hover:bg-bg"
                      >
                        {file.filename}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}

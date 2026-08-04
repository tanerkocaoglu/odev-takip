/**
 * Veli paneli — rapor detayı (spec.md §6 Veli).
 * `snapshot` (haftalık derslerin raporu, salt-okunur) + ödev teslim geçmişi.
 * Teslim dosyaları korumalı rotadan (Bearer token) açılır.
 */

import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import type { GuardianReportDetail } from '../../types';
import { guardianApi, openProtectedFile, ApiClientError } from '../../services/api';
import ReportSnapshot from '../../components/ReportSnapshot';
import { LoadingState, EmptyState, FormError } from '../../components/admin/ui';

const SUB_LABELS = {
  submitted: 'Yüklendi',
  reviewed: 'İncelendi',
} as const;

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
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-xl font-semibold text-text">
          {data.digest.week.label} haftalık rapor
        </h1>
        <span className="tabular text-sm text-muted">
          {new Date(data.digest.sent_at).toLocaleDateString('tr-TR')} tarihinde
          gönderildi
        </span>
      </div>

      <ReportSnapshot snapshot={data.snapshot} showStudent />

      <section>
        <h2 className="text-base font-semibold text-text">Ödev teslim geçmişi</h2>
        <div className="mt-3 space-y-3">
          {data.submissions.map((sub) => (
            <div
              key={sub.course_name}
              className="rounded-md border border-border bg-surface p-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-text">
                  {sub.course_name}
                </h3>
                {sub.submission ? (
                  <span
                    className={
                      'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ' +
                      (sub.submission.is_late
                        ? 'bg-att-late/10 text-att-late'
                        : 'bg-status-sent/10 text-status-sent')
                    }
                  >
                    {sub.submission.is_late
                      ? 'Geç yüklendi'
                      : SUB_LABELS[sub.submission.status]}
                  </span>
                ) : (
                  <span className="inline-flex items-center rounded-full bg-att-absent/10 px-2 py-0.5 text-xs font-medium text-att-absent">
                    Yüklenmedi
                  </span>
                )}
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
          ))}
        </div>
      </section>
    </div>
  );
}

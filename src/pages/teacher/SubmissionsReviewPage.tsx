/**
 * Öğretmen "Ödev teslim kontrol" ekranı — spec.md §6 Öğretmen.
 * Bir ödevin tüm teslimlerini listede gez, dosyaları aç, "İncelendi" işaretle.
 * Sol panel: teslimi olan ödevler (seçici); sağ panel: seçili ödevin teslimleri.
 */

import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, Clock3 } from 'lucide-react';
import type { TeacherHomeworkWithSubmissions, TeacherSubmission } from '../../types';
import { teacherApi, openProtectedFile, ApiClientError } from '../../services/api';
import { LoadingState, EmptyState, FormError, PrimaryButton } from '../../components/admin/ui';
import SubmissionFileGrid from '../../components/SubmissionFileGrid';

function fmtDate(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}.${m}.${y}`;
}

function fmtDateTime(iso: string): string {
  const date = new Date(iso);
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const hh = String(date.getHours()).padStart(2, '0');
  const min = String(date.getMinutes()).padStart(2, '0');
  return `${dd}.${mm}.${date.getFullYear()} ${hh}:${min}`;
}

export default function SubmissionsReviewPage() {
  const [homeworks, setHomeworks] = useState<TeacherHomeworkWithSubmissions[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [submissions, setSubmissions] = useState<TeacherSubmission[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [reviewingId, setReviewingId] = useState<string | null>(null);

  const loadPicker = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await teacherApi.submissionHomeworks();
      setHomeworks(res.items);
      if (res.items.length > 0 && !selectedId) {
        setSelectedId(res.items[0].id);
      }
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Bir hata oluştu.');
    } finally {
      setLoading(false);
    }
  }, [selectedId]);

  useEffect(() => {
    loadPicker();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadDetail = useCallback(async (homeworkId: string) => {
    setSelectedId(homeworkId);
    setLoadingDetail(true);
    setDetailError(null);
    try {
      const res = await teacherApi.submissions(homeworkId);
      setSubmissions(res.items);
    } catch (err) {
      setDetailError(err instanceof ApiClientError ? err.message : 'Teslimler yüklenemedi.');
      setSubmissions(null);
    } finally {
      setLoadingDetail(false);
    }
  }, []);

  const markReviewed = async (submissionId: string) => {
    setReviewingId(submissionId);
    setDetailError(null);
    try {
      await teacherApi.markReviewed(submissionId);
      setSubmissions((prev) =>
        (prev ?? []).map((s) =>
          s.id === submissionId
            ? { ...s, status: 'reviewed' as const, reviewed_at: new Date().toISOString() }
            : s,
        ),
      );
    } catch (err) {
      setDetailError(err instanceof ApiClientError ? err.message : 'İşaretlenemedi.');
    } finally {
      setReviewingId(null);
    }
  };

  if (loading) return <LoadingState />;

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold text-text">Teslim kontrol</h1>

      <FormError message={error} />
      {error && (
        <button
          type="button"
          onClick={loadPicker}
          className="rounded-md border border-border px-3 py-1.5 text-sm font-medium text-text hover:bg-bg"
        >
          Yeniden dene
        </button>
      )}

      {!error && homeworks && homeworks.length === 0 && (
        <EmptyState message="Teslim edilmiş ödev yok." />
      )}

      {!error && homeworks && homeworks.length > 0 && (
        <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
          {/* Seçici */}
          <ul className="space-y-2">
            {homeworks.map((hw) => (
              <li key={hw.id}>
                <button
                  type="button"
                  onClick={() => loadDetail(hw.id)}
                  className={
                    'w-full rounded-md border px-3 py-2.5 text-left transition-colors ' +
                    (selectedId === hw.id
                      ? 'border-accent bg-accent/5'
                      : 'border-border bg-surface hover:border-accent')
                  }
                >
                  <p className="text-sm font-medium text-text">
                    {hw.course_name} · {hw.class_name}
                  </p>
                  <p className="tabular mt-0.5 text-xs text-muted">
                    Hafta {hw.week_no} · {hw.week_label}
                  </p>
                  <p className="tabular mt-0.5 text-xs text-muted">
                    {hw.submission_count} teslim · son tarih {fmtDate(hw.due_date)}
                  </p>
                </button>
              </li>
            ))}
          </ul>

          {/* Detay */}
          <div>
            {loadingDetail && <LoadingState />}
            <FormError message={detailError} />
            {!loadingDetail && !detailError && submissions && submissions.length === 0 && (
              <EmptyState message="Bu ödeve teslim yok." />
            )}
            {!loadingDetail && submissions && submissions.length > 0 && (
              <ul className="space-y-3">
                {submissions.map((s) => (
                  <li key={s.id} className="rounded-md border border-border bg-surface p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-medium text-text">{s.student_name}</p>
                      <div className="flex items-center gap-2">
                        {s.is_late && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-amber/10 px-2 py-0.5 text-xs font-medium text-sub-late">
                            <Clock3 className="h-3.5 w-3.5" />
                            Geç teslim
                          </span>
                        )}
                        {s.status === 'reviewed' ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-green/10 px-2 py-0.5 text-xs font-medium text-sub-uploaded">
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            İncelendi
                          </span>
                        ) : (
                          <span className="rounded-full bg-blue/10 px-2 py-0.5 text-xs font-medium text-status-completed">
                            Yeni
                          </span>
                        )}
                      </div>
                    </div>
                    <p className="tabular mt-1 text-xs text-muted">{fmtDateTime(s.submitted_at)}</p>

                    {s.note && <p className="mt-2 text-sm text-text">Not: {s.note}</p>}

                    <div className="mt-3">
                      <SubmissionFileGrid
                        variant="server"
                        files={s.files}
                        onOpenPdf={(key) => {
                          setDetailError(null);
                          openProtectedFile(key).catch((err) =>
                            setDetailError(
                              err instanceof ApiClientError
                                ? err.message
                                : 'Dosya açılırken bir hata oluştu.',
                            ),
                          );
                        }}
                      />
                    </div>

                    {s.status === 'submitted' && (
                      <div className="mt-3">
                        <PrimaryButton
                          onClick={() => markReviewed(s.id)}
                          disabled={reviewingId === s.id}
                        >
                          {reviewingId === s.id ? 'İşaretleniyor…' : 'İncelendi olarak işaretle'}
                        </PrimaryButton>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Öğretmen "Ödev teslim kontrol" ekranı — spec.md §6 Öğretmen.
 * Bir ödevin tüm teslimlerini listede gez, dosyaları aç, "İncelendi" işaretle.
 * Sol panel: teslimi olan ödevler (seçici); sağ panel: seçili ödevin teslimleri.
 */

import { useCallback, useEffect, useState } from 'react';
import { ClipboardCheck } from 'lucide-react';
import type { TeacherHomeworkWithSubmissions, TeacherSubmission } from '../../types';
import { teacherApi, openProtectedFile, ApiClientError } from '../../services/api';
import {
  Badge,
  LoadingState,
  EmptyState,
  FilterChip,
  FormError,
  PageTitle,
  PrimaryButton,
  SecondaryButton,
} from '../../components/admin/ui';
import { useIsMobile } from '../../hooks/useIsMobile';
import { formatDate } from '../../utils/date';
import SubmissionFileGrid from '../../components/SubmissionFileGrid';

function fmtDateTime(iso: string): string {
  const date = new Date(iso);
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const hh = String(date.getHours()).padStart(2, '0');
  const min = String(date.getMinutes()).padStart(2, '0');
  return `${dd}.${mm}.${date.getFullYear()} ${hh}:${min}`;
}

export default function SubmissionsReviewPage() {
  const isMobile = useIsMobile();
  const [homeworks, setHomeworks] = useState<TeacherHomeworkWithSubmissions[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [submissions, setSubmissions] = useState<TeacherSubmission[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [reviewingId, setReviewingId] = useState<string | null>(null);

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

  const loadPicker = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await teacherApi.submissionHomeworks();
      setHomeworks(res.items);
      if (res.items.length > 0 && !selectedId) {
        // İlk ödev seçili görünür; detayı da yükle ki "göz at" akışı boş açılmasın.
        void loadDetail(res.items[0].id);
      }
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Bir hata oluştu.');
    } finally {
      setLoading(false);
    }
  }, [selectedId, loadDetail]);

  useEffect(() => {
    loadPicker();
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  const selectedHw = homeworks?.find((h) => h.id === selectedId) ?? null;

  return (
    <div className="space-y-5 md:space-y-4">
      <PageTitle icon={ClipboardCheck}>Teslim kontrol</PageTitle>

      <FormError message={error} />
      {error && (
        <SecondaryButton onClick={() => void loadPicker()}>Yeniden dene</SecondaryButton>
      )}

      {!error && homeworks && homeworks.length === 0 && (
        <EmptyState message="Teslim edilmiş ödev yok." />
      )}

      {!error && homeworks && homeworks.length > 0 && (
        <div className="space-y-4 lg:grid lg:grid-cols-[280px_1fr] lg:gap-6 lg:space-y-0">
          {/* Seçici — mobilde yatay çip şeridi, masaüstünde dikey liste */}
          {isMobile ? (
            <section>
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
                Ödev
              </h2>
              <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
                {homeworks.map((hw) => (
                  <FilterChip
                    key={hw.id}
                    active={selectedId === hw.id}
                    onClick={() => loadDetail(hw.id)}
                  >
                    {hw.course_name} · {hw.class_name}
                  </FilterChip>
                ))}
              </div>
            </section>
          ) : (
            <ul className="space-y-2">
              {homeworks.map((hw) => (
                <li key={hw.id}>
                  <button
                    type="button"
                    onClick={() => loadDetail(hw.id)}
                    className={
                      'card-interactive elevation-1 w-full rounded-md border px-3 py-2.5 text-left ' +
                      (selectedId === hw.id
                        ? 'border-accent bg-accent/5'
                        : 'border-border bg-surface')
                    }
                  >
                    <p className="text-sm font-medium text-text">
                      {hw.course_name} · {hw.class_name}
                    </p>
                    <p className="tabular mt-0.5 text-xs text-muted">
                      Hafta {hw.week_no} · {hw.week_label}
                    </p>
                    <p className="tabular mt-0.5 text-xs text-muted">
                      {hw.submission_count} teslim · son tarih {formatDate(hw.due_date)}
                    </p>
                  </button>
                </li>
              ))}
            </ul>
          )}

          {/* Detay */}
          <div>
            {isMobile && selectedHw && (
              <p className="tabular mb-3 text-xs text-muted">
                Hafta {selectedHw.week_no} · {selectedHw.week_label} ·{' '}
                {selectedHw.submission_count} teslim · son tarih{' '}
                {formatDate(selectedHw.due_date)}
              </p>
            )}
            {loadingDetail && <LoadingState />}
            <FormError message={detailError} />
            {!loadingDetail && !detailError && submissions && submissions.length === 0 && (
              <EmptyState message="Bu ödeve teslim yok." />
            )}
            {!loadingDetail && submissions && submissions.length > 0 && (
              <ul className="space-y-3">
                {submissions.map((s) => (
                  <li
                    key={s.id}
                    className="elevation-1 rounded-2xl border border-border bg-surface p-4 md:rounded-md"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-medium text-text">{s.student_name}</p>
                      <div className="flex items-center gap-2">
                        {s.is_late && <Badge tone="warning">Geç teslim</Badge>}
                        {s.status === 'reviewed' ? (
                          <Badge tone="positive">İncelendi</Badge>
                        ) : (
                          <Badge tone="info">Yeni</Badge>
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
                          className="min-h-11 w-full md:min-h-0 md:w-auto"
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

/**
 * Admin — rapor inceleme (salt-okunur). spec.md §5.5 "Tüm raporlar" görünümü:
 * satıra tıklayınca canlı rapor verisi düzenleme UI'ı olmadan açılır.
 * Kaynak: GET /teacher/reports/:id (admin için tümü).
 */

import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { FileText } from 'lucide-react';
import type { TeacherReportPayload } from '../../types';
import { DAY_LABELS } from '../../types';
import { teacherApi, ApiClientError } from '../../services/api';
import {
  AttendanceBadge,
  EmptyState,
  FormError,
  LoadingState,
  PageTitle,
  StatusBadge,
} from '../../components/admin/ui';

export default function AdminReportViewPage() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<TeacherReportPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    teacherApi
      .getReport(id)
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

  if (loading) return <LoadingState />;
  if (error) return <FormError message={error} />;
  if (!data) return <EmptyState message="Rapor bulunamadı." />;

  const { report, entries } = data;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <PageTitle icon={FileText}>
          {report.class_name} · {report.course_name}
        </PageTitle>
        <Link
          to="/admin/reports"
          className="rounded-md border border-border px-3 py-1.5 text-sm font-medium text-text hover:bg-bg"
        >
          Geri
        </Link>
      </div>

      <div className="rounded-md border border-border bg-surface p-5">
        <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
          <div className="flex gap-2">
            <dt className="font-medium text-muted">Hafta:</dt>
            <dd className="tabular text-text">
              {report.week.week_no} · {report.week.label}
            </dd>
          </div>
          <div className="flex gap-2">
            <dt className="font-medium text-muted">Öğretmen:</dt>
            <dd className="text-text">{report.teacher_name}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="font-medium text-muted">Ders günü:</dt>
            <dd className="tabular text-text">
              {DAY_LABELS[report.day_of_week]}
              {report.lesson_time ? ` · ${report.lesson_time}` : ''}
            </dd>
          </div>
          <div className="flex gap-2">
            <dt className="font-medium text-muted">Durum:</dt>
            <dd>
              <StatusBadge status={report.status} />
            </dd>
          </div>
          {report.topic_covered && (
            <div className="flex gap-2 sm:col-span-2">
              <dt className="font-medium text-muted">İşlenen konu:</dt>
              <dd className="text-text">{report.topic_covered}</dd>
            </div>
          )}
          {report.prev_homework_text && (
            <div className="flex gap-2 sm:col-span-2">
              <dt className="font-medium text-muted">Verilmiş ödev:</dt>
              <dd className="text-text">{report.prev_homework_text}</dd>
            </div>
          )}
          {report.homework && (
            <div className="flex gap-2 sm:col-span-2">
              <dt className="font-medium text-muted">Yapılacak ödev:</dt>
              <dd className="text-text">
                {report.homework.description || '—'}
                <span className="tabular text-muted">
                  {' '}
                  (son tarih: {report.homework.due_date})
                </span>
              </dd>
            </div>
          )}
        </dl>
      </div>

      <div className="overflow-hidden rounded-md border border-border bg-surface">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-bg text-left text-[13px] font-medium text-muted">
              <th className="px-3 py-2">Öğrenci</th>
              <th className="px-3 py-2">Devamsızlık</th>
              <th className="px-3 py-2">Ödev puanı</th>
              <th className="px-3 py-2">İlgi puanı</th>
              <th className="px-3 py-2">Not</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry) => (
              <tr key={entry.student_id} className="border-b border-border last:border-b-0">
                <td className="px-3 py-2 font-medium text-text">{entry.student_name}</td>
                <td className="px-3 py-2">
                  <AttendanceBadge attendance={entry.attendance} />
                </td>
                <td className="tabular px-3 py-2 text-[13px] text-text">
                  {entry.homework_score ?? '—'}
                </td>
                <td className="tabular px-3 py-2 text-[13px] text-text">
                  {entry.interest_score ?? '—'}
                </td>
                <td className="px-3 py-2 text-[13px] text-text">
                  {entry.teacher_note || '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

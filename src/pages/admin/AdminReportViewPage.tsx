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
import { formatDate } from '../../utils/date';
import { teacherApi, ApiClientError } from '../../services/api';
import {
  AttendanceBadge,
  Card,
  DataTable,
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
  StatusBadge,
  buttonClass,
  type Column,
} from '../../components/ui';

type Entry = TeacherReportPayload['entries'][number];

const COLUMNS: Column<Entry>[] = [
  {
    key: 'student',
    header: 'Öğrenci',
    card: 'title',
    cell: (e) => <span className="font-medium">{e.student_name}</span>,
  },
  { key: 'att', header: 'Devamsızlık', cell: (e) => <AttendanceBadge attendance={e.attendance} /> },
  {
    key: 'hw',
    header: 'Ödev puanı',
    className: 'tabular',
    cell: (e) => e.homework_score ?? '—',
  },
  {
    key: 'perf',
    header: 'Ders içi performans puanı',
    className: 'tabular',
    cell: (e) => e.interest_score ?? '—',
  },
  { key: 'note', header: 'Not', cell: (e) => e.teacher_note || '—' },
];

export default function AdminReportViewPage() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<TeacherReportPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [reloadKey, setReloadKey] = useState(0);

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
          setError(
            err instanceof ApiClientError
              ? err.message
              : 'Rapor yüklenemedi. Bağlantınızı kontrol edip yeniden deneyin.',
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id, reloadKey]);

  if (loading) return <LoadingState />;
  if (error) return <ErrorState message={error} onRetry={() => setReloadKey((k) => k + 1)} />;
  if (!data) return <EmptyState message="Rapor bulunamadı." />;

  const { report, entries } = data;

  return (
    <div className="space-y-4">
      <PageHeader
        icon={FileText}
        title={`${report.class_name} · ${report.course_name}`}
        actions={
          <Link to="/admin/reports" className={buttonClass('secondary', 'md')}>
            Geri
          </Link>
        }
      />

      <Card padding="lg">
        <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
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
          <div className="flex items-center gap-2">
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
                  (son tarih: {formatDate(report.homework.due_date)})
                </span>
              </dd>
            </div>
          )}
        </dl>
      </Card>

      <DataTable
        rows={entries}
        columns={COLUMNS}
        rowKey={(e) => e.student_id}
        rowLabel={(e) => e.student_name}
      />
    </div>
  );
}

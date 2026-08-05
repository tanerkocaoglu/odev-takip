/**
 * Geçmiş raporlarım — spec.md §6 Öğretmen.
 * Tamamlananlar dashboard'da görünmez (draft düşer); bu ekran öğretmenin
 * tüm raporlarını durumuyla listeler ve düzenlemeye açar.
 */

import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { TeacherReportHistoryItem } from '../../types';
import { DAY_LABELS } from '../../types';
import { teacherApi, ApiClientError } from '../../services/api';
import Pagination from '../../components/admin/Pagination';
import { LoadingState, EmptyState, FormError } from '../../components/admin/ui';

const STATUS_LABELS: Record<string, string> = {
  draft: 'Taslak',
  completed: 'Tamamlandı',
  sent: 'Gönderildi',
};

const PAGE_SIZE = 20;

export default function ReportHistoryPage() {
  const [data, setData] = useState<TeacherReportHistoryItem[] | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await teacherApi.history({ page, pageSize: PAGE_SIZE });
      setData(res.items);
      setTotal(res.total);
      setPage(res.page);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Bir hata oluştu.');
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) return <LoadingState />;

  return (
    <div className="space-y-4">
      <div className="flex items-baseline justify-between">
        <h1 className="text-xl font-semibold text-text">Geçmiş raporlarım</h1>
        <button
          type="button"
          onClick={load}
          className="rounded-md border border-border px-3 py-1.5 text-sm font-medium text-text hover:bg-bg"
        >
          Yenile
        </button>
      </div>

      <FormError message={error} />

      {!error && data && data.length === 0 && (
        <EmptyState message="Henüz rapor yok." />
      )}

      {!error && data && data.length > 0 && (
        <div className="overflow-hidden rounded-md border border-border bg-surface">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-[13px] font-medium text-muted">
                <th className="px-3 py-2">Hafta</th>
                <th className="px-3 py-2">Sınıf · Ders</th>
                <th className="px-3 py-2">Ders günü</th>
                <th className="px-3 py-2">Öğrenci</th>
                <th className="px-3 py-2">Durum</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {data.map((item) => (
                <tr
                  key={item.id}
                  className="border-b border-border last:border-b-0"
                >
                  <td className="tabular px-3 py-2 text-[13px] text-text">
                    {item.week_no}
                    <span className="block text-xs text-muted">
                      {item.week_label}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-[13px] text-text">
                    {item.class_name} · {item.course_name}
                  </td>
                  <td className="tabular px-3 py-2 text-[13px] text-muted">
                    {DAY_LABELS[item.day_of_week]}
                    {item.lesson_time ? ` · ${item.lesson_time}` : ''}
                  </td>
                  <td className="tabular px-3 py-2 text-[13px] text-muted">
                    {item.student_count}
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={
                        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ' +
                        (item.status === 'completed'
                          ? 'bg-status-completed/10 text-status-completed'
                          : item.status === 'sent'
                            ? 'bg-status-sent/10 text-status-sent'
                            : 'bg-status-draft/10 text-status-draft')
                      }
                    >
                      {STATUS_LABELS[item.status]}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <Link
                      to={`/teacher/reports/${item.class_course_id}/${item.week_id}`}
                      className="text-sm font-medium text-accent hover:underline"
                    >
                      Aç
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {!error && data && data.length > 0 && (
        <Pagination page={page} pageSize={PAGE_SIZE} total={total} onChange={setPage} />
      )}
    </div>
  );
}
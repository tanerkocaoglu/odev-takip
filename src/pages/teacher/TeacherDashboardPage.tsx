/**
 * Öğretmen dashboard — "Bu hafta doldurulacaklar" (spec.md §5.1, §6).
 * Ders gününe göre sıralı gelir (backend); tamamlananlar düşer, günü geçmiş
 * taslaklar üstte ve vurgulu görünür.
 */

import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { TeacherDashboard } from '../../types';
import { DAY_LABELS } from '../../types';
import { teacherApi, ApiClientError } from '../../services/api';
import { LoadingState, EmptyState, FormError } from '../../components/admin/ui';

export default function TeacherDashboardPage() {
  const [data, setData] = useState<TeacherDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await teacherApi.dashboard());
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Bir hata oluştu.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) return <LoadingState />;

  return (
    <div className="space-y-4">
      <div className="flex items-baseline justify-between">
        <h1 className="text-xl font-semibold text-text">Bu hafta doldurulacaklar</h1>
        <div className="flex items-center gap-3">
          {data?.week && (
            <span className="tabular text-sm text-muted">
              Hafta {data.week.week_no} · {data.week.label}
            </span>
          )}
          <Link
            to="/teacher/reports/history"
            className="text-sm font-medium text-accent hover:underline"
          >
            Geçmiş raporlarım
          </Link>
        </div>
      </div>

      <FormError message={error} />
      {error && (
        <button
          type="button"
          onClick={load}
          className="rounded-md border border-border px-3 py-1.5 text-sm font-medium text-text hover:bg-bg"
        >
          Yeniden dene
        </button>
      )}

      {!error && data && data.items.length === 0 && (
        <EmptyState message="Bu hafta doldurulacak rapor yok." />
      )}

      {!error && data && data.items.length > 0 && (
        <ul className="space-y-2">
          {data.items.map((item) => (
            <li key={item.class_course_id}>
              <Link
                to={`/teacher/reports/${item.class_course_id}/${data.week!.id}`}
                className={
                  'flex items-center justify-between rounded-md border bg-surface px-4 py-3 transition-colors hover:border-accent ' +
                  (item.is_overdue ? 'border-att-late/50' : 'border-border')
                }
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-text">
                    {item.class_name} · {item.course_name}
                  </p>
                  <p className="tabular mt-0.5 text-xs text-muted">
                    {DAY_LABELS[item.day_of_week]}
                    {item.lesson_time ? ` · ${item.lesson_time}` : ''}
                  </p>
                </div>
                <div className="ml-3 flex shrink-0 items-center gap-2">
                  {item.is_overdue && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber/10 px-2 py-0.5 text-xs font-medium text-amber">
                      Günü geçti
                    </span>
                  )}
                  {item.status === 'draft' ? (
                    <span className="inline-flex items-center rounded-full bg-status-draft/10 px-2 py-0.5 text-xs font-medium text-status-draft">
                      Taslak
                    </span>
                  ) : (
                    <span className="inline-flex items-center rounded-full border border-border px-2 py-0.5 text-xs font-medium text-muted">
                      Açılmadı
                    </span>
                  )}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

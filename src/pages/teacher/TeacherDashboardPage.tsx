/**
 * Öğretmen dashboard — "Bu hafta doldurulacaklar" (spec.md §5.1, §6).
 * Ders gününe göre sıralı gelir (backend); tamamlananlar düşer, günü geçmiş
 * taslaklar vurgulu görünür. Tek düzen, mobil öncelikli (comfortable): her
 * kayıt tek dokunuşla açılan bir kart satırıdır (≥ 56px).
 */

import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, LayoutDashboard } from 'lucide-react';
import type { TeacherDashboard } from '../../types';
import { DAY_LABELS } from '../../types';
import { teacherApi, ApiClientError } from '../../services/api';
import {
  Badge,
  EmptyState,
  ErrorState,
  InlineNotice,
  LoadingState,
  PageHeader,
  StatusBadge,
  cx,
} from '../../components/ui';

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
      setError(
        err instanceof ApiClientError
          ? err.message
          : 'Raporlar yüklenemedi. Bağlantınızı kontrol edip yeniden deneyin.',
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) return <LoadingState />;

  const description = data?.week
    ? `Hafta ${data.week.week_no} · ${data.week.label}`
    : undefined;

  return (
    <div className="space-y-4">
      <PageHeader icon={LayoutDashboard} title="Bu hafta doldurulacaklar" description={description} />

      {error && <ErrorState message={error} onRetry={() => void load()} />}

      {/* Hafta henüz başlamadıysa kayıtlar salt-okunur önizlemedir (spec §5.1). */}
      {!error && data?.week_not_started && (
        <InlineNotice tone="info">
          Bu hafta henüz başlamadı — kayıtlar yalnızca önizleme. Hafta başladığında
          doldurulabilir.
        </InlineNotice>
      )}

      {/* İç hatırlatma: ders günü geçmiş taslaklar. */}
      {!error && data && data.overdue_count > 0 && (
        <InlineNotice tone="warning">
          <p className="tabular font-medium">Bu hafta {data.overdue_count} raporunuz gecikti</p>
          <p className="mt-0.5 text-[13px]">Aşağıdaki kayıtların ders günü geçti.</p>
        </InlineNotice>
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
                className={cx(
                  'card-interactive flex min-h-14 items-center gap-3 rounded-md border px-4 py-3',
                  item.week_range_invalid
                    ? 'border-danger/40 bg-danger/5'
                    : item.is_overdue
                      ? 'border-warning/40 bg-warning/5'
                      : 'border-border bg-surface',
                )}
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-base font-medium text-text md:text-sm">
                    {item.class_name} · {item.course_name}
                  </p>
                  <p className="tabular mt-0.5 text-[13px] text-muted">
                    {DAY_LABELS[item.day_of_week]}
                    {item.lesson_time ? ` · ${item.lesson_time}` : ''}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1 sm:flex-row sm:items-center sm:gap-2">
                  {item.week_range_invalid ? (
                    <Badge tone="danger">Hafta tanımı hatalı</Badge>
                  ) : (
                    <>
                      {item.is_overdue && <Badge tone="warning">Günü geçti</Badge>}
                      {data.week_not_started ? (
                        <Badge tone="neutral">Önizleme</Badge>
                      ) : item.status === 'draft' ? (
                        <StatusBadge status="draft" />
                      ) : (
                        <Badge tone="neutral">Açılmadı</Badge>
                      )}
                    </>
                  )}
                </div>
                <ChevronRight size={18} aria-hidden="true" className="shrink-0 text-muted" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * Öğretmen dashboard — "Bu hafta doldurulacaklar" (spec.md §5.1, §6).
 * Ders gününe göre sıralı gelir (backend); tamamlananlar düşer, günü geçmiş
 * taslaklar üstte ve vurgulu görünür.
 *
 * Görsel dil admin paneliyle ortaktır: `PageTitle`, dolgulu `Badge`, özet kartı
 * (üst kenarlık renk şeridi + accent ikon dairesi), `elevation-1` ve
 * `card-interactive`. Navigasyon artık `TeacherShell` içindedir.
 */

import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, LayoutDashboard } from 'lucide-react';
import type { TeacherDashboard } from '../../types';
import { DAY_LABELS } from '../../types';
import { teacherApi, ApiClientError } from '../../services/api';
import {
  Badge,
  EmptyState,
  FormError,
  LoadingState,
  PageTitle,
  SecondaryButton,
  StatusBadge,
} from '../../components/admin/ui';

/** Özet kartı ikonu — accent %10 daire (admin ile aynı). */
function CardIcon() {
  return (
    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-att-late/10 text-att-late">
      <AlertTriangle size={18} aria-hidden="true" />
    </span>
  );
}

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
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <PageTitle icon={LayoutDashboard}>Bu hafta doldurulacaklar</PageTitle>
        {data?.week && (
          <span className="tabular text-sm text-muted">
            Hafta {data.week.week_no} · {data.week.label}
          </span>
        )}
      </div>

      <FormError message={error} />
      {error && (
        <SecondaryButton onClick={() => void load()}>Yeniden dene</SecondaryButton>
      )}

      {/* İç hatırlatma: ders günü geçmiş taslaklar — admin özet kartı diliyle
          (üst kenarlık anlam rengi + ikon dairesi). */}
      {!error && data && data.overdue_count > 0 && (
        <div className="elevation-1 flex items-center gap-3 rounded-md border border-border border-t-2 border-t-att-late bg-surface p-4">
          <CardIcon />
          <div className="min-w-0">
            <p className="tabular text-sm font-semibold text-att-late">
              Bu hafta {data.overdue_count} raporunuz gecikti
            </p>
            <p className="mt-0.5 text-xs text-muted">
              Aşağıdaki kayıtların ders günü geçti.
            </p>
          </div>
        </div>
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
                  'card-interactive elevation-1 flex items-center justify-between rounded-md border bg-surface px-4 py-3 ' +
                  (item.is_overdue ? 'border-att-late/50 bg-att-late/5' : 'border-border')
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
                  {item.is_overdue && <Badge tone="warning">Günü geçti</Badge>}
                  {item.status === 'draft' ? (
                    <StatusBadge status="draft" />
                  ) : (
                    <Badge tone="neutral">Açılmadı</Badge>
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

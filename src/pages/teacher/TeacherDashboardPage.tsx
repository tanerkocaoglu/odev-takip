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
import { AlertTriangle, BookOpen, ChevronRight, LayoutDashboard } from 'lucide-react';
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
    <div className="space-y-5 md:space-y-4">
      {/* Masaüstü başlık */}
      <div className="hidden flex-wrap items-baseline justify-between gap-2 md:flex">
        <PageTitle icon={LayoutDashboard}>Bu hafta doldurulacaklar</PageTitle>
        {data?.week && (
          <span className="tabular text-sm text-muted">
            Hafta {data.week.week_no} · {data.week.label}
          </span>
        )}
      </div>

      {/* Mobil bağlam bloğu — hafta ve yük, ekranın üstünü anlamlandırır. */}
      {data?.week && (
        <section className="elevation-1 rounded-3xl border border-border bg-surface p-5 md:hidden">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">
            Bu hafta
          </p>
          <h1 className="mt-1 text-xl font-semibold text-text">
            Hafta {data.week.week_no}
          </h1>
          <p className="tabular mt-0.5 text-sm text-muted">{data.week.label}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <span className="tabular inline-flex items-center rounded-full bg-bg px-3 py-1 text-sm font-medium text-text">
              {data.items.length} kayıt
            </span>
            {data.overdue_count > 0 && (
              <span className="tabular inline-flex items-center rounded-full bg-att-late/10 px-3 py-1 text-sm font-medium text-att-late">
                {data.overdue_count} gecikti
              </span>
            )}
          </div>
        </section>
      )}

      <FormError message={error} />
      {error && (
        <SecondaryButton onClick={() => void load()}>Yeniden dene</SecondaryButton>
      )}

      {/* Hafta henüz başlamadıysa kayıtlar salt-okunur önizlemedir (spec §5.1). */}
      {!error && data?.week_not_started && (
        <p className="elevation-1 rounded-2xl border border-border bg-surface p-4 text-sm text-muted md:rounded-md">
          Bu hafta henüz başlamadı — kayıtlar yalnızca önizleme. Hafta
          başladığında doldurulabilir.
        </p>
      )}

      {/* İç hatırlatma: ders günü geçmiş taslaklar — admin özet kartı diliyle
          (üst kenarlık anlam rengi + ikon dairesi). */}
      {!error && data && data.overdue_count > 0 && (
        <div className="elevation-1 flex items-center gap-3 rounded-2xl border border-border border-t-2 border-t-att-late bg-surface p-4 md:rounded-md">
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
        <ul className="space-y-3 md:space-y-2">
          {data.items.map((item) => (
            <li key={item.class_course_id}>
              <Link
                to={`/teacher/reports/${item.class_course_id}/${data.week!.id}`}
                className={
                  'card-interactive elevation-1 block rounded-2xl border bg-surface p-4 md:flex md:min-h-0 md:items-center md:rounded-md md:px-4 md:py-3 ' +
                  (item.is_overdue ? 'border-att-late/50 bg-att-late/5' : 'border-border')
                }
              >
                <div className="flex items-center gap-3 md:min-w-0 md:flex-1">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-bg text-muted md:hidden">
                    <BookOpen size={18} aria-hidden="true" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[15px] font-semibold text-text md:text-sm md:font-medium">
                      {item.class_name} · {item.course_name}
                    </p>
                    <p className="tabular mt-1 text-[13px] text-muted md:mt-0.5 md:text-xs">
                      {DAY_LABELS[item.day_of_week]}
                      {item.lesson_time ? ` · ${item.lesson_time}` : ''}
                    </p>
                  </div>
                  <ChevronRight
                    size={18}
                    aria-hidden="true"
                    className="shrink-0 text-muted md:hidden"
                  />
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2 md:mt-0 md:ml-3 md:shrink-0">
                  {item.is_overdue && <Badge tone="warning">Günü geçti</Badge>}
                  {data.week_not_started ? (
                    <Badge tone="neutral">Önizleme</Badge>
                  ) : item.status === 'draft' ? (
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

/**
 * Admin — Tüm raporlar (spec.md §5.5 "Tüm raporlar" görünümü).
 * Admin'in "tüm raporları görme" hakkının karşılığı: durum/sınıf/hafta
 * filtresiyle raporlar listelenir, satıra tıklayınca salt-okunur açılır.
 * Kaynak: GET /teacher/reports (admin için tümü) + GET /teacher/reports/:id.
 */

import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { AcademicYear, ClassItem, TeacherReportHistoryItem, Week } from '../../types';
import { DAY_LABELS } from '../../types';
import { adminApi, teacherApi, ApiClientError } from '../../services/api';
import Pagination from '../../components/admin/Pagination';
import { EmptyState, FormError, LoadingState } from '../../components/admin/ui';

const PAGE_SIZE = 20;

const STATUS_OPTIONS = [
  { value: '', label: 'Tümü' },
  { value: 'draft', label: 'Taslak' },
  { value: 'completed', label: 'Tamamlandı' },
  { value: 'sent', label: 'Gönderildi' },
] as const;

const STATUS_LABELS: Record<string, string> = {
  draft: 'Taslak',
  completed: 'Tamamlandı',
  sent: 'Gönderildi',
};

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    draft: 'bg-status-draft/10 text-status-draft',
    completed: 'bg-status-completed/10 text-status-completed',
    sent: 'bg-status-sent/10 text-status-sent',
  };
  return (
    <span
      className={
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ' +
        (styles[status] ?? 'bg-status-draft/10 text-status-draft')
      }
    >
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}

export default function AdminReportsPage() {
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [weeks, setWeeks] = useState<Week[]>([]);
  const [classId, setClassId] = useState('');
  const [weekId, setWeekId] = useState('');
  const [status, setStatus] = useState<'draft' | 'completed' | 'sent' | ''>('');
  const [items, setItems] = useState<TeacherReportHistoryItem[] | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await teacherApi.history({
        status: status || undefined,
        class_id: classId || undefined,
        week_id: weekId || undefined,
        page,
        pageSize: PAGE_SIZE,
      });
      setItems(res.items);
      setTotal(res.total);
      setPage(res.page);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Bir hata oluştu.');
    } finally {
      setLoading(false);
    }
  }, [status, classId, weekId, page]);

  useEffect(() => {
    void load();
  }, [load]);

  /** Filtre değişince ilk sayfaya dön. */
  function changeFilter(setter: (v: string) => void) {
    return (value: string) => {
      setter(value);
      setPage(1);
    };
  }

  useEffect(() => {
    adminApi.academicYears
      .list()
      .then((res) => {
        const active = (res.items as AcademicYear[]).find((y) => y.is_active === 1);
        if (!active) return;
        return Promise.all([
          adminApi.classes.list({ academicYearId: active.id }),
          adminApi.weeks.list(active.id),
        ]);
      })
      .then((data) => {
        if (!data) return;
        setClasses(data[0].items);
        setWeeks(data[1].items);
      })
      .catch(() => {
        // Filtre listeleri yüklenemezse sayfa yine çalışır (filtresiz).
      });
  }, []);

  const selectClass = 'h-9 rounded-md border border-border bg-surface px-3 text-sm text-text';

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-muted">Durum</span>
          <select
            value={status}
            onChange={(e) => changeFilter((v) => setStatus(v as typeof status))(e.target.value)}
            className={selectClass}
          >
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-muted">Sınıf</span>
          <select
            value={classId}
            onChange={(e) => changeFilter(setClassId)(e.target.value)}
            className={selectClass}
          >
            <option value="">Tümü</option>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-muted">Hafta</span>
          <select
            value={weekId}
            onChange={(e) => changeFilter(setWeekId)(e.target.value)}
            className={selectClass}
          >
            <option value="">Tümü</option>
            {weeks.map((w) => (
              <option key={w.id} value={w.id}>
                {w.week_no}. hafta · {w.label}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          onClick={() => void load()}
          className="rounded-md border border-border px-3 py-1.5 text-sm font-medium text-text hover:bg-bg"
        >
          Yenile
        </button>
      </div>

      <FormError message={error} />

      {loading ? (
        <LoadingState />
      ) : items && items.length === 0 ? (
        <EmptyState message="Bu filtrelerle rapor bulunamadı." />
      ) : (
        items && (
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
                {items.map((item) => (
                  <tr key={item.id} className="border-b border-border last:border-b-0">
                    <td className="tabular px-3 py-2 text-[13px] text-text">
                      {item.week_no}
                      <span className="block text-xs text-muted">{item.week_label}</span>
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
                      <StatusBadge status={item.status} />
                    </td>
                    <td className="px-3 py-2 text-right">
                      <Link
                        to={`/admin/reports/${item.id}`}
                        className="text-sm font-medium text-accent hover:underline"
                      >
                        İncele
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}

      {!loading && items && items.length > 0 && (
        <Pagination page={page} pageSize={PAGE_SIZE} total={total} onChange={setPage} />
      )}
    </div>
  );
}

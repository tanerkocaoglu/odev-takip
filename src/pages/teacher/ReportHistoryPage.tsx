/**
 * Geçmiş raporlarım — spec.md §6 Öğretmen.
 * Tamamlananlar dashboard'da görünmez (draft düşer); bu ekran öğretmenin
 * tüm raporlarını durumuyla listeler ve düzenlemeye açar.
 *
 * Filtreler (durum + sınıf + hafta + arama) sunucu taraflıdır; sayfalama
 * doğru kalır. Seçenekler öğretmenin kapsamındaki raporlardan türetilir
 * (`GET /teacher/reports/filters`). Admin "Tüm raporlar" ekranıyla aynı
 * görsel dil kullanılır.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import type {
  ReportClassFilterOption,
  ReportWeekFilterOption,
  TeacherReportHistoryItem,
} from '../../types';
import { DAY_LABELS } from '../../types';
import { teacherApi, ApiClientError } from '../../services/api';
import Pagination from '../../components/admin/Pagination';
import {
  LoadingState,
  EmptyState,
  FormError,
  SearchBox,
  FilterSelect,
  StatusBadge,
} from '../../components/admin/ui';

const PAGE_SIZE = 20;

const STATUS_OPTIONS = [
  { value: '', label: 'Tümü' },
  { value: 'draft', label: 'Taslak' },
  { value: 'completed', label: 'Tamamlandı' },
  { value: 'sent', label: 'Gönderildi' },
] as const;

type StatusFilter = '' | 'draft' | 'completed' | 'sent';

export default function ReportHistoryPage() {
  const [data, setData] = useState<TeacherReportHistoryItem[] | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [classes, setClasses] = useState<ReportClassFilterOption[]>([]);
  const [weeks, setWeeks] = useState<ReportWeekFilterOption[]>([]);
  const [classId, setClassId] = useState('');
  const [weekId, setWeekId] = useState('');
  const [status, setStatus] = useState<StatusFilter>('');
  const [qInput, setQInput] = useState('');
  const [q, setQ] = useState('');

  // Arama debounce (~300ms): her tuşta istek atılmaz. yalnızca arama
  // gerçekten değişince 1. sayfaya dönülür (mount'ta sıfırlama yapılmaz).
  const appliedQ = useRef(q);
  useEffect(() => {
    const next = qInput.trim();
    if (next === appliedQ.current) return;
    const timer = window.setTimeout(() => {
      appliedQ.current = next;
      setQ(next);
      setPage(1);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [qInput]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await teacherApi.history({
        status: status || undefined,
        class_id: classId || undefined,
        week_id: weekId || undefined,
        q: q || undefined,
        page,
        pageSize: PAGE_SIZE,
      });
      setData(res.items);
      setTotal(res.total);
      setPage(res.page);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Bir hata oluştu.');
    } finally {
      setLoading(false);
    }
  }, [status, classId, weekId, q, page]);

  useEffect(() => {
    void load();
  }, [load]);

  // Filtre seçenekleri bir kez; yüklenemezse sayfa filtresiz çalışır.
  useEffect(() => {
    teacherApi
      .reportFilters()
      .then((res) => {
        setClasses(res.classes);
        setWeeks(res.weeks);
      })
      .catch(() => {
        // Sessiz: filtre listeleri yoksa da liste çalışır.
      });
  }, []);

  /** Filtre değişince ilk sayfaya dön. */
  function applyFilter(setter: (value: string) => void) {
    return (value: string) => {
      setter(value);
      setPage(1);
    };
  }

  const filtersActive = Boolean(status || classId || weekId || q);

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold text-text">Geçmiş raporlarım</h1>

      <div className="flex flex-wrap items-end gap-3">
        <FilterSelect
          label="Durum"
          value={status}
          onChange={applyFilter((v) => setStatus(v as StatusFilter))}
        >
          {STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </FilterSelect>
        <FilterSelect label="Sınıf" value={classId} onChange={applyFilter(setClassId)}>
          <option value="">Tümü</option>
          {classes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </FilterSelect>
        <FilterSelect label="Hafta" value={weekId} onChange={applyFilter(setWeekId)}>
          <option value="">Tümü</option>
          {weeks.map((w) => (
            <option key={w.id} value={w.id}>
              {w.week_no}. hafta · {w.label}
            </option>
          ))}
        </FilterSelect>
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-muted">Ara</span>
          <SearchBox
            value={qInput}
            onChange={setQInput}
            placeholder="Sınıf veya ders ara"
          />
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
      ) : data && data.length === 0 ? (
        <EmptyState
          message={
            filtersActive ? 'Bu filtrelerle rapor bulunamadı.' : 'Henüz rapor yok.'
          }
        />
      ) : (
        data && (
          <>
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
                        <StatusBadge status={item.status} />
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
            <Pagination
              page={page}
              pageSize={PAGE_SIZE}
              total={total}
              onChange={setPage}
            />
          </>
        )
      )}
    </div>
  );
}

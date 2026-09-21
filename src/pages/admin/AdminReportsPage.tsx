/**
 * Admin — Tüm raporlar (spec.md §5.5 "Tüm raporlar" görünümü).
 * Admin'in "tüm raporları görme" hakkının karşılığı: durum/sınıf/hafta/
 * öğretmen filtresi + arama ile raporlar listelenir, satıra tıklayınca
 * salt-okunur açılır. Kaynak: GET /teacher/reports (admin için tümü) + `:id`.
 *
 * Filtre seçenekleri öğretmenle aynı uçtan gelir (`/teacher/reports/filters`)
 * — tek kaynak; admin kapsamı uçta role göre belirlenir.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import type {
  ReportClassFilterOption,
  ReportTeacherFilterOption,
  ReportWeekFilterOption,
  TeacherReportHistoryItem,
} from '../../types';
import { DAY_LABELS } from '../../types';
import { adminApi, teacherApi, ApiClientError } from '../../services/api';
import Pagination from '../../components/admin/Pagination';
import {
  EmptyState,
  FormError,
  LoadingState,
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

export default function AdminReportsPage() {
  const [classes, setClasses] = useState<ReportClassFilterOption[]>([]);
  const [weeks, setWeeks] = useState<ReportWeekFilterOption[]>([]);
  const [teachers, setTeachers] = useState<ReportTeacherFilterOption[]>([]);
  const [classId, setClassId] = useState('');
  const [weekId, setWeekId] = useState('');
  const [teacherId, setTeacherId] = useState('');
  const [status, setStatus] = useState<StatusFilter>('');
  const [qInput, setQInput] = useState('');
  const [q, setQ] = useState('');
  const [items, setItems] = useState<TeacherReportHistoryItem[] | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  // Arama debounce (~300ms); yalnızca arama gerçekten değişince 1. sayfaya dön.
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
        teacher_id: teacherId || undefined,
        q: q || undefined,
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
  }, [status, classId, weekId, teacherId, q, page]);

  useEffect(() => {
    void load();
  }, [load]);

  /** Filtre değişince ilk sayfaya dön. */
  function applyFilter(setter: (value: string) => void) {
    return (value: string) => {
      setter(value);
      setPage(1);
    };
  }

  /** Aktif filtre sonucunu CSV indirir (spec §5.7). */
  async function handleExport() {
    setExporting(true);
    setError(null);
    try {
      await adminApi.exports.reports({
        status: status || undefined,
        class_id: classId || undefined,
        week_id: weekId || undefined,
        teacher_id: teacherId || undefined,
        q: q || undefined,
      });
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'CSV indirilemedi.');
    } finally {
      setExporting(false);
    }
  }

  // Seçenekler öğretmenle aynı uçtan; hata olursa sayfa filtresiz çalışır.
  useEffect(() => {
    teacherApi
      .reportFilters()
      .then((res) => {
        setClasses(res.classes);
        setWeeks(res.weeks);
        setTeachers(res.teachers ?? []);
      })
      .catch(() => {
        // Sessiz.
      });
  }, []);

  return (
    <div className="space-y-4">
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
        <FilterSelect label="Öğretmen" value={teacherId} onChange={applyFilter(setTeacherId)}>
          <option value="">Tümü</option>
          {teachers.map((t) => (
            <option key={t.id} value={t.id}>
              {t.full_name}
            </option>
          ))}
        </FilterSelect>
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-muted">Ara</span>
          <SearchBox
            value={qInput}
            onChange={setQInput}
            placeholder="Sınıf, ders veya öğretmen ara"
          />
        </label>
        <button
          type="button"
          onClick={() => void load()}
          className="rounded-md border border-border px-3 py-1.5 text-sm font-medium text-text hover:bg-bg"
        >
          Yenile
        </button>
        <button
          type="button"
          onClick={handleExport}
          disabled={exporting}
          className="rounded-md border border-border px-3 py-1.5 text-sm font-medium text-text hover:bg-bg disabled:cursor-not-allowed disabled:opacity-60"
        >
          {exporting ? 'İndiriliyor…' : 'CSV indir'}
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

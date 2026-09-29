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
import {
  ActionError,
  Button,
  CountChip,
  DataTable,
  FilterSelect,
  ListState,
  Pagination,
  SearchBox,
  StatusBadge,
  Toolbar,
  type Column,
} from '../../components/ui';

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
  const [exportError, setExportError] = useState<string | null>(null);

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
      setError(
        err instanceof ApiClientError
          ? err.message
          : 'Raporlar yüklenemedi. Bağlantınızı kontrol edip yeniden deneyin.',
      );
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
    setExportError(null);
    try {
      await adminApi.exports.reports({
        status: status || undefined,
        class_id: classId || undefined,
        week_id: weekId || undefined,
        teacher_id: teacherId || undefined,
        q: q || undefined,
      });
    } catch (err) {
      setExportError(err instanceof ApiClientError ? err.message : 'CSV indirilemedi.');
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

  const columns: Column<TeacherReportHistoryItem>[] = [
    {
      key: 'class',
      header: 'Sınıf · Ders',
      card: 'title',
      cell: (item) => (
        <Link
          to={`/admin/reports/${item.id}`}
          className="font-medium text-accent hover:underline"
          aria-label={`${item.class_name} · ${item.course_name} raporunu incele`}
        >
          {item.class_name} · {item.course_name}
        </Link>
      ),
    },
    {
      key: 'week',
      header: 'Hafta',
      className: 'tabular',
      cell: (item) => (
        <>
          {item.week_no}
          <span className="ml-1.5 text-xs text-muted">{item.week_label}</span>
        </>
      ),
    },
    {
      key: 'day',
      header: 'Ders günü',
      className: 'tabular text-muted',
      cell: (item) =>
        `${DAY_LABELS[item.day_of_week]}${item.lesson_time ? ` · ${item.lesson_time}` : ''}`,
    },
    {
      key: 'students',
      header: 'Öğrenci',
      className: 'tabular text-muted',
      cell: (item) => item.student_count,
    },
    { key: 'status', header: 'Durum', cell: (item) => <StatusBadge status={item.status} /> },
  ];

  return (
    <div className="space-y-4">
      <Toolbar
        filters={
          <>
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
            <div>
              <span className="mb-1 block text-[13px] font-medium text-muted">Ara</span>
              <SearchBox
                value={qInput}
                onChange={setQInput}
                placeholder="Sınıf, ders veya öğretmen ara"
                label="Ara"
              />
            </div>
            {!loading && !error && (
              <p className="flex items-center gap-1.5 pb-2 text-[13px] text-muted">
                <CountChip value={total} /> rapor
              </p>
            )}
          </>
        }
        actions={
          <>
            <Button onClick={() => void load()}>Yenile</Button>
            <Button onClick={handleExport} loading={exporting}>
              {exporting ? 'İndiriliyor…' : 'CSV indir'}
            </Button>
          </>
        }
      />

      <ActionError message={exportError} onDismiss={() => setExportError(null)} />

      <ListState
        loading={loading}
        error={error}
        onRetry={() => void load()}
        empty={!items || items.length === 0}
        emptyMessage="Bu filtrelerle rapor bulunamadı."
      >
        <DataTable
          rows={items ?? []}
          columns={columns}
          rowKey={(item) => item.id}
          rowLabel={(item) => `${item.class_name} ${item.course_name}`}
        />
      </ListState>

      {!loading && items && items.length > 0 && (
        <Pagination page={page} pageSize={PAGE_SIZE} total={total} onChange={setPage} />
      )}
    </div>
  );
}

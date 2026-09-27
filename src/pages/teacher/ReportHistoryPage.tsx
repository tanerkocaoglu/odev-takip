/**
 * Geçmiş raporlarım — spec.md §6 Öğretmen.
 * Tamamlananlar dashboard'da görünmez (draft düşer); bu ekran öğretmenin
 * tüm raporlarını durumuyla listeler ve düzenlemeye açar.
 *
 * Filtreler (durum + sınıf + hafta) sunucu taraflıdır; sayfalama doğru kalır.
 * Seçenekler öğretmenin kapsamındaki raporlardan türetilir
 * (`GET /teacher/reports/filters`).
 *
 * Mobil ("göz at" felsefesi): durum sekmeleri + Sınıf/Hafta yatay çip
 * şeritleri, sonuçlar kart listesi. Masaüstünde admin ile aynı görsel dil
 * (FilterSelect + tablo) korunur. İki düzen aynı anda DOM'a basılmaz
 * (`useIsMobile`), böylece erişilebilir adlar ve testler tekilleşir.
 */

import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, History } from 'lucide-react';
import type {
  ReportClassFilterOption,
  ReportWeekFilterOption,
  TeacherReportHistoryItem,
} from '../../types';
import { DAY_LABELS } from '../../types';
import { teacherApi, ApiClientError } from '../../services/api';
import { useIsMobile } from '../../hooks/useIsMobile';
import Pagination from '../../components/admin/Pagination';
import {
  LoadingState,
  EmptyState,
  FormError,
  FilterChip,
  FilterSelect,
  PageTitle,
  SecondaryButton,
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
  const isMobile = useIsMobile();
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
      setData(res.items);
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

  const filtersActive = Boolean(status || classId || weekId);

  const mobileFilters = (
    <div className="space-y-4">
      <div
        role="tablist"
        aria-label="Durum"
        className="flex gap-1 rounded-2xl border border-border bg-surface p-1"
      >
        {STATUS_OPTIONS.map((o) => (
          <button
            key={o.value}
            role="tab"
            type="button"
            aria-selected={status === o.value}
            onClick={() => applyFilter((v) => setStatus(v as StatusFilter))(o.value)}
            className={
              'flex min-h-11 flex-1 items-center justify-center rounded-xl text-sm font-medium transition-colors ' +
              (status === o.value ? 'bg-accent text-accent-fg' : 'text-muted hover:text-text')
            }
          >
            {o.label}
          </button>
        ))}
      </div>

      <section>
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
          Sınıf
        </h2>
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
          <FilterChip active={!classId} onClick={() => applyFilter(setClassId)('')}>
            Tümü
          </FilterChip>
          {classes.map((c) => (
            <FilterChip
              key={c.id}
              active={classId === c.id}
              onClick={() => applyFilter(setClassId)(c.id)}
            >
              {c.name}
            </FilterChip>
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
          Hafta
        </h2>
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
          <FilterChip active={!weekId} onClick={() => applyFilter(setWeekId)('')}>
            Tümü
          </FilterChip>
          {weeks.map((w) => (
            <FilterChip
              key={w.id}
              active={weekId === w.id}
              onClick={() => applyFilter(setWeekId)(w.id)}
            >
              {w.week_no}. hafta
            </FilterChip>
          ))}
        </div>
      </section>

      <SecondaryButton onClick={() => void load()}>Yenile</SecondaryButton>
    </div>
  );

  return (
    <div className="space-y-5 md:space-y-4">
      <PageTitle icon={History}>Geçmiş raporlarım</PageTitle>

      {isMobile ? (
        mobileFilters
      ) : (
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
          <SecondaryButton onClick={() => void load()}>Yenile</SecondaryButton>
        </div>
      )}

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
            {isMobile ? (
              <ul className="space-y-3">
                {data.map((item) => (
                  <li key={item.id}>
                    <Link
                      to={`/teacher/reports/${item.class_course_id}/${item.week_id}`}
                      className="card-interactive elevation-1 block rounded-2xl border border-border bg-surface p-4"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="tabular text-lg font-semibold text-text">
                            {item.week_no}. hafta
                          </p>
                          <p className="truncate text-sm text-muted">{item.week_label}</p>
                        </div>
                        <StatusBadge status={item.status} />
                      </div>
                      <p className="mt-2 truncate text-sm font-medium text-text">
                        {item.class_name} · {item.course_name}
                      </p>
                      <div className="tabular mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
                        <span>
                          {DAY_LABELS[item.day_of_week]}
                          {item.lesson_time ? ` · ${item.lesson_time}` : ''}
                        </span>
                        <span>{item.student_count} öğrenci</span>
                      </div>
                      <span className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-accent">
                        {item.status === 'sent' ? 'Görüntüle' : 'Aç'}{' '}
                        <ChevronRight size={16} aria-hidden="true" />
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="elevation-1 overflow-hidden rounded-md border border-border bg-surface">
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
                            to={`/teacher/reports/${item.class_course_id}/${item.week_id}`}
                            className="text-sm font-medium text-accent hover:underline"
                          >
                            {item.status === 'sent' ? 'Görüntüle' : 'Aç'}
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
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

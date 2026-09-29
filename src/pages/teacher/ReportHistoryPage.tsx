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
import {
  Button,
  EmptyState,
  ErrorState,
  FilterChip,
  FilterChipRow,
  FilterSelect,
  LoadingState,
  PageTitle,
  Pagination,
  StatusBadge,
  Tabs,
  TableCard,
  tdClass,
  thClass,
} from '../../components/ui';

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
      setError(
        err instanceof ApiClientError
          ? err.message
          : 'Raporlar yüklenemedi. Bağlantınızı kontrol edip yeniden deneyin.',
      );
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
      <Tabs
        label="Durum"
        value={status}
        onChange={(v) => applyFilter((x) => setStatus(x as StatusFilter))(v)}
        items={STATUS_OPTIONS.map((o) => ({ id: o.value, label: o.label }))}
      />

      <FilterChipRow label="Sınıf">
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
      </FilterChipRow>

      <FilterChipRow label="Hafta">
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
      </FilterChipRow>
    </div>
  );

  return (
    <div className="space-y-4">
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
          <Button onClick={() => void load()}>Yenile</Button>
        </div>
      )}

      {error && <ErrorState message={error} onRetry={() => void load()} />}

      {error ? null : loading ? (
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
                      className="card-interactive block rounded-md border border-border bg-surface p-4"
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
                      <div className="tabular mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-muted">
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
              <TableCard>
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border">
                      <th className={thClass()}>Hafta</th>
                      <th className={thClass()}>Sınıf · Ders</th>
                      <th className={thClass()}>Ders günü</th>
                      <th className={thClass()}>Öğrenci</th>
                      <th className={thClass()}>Durum</th>
                      <th className={thClass()}>
                        <span className="sr-only">Eylem</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.map((item) => (
                      <tr key={item.id} className="border-b border-border last:border-b-0">
                        <td className={tdClass() + ' tabular'}>
                          {item.week_no}
                          <span className="block text-xs text-muted">{item.week_label}</span>
                        </td>
                        <td className={tdClass()}>
                          {item.class_name} · {item.course_name}
                        </td>
                        <td className={tdClass() + ' tabular text-muted'}>
                          {DAY_LABELS[item.day_of_week]}
                          {item.lesson_time ? ` · ${item.lesson_time}` : ''}
                        </td>
                        <td className={tdClass() + ' tabular text-muted'}>{item.student_count}</td>
                        <td className={tdClass()}>
                          <StatusBadge status={item.status} />
                        </td>
                        <td className={tdClass() + ' text-right'}>
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
              </TableCard>
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

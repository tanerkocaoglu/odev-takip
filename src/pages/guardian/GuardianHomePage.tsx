/**
 * Veli paneli — ana ekran (spec.md §6 Veli).
 *
 * Mobil öncelikli, comfortable, tek sütun. Birden çok çocuk varsa öğrenci seçimi
 * yatay çip şeridi; **hafta** filtresi (tüm haftalar) liste üzerinde çalışır.
 * Sınıf değişmiş olsa bile geçmiş raporlar listede kalır (sınıf adı satırdan
 * gelir). Ders filtresi bu ekranda anlamsız olduğu için yoktur.
 */

import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { BookOpen, ChevronRight, Users } from 'lucide-react';
import type { GuardianChild, GuardianReportItem } from '../../types';
import { guardianApi, ApiClientError } from '../../services/api';
import { formatDateIst } from '../../utils/date';
import {
  CountChip,
  EmptyState,
  ErrorState,
  Field,
  FilterChip,
  FilterChipRow,
  PageHeader,
  Select,
  Skeleton,
} from '../../components/ui';

function ReportsSkeleton() {
  return (
    <div role="status" aria-busy="true" className="space-y-3">
      <span className="sr-only">Yükleniyor…</span>
      <Skeleton className="h-28 w-full" />
      <Skeleton className="h-28 w-full" />
      <Skeleton className="h-28 w-full" />
    </div>
  );
}

export default function GuardianHomePage() {
  const [students, setStudents] = useState<GuardianChild[] | null>(null);
  const [selected, setSelected] = useState<string>('');
  const [reports, setReports] = useState<GuardianReportItem[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [weekFilter, setWeekFilter] = useState('');

  const loadReports = useCallback(async (studentId: string) => {
    setLoading(true);
    setError(null);
    setReports(null);
    setWeekFilter('');
    try {
      const res = await guardianApi.reports(studentId);
      setReports(res.items);
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

  const loadStudents = useCallback(() => {
    setError(null);
    setStudents(null);
    guardianApi
      .students()
      .then((res) => {
        setStudents(res.items);
        if (res.items.length === 1) {
          setSelected(res.items[0].student_id);
          void loadReports(res.items[0].student_id);
        } else {
          setLoading(false);
        }
      })
      .catch((err) => {
        setError(
          err instanceof ApiClientError
            ? err.message
            : 'Öğrenciler yüklenemedi. Bağlantınızı kontrol edip yeniden deneyin.',
        );
        setLoading(false);
      });
  }, [loadReports]);

  useEffect(() => {
    loadStudents();
  }, [loadStudents]);

  const selectedStudent = students?.find((s) => s.student_id === selected) ?? null;

  const sorted = [...(reports ?? [])].sort((a, b) => b.relative_week_no - a.relative_week_no);
  // Aynı hafta yalnızca bir rapor olduğundan week_id ile tekilleştirilir.
  const weekOptions = [...new Map(sorted.map((r) => [r.week.id, r])).values()];
  const filtered = sorted.filter((r) => !weekFilter || r.week.id === weekFilter);
  const hasReports = (reports ?? []).length > 0;

  return (
    <div className="space-y-5">
      <PageHeader
        title={selectedStudent ? selectedStudent.student_name : 'Raporlarım'}
        description="Her hafta gönderilen ders raporlarını buradan inceleyebilirsiniz."
      />

      {error && (
        <ErrorState
          message={error}
          onRetry={() => {
            if (selected) void loadReports(selected);
            else loadStudents();
          }}
        />
      )}

      {/* Çok çocuk varsa: yatay çocuk çipleri (tek çocukta gösterilmez). */}
      {students && students.length > 1 && (
        <FilterChipRow label="Öğrenci">
          {students.map((s) => (
            <FilterChip
              key={s.student_id}
              active={selected === s.student_id}
              onClick={() => {
                setSelected(s.student_id);
                void loadReports(s.student_id);
              }}
            >
              {s.student_name}
            </FilterChip>
          ))}
        </FilterChipRow>
      )}

      {!students && !error && <ReportsSkeleton />}

      {students && students.length > 1 && !selected && !error && (
        <EmptyState icon={Users} message="Raporları görmek için yukarıdan bir öğrenci seçin." />
      )}

      {selected && loading && <ReportsSkeleton />}

      {selected && !loading && !error && reports && reports.length === 0 && (
        <EmptyState message="Bu öğrenci için henüz gönderilmiş rapor yok." />
      )}

      {selected && !loading && hasReports && (
        <>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <h2 className="flex items-center gap-2 text-base font-semibold text-text">
              Gönderilmiş raporlar <CountChip value={filtered.length} />
            </h2>
            {/* Hafta filtresi — tüm haftalar erişilebilir; kayıt sayısıyla büyümez. */}
            {weekOptions.length > 1 && (
              <div className="w-full sm:w-auto">
                <Field label="Hafta" htmlFor="guardian-week">
                  <Select
                    id="guardian-week"
                    value={weekFilter}
                    onChange={(e) => setWeekFilter(e.target.value)}
                  >
                    <option value="">Tüm haftalar</option>
                    {weekOptions.map((r) => (
                      <option key={r.week.id} value={r.week.id}>
                        {r.relative_week_no}. hafta · {r.week.label}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>
            )}
          </div>

          {filtered.length === 0 ? (
            <EmptyState message="Bu filtreyle rapor yok." />
          ) : (
            <ul className="grid gap-3 lg:grid-cols-2">
              {filtered.map((r) => (
                <li key={r.id}>
                  <Link
                    to={`/guardian/reports/${r.id}`}
                    aria-label={`${r.relative_week_no}. hafta raporunu aç`}
                    className="card-interactive block rounded-md border border-border bg-surface p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="tabular text-lg font-semibold text-text">
                          {r.relative_week_no}. hafta
                        </p>
                        <p className="tabular text-sm text-muted">{r.week.label}</p>
                      </div>
                      <ChevronRight
                        size={20}
                        aria-hidden="true"
                        className="mt-1 shrink-0 text-muted"
                      />
                    </div>

                    <p className="mt-3 flex items-center gap-1.5 text-sm text-text">
                      <BookOpen size={15} aria-hidden="true" className="shrink-0 text-muted" />
                      <span>{r.class_name ?? '—'}</span>
                    </p>
                    <p className="tabular mt-0.5 text-[13px] text-muted">
                      {formatDateIst(r.sent_at)} tarihinde gönderildi
                    </p>
                    {r.courses.length > 0 && (
                      <p className="mt-2 text-[13px] text-muted">{r.courses.join(' · ')}</p>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

/**
 * Veli paneli — ana ekran (spec.md §6 Veli).
 *
 * Müşteri yüzü: marka mavisi, mobil öncelikli "rapor rafı". Öğrenci seçimi
 * yatay çip şeridi; **hafta** filtresi (tüm haftalar, erişilebilir seçici)
 * liste üzerinde çalışır. Raporlar dikey bir **zaman çizelgesi** (masaüstünde
 * çok sütunlu ızgara). Sınıf değişmiş olsa bile geçmiş raporlar listede kalır
 * (sınıf adı satırdan gelir). Her haftanın dersleri kart üzerinde bilgi olarak
 * gösterilir; ders filtresi bu ekranda anlamsız olduğu için yoktur.
 */

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { BookOpen, ChevronRight, Inbox } from 'lucide-react';
import type { GuardianChild, GuardianReportItem } from '../../types';
import { guardianApi, ApiClientError } from '../../services/api';

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('tr-TR');
}

function Chip({
  active,
  onClick,
  children,
}: {
  active?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={
        'shrink-0 rounded-full border px-4 py-2 text-sm font-medium transition-colors ' +
        (active
          ? 'border-accent bg-accent text-accent-fg'
          : 'border-border bg-surface text-text hover:border-accent hover:text-accent')
      }
    >
      {children}
    </button>
  );
}

function EmptyBlock({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-3xl border border-dashed border-border bg-surface/60 py-14 text-center">
      <span className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-accent/10 text-accent">
        <Inbox size={24} aria-hidden="true" />
      </span>
      <p className="text-sm font-medium text-text">{title}</p>
      <p className="mx-auto mt-1 max-w-xs text-sm text-muted">{text}</p>
    </div>
  );
}

function ReportsSkeleton() {
  return (
    <div className="space-y-3" aria-hidden="true">
      <div className="shimmer h-14 w-1/2 rounded-2xl" />
      <div className="shimmer h-28 w-full rounded-2xl" />
      <div className="shimmer h-28 w-full rounded-2xl" />
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
      setError(err instanceof ApiClientError ? err.message : 'Bir hata oluştu.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
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
        setError(err instanceof ApiClientError ? err.message : 'Bir hata oluştu.');
        setLoading(false);
      });
  }, [loadReports]);

  const selectedStudent = students?.find((s) => s.student_id === selected) ?? null;

  const sorted = [...(reports ?? [])].sort(
    (a, b) => b.relative_week_no - a.relative_week_no,
  );
  // Aynı hafta yalnızca bir rapor olduğundan week_id ile tekilleştirilir.
  const weekOptions = [...new Map(sorted.map((r) => [r.week.id, r])).values()];
  const filtered = sorted.filter((r) => !weekFilter || r.week.id === weekFilter);

  const hasReports = (reports ?? []).length > 0;

  return (
    <div className="space-y-6">
      <header className="brand-hero rounded-3xl border border-border px-5 py-6">
        <p className="text-xs font-semibold uppercase tracking-wide text-accent">
          Haftalık raporlar
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-text">
          {selectedStudent ? selectedStudent.student_name : 'Raporlarım'}
        </h1>
        <p className="mt-1.5 max-w-prose text-sm leading-relaxed text-muted">
          Her hafta gönderilen ders raporlarını buradan inceleyebilirsin.
        </p>
      </header>

      {error && (
        <p role="alert" className="text-sm font-medium text-sub-missing">
          {error}
        </p>
      )}

      {/* Çok çocuk varsa: yatay çocuk çipleri (tek çocukta gösterilmez). */}
      {students && students.length > 1 && (
        <section>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
            Öğrenci
          </h2>
          <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
            {students.map((s) => (
              <Chip
                key={s.student_id}
                active={selected === s.student_id}
                onClick={() => {
                  setSelected(s.student_id);
                  void loadReports(s.student_id);
                }}
              >
                {s.student_name}
              </Chip>
            ))}
          </div>
        </section>
      )}

      {!students && !error && <ReportsSkeleton />}

      {selected && loading && <ReportsSkeleton />}

      {selected && !loading && reports && reports.length === 0 && (
        <EmptyBlock
          title="Henüz gönderilmiş rapor yok"
          text="Bu öğrenci için henüz gönderilmiş rapor yok."
        />
      )}

      {selected && !loading && hasReports && (
        <>
          {/* Hafta filtresi — tüm haftalar erişilebilir; kayıt sayısıyla büyümez. */}
          {weekOptions.length > 1 && (
            <section>
              <label className="block">
                <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted">
                  Hafta
                </span>
                <select
                  value={weekFilter}
                  onChange={(e) => setWeekFilter(e.target.value)}
                  className="h-10 w-full max-w-xs rounded-xl border border-border bg-surface px-3 text-sm text-text focus:border-accent"
                >
                  <option value="">Tüm haftalar</option>
                  {weekOptions.map((r) => (
                    <option key={r.week.id} value={r.week.id}>
                      {r.relative_week_no}. hafta · {r.week.label}
                    </option>
                  ))}
                </select>
              </label>
            </section>
          )}

          {filtered.length === 0 ? (
            <EmptyBlock title="Sonuç yok" text="Bu filtrelerle rapor yok." />
          ) : (
            <ol className="relative space-y-3 border-l border-border pl-5 lg:grid lg:grid-cols-2 lg:gap-4 lg:space-y-0 lg:border-l-0 lg:pl-0 xl:grid-cols-3">
              {filtered.map((r) => (
                <li key={r.id} className="relative">
                  <span
                    className="absolute -left-[26px] top-5 h-3 w-3 rounded-full border-2 border-surface bg-accent lg:hidden"
                    aria-hidden="true"
                  />
                  <Link
                    to={`/guardian/reports/${r.id}`}
                    aria-label={`${r.relative_week_no}. hafta raporunu aç`}
                    className="card-interactive block rounded-2xl border border-border bg-surface p-4 elevation-1"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="tabular text-lg font-semibold text-text">
                          {r.relative_week_no}. hafta
                        </p>
                        <p className="text-sm text-muted">{r.week.label}</p>
                      </div>
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent/10 text-accent">
                        <ChevronRight size={18} aria-hidden="true" />
                      </span>
                    </div>

                    <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-bg px-2.5 py-1 font-medium text-text">
                        <BookOpen size={13} aria-hidden="true" />
                        {r.class_name ?? '—'}
                      </span>
                      <span className="tabular text-muted">
                        {fmtDate(r.sent_at)} tarihinde gönderildi
                      </span>
                    </div>

                    {r.courses.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {r.courses.map((c) => (
                          <span
                            key={c}
                            className="rounded-full border border-border px-2 py-0.5 text-[11px] text-muted"
                          >
                            {c}
                          </span>
                        ))}
                      </div>
                    )}
                  </Link>
                </li>
              ))}
            </ol>
          )}
        </>
      )}
    </div>
  );
}

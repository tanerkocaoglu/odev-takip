/**
 * Veli paneli — ana ekran (spec.md §6 Veli).
 * Öğrenci seçimi (birden çok çocuk varsa) + öğrencinin sistemdeki tüm
 * gönderilmiş raporları. Sınıf değişmiş olsa bile geçmiş raporlar listede
 * kalır (sınıf adı snapshot'tan gelir).
 */

import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { BookOpen, FileText } from 'lucide-react';
import type { GuardianChild, GuardianReportItem } from '../../types';
import { guardianApi, ApiClientError } from '../../services/api';
import { LoadingState, EmptyState, FormError, PageTitle } from '../../components/admin/ui';

export default function GuardianHomePage() {
  const navigate = useNavigate();
  const [students, setStudents] = useState<GuardianChild[] | null>(null);
  const [selected, setSelected] = useState<string>('');
  const [reports, setReports] = useState<GuardianReportItem[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [weekFilter, setWeekFilter] = useState('');
  const [courseFilter, setCourseFilter] = useState('');

  const loadReports = useCallback(async (studentId: string) => {
    setLoading(true);
    setError(null);
    setReports(null);
    setWeekFilter('');
    setCourseFilter('');
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

  function onSelect(studentId: string) {
    setSelected(studentId);
    void loadReports(studentId);
  }

  // Filtre seçenekleri satırlardan türetilir (gösterim katmanı — backend yalnızca
  // görece etiketi ve ders listesini döner; mutlak sıralama değişmez).
  const weekOptions = [...new Set((reports ?? []).map((r) => r.relative_week_no))].sort(
    (a, b) => a - b,
  );
  const courseOptions = [...new Set((reports ?? []).flatMap((r) => r.courses))].sort();

  const filtered =
    reports?.filter(
      (r) =>
        (!weekFilter || String(r.relative_week_no) === weekFilter) &&
        (!courseFilter || r.courses.includes(courseFilter)),
    ) ?? [];

  const selectClass = 'h-9 rounded-md border border-border bg-surface px-3 text-sm text-text focus:border-accent';

  return (
    <div className="space-y-6">
      <PageTitle icon={FileText}>Öğrenci raporlarım</PageTitle>

      <FormError message={error} />

      {students && students.length > 1 && (
        <div>
          <label
            htmlFor="student-select"
            className="mb-1 block text-sm font-medium text-muted"
          >
            Öğrenci
          </label>
          <select
            id="student-select"
            value={selected}
            onChange={(e) => onSelect(e.target.value)}
            className="h-9 w-full max-w-xs rounded-md border border-border bg-surface px-3 text-sm text-text focus:border-accent"
          >
            <option value="" disabled>
              Seçin…
            </option>
            {students.map((s) => (
              <option key={s.student_id} value={s.student_id}>
                {s.student_name}
                {s.class_name ? ` (${s.class_name})` : ''}
              </option>
            ))}
          </select>
        </div>
      )}

      {selected && loading && <LoadingState />}

      {selected && !loading && reports && reports.length === 0 && (
        <EmptyState message="Bu öğrenci için henüz gönderilmiş rapor yok." />
      )}

      {selected && !loading && reports && reports.length > 0 && (
        <>
          <div className="flex flex-wrap gap-3">
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-muted">Hafta</span>
              <select
                value={weekFilter}
                onChange={(e) => setWeekFilter(e.target.value)}
                className={selectClass}
              >
                <option value="">Tümü</option>
                {weekOptions.map((w) => (
                  <option key={w} value={String(w)}>
                    {w}. hafta
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-muted">Ders</span>
              <select
                value={courseFilter}
                onChange={(e) => setCourseFilter(e.target.value)}
                className={selectClass}
              >
                <option value="">Tümü</option>
                {courseOptions.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {filtered.length === 0 ? (
            <EmptyState message="Bu filtrelerle rapor yok." />
          ) : (
            <div className="elevation-1 overflow-hidden rounded-md border border-border bg-surface">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-[13px] font-medium text-muted">
                    <th className="px-3 py-2">Hafta</th>
                    <th className="px-3 py-2">Sınıf</th>
                    <th className="px-3 py-2">Ders</th>
                    <th className="px-3 py-2">Gönderim</th>
                    <th className="px-3 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r) => (
                    <tr
                      key={r.id}
                      role="link"
                      tabIndex={0}
                      aria-label={`${r.relative_week_no}. hafta raporunu aç`}
                      onClick={() => navigate(`/guardian/reports/${r.id}`)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          navigate(`/guardian/reports/${r.id}`);
                        }
                      }}
                      className="cursor-pointer border-b border-border transition-colors last:border-b-0 hover:bg-bg focus-visible:outline-offset-[-2px]"
                    >
                      <td className="px-3 py-2 text-[13px] text-text">
                        <span className="tabular font-medium">{r.relative_week_no}</span>
                        <span className="block text-xs text-muted">{r.week.label}</span>
                      </td>
                      <td className="px-3 py-2 text-[13px] text-text">
                        {r.class_name ?? '—'}
                      </td>
                      <td className="px-3 py-2 text-[13px] text-muted">
                        <span className="inline-flex items-center gap-1.5">
                          <BookOpen size={14} aria-hidden="true" />
                          <span className="tabular">{r.course_count}</span>
                        </span>
                      </td>
                      <td className="tabular px-3 py-2 text-[13px] text-muted">
                        {new Date(r.sent_at).toLocaleDateString('tr-TR')}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <Link
                          to={`/guardian/reports/${r.id}`}
                          onClick={(e) => e.stopPropagation()}
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
          )}
        </>
      )}

      {!students && !loading && !error && <LoadingState />}
    </div>
  );
}

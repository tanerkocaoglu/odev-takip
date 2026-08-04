/**
 * Veli paneli — ana ekran (spec.md §6 Veli).
 * Öğrenci seçimi (birden çok çocuk varsa) + öğrencinin sistemdeki tüm
 * gönderilmiş raporları. Sınıf değişmiş olsa bile geçmiş raporlar listede
 * kalır (sınıf adı snapshot'tan gelir).
 */

import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { GuardianChild, GuardianReportItem } from '../../types';
import { guardianApi, ApiClientError } from '../../services/api';
import { LoadingState, EmptyState, FormError } from '../../components/admin/ui';

export default function GuardianHomePage() {
  const [students, setStudents] = useState<GuardianChild[] | null>(null);
  const [selected, setSelected] = useState<string>('');
  const [reports, setReports] = useState<GuardianReportItem[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadReports = useCallback(async (studentId: string) => {
    setLoading(true);
    setError(null);
    setReports(null);
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

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-text">Öğrenci raporlarım</h1>

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
        <div className="overflow-hidden rounded-md border border-border bg-surface">
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
              {reports.map((r) => (
                <tr key={r.id} className="border-b border-border last:border-b-0">
                  <td className="px-3 py-2 text-[13px] text-text">
                    <span className="tabular font-medium">{r.week.week_no}</span>
                    <span className="block text-xs text-muted">{r.week.label}</span>
                  </td>
                  <td className="px-3 py-2 text-[13px] text-text">
                    {r.class_name ?? '—'}
                  </td>
                  <td className="tabular px-3 py-2 text-[13px] text-muted">
                    {r.course_count}
                  </td>
                  <td className="tabular px-3 py-2 text-[13px] text-muted">
                    {new Date(r.sent_at).toLocaleDateString('tr-TR')}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <Link
                      to={`/guardian/reports/${r.id}`}
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

      {!students && !loading && !error && <LoadingState />}
    </div>
  );
}

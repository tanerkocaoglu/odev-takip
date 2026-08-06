/**
 * Admin panel — spec.md §5.5.
 * Varsayılan görünüm özet + eksik rapor listesidir ("Bu hafta N rapordan
 * M'si tamamlandı"), öğretmene göre gruplama seçeneği ve bekleyen gönderim
 * sayacıyla. Tam matris (satır = sınıf, sütun = ders) ikincil sekmede.
 */

import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { AdminDashboard } from '../../types';
import { DAY_LABELS } from '../../types';
import { adminApi, downloadBackup, ApiClientError } from '../../services/api';
import { EmptyState, FormError, LoadingState } from '../../components/admin/ui';

export default function AdminDashboardPage() {
  const [data, setData] = useState<AdminDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<'missing' | 'matrix'>('missing');
  const [groupByTeacher, setGroupByTeacher] = useState(false);
  const [backupRunning, setBackupRunning] = useState(false);
  const [backupDone, setBackupDone] = useState<string | null>(null);
  const [backupError, setBackupError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await adminApi.dashboard());
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Bir hata oluştu.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleBackup() {
    setBackupRunning(true);
    setBackupDone(null);
    setBackupError(null);
    try {
      const filename = await downloadBackup();
      setBackupDone(`${filename} indirildi.`);
    } catch (err) {
      setBackupError(err instanceof ApiClientError ? err.message : 'Yedek oluşturulamadı.');
    } finally {
      setBackupRunning(false);
    }
  }

  if (loading) return <LoadingState />;
  if (error) return <FormError message={error} />;
  if (!data) return <EmptyState message="Veri yüklenemedi." />;

  const completed = data.summary.completed;
  const total = data.summary.total;

  // Öğretmene göre gruplama ("Kim geride kalmış?")
  const grouped = new Map<string, typeof data.missing>();
  for (const item of data.missing) {
    const list = grouped.get(item.teacher_name) ?? [];
    list.push(item);
    grouped.set(item.teacher_name, list);
  }

  const tabs = (
    <div className="flex gap-1 border-b border-border">
      {(
        [
          ['missing', 'Eksik raporlar'],
          ['matrix', 'Tam matris'],
        ] as const
      ).map(([key, label]) => (
        <button
          key={key}
          type="button"
          onClick={() => setTab(key)}
          className={
            'rounded-t-md border-b-2 px-3 py-2 text-sm font-medium transition-colors ' +
            (tab === key
              ? 'border-accent text-accent'
              : 'border-transparent text-muted hover:text-text')
          }
        >
          {label}
        </button>
      ))}
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-xl font-semibold text-text">Panel</h1>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void handleBackup()}
            disabled={backupRunning}
            className="rounded-md border border-border px-3 py-1.5 text-sm font-medium text-text transition-colors hover:bg-bg disabled:cursor-not-allowed disabled:opacity-60"
          >
            {backupRunning ? 'Yedekleniyor…' : 'Yedek indir'}
          </button>
          <button
            type="button"
            onClick={() => void load()}
            className="rounded-md border border-border px-3 py-1.5 text-sm font-medium text-text hover:bg-bg"
          >
            Yenile
          </button>
        </div>
      </div>

      {backupDone && <p className="text-sm font-medium text-status-sent">{backupDone}</p>}
      {backupError && <FormError message={backupError} />}

      <p className="text-sm text-muted">
        Bu hafta{' '}
        <span className="tabular font-semibold text-text">
          {total} rapordan {completed} tanesi tamamlandı
        </span>
        {data.week ? ` (${data.week.label})` : ''}.
      </p>

      <div className="flex flex-wrap gap-3">
        <Link
          to="/admin/digests"
          className="rounded-md border border-border px-4 py-2 text-sm font-medium text-text transition-colors hover:bg-bg"
        >
          Bekleyen gönderim:{' '}
          <span className="tabular font-semibold text-accent">{data.digests.ready}</span>{' '}
          hazır ·{' '}
          <span className="tabular font-semibold text-accent">{data.digests.pending}</span>{' '}
          eksikli
        </Link>
        <Link
          to="/admin/reports"
          className="rounded-md border border-border px-4 py-2 text-sm font-medium text-text transition-colors hover:bg-bg"
        >
          Tüm raporlar
        </Link>
      </div>

      {tabs}

      {tab === 'missing' && (
        <div className="space-y-4">
          <label className="flex items-center gap-2 text-sm text-muted">
            <input
              type="checkbox"
              checked={groupByTeacher}
              onChange={(e) => setGroupByTeacher(e.target.checked)}
              className="h-4 w-4 accent-[var(--accent)]"
            />
            Öğretmene göre grupla (Kim geride kalmış?)
          </label>

          {data.missing.length === 0 ? (
            <EmptyState message="Bu hafta doldurulacak eksik rapor yok." />
          ) : groupByTeacher ? (
            [...grouped.entries()].map(([teacher, items]) => (
              <div key={teacher} className="space-y-2">
                <h2 className="text-sm font-semibold text-text">
                  {teacher}{' '}
                  <span className="tabular font-medium text-muted">({items.length})</span>
                </h2>
                <div className="overflow-hidden rounded-md border border-border bg-surface">
                  <table className="w-full text-sm">
                    <tbody>
                      {items.map((item) => (
                        <tr
                          key={item.class_course_id}
                          className="border-b border-border last:border-b-0"
                        >
                          <td className="px-3 py-2 text-[13px] text-text">
                            {item.class_name} · {item.course_name}
                          </td>
                          <td className="tabular px-3 py-2 text-[13px] text-muted">
                            {DAY_LABELS[item.day_of_week]}
                            {item.lesson_time ? ` · ${item.lesson_time}` : ''}
                          </td>
                          <td className="px-3 py-2 text-right">
                            {item.is_overdue && (
                              <span className="inline-flex items-center rounded-full bg-att-late/10 px-2 py-0.5 text-xs font-medium text-att-late">
                                Günü geçti
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))
          ) : (
            <div className="overflow-hidden rounded-md border border-border bg-surface">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-[13px] font-medium text-muted">
                    <th className="px-3 py-2">Sınıf · Ders</th>
                    <th className="px-3 py-2">Öğretmen</th>
                    <th className="px-3 py-2">Ders günü</th>
                    <th className="px-3 py-2">Durum</th>
                  </tr>
                </thead>
                <tbody>
                  {data.missing.map((item) => (
                    <tr
                      key={item.class_course_id}
                      className={
                        'border-b border-border last:border-b-0 ' +
                        (item.is_overdue ? 'bg-att-late/5' : '')
                      }
                    >
                      <td className="px-3 py-2 text-[13px] font-medium text-text">
                        {item.class_name} · {item.course_name}
                      </td>
                      <td className="px-3 py-2 text-[13px] text-text">{item.teacher_name}</td>
                      <td className="tabular px-3 py-2 text-[13px] text-muted">
                        {DAY_LABELS[item.day_of_week]}
                        {item.lesson_time ? ` · ${item.lesson_time}` : ''}
                      </td>
                      <td className="px-3 py-2">
                        <span
                          className={
                            'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ' +
                            (item.is_overdue
                              ? 'bg-att-late/10 text-att-late'
                              : 'bg-status-draft/10 text-status-draft')
                          }
                        >
                          {item.is_overdue
                            ? 'Günü geçti'
                            : item.status === 'draft'
                              ? 'Taslak'
                              : 'Hiç açılmamış'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {tab === 'matrix' && (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <tbody>
              {data.matrix.map((row) => (
                <tr key={row.class_id} className="border-b border-border">
                  <td className="whitespace-nowrap px-3 py-2 font-medium text-text">
                    {row.class_name}
                  </td>
                  {row.courses.map((course) => (
                    <td
                      key={course.class_course_id}
                      className="min-w-[140px] px-3 py-2 align-top"
                    >
                      <div className="text-[13px] font-medium text-text">
                        {course.course_name}
                      </div>
                      <div className="text-xs text-muted">{course.teacher_name}</div>
                      <div className="mt-1">
                        <span
                          className={
                            'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ' +
                            (course.status === 'sent'
                              ? 'bg-status-sent/10 text-status-sent'
                              : course.status === 'completed'
                                ? 'bg-status-completed/10 text-status-completed'
                                : 'bg-status-draft/10 text-status-draft')
                          }
                        >
                          {course.status === 'sent'
                            ? 'Gönderildi'
                            : course.status === 'completed'
                              ? 'Tamamlandı'
                              : 'Eksik'}
                        </span>
                      </div>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

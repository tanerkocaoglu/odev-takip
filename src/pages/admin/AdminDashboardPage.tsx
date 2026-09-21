/**
 * Admin panel — spec.md §5.5.
 * Varsayılan görünüm özet + eksik rapor listesidir ("Bu hafta N rapordan
 * M'si tamamlandı"), öğretmene göre gruplama seçeneği ve bekleyen gönderim
 * sayacıyla. Tam matris (satır = sınıf, sütun = ders) ikincil sekmede.
 */

import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import {
  AlertCircle,
  AlertTriangle,
  Archive,
  CheckCircle,
  Grid3x3,
  LayoutDashboard,
  Send,
  type LucideIcon,
} from 'lucide-react';
import type { AdminDashboard, RiskList } from '../../types';
import { DAY_LABELS, RISK_FLAG_LABELS, type RiskFlag } from '../../types';
import { adminApi, downloadBackup, ApiClientError } from '../../services/api';
import { Badge, EmptyState, FormError, PageTitle } from '../../components/admin/ui';
import { formatDate } from '../../utils/date';

/** İskelet bloğu — shimmer sınıfı index.css'te tanımlı. */
function Skeleton({ className = '' }: { className?: string }) {
  return <div aria-hidden="true" className={'shimmer rounded ' + className} />;
}

/** Özet kartı ikonu — accent %10 daire içinde. */
function CardIcon({ Icon }: { Icon: LucideIcon }) {
  return (
    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-accent/10 text-accent">
      <Icon size={16} aria-hidden="true" />
    </span>
  );
}

export default function AdminDashboardPage() {
  const reduceMotion = useReducedMotion();
  const [data, setData] = useState<AdminDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<'missing' | 'matrix' | 'risk'>('missing');
  const [groupByTeacher, setGroupByTeacher] = useState(false);
  const [backupRunning, setBackupRunning] = useState(false);
  const [backupDone, setBackupDone] = useState<string | null>(null);
  const [backupError, setBackupError] = useState<string | null>(null);

  // Risk sekmesi — sekmeye girince tembel yüklenir.
  const [risk, setRisk] = useState<RiskList | null>(null);
  const [riskLoading, setRiskLoading] = useState(false);
  const [riskError, setRiskError] = useState<string | null>(null);

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

  const loadRisk = useCallback(async () => {
    setRiskLoading(true);
    setRiskError(null);
    try {
      setRisk(await adminApi.risk());
    } catch (err) {
      setRiskError(err instanceof ApiClientError ? err.message : 'Bir hata oluştu.');
    } finally {
      setRiskLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (tab === 'risk') void loadRisk();
  }, [tab, loadRisk]);

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

  if (loading) {
    return (
      <div aria-busy="true" className="space-y-4">
        <div className="flex items-center justify-between">
          <Skeleton className="h-7 w-24" />
          <Skeleton className="h-9 w-44" />
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </div>
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }
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

  const filters: {
    key: 'missing' | 'matrix' | 'risk';
    label: string;
    icon: LucideIcon;
    count: number | null;
  }[] = [
    { key: 'missing', label: 'Eksik raporlar', icon: AlertTriangle, count: data.missing.length },
    { key: 'matrix', label: 'Tam matris', icon: Grid3x3, count: data.matrix.length },
    {
      key: 'risk',
      label: 'Riskli öğrenciler',
      icon: AlertCircle,
      count: risk ? risk.items.length : null,
    },
  ];

  const tabs = (
    <div className="grid gap-3 sm:grid-cols-3">
      {filters.map(({ key, label, icon: Icon, count }) => {
        const isActive = tab === key;
        return (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            aria-label={label}
            aria-pressed={isActive}
            className={
              'card-interactive elevation-1 flex items-center gap-3 rounded-md border bg-surface p-3 text-left ' +
              (isActive ? 'border-accent' : 'border-border')
            }
          >
            <span
              className={
                'flex h-9 w-9 shrink-0 items-center justify-center rounded-full ' +
                (isActive ? 'bg-accent/10 text-accent' : 'bg-bg text-muted')
              }
            >
              <Icon size={18} aria-hidden="true" />
            </span>
            <span className="min-w-0 flex-1 truncate text-sm font-medium text-text">
              {label}
            </span>
            {count !== null && <Badge tone="neutral">{count}</Badge>}
          </button>
        );
      })}
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <PageTitle icon={LayoutDashboard}>Panel</PageTitle>
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

      {/* Hafta henüz başlamadıysa doldurulmuş rapor yoktur; bu durumda
          "eksik" değil "henüz başlamadı" bilgisi gösterilir (spec §5.1/§5.5). */}
      {data.week_not_started && data.week && (
        <p className="elevation-1 rounded-md border border-border bg-surface p-4 text-sm text-muted">
          {data.week.label} haftası henüz başlamadı ({formatDate(data.week.start_date)}).
          Raporlar hafta başladığında doldurulmaya başlanır.
        </p>
      )}

      {/* Özet kartları — üst kenarlık anlam rengi; tıklanabilirler Level 2 hover */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="elevation-1 rounded-md border border-border border-t-2 border-t-status-sent bg-surface p-4">
          <CardIcon Icon={CheckCircle} />
          <p className="tabular mt-2 text-2xl font-semibold text-text">{completed}</p>
          <p className="mt-1 text-xs text-muted">
            Tamamlanan rapor{data.week ? ` · ${data.week.label}` : ''}
          </p>
        </div>
        <div
          className={
            'elevation-1 rounded-md border border-border border-t-2 bg-surface p-4 ' +
            (data.week_not_started ? 'border-t-border' : 'border-t-att-late')
          }
        >
          <CardIcon Icon={data.week_not_started ? LayoutDashboard : AlertTriangle} />
          <p className="tabular mt-2 text-2xl font-semibold text-text">
            {data.week_not_started ? '—' : Math.max(0, total - completed)}
          </p>
          <p className="mt-1 text-xs text-muted">
            {data.week_not_started ? 'Henüz başlamadı' : 'Eksik rapor'}
          </p>
        </div>
        <Link
          to="/admin/digests"
          className="card-interactive elevation-1 block rounded-md border border-border border-t-2 border-t-status-completed bg-surface p-4"
        >
          <CardIcon Icon={Send} />
          <p className="tabular mt-2 text-2xl font-semibold text-text">
            {data.digests.ready}
            <span className="text-base font-normal text-muted"> hazır</span>
          </p>
          <p className="tabular mt-1 text-xs text-muted">
            Bekleyen gönderim · {data.digests.pending} eksikli
          </p>
        </Link>
        <Link
          to="/admin/reports"
          className="card-interactive elevation-1 block rounded-md border border-border border-t-2 border-t-accent bg-surface p-4"
        >
          <CardIcon Icon={Archive} />
          <p className="mt-2 text-base font-semibold text-text">Tüm raporlar</p>
          <p className="mt-1 text-xs text-muted">Durum, sınıf ve haftaya göre filtreleyin</p>
        </Link>
      </div>

      {tabs}

      {/* Sekme içeriği geçişi — prefers-reduced-motion'da animasyonsuz */}
      <motion.div
        key={tab}
        initial={reduceMotion ? false : { opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={
          reduceMotion
            ? { duration: 0 }
            : {
                duration: 0.18,
                ease: [0.4, 0, 0.2, 1] as [number, number, number, number],
              }
        }
      >
      {tab === 'missing' && (
        <div className="space-y-4">
          <label className="flex items-center gap-2 text-sm text-muted">
            <input
              type="checkbox"
              checked={groupByTeacher}
              onChange={(e) => setGroupByTeacher(e.target.checked)}
              className="h-4 w-4 accent-accent"
            />
            Öğretmene göre grupla (Kim geride kalmış?)
          </label>

          {data.missing.length === 0 ? (
            <EmptyState
              message={
                data.week_not_started
                  ? 'Bu hafta henüz başlamadı; raporlar hafta başladığında doldurulacak.'
                  : 'Bu hafta doldurulacak eksik rapor yok.'
              }
            />
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
                          className="border-b border-border transition-colors last:border-b-0 hover:bg-bg"
                        >
                          <td className="px-3 py-2 text-[13px] text-text">
                            {item.class_name} · {item.course_name}
                          </td>
                          <td className="tabular px-3 py-2 text-[13px] text-muted">
                            {DAY_LABELS[item.day_of_week]}
                            {item.lesson_time ? ` · ${item.lesson_time}` : ''}
                          </td>
                          <td className="px-3 py-2 text-right">
                            {item.is_overdue && <Badge tone="warning">Günü geçti</Badge>}
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
                        'border-b border-border transition-colors last:border-b-0 hover:bg-bg ' +
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
                        <Badge tone={item.is_overdue ? 'warning' : 'neutral'}>
                          {item.is_overdue
                            ? 'Günü geçti'
                            : item.status === 'draft'
                              ? 'Taslak'
                              : 'Hiç açılmamış'}
                        </Badge>
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
                  {row.courses.map((course) => {
                    const done =
                      course.status === 'sent' || course.status === 'completed';
                    const label =
                      course.status === 'sent'
                        ? 'Gönderildi'
                        : course.status === 'completed'
                          ? 'Tamamlandı'
                          : data.week_not_started
                            ? 'Henüz başlamadı'
                            : 'Eksik';
                    return (
                      <td
                        key={course.class_course_id}
                        className="min-w-[140px] px-3 py-2 align-top"
                      >
                        <div className="text-[13px] font-medium text-text">
                          {course.course_name}
                        </div>
                        <div className="text-xs text-muted">{course.teacher_name}</div>
                        <div className="mt-1">
                          <Badge
                            tone={done ? 'positive' : data.week_not_started ? 'neutral' : 'warning'}
                          >
                            {label}
                          </Badge>
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {tab === 'risk' && (
        <div className="space-y-3">
          {risk && risk.weeks.length > 0 && (
            <p className="text-sm text-muted">
              Son{' '}
              <span className="tabular font-semibold text-text">{risk.weeks.length}</span> hafta
              değerlendirildi (
              {risk.weeks.map((w) => `Hafta ${w.week_no}`).join(', ')}).
            </p>
          )}

          {riskLoading ? (
            <div aria-busy="true" className="space-y-2">
              <Skeleton className="h-5 w-72" />
              <div className="overflow-hidden rounded-md border border-border bg-surface">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="border-b border-border p-3 last:border-b-0">
                    <Skeleton className="h-4 w-full" />
                  </div>
                ))}
              </div>
            </div>
          ) : riskError ? (
            <FormError message={riskError} />
          ) : risk && risk.items.length === 0 ? (
            <EmptyState
              message={
                risk.weeks.length === 0
                  ? 'Henüz değerlendirilecek geçmiş hafta yok.'
                  : 'Bu kriterlerle riskli öğrenci yok.'
              }
            />
          ) : (
            risk && (
              <div className="overflow-hidden rounded-md border border-border bg-surface">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-[13px] font-medium text-muted">
                      <th className="px-3 py-2">Öğrenci</th>
                      <th className="px-3 py-2">Sınıf</th>
                      <th className="px-3 py-2">Okul</th>
                      <th className="px-3 py-2">Sınıf seviyesi</th>
                      <th className="px-3 py-2">Risk nedeni</th>
                    </tr>
                  </thead>
                  <tbody>
                    {risk.items.map((s) => (
                      <tr
                        key={s.student_id}
                        className="border-b border-border transition-colors last:border-b-0 hover:bg-bg"
                      >
                        <td className="px-3 py-2 font-medium text-text">{s.student_name}</td>
                        <td className="px-3 py-2 text-[13px] text-text">{s.class_name ?? '—'}</td>
                        <td className="px-3 py-2 text-[13px] text-muted">
                          {s.school_name ?? '—'}
                        </td>
                        <td className="px-3 py-2 text-[13px] text-muted">
                          {s.grade_level ?? '—'}
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex flex-wrap gap-1.5">
                            {s.risk_flags.map((flag) => (
                              <Badge key={flag} tone="danger">
                                {RISK_FLAG_LABELS[flag as RiskFlag]}
                              </Badge>
                            ))}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          )}
        </div>
      )}
      </motion.div>
    </div>
  );
}

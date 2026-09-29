/**
 * Admin panel — spec.md §5.5.
 * Varsayılan görünüm özet + eksik rapor listesidir ("Bu hafta N rapordan
 * M'si tamamlandı"), öğretmene göre gruplama seçeneği ve bekleyen gönderim
 * sayacıyla. Tam matris (satır = sınıf, sütun = ders) ikincil sekmede.
 */

import { useCallback, useEffect, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import {
  AlertCircle,
  AlertTriangle,
  Archive,
  CheckCircle,
  Grid3x3,
  LayoutDashboard,
  RefreshCw,
  Send,
} from 'lucide-react';
import type { AdminDashboard, RiskList } from '../../types';
import { DAY_LABELS, RISK_FLAG_LABELS, type RiskFlag } from '../../types';
import { adminApi, downloadBackup, ApiClientError } from '../../services/api';
import {
  Badge,
  Button,
  DataTable,
  EmptyState,
  ErrorState,
  FormError,
  InlineNotice,
  ListState,
  PageHeader,
  Skeleton,
  StatCard,
  TableCard,
  Tabs,
  cx,
  tdClass,
  type Column,
} from '../../components/ui';
import { formatDate } from '../../utils/date';

type MissingItem = AdminDashboard['missing'][number];
type RiskItem = RiskList['items'][number];

const lessonDay = (item: MissingItem) =>
  `${DAY_LABELS[item.day_of_week]}${item.lesson_time ? ` · ${item.lesson_time}` : ''}`;

const missingStatus = (item: MissingItem) => (
  <Badge tone={item.is_overdue ? 'warning' : 'neutral'}>
    {item.is_overdue ? 'Günü geçti' : item.status === 'draft' ? 'Taslak' : 'Hiç açılmamış'}
  </Badge>
);

const MISSING_COLUMNS: Column<MissingItem>[] = [
  {
    key: 'class',
    header: 'Sınıf · Ders',
    card: 'title',
    cell: (i) => (
      <span className="font-medium">
        {i.class_name} · {i.course_name}
      </span>
    ),
  },
  { key: 'teacher', header: 'Öğretmen', cell: (i) => i.teacher_name },
  { key: 'day', header: 'Ders günü', className: 'tabular text-muted', cell: lessonDay },
  { key: 'status', header: 'Durum', cell: missingStatus },
];

/** Öğretmene göre gruplu görünümde öğretmen sütunu gereksizdir. */
const GROUPED_COLUMNS: Column<MissingItem>[] = [
  MISSING_COLUMNS[0],
  { key: 'day', header: 'Ders günü', className: 'tabular text-muted', cell: lessonDay },
  { key: 'status', header: 'Durum', cell: missingStatus },
];

const RISK_COLUMNS: Column<RiskItem>[] = [
  {
    key: 'student',
    header: 'Öğrenci',
    card: 'title',
    cell: (s) => <span className="font-medium">{s.student_name}</span>,
  },
  { key: 'class', header: 'Sınıf', cell: (s) => s.class_name ?? '—' },
  { key: 'school', header: 'Okul', className: 'text-muted', cell: (s) => s.school_name ?? '—' },
  {
    key: 'grade',
    header: 'Sınıf seviyesi',
    className: 'text-muted',
    cell: (s) => s.grade_level ?? '—',
  },
  {
    key: 'reason',
    header: 'Risk nedeni',
    cell: (s) => (
      <span className="flex flex-wrap gap-1.5">
        {s.risk_flags.map((flag) => (
          <Badge key={flag} tone="danger">
            {RISK_FLAG_LABELS[flag as RiskFlag]}
          </Badge>
        ))}
      </span>
    ),
  },
];

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
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
        </div>
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }
  if (error) return <ErrorState message={error} onRetry={() => void load()} />;
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

  return (
    <div className="space-y-4">
      <PageHeader
        icon={LayoutDashboard}
        title="Panel"
        actions={
          <>
            <Button onClick={() => void handleBackup()} loading={backupRunning}>
              {backupRunning ? 'Yedekleniyor…' : 'Yedek indir'}
            </Button>
            <Button onClick={() => void load()}>
              <RefreshCw size={15} aria-hidden="true" />
              Yenile
            </Button>
          </>
        }
      />

      {backupDone && (
        <p role="status" className="text-sm font-medium text-success">
          {backupDone}
        </p>
      )}
      {backupError && <FormError message={backupError} />}

      {/* Hafta henüz başlamadıysa doldurulmuş rapor yoktur; bu durumda
          "eksik" değil "henüz başlamadı" bilgisi gösterilir (spec §5.1/§5.5). */}
      {data.week_not_started && data.week && (
        <InlineNotice tone="info">
          {data.week.label} haftası henüz başlamadı ({formatDate(data.week.start_date)}). Raporlar
          hafta başladığında doldurulmaya başlanır.
        </InlineNotice>
      )}

      {/* Özet kartları — anlam ikon dairesinin semantik renginde. */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          icon={CheckCircle}
          tone="success"
          value={completed}
          label={`Tamamlanan rapor${data.week ? ` · ${data.week.label}` : ''}`}
        />
        <StatCard
          icon={data.week_not_started ? LayoutDashboard : AlertTriangle}
          tone={data.week_not_started ? 'neutral' : 'warning'}
          value={data.week_not_started ? '—' : Math.max(0, total - completed)}
          label={data.week_not_started ? 'Henüz başlamadı' : 'Eksik rapor'}
        />
        <StatCard
          to="/admin/digests"
          icon={Send}
          tone="info"
          value={data.digests.ready}
          suffix="hazır"
          label="Bekleyen gönderim"
          hint={`${data.digests.pending} eksikli`}
        />
        <StatCard
          to="/admin/reports"
          icon={Archive}
          value={<span className="text-base">Tüm raporlar</span>}
          label="Durum, sınıf ve haftaya göre filtreleyin"
        />
      </div>

      <Tabs
        label="Panel bölümleri"
        value={tab}
        onChange={setTab}
        items={[
          {
            id: 'missing',
            label: 'Eksik raporlar',
            icon: <AlertTriangle size={16} aria-hidden="true" />,
            count: data.missing.length,
          },
          {
            id: 'matrix',
            label: 'Tam matris',
            icon: <Grid3x3 size={16} aria-hidden="true" />,
            count: data.matrix.length,
          },
          {
            id: 'risk',
            label: 'Riskli öğrenciler',
            icon: <AlertCircle size={16} aria-hidden="true" />,
            count: risk ? risk.items.length : undefined,
          },
        ]}
      />

      {/* Sekme içeriği geçişi — prefers-reduced-motion'da animasyonsuz */}
      <motion.div
        key={tab}
        initial={reduceMotion ? false : { opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={
          reduceMotion
            ? { duration: 0 }
            : { duration: 0.18, ease: [0.4, 0, 0.2, 1] as [number, number, number, number] }
        }
      >
        {tab === 'missing' && (
          <div className="space-y-4">
            <label className="flex min-h-9 items-center gap-2 text-sm text-muted max-md:min-h-11">
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
                <section key={teacher} className="space-y-2">
                  <h2 className="text-sm font-semibold text-text">
                    {teacher}{' '}
                    <span className="tabular font-medium text-muted">({items.length})</span>
                  </h2>
                  <DataTable
                    rows={items}
                    columns={GROUPED_COLUMNS}
                    rowKey={(i) => i.class_course_id}
                    rowLabel={(i) => `${i.class_name} ${i.course_name}`}
                  />
                </section>
              ))
            ) : (
              <DataTable
                rows={data.missing}
                columns={MISSING_COLUMNS}
                rowKey={(i) => i.class_course_id}
                rowLabel={(i) => `${i.class_name} ${i.course_name}`}
              />
            )}
          </div>
        )}

        {tab === 'matrix' && (
          // Matris sınıf × ders karşılaştırmasıdır: kartlaştırılmaz; kendi kapsayıcısında
          // yatay kayar, sınıf adı sütunu solda sabit kalır (sayfa gövdesi taşmaz).
          <TableCard>
            <table className="w-full border-collapse">
              <tbody>
                {data.matrix.map((row) => (
                  <tr key={row.class_id} className="border-b border-border last:border-b-0">
                    <th
                      scope="row"
                      className={cx(
                        tdClass(),
                        'sticky left-0 z-10 whitespace-nowrap bg-surface text-left font-medium',
                      )}
                    >
                      {row.class_name}
                    </th>
                    {row.courses.map((course) => {
                      const done = course.status === 'sent' || course.status === 'completed';
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
                          className={cx(tdClass(), 'min-w-[140px] align-top')}
                        >
                          <div className="font-medium">{course.course_name}</div>
                          <div className="text-xs text-muted">{course.teacher_name}</div>
                          <div className="mt-1">
                            <Badge
                              tone={
                                done ? 'positive' : data.week_not_started ? 'neutral' : 'warning'
                              }
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
          </TableCard>
        )}

        {tab === 'risk' && (
          <div className="space-y-3">
            {risk && risk.weeks.length > 0 && (
              <p className="text-sm text-muted">
                Son <span className="tabular font-semibold text-text">{risk.weeks.length}</span>{' '}
                hafta değerlendirildi ({risk.weeks.map((w) => `Hafta ${w.week_no}`).join(', ')}).
              </p>
            )}
            <ListState
              loading={riskLoading || (!risk && !riskError)}
              error={riskError}
              onRetry={() => void loadRisk()}
              empty={!!risk && risk.items.length === 0}
              emptyMessage={
                risk && risk.weeks.length === 0
                  ? 'Henüz değerlendirilecek geçmiş hafta yok.'
                  : 'Bu kriterlerle riskli öğrenci yok.'
              }
            >
              {risk && (
                <DataTable
                  rows={risk.items}
                  columns={RISK_COLUMNS}
                  rowKey={(s) => s.student_id}
                  rowLabel={(s) => s.student_name}
                />
              )}
            </ListState>
          </div>
        )}
      </motion.div>
    </div>
  );
}

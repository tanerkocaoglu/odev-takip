/**
 * Admin panel iş mantığı — özet + eksik rapor + tam matris + riskli öğrenci
 * (spec.md §5.5, §6). Route handler'lar yalnızca parse edip bu servise devreder;
 * `missing` listesi hem `GET /admin/dashboard` hem `GET /admin/dashboard/missing`
 * tarafından **aynı** fonksiyondan üretilir (kopya sorgu/eşleme yok).
 */

import { db } from '../db/index.js';
import { RISK, RISK_FLAGS } from '../constants.js';
import { hasWeekStarted, isOverdue } from '../utils/time.js';
import { compareWeekdayLessonTime, type WeekRecord } from '../utils/weeks.js';
import { currentDigestWeek } from './digests.js';

export interface MissingReport {
  class_course_id: string;
  class_id: string;
  class_name: string;
  course_name: string;
  teacher_id: string;
  teacher_name: string;
  day_of_week: number;
  lesson_time: string | null;
  status: string;
  report_id: string | null;
  is_overdue: boolean;
}

interface MatrixCourse {
  class_course_id: string;
  course_name: string;
  teacher_name: string;
  day_of_week: number;
  lesson_time: string | null;
  status: string | null;
  report_id: string | null;
}

interface MatrixClass {
  class_id: string;
  class_name: string;
  courses: MatrixCourse[];
}

export interface DashboardOverview {
  week: {
    id: string;
    week_no: number;
    start_date: string;
    end_date: string;
    label: string;
  } | null;
  /**
   * Gösterilen hafta henüz başlamadı mı (bugün < `week.start_date`)?
   * Bu durumda `missing` boş ve `summary` sıfırdır: henüz doldurulmamış bir
   * haftanın raporları "eksik" sayılmaz (spec.md §5.1/§5.5).
   */
  week_not_started: boolean;
  summary: { total: number; completed: number };
  missing: MissingReport[];
  matrix: MatrixClass[];
  digests: { pending: number; ready: number; sent: number };
}

export interface RiskWeek {
  id: string;
  week_no: number;
  start_date: string;
  end_date: string;
  label: string;
}

export interface RiskItem {
  student_id: string;
  student_name: string;
  class_name: string | null;
  school_name: string | null;
  grade_level: string | null;
  risk_flags: string[];
  avg_score: number | null;
  missing_submission_count: number;
}

/** `week_id` verilmezse aktif yılın "şu anki" haftasına düşer. */
export function resolveWeekId(weekId?: string): string | null {
  return weekId ?? currentDigestWeek()?.id ?? null;
}

function loadWeek(weekId: string): WeekRecord {
  return db.prepare(`SELECT * FROM weeks WHERE id = ?`).get(weekId) as unknown as WeekRecord;
}

/**
 * Eksik raporlar (spec §5.5): draft ya da hiç açılmamış atamalar; günü geçenler
 * üstte, sonra ders günü/saate göre sıralı. `is_overdue` JS'te hesaplanır.
 *
 * Hafta henüz başlamadıysa liste boştur — doldurulmamış bir gelecek haftanın
 * tüm atamalarını "eksik" saymak yanıltıcıdır (spec §5.1). Savunma katmanı:
 * `/admin/dashboard/missing` de bu fonksiyondan beslenir.
 */
export function buildMissingReports(week: WeekRecord): MissingReport[] {
  if (!hasWeekStarted(week)) return [];

  const rows = db
    .prepare(
      `SELECT cc.id AS class_course_id, cc.day_of_week, cc.lesson_time, cc.teacher_id,
              c.id AS class_id, c.name AS class_name,
              co.name AS course_name, t.full_name AS teacher_name,
              r.id AS report_id, r.status AS report_status
       FROM class_courses cc
       JOIN classes c ON c.id = cc.class_id AND c.deleted_at IS NULL
       JOIN academic_years a ON a.id = c.academic_year_id AND a.is_active = 1
       JOIN courses co ON co.id = cc.course_id AND co.deleted_at IS NULL
       JOIN users t ON t.id = cc.teacher_id
       LEFT JOIN reports r ON r.class_course_id = cc.id AND r.week_id = ?
       WHERE cc.deleted_at IS NULL
         AND (r.id IS NULL OR r.status = 'draft')
       ORDER BY cc.day_of_week, cc.lesson_time`,
    )
    .all(week.id) as Array<{
    class_course_id: string;
    day_of_week: number;
    lesson_time: string | null;
    teacher_id: string;
    class_id: string;
    class_name: string;
    course_name: string;
    teacher_name: string;
    report_id: string | null;
    report_status: string | null;
  }>;

  const byWeekDay = compareWeekdayLessonTime<{ day_of_week: number; lesson_time: string | null }>(
    week.start_date,
  );
  return rows
    .map((r) => ({
      class_course_id: r.class_course_id,
      class_id: r.class_id,
      class_name: r.class_name,
      course_name: r.course_name,
      teacher_id: r.teacher_id,
      teacher_name: r.teacher_name,
      day_of_week: r.day_of_week,
      lesson_time: r.lesson_time,
      status: r.report_status ?? 'not_started',
      report_id: r.report_id,
      is_overdue: isOverdue(week, r.day_of_week),
    }))
    .sort((a, b) => Number(b.is_overdue) - Number(a.is_overdue) || byWeekDay(a, b));
}

/**
 * GET /admin/dashboard — admin panelinin tek veri kaynağı (spec §5.5):
 * summary + missing + matrix + digest sayaçları.
 */
export function getDashboardOverview(weekId?: string): DashboardOverview {
  const resolved = resolveWeekId(weekId);
  if (!resolved) {
    return {
      week: null,
      week_not_started: false,
      summary: { total: 0, completed: 0 },
      missing: [],
      matrix: [],
      digests: { pending: 0, ready: 0, sent: 0 },
    };
  }
  const week = loadWeek(resolved);
  const weekNotStarted = !hasWeekStarted(week);

  // Toplam beklenti: aktif eğitim yılının (silinmemiş) atamaları.
  const totalRow = db
    .prepare(
      `SELECT COUNT(*) AS n FROM class_courses cc
       JOIN classes c ON c.id = cc.class_id AND c.deleted_at IS NULL
       JOIN academic_years a ON a.id = c.academic_year_id AND a.is_active = 1
       WHERE cc.deleted_at IS NULL`,
    )
    .get() as { n: number };
  const completedRow = db
    .prepare(
      `SELECT COUNT(*) AS n FROM reports r
       WHERE r.week_id = ? AND r.status IN ('completed','sent')`,
    )
    .get(resolved) as { n: number };

  const missing = buildMissingReports(week);
  // Henüz başlamamış haftada tamamlanan/eksik sayılmaz: payda da sıfırdır
  // (§5.5 özeti yanlış "0/N tamamlandı" göstermesin).
  const summary = weekNotStarted
    ? { total: 0, completed: 0 }
    : { total: totalRow.n, completed: completedRow.n };

  // Tam matris (satır = sınıf, sütun = ders).
  const matrixRows = db
    .prepare(
      `SELECT c.id AS class_id, c.name AS class_name,
              cc.id AS class_course_id, cc.day_of_week, cc.lesson_time,
              co.name AS course_name, t.full_name AS teacher_name,
              r.status AS report_status, r.id AS report_id
       FROM classes c
       JOIN academic_years a ON a.id = c.academic_year_id AND a.is_active = 1
       JOIN class_courses cc ON cc.class_id = c.id AND cc.deleted_at IS NULL
       JOIN courses co ON co.id = cc.course_id AND co.deleted_at IS NULL
       JOIN users t ON t.id = cc.teacher_id
       LEFT JOIN reports r ON r.class_course_id = cc.id AND r.week_id = ?
       WHERE c.deleted_at IS NULL
       ORDER BY c.name, cc.day_of_week, cc.lesson_time`,
    )
    .all(resolved) as Array<{
    class_id: string;
    class_name: string;
    class_course_id: string;
    day_of_week: number;
    lesson_time: string | null;
    course_name: string;
    teacher_name: string;
    report_status: string | null;
    report_id: string | null;
  }>;

  const matrix = new Map<string, MatrixClass>();
  for (const r of matrixRows) {
    const entry =
      matrix.get(r.class_id) ??
      { class_id: r.class_id, class_name: r.class_name, courses: [] };
    entry.courses.push({
      class_course_id: r.class_course_id,
      course_name: r.course_name,
      teacher_name: r.teacher_name,
      day_of_week: r.day_of_week,
      lesson_time: r.lesson_time,
      status: r.report_status,
      report_id: r.report_id,
    });
    matrix.set(r.class_id, entry);
  }

  // Matris içi ders sırası da haftanın gerçek başlangıcına göre.
  const matrixByWeekDay = compareWeekdayLessonTime<MatrixCourse>(week.start_date);
  for (const entry of matrix.values()) {
    entry.courses.sort(matrixByWeekDay);
  }

  const digests = db
    .prepare(
      `SELECT
         SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS pending,
         SUM(CASE WHEN status = 'ready' THEN 1 ELSE 0 END) AS ready,
         SUM(CASE WHEN status = 'sent' THEN 1 ELSE 0 END) AS sent
       FROM weekly_digests WHERE week_id = ?`,
    )
    .get(resolved) as { pending: number | null; ready: number | null; sent: number | null };

  return {
    week: {
      id: week.id,
      week_no: week.week_no,
      start_date: week.start_date,
      end_date: week.end_date,
      label: week.label,
    },
    week_not_started: weekNotStarted,
    summary,
    missing,
    matrix: [...matrix.values()],
    digests: {
      pending: digests.pending ?? 0,
      ready: digests.ready ?? 0,
      sent: digests.sent ?? 0,
    },
  };
}

/**
 * Eksik rapor listesi (sayfalama route'ta). Hafta yoksa boş liste; hafta henüz
 * başlamadıysa da boştur (`buildMissingReports` guard'ı) ve `week_not_started`
 * true döner.
 */
export function getMissingReportsView(weekId?: string): {
  missing: MissingReport[];
  week_not_started: boolean;
} {
  const resolved = resolveWeekId(weekId);
  if (!resolved) return { missing: [], week_not_started: false };
  const week = loadWeek(resolved);
  return { missing: buildMissingReports(week), week_not_started: !hasWeekStarted(week) };
}

/**
 * GET /admin/dashboard/risk — riskli öğrenci listesi (spec §6, kullanıcı kararı).
 * Son `RISK.lookbackWeeks` hafta; üç kriter OR; `risk_flags` ayrı rozet.
 */
export function getRiskData(): { weeks: RiskWeek[]; items: RiskItem[] } {
  const weeks = db
    .prepare(
      `SELECT w.* FROM weeks w
       JOIN academic_years a ON a.id = w.academic_year_id AND a.is_active = 1
       ORDER BY w.start_date DESC LIMIT ?`,
    )
    .all(RISK.lookbackWeeks) as unknown as WeekRecord[];
  if (weeks.length === 0) {
    return { weeks: [], items: [] };
  }
  const weekIds = weeks.map((w) => w.id);
  const ph = weekIds.map(() => '?').join(',');

  // 1) Puan ortalaması (completed/sent; taslak sayılmaz; absent satırlar NULL).
  const scoreRows = db
    .prepare(
      `SELECT re.student_id,
              AVG((re.homework_score + re.interest_score) / 2.0) AS avg_score
       FROM report_entries re
       JOIN reports r ON r.id = re.report_id AND r.status IN ('completed','sent')
       JOIN class_courses cc ON cc.id = r.class_course_id AND cc.deleted_at IS NULL
       JOIN classes c ON c.id = cc.class_id
       JOIN academic_years a ON a.id = c.academic_year_id AND a.is_active = 1
       WHERE r.week_id IN (${ph}) AND re.attendance IN ('present','late')
       GROUP BY re.student_id`,
    )
    .all(...weekIds) as Array<{ student_id: string; avg_score: number }>;

  // 2) Hafta bazlı devamsızlık (yalnızca absent; excused sayılmaz).
  const absenceRows = db
    .prepare(
      `SELECT re.student_id, w.week_no,
              MAX(CASE WHEN re.attendance = 'absent' THEN 1 ELSE 0 END) AS was_absent
       FROM report_entries re
       JOIN reports r ON r.id = re.report_id AND r.status IN ('completed','sent')
       JOIN weeks w ON w.id = r.week_id
       JOIN class_courses cc ON cc.id = r.class_course_id AND cc.deleted_at IS NULL
       JOIN classes c ON c.id = cc.class_id
       JOIN academic_years a ON a.id = c.academic_year_id AND a.is_active = 1
       WHERE r.week_id IN (${ph})
       GROUP BY re.student_id, w.week_no`,
    )
    .all(...weekIds) as Array<{ student_id: string; week_no: number; was_absent: number }>;

  // 3) Teslim durumu: pencere içi completed/sent ödevler → sınıfındaki öğrenciler.
  const homeworks = db
    .prepare(
      `SELECT h.id, h.week_id, cc.class_id, w.start_date AS week_start
       FROM homeworks h
       JOIN reports r ON r.id = h.report_id AND r.status IN ('completed','sent')
       JOIN class_courses cc ON cc.id = h.class_course_id
       JOIN weeks w ON w.id = h.week_id
       WHERE h.week_id IN (${ph})`,
    )
    .all(...weekIds) as Array<{ id: string; week_id: string; class_id: string; week_start: string }>;
  const submittedRows = db
    .prepare(
      `SELECT s.homework_id, s.student_id FROM submissions s
       JOIN homeworks h ON h.id = s.homework_id
       WHERE h.week_id IN (${ph})`,
    )
    .all(...weekIds) as Array<{ homework_id: string; student_id: string }>;
  const submittedSet = new Set(submittedRows.map((s) => `${s.homework_id}:${s.student_id}`));

  const missingCount = new Map<string, number>();
  const enrollStmt = db.prepare(
    `SELECT s.id FROM enrollments e
     JOIN students s ON s.id = e.student_id AND s.deleted_at IS NULL
     JOIN users u ON u.id = s.user_id AND u.deleted_at IS NULL
     WHERE e.class_id = ? AND e.start_date <= ?
       AND (e.end_date IS NULL OR e.end_date >= ?)`,
  );
  for (const hw of homeworks) {
    const students = enrollStmt.all(hw.class_id, hw.week_start, hw.week_start) as Array<{
      id: string;
    }>;
    for (const st of students) {
      if (!submittedSet.has(`${hw.id}:${st.id}`)) {
        missingCount.set(st.id, (missingCount.get(st.id) ?? 0) + 1);
      }
    }
  }

  // 4) Risk hesabı.
  const avgByStudent = new Map(scoreRows.map((r) => [r.student_id, r.avg_score]));
  const absentByStudent = new Map<string, Set<number>>();
  for (const row of absenceRows) {
    const set = absentByStudent.get(row.student_id) ?? new Set();
    if (row.was_absent === 1) set.add(row.week_no);
    absentByStudent.set(row.student_id, set);
  }
  const orderedWeekNos = weeks.map((w) => w.week_no).sort((a, b) => a - b);

  const students = db
    .prepare(
      `SELECT s.id AS student_id, u.full_name AS student_name, s.grade_level,
              sch.name AS school_name, c.name AS class_name
       FROM students s
       JOIN users u ON u.id = s.user_id AND u.deleted_at IS NULL
       LEFT JOIN schools sch ON sch.id = s.school_id AND sch.deleted_at IS NULL
       LEFT JOIN enrollments e ON e.student_id = s.id AND e.end_date IS NULL
       LEFT JOIN classes c ON c.id = e.class_id
       WHERE s.deleted_at IS NULL
       ORDER BY u.full_name_normalized`,
    )
    .all() as Array<{
    student_id: string;
    student_name: string;
    grade_level: string | null;
    school_name: string | null;
    class_name: string | null;
  }>;

  const items: RiskItem[] = [];
  for (const st of students) {
    const flags: string[] = [];
    const avg = avgByStudent.get(st.student_id);
    const absentWeeks = absentByStudent.get(st.student_id) ?? new Set();
    const missing = missingCount.get(st.student_id) ?? 0;

    if (avg !== undefined && avg <= RISK.avgScoreThreshold) flags.push(RISK_FLAGS.LOW_SCORE);
    if (missing >= RISK.missingSubmissionMin) flags.push(RISK_FLAGS.MISSING_SUBMISSION);

    let consecutive = false;
    for (let i = 0; i < orderedWeekNos.length - 1; i++) {
      if (absentWeeks.has(orderedWeekNos[i]) && absentWeeks.has(orderedWeekNos[i + 1])) {
        consecutive = true;
        break;
      }
    }
    if (consecutive) flags.push(RISK_FLAGS.CONSECUTIVE_ABSENCE);

    if (flags.length > 0) {
      items.push({
        student_id: st.student_id,
        student_name: st.student_name,
        class_name: st.class_name,
        school_name: st.school_name,
        grade_level: st.grade_level,
        risk_flags: flags,
        avg_score: avg === undefined ? null : Number(avg.toFixed(2)),
        missing_submission_count: missing,
      });
    }
  }

  return {
    weeks: weeks.map((w) => ({
      id: w.id,
      week_no: w.week_no,
      start_date: w.start_date,
      end_date: w.end_date,
      label: w.label,
    })),
    items,
  };
}

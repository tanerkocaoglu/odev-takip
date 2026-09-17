/**
 * Tek seferlik dar kapsamlı onarım: yalnızca verilen `enrollments.id`'lerin
 * `start_date`'ini düzeltir ve bu düzeltmeden sonra artık doğru sonucu veren
 * `classIdForStudentAtWeek()` ile, o öğrencilerin **`class_id` NULL olan**
 * `weekly_digests` satırlarını onarır.
 *
 * NEDEN: Kurulum/test sırasında bir enrollment bir gün geç girildiği için
 * (`start_date` hafta başından sonra) migration #11 backfill'i `class_id`'yi
 * çözemedi ve önizleme/gönderim 409 verdi. Tarih düzeltilince katı kural
 * sağlanır ve digest'ler gönderilebilir hale gelir.
 *
 * Kurallar:
 * - Yalnızca **açıkça verilen** enrollment id'leri; başka satıra dokunulmaz.
 * - Varsayılan **dry-run**; gerçek yazma `execute: true` (CLI `--execute`).
 * - Execute'da, yazılacak değişiklik varsa önce `createBackup()` (proje kuralı).
 * - İdempotent: ikinci çalıştırma değişiklik bulamaz → yedek almaz, yazmaz.
 */

import { db } from '../db/index.js';
import { createBackup } from './backup.js';
import { classIdForStudentAtWeek } from './digests.js';
import type { WeekRecord } from '../utils/weeks.js';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export interface EnrollmentFixItem {
  enrollmentId: string;
  studentId: string;
  studentName: string;
  classId: string;
  className: string;
  oldStartDate: string;
  newStartDate: string;
  endDate: string | null;
  changed: boolean;
}

export interface DigestClassFixItem {
  digestId: string;
  studentId: string;
  weekId: string;
  weekNo: number;
  weekStart: string;
  currentClassId: string | null;
  /** Onarım sonrası beklenen sınıf (NULL ise çözülemedi). */
  resolvedClassId: string | null;
  willUpdate: boolean;
}

export interface EnrollmentFixPlan {
  newStartDate: string;
  enrollments: EnrollmentFixItem[];
  digests: DigestClassFixItem[];
  enrollmentUpdateCount: number;
  digestUpdateCount: number;
}

export interface EnrollmentFixResult extends EnrollmentFixPlan {
  executed: boolean;
  backupPath: string | null;
  enrollmentUpdated: number;
  digestUpdated: number;
}

export interface EnrollmentFixOptions {
  execute?: boolean;
  backupOutDir?: string;
}

interface EnrollmentRow {
  id: string;
  student_id: string;
  class_id: string;
  class_name: string;
  student_name: string;
  start_date: string;
  end_date: string | null;
}

function loadEnrollment(id: string): EnrollmentRow {
  const row = db
    .prepare(
      `SELECT e.id, e.student_id, e.class_id, e.start_date, e.end_date,
              c.name AS class_name, u.full_name AS student_name
       FROM enrollments e
       JOIN students s ON s.id = e.student_id
       JOIN users u ON u.id = s.user_id
       JOIN classes c ON c.id = e.class_id
       WHERE e.id = ?`,
    )
    .get(id) as EnrollmentRow | undefined;
  if (!row) {
    throw new Error(`Enrollment bulunamadı: ${id}`);
  }
  return row;
}

/** Onarım sonrası öğrencinin bu hafta için beklenen sınıfı (tahmin). */
function predictedClass(
  classId: string,
  endDate: string | null,
  weekStart: string,
  newStartDate: string,
): string | null {
  const active =
    newStartDate <= weekStart && (endDate === null || endDate >= weekStart);
  return active ? classId : null;
}

/**
 * Filtrelere göre ne yazılacağını hesaplar. Hiçbir şey yazmaz.
 */
export function planEnrollmentDateFix(
  enrollmentIds: string[],
  newStartDate: string,
): EnrollmentFixPlan {
  if (!DATE_RE.test(newStartDate)) {
    throw new Error('Tarih YYYY-MM-DD biçiminde olmalı.');
  }
  const uniqueIds = [...new Set(enrollmentIds.map((s) => s.trim()).filter(Boolean))];
  if (uniqueIds.length === 0) {
    throw new Error('En az bir --enrollment gerekli.');
  }

  const enrollments: EnrollmentFixItem[] = [];
  for (const id of uniqueIds) {
    const row = loadEnrollment(id);
    enrollments.push({
      enrollmentId: row.id,
      studentId: row.student_id,
      studentName: row.student_name,
      classId: row.class_id,
      className: row.class_name,
      oldStartDate: row.start_date,
      newStartDate,
      endDate: row.end_date,
      changed: row.start_date !== newStartDate,
    });
  }

  // Hedef öğrencilerin class_id NULL digest satırları (yalnızca onlar onarılır).
  const byEnrollment = new Map(enrollments.map((e) => [e.enrollmentId, e] as const));
  const digests: DigestClassFixItem[] = [];
  for (const enr of byEnrollment.values()) {
    const rows = db
      .prepare(
        `SELECT d.id, d.week_id, d.class_id, w.week_no, w.start_date
         FROM weekly_digests d
         JOIN weeks w ON w.id = d.week_id
         WHERE d.student_id = ? AND d.class_id IS NULL
         ORDER BY w.start_date`,
      )
      .all(enr.studentId) as Array<{
      id: string;
      week_id: string;
      class_id: string | null;
      week_no: number;
      start_date: string;
    }>;
    for (const d of rows) {
      const resolved = predictedClass(enr.classId, enr.endDate, d.start_date, newStartDate);
      digests.push({
        digestId: d.id,
        studentId: enr.studentId,
        weekId: d.week_id,
        weekNo: d.week_no,
        weekStart: d.start_date,
        currentClassId: d.class_id,
        resolvedClassId: resolved,
        willUpdate: resolved !== null,
      });
    }
  }

  return {
    newStartDate,
    enrollments,
    digests,
    enrollmentUpdateCount: enrollments.filter((e) => e.changed).length,
    digestUpdateCount: digests.filter((d) => d.willUpdate).length,
  };
}

/**
 * Onarımı çalıştırır. `execute` false ise yalnızca planı döner (dry-run).
 * `execute` true ve yazılacak değişiklik varsa: önce tam yedek, sonra tek
 * transaction'da enrollment güncelleme + digest `class_id` onarımı.
 */
export async function runEnrollmentDateFix(
  enrollmentIds: string[],
  newStartDate: string,
  options: EnrollmentFixOptions = {},
): Promise<EnrollmentFixResult> {
  const plan = planEnrollmentDateFix(enrollmentIds, newStartDate);
  const execute = options.execute === true;

  const empty: EnrollmentFixResult = {
    ...plan,
    executed: false,
    backupPath: null,
    enrollmentUpdated: 0,
    digestUpdated: 0,
  };

  if (!execute) return empty;
  if (plan.enrollmentUpdateCount === 0 && plan.digestUpdateCount === 0) {
    return { ...empty, executed: true };
  }

  // Güvenlik ağı: geri dönüşsüz yazma öncesi tam yedek (proje kuralı).
  const backupPath = await createBackup(
    options.backupOutDir !== undefined ? { outDir: options.backupOutDir } : {},
  );

  const targetStudents = [...new Set(plan.enrollments.map((e) => e.studentId))];
  let enrollmentUpdated = 0;
  let digestUpdated = 0;

  db.exec('BEGIN');
  try {
    const updateEnrollment = db.prepare(
      `UPDATE enrollments SET start_date = ? WHERE id = ?`,
    );
    for (const e of plan.enrollments) {
      if (!e.changed) continue;
      const r = updateEnrollment.run(newStartDate, e.enrollmentId);
      if (Number(r.changes) > 0) enrollmentUpdated += 1;
    }

    // Tarih artık doğru olduğu için `classIdForStudentAtWeek()` gerçek sonucu verir.
    // Yalnızca hâlâ `class_id IS NULL` olan satırlar doldurulur.
    const updateDigest = db.prepare(
      `UPDATE weekly_digests SET class_id = ? WHERE id = ? AND class_id IS NULL`,
    );
    for (const studentId of targetStudents) {
      const rows = db
        .prepare(
          `SELECT id, week_id FROM weekly_digests
           WHERE student_id = ? AND class_id IS NULL`,
        )
        .all(studentId) as Array<{ id: string; week_id: string }>;
      for (const row of rows) {
        const week = db.prepare(`SELECT * FROM weeks WHERE id = ?`).get(row.week_id) as
          | WeekRecord
          | undefined;
        if (!week) continue;
        const resolved = classIdForStudentAtWeek(studentId, week);
        if (!resolved) continue;
        const r = updateDigest.run(resolved, row.id);
        if (Number(r.changes) > 0) digestUpdated += 1;
      }
    }

    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }

  return { ...plan, executed: true, backupPath, enrollmentUpdated, digestUpdated };
}

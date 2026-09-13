/**
 * Digest telafi (backfill) aracı — manuel CLI (`npm run digest-backfill`).
 *
 * NEDEN VAR: Bir dönem, rapor öğrenci listesi `enrollments.start_date`'i
 * yok saydığı için henüz başlamamış (ileri/orta hafta tarihli) öğrenciler
 * rapora girip puanlanabildi; digest oluşturma ise `start_date <= hafta başı`
 * şartını (spec §5.1) uyguladığından bu öğrenciler için `weekly_digests` satırı
 * hiç açılmadı. Kalıcı düzeltme `routes/teacher.ts` get-or-create sorgusunda
 * yapıldı (yeni raporlar artık bu öğrencileri içermez). Bu araç ise **mevcut**
 * etkilenmiş raporları telafi eder: o sınıf+hafta için fiilen puanlanmış
 * (report_entries'te bulunan) ve velisi olan öğrencilere digest satırı açar.
 *
 * ÖNEMLİ: Bu kalıcı ürün akışı değil, **tek seferlik bir geçiş/telafi**
 * aracıdır. `ensurePendingDigests`'in "aktif öğrenci" tanımını genişletmez;
 * yalnızca zaten rapora yazılmış öğrencileri hedefler. İhtiyaç, kalıcı düzeltme
 * devreye girince kendiliğinden ortadan kalkar.
 *
 * Kurallar:
 * - Sınıf zorunludur; hafta verilmezse aktif yılın "şu anki" haftasına düşer.
 * - Varsayılan **dry-run**; gerçek yazma `execute: true` (CLI `--execute`) ile.
 * - Execute'da, yazılacak satır varsa önce `createBackup()` ile tam yedek
 *   alınır; yedek başarısızsa yazma hiç başlamaz (proje kuralı).
 * - İdempotent: mevcut `(student_id, week_id)` satırlarına dokunulmaz
 *   (`INSERT OR IGNORE`); ikinci çalıştırma hiçbir şey değiştirmez.
 * - `status`: o hafta sınıfın tüm (silinmemiş) dersleri completed/sent ise
 *   `ready`, değilse `pending` — gönderim ekranının beklediği değerler.
 */

import { randomUUID } from 'node:crypto';
import { db } from '../db/index.js';
import { normalizeTurkish } from '../utils/text.js';
import { currentDigestWeek, newDigestToken } from './digests.js';
import { createBackup } from './backup.js';
import type { WeekRecord } from '../utils/weeks.js';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export interface BackfillTarget {
  /** Sınıf adı (normalize edilir) veya `classes.id`. Aktif yıl içinde aranır. */
  className: string;
  /** `weeks.week_no` (sınıfın eğitim yılında). */
  weekNo?: number;
  /** Haftanın içerdiği tarih (YYYY-MM-DD). */
  weekStartDate?: string;
  /** Doğrudan `weeks.id`. Verilirse diğer hafta seçicileri yok sayılır. */
  weekId?: string;
}

export interface BackfillOptions {
  /** `true` ise gerçekten yazar; varsayılan `false` (dry-run). */
  execute?: boolean;
  /** Yedeğin yazılacağı dizin (test/özel ortamlar için). */
  backupOutDir?: string;
  /** Token üreteci (test edilebilirlik; varsayılan `newDigestToken`). */
  newToken?: () => string;
}

export interface BackfillPlanItem {
  studentId: string;
  studentName: string;
  guardianId: string;
  /** Bu öğrenci-hafta için zaten digest satırı var mı (yazılmayacak). */
  alreadyExists: boolean;
  /** Yazılacaksa önerilen durum. */
  status: 'pending' | 'ready';
}

export interface BackfillPlan {
  classId: string;
  className: string;
  weekId: string;
  weekNo: number;
  weekLabel: string;
  items: BackfillPlanItem[];
  /** Digesti açılamayan (velisi olmayan) puanlanmış öğrenciler. */
  skippedNoGuardian: Array<{ studentId: string; studentName: string }>;
  /** Gerçekten yazılacak satır sayısı. */
  insertCount: number;
}

export interface BackfillResult extends BackfillPlan {
  executed: boolean;
  backupPath: string | null;
  inserted: number;
}

interface ClassRow {
  id: string;
  name: string;
  academic_year_id: string;
}

/** Sınıfı aktif eğitim yılında çözer (id veya normalize ad). */
function resolveClass(className: string): ClassRow {
  const row = db
    .prepare(
      `SELECT c.id, c.name, c.academic_year_id
       FROM classes c
       JOIN academic_years a ON a.id = c.academic_year_id AND a.is_active = 1
       WHERE c.deleted_at IS NULL AND (c.id = ? OR c.name_normalized = ?)
       LIMIT 1`,
    )
    .get(className, normalizeTurkish(className)) as ClassRow | undefined;
  if (!row) {
    throw new Error(
      `Aktif eğitim yılında "${className}" adlı (veya bu id'li) sınıf bulunamadı.`,
    );
  }
  return row;
}

/** Hedef haftayı çözer; seçici yoksa `currentDigestWeek()`'e düşer. */
function resolveWeek(target: BackfillTarget, classRow: ClassRow): WeekRecord {
  let week: WeekRecord | undefined;

  if (target.weekId) {
    week = db.prepare(`SELECT * FROM weeks WHERE id = ?`).get(target.weekId) as
      | WeekRecord
      | undefined;
    if (!week) throw new Error(`Hafta bulunamadı: ${target.weekId}`);
  } else if (target.weekNo !== undefined) {
    if (!Number.isInteger(target.weekNo) || target.weekNo < 1) {
      throw new Error('--week pozitif bir tam sayı olmalı.');
    }
    week = db
      .prepare(`SELECT * FROM weeks WHERE academic_year_id = ? AND week_no = ?`)
      .get(classRow.academic_year_id, target.weekNo) as WeekRecord | undefined;
    if (!week) throw new Error(`Hafta bulunamadı: week_no=${target.weekNo}`);
  } else if (target.weekStartDate !== undefined) {
    if (!DATE_RE.test(target.weekStartDate)) {
      throw new Error('--week tarihi geçerli bir tarih olmalı (YYYY-MM-DD).');
    }
    week = db
      .prepare(
        `SELECT * FROM weeks
         WHERE academic_year_id = ? AND start_date <= ? AND end_date >= ?
         ORDER BY start_date LIMIT 1`,
      )
      .get(classRow.academic_year_id, target.weekStartDate, target.weekStartDate) as
      | WeekRecord
      | undefined;
    if (!week) throw new Error(`Tarihi kapsayan hafta bulunamadı: ${target.weekStartDate}`);
  } else {
    const current = currentDigestWeek();
    if (!current) throw new Error('Aktif hafta belirlenemedi; --week ile belirtin.');
    week = current;
  }

  if (week.academic_year_id !== classRow.academic_year_id) {
    throw new Error('Seçilen hafta, sınıfın eğitim yılında değil.');
  }
  return week;
}

/** O hafta sınıfın tüm dersleri completed/sent mi? */
function allCoursesDone(classId: string, weekId: string): boolean {
  const total = db
    .prepare(
      `SELECT COUNT(*) AS n FROM class_courses
       WHERE class_id = ? AND deleted_at IS NULL`,
    )
    .get(classId) as { n: number };
  if (total.n === 0) return false;
  const done = db
    .prepare(
      `SELECT COUNT(*) AS n FROM reports r
       JOIN class_courses cc ON cc.id = r.class_course_id AND cc.deleted_at IS NULL
       WHERE r.week_id = ? AND cc.class_id = ? AND r.status IN ('completed','sent')`,
    )
    .get(weekId, classId) as { n: number };
  return done.n >= total.n;
}

/**
 * Filtrelere göre ne yazılacağını hesaplar. Hiçbir şey yazmaz.
 */
export function planBackfill(target: BackfillTarget): BackfillPlan {
  const classRow = resolveClass(target.className);
  const week = resolveWeek(target, classRow);
  const ready = allCoursesDone(classRow.id, week.id);

  // Kaynak: fiilen puanlanmış/raporda yer alan öğrenciler (report_entries).
  const scored = db
    .prepare(
      `SELECT DISTINCT re.student_id AS student_id, u.full_name AS student_name,
              st.guardian_id AS guardian_id
       FROM report_entries re
       JOIN reports r ON r.id = re.report_id AND r.week_id = ?
       JOIN class_courses cc ON cc.id = r.class_course_id AND cc.class_id = ?
       JOIN students st ON st.id = re.student_id AND st.deleted_at IS NULL
       JOIN users u ON u.id = st.user_id AND u.deleted_at IS NULL
       ORDER BY u.full_name_normalized`,
    )
    .all(week.id, classRow.id) as Array<{
    student_id: string;
    student_name: string;
    guardian_id: string | null;
  }>;

  const existing = new Set(
    (
      db
        .prepare(`SELECT student_id FROM weekly_digests WHERE week_id = ?`)
        .all(week.id) as Array<{ student_id: string }>
    ).map((r) => r.student_id),
  );

  const items: BackfillPlanItem[] = [];
  const skippedNoGuardian: Array<{ studentId: string; studentName: string }> = [];
  for (const s of scored) {
    if (!s.guardian_id) {
      skippedNoGuardian.push({ studentId: s.student_id, studentName: s.student_name });
      continue;
    }
    items.push({
      studentId: s.student_id,
      studentName: s.student_name,
      guardianId: s.guardian_id,
      alreadyExists: existing.has(s.student_id),
      status: ready ? 'ready' : 'pending',
    });
  }

  return {
    classId: classRow.id,
    className: classRow.name,
    weekId: week.id,
    weekNo: week.week_no,
    weekLabel: week.label,
    items,
    skippedNoGuardian,
    insertCount: items.filter((i) => !i.alreadyExists).length,
  };
}

/**
 * Telafiyi çalıştırır. `execute` false ise yalnızca planı döner (dry-run).
 * `execute` true ve yazılacak satır varsa: önce tam yedek, sonra tek
 * transaction'da `INSERT OR IGNORE`.
 */
export function runBackfill(target: BackfillTarget, options: BackfillOptions = {}): BackfillResult {
  const plan = planBackfill(target);
  const execute = options.execute === true;

  const empty: BackfillResult = {
    ...plan,
    executed: false,
    backupPath: null,
    inserted: 0,
  };

  if (!execute) return empty;
  if (plan.insertCount === 0) return { ...empty, executed: true };

  // Güvenlik ağı: geri dönüşsüz yazma öncesi tam yedek (proje kuralı).
  const backupPath = createBackup(
    options.backupOutDir !== undefined ? { outDir: options.backupOutDir } : {},
  );
  const token = options.newToken ?? newDigestToken;

  db.exec('BEGIN');
  try {
    const insert = db.prepare(
      `INSERT OR IGNORE INTO weekly_digests
         (id, student_id, week_id, guardian_id, token, status, send_count,
          sent_at, sent_by, snapshot, is_revoked)
       VALUES (?, ?, ?, ?, ?, ?, 0, NULL, NULL, NULL, 0)`,
    );
    let inserted = 0;
    for (const item of plan.items) {
      if (item.alreadyExists) continue;
      const result = insert.run(
        randomUUID(),
        item.studentId,
        plan.weekId,
        item.guardianId,
        token(),
        item.status,
      );
      if (Number(result.changes) > 0) inserted += 1;
    }
    db.exec('COMMIT');
    return { ...plan, executed: true, backupPath, inserted };
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

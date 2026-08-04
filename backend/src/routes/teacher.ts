/**
 * Öğretmen rapor rotaları — `/api/v1/teacher/*` (spec.md §5.1, §6 Öğretmen).
 *
 * Aşama 3:
 * - `GET /dashboard` — "Bu hafta doldurulacaklar" (~10 kayıt; ders gününe göre
 *   sıralı, tamamlananlar düşer, günü geçmişler vurgulu).
 * - `POST /reports` — get-or-create: rapor + aktif enrollment'dan report_entries
 *   + draft homeworks satırı (due_date sunucuda hesaplanır).
 * (Autosave PUT + complete sonraki adımda aynı dosyaya eklenir.)
 *
 * Yetki (CLAUDE.md): her handler ilk satırında kontrol eder — öğretmen
 * yalnızca kendi `class_course`'ları (`teacher_id = req.user.id` filtreli),
 * admin tümü (spec §2: admin de rapor doldurur); veli/öğrenci 403.
 */

import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { db } from '../db/index.js';
import { AppError } from '../errors.js';
import { requireAuth } from '../middleware/auth.js';
import { writeAuditLog } from '../services/audit.js';
import { calculateDueDate, getPreviousWeek, type WeekRecord } from '../utils/weeks.js';
import type { AuthUser } from '../types.js';

const router = Router();

router.use(requireAuth);

/** Yerel saatte bugün (YYYY-MM-DD) — UTC üzerinden gün çıkarımı yapılmaz. */
function localTodayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`;
}

/**
 * Ders günü bu haftada geçti mi? (spec.md §5.1: "ders günü geçtiği halde
 * draft olanlar üstte ve vurgulu görünür"). Hafta tamamen bittiyse de geçmiş.
 */
function isOverdue(week: WeekRecord, dayOfWeek: number): boolean {
  const [y, m, d] = week.start_date.split('-').map(Number);
  const classDay = new Date(y, m - 1, d);
  classDay.setDate(classDay.getDate() + (dayOfWeek - 1));
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return classDay < today;
}

/** Rol + sahiplik kontrolü — rapor doldurma izni (spec.md §2). */
function assertCanFill(user: AuthUser, cc: { teacher_id: string }): void {
  if (user.role === 'admin') return;
  if (user.role !== 'teacher' || cc.teacher_id !== user.id) {
    throw new AppError('FORBIDDEN', 403, 'Bu rapora erişim yetkiniz yok.');
  }
}

/**
 * Rapor payload'ı — öğretmen ekranının ihtiyaç duyduğu her şey tek yanıtta:
 * üst alanlar (verilmiş ödev, konu, yapılacak ödev + son tarih) ve öğrenci
 * satırları. `prev_homework_text`, gösterilecek metindir: rapor kendi
 * `prev_homework_text`'ini tutuyorsa o, değilse önceki haftanın ödevinin
 * açıklaması. `homework` null ise (yılın son haftası, tarih henüz
 * girilmedi) form "teslim tarihini siz belirleyin" durumundadır (spec §5.2).
 */
function buildReportPayload(reportId: string): unknown {
  const report = db
    .prepare(
      `SELECT r.id, r.class_course_id, r.week_id, r.topic_covered, r.status,
              r.prev_homework_id, r.prev_homework_text,
              r.completed_at, r.updated_at,
              cc.day_of_week, cc.lesson_time,
              c.name AS class_name, co.name AS course_name,
              t.full_name AS teacher_name,
              w.week_no, w.start_date AS week_start, w.end_date AS week_end,
              w.label AS week_label
       FROM reports r
       JOIN class_courses cc ON cc.id = r.class_course_id
       JOIN classes c ON c.id = cc.class_id
       JOIN courses co ON co.id = cc.course_id
       JOIN users t ON t.id = cc.teacher_id
       JOIN weeks w ON w.id = r.week_id
       WHERE r.id = ?`,
    )
    .get(reportId) as {
    id: string;
    class_course_id: string;
    week_id: string;
    topic_covered: string | null;
    status: string;
    prev_homework_id: string | null;
    prev_homework_text: string | null;
    completed_at: string | null;
    updated_at: string;
    day_of_week: number;
    lesson_time: string | null;
    class_name: string;
    course_name: string;
    teacher_name: string;
    week_no: number;
    week_start: string;
    week_end: string;
    week_label: string;
  };

  let prevHomeworkText: string | null;
  if (report.prev_homework_id) {
    const prev = db
      .prepare(`SELECT description FROM homeworks WHERE id = ?`)
      .get(report.prev_homework_id) as { description: string } | undefined;
    prevHomeworkText = report.prev_homework_text ?? prev?.description ?? null;
  } else {
    prevHomeworkText = report.prev_homework_text ?? null;
  }

  const homework = db
    .prepare(
      `SELECT description, due_date FROM homeworks WHERE report_id = ?`,
    )
    .get(reportId) as
    | { description: string | null; due_date: string }
    | undefined;

  const entries = db
    .prepare(
      `SELECT re.student_id, u.full_name AS student_name, re.attendance,
              re.homework_score, re.interest_score, re.teacher_note
       FROM report_entries re
       JOIN students s ON s.id = re.student_id
       JOIN users u ON u.id = s.user_id
       WHERE re.report_id = ?
       ORDER BY u.full_name_normalized`,
    )
    .all(reportId);

  return {
    report: {
      id: report.id,
      class_course_id: report.class_course_id,
      week_id: report.week_id,
      status: report.status,
      completed_at: report.completed_at,
      updated_at: report.updated_at,
      topic_covered: report.topic_covered,
      prev_homework_text: prevHomeworkText,
      homework: homework
        ? { description: homework.description, due_date: homework.due_date }
        : null,
      week: {
        week_no: report.week_no,
        start_date: report.week_start,
        end_date: report.week_end,
        label: report.week_label,
      },
      class_name: report.class_name,
      course_name: report.course_name,
      teacher_name: report.teacher_name,
      day_of_week: report.day_of_week,
      lesson_time: report.lesson_time,
    },
    entries,
  };
}

// ---------- Dashboard ----------

router.get('/dashboard', (req, res) => {
  const user = req.user!;
  // İlk satırda yetki: yalnızca öğretmen ve admin.
  if (user.role !== 'teacher' && user.role !== 'admin') {
    throw new AppError('FORBIDDEN', 403, 'Bu ekrana erişim yetkiniz yok.');
  }

  const today = localTodayISO();

  // "Bu hafta": aktif eğitim yılında `start_date <= bugün` olanların sonuncusu
  // (tatil haftası kaydı olmadığından son ders yapılan haftadır); yıl henüz
  // başlamadıysa en erken hafta.
  const week = (db
    .prepare(
      `SELECT w.* FROM weeks w
       JOIN academic_years a ON a.id = w.academic_year_id AND a.is_active = 1
       WHERE w.start_date <= ?
       ORDER BY w.start_date DESC
       LIMIT 1`,
    )
    .get(today) ??
    db
      .prepare(
        `SELECT w.* FROM weeks w
         JOIN academic_years a ON a.id = w.academic_year_id AND a.is_active = 1
         ORDER BY w.start_date ASC
         LIMIT 1`,
      )
      .get()) as WeekRecord | undefined;

  if (!week) {
    res.json({ week: null, items: [] });
    return;
  }

  // Tamamlananlar (completed/sent) listeden düşer; hiç açılmamışlar ve
  // draft'lar görünür. Öğretmen sorgusu her zaman teacher_id ile filtreli.
  const rows =
    user.role === 'teacher'
      ? (db
          .prepare(
            `SELECT cc.id AS class_course_id, cc.day_of_week, cc.lesson_time,
                    c.name AS class_name, co.name AS course_name,
                    r.id AS report_id, r.status AS report_status
             FROM class_courses cc
             JOIN classes c ON c.id = cc.class_id AND c.deleted_at IS NULL
             JOIN courses co ON co.id = cc.course_id AND co.deleted_at IS NULL
             LEFT JOIN reports r
               ON r.class_course_id = cc.id AND r.week_id = ?
             WHERE cc.teacher_id = ? AND cc.deleted_at IS NULL
               AND (r.id IS NULL OR r.status = 'draft')
             ORDER BY cc.day_of_week, cc.lesson_time`,
          )
          .all(week.id, user.id) as unknown as DashboardRow[])
      : (db
          .prepare(
            `SELECT cc.id AS class_course_id, cc.day_of_week, cc.lesson_time,
                    c.name AS class_name, co.name AS course_name,
                    r.id AS report_id, r.status AS report_status
             FROM class_courses cc
             JOIN classes c ON c.id = cc.class_id AND c.deleted_at IS NULL
             JOIN courses co ON co.id = cc.course_id AND co.deleted_at IS NULL
             LEFT JOIN reports r
               ON r.class_course_id = cc.id AND r.week_id = ?
             WHERE cc.deleted_at IS NULL
               AND (r.id IS NULL OR r.status = 'draft')
             ORDER BY cc.day_of_week, cc.lesson_time`,
          )
          .all(week.id) as unknown as DashboardRow[]);

  const items = rows
    .map((row) => ({
      class_course_id: row.class_course_id,
      class_name: row.class_name,
      course_name: row.course_name,
      day_of_week: row.day_of_week,
      lesson_time: row.lesson_time,
      report_id: row.report_id,
      status: row.report_status,
      is_overdue: isOverdue(week, row.day_of_week),
    }))
    .sort(
      (a, b) =>
        Number(b.is_overdue) - Number(a.is_overdue) ||
        a.day_of_week - b.day_of_week ||
        (a.lesson_time ?? '').localeCompare(b.lesson_time ?? ''),
    );

  res.json({
    week: {
      id: week.id,
      week_no: week.week_no,
      start_date: week.start_date,
      end_date: week.end_date,
      label: week.label,
    },
    items,
  });
});

interface DashboardRow {
  class_course_id: string;
  day_of_week: number;
  lesson_time: string | null;
  class_name: string;
  course_name: string;
  report_id: string | null;
  report_status: string | null;
}

// ---------- Rapor get-or-create ----------

const createReportSchema = z.object({
  class_course_id: z.string().trim().min(1),
  week_id: z.string().trim().min(1),
});

router.post('/reports', (req, res) => {
  const user = req.user!;
  // İlk satırda yetki: yalnızca öğretmen ve admin rapor doldurabilir.
  if (user.role !== 'teacher' && user.role !== 'admin') {
    throw new AppError('FORBIDDEN', 403, 'Bu rapora erişim yetkiniz yok.');
  }
  const input = createReportSchema.parse(req.body);

  const cc = db
    .prepare(
      `SELECT cc.*, c.academic_year_id
       FROM class_courses cc
       JOIN classes c ON c.id = cc.class_id
       WHERE cc.id = ? AND cc.deleted_at IS NULL`,
    )
    .get(input.class_course_id) as
    | { id: string; class_id: string; teacher_id: string; day_of_week: number; academic_year_id: string }
    | undefined;
  if (!cc) {
    throw new AppError('NOT_FOUND', 404, 'Atama bulunamadı.');
  }
  assertCanFill(user, cc);

  const week = db
    .prepare(`SELECT * FROM weeks WHERE id = ?`)
    .get(input.week_id) as WeekRecord | undefined;
  if (!week) {
    throw new AppError('NOT_FOUND', 404, 'Hafta bulunamadı.');
  }
  if (week.academic_year_id !== cc.academic_year_id) {
    throw new AppError(
      'VALIDATION_ERROR',
      400,
      'Seçilen hafta bu sınıfın eğitim yılında değil.',
    );
  }

  // Zaten varsa aynı rapor döner (idempotent — dashboard açılışta çalıştırır).
  const existing = db
    .prepare(`SELECT id FROM reports WHERE class_course_id = ? AND week_id = ?`)
    .get(cc.id, week.id) as { id: string } | undefined;
  if (existing) {
    res.json(buildReportPayload(existing.id));
    return;
  }

  const reportId = randomUUID();
  const now = new Date().toISOString();
  const allWeeks = db.prepare(`SELECT * FROM weeks`).all() as unknown as WeekRecord[];
  // Yılın son haftasında null döner → homeworks satırı, öğretmen tarihi elle
  // girene kadar oluşturulmaz (spec §5.2; `homeworks.due_date` NOT NULL).
  const dueDate = calculateDueDate(week, cc.day_of_week, allWeeks);

  // Verilmiş olan ödev: bir önceki ders haftasının aynı atamadaki ödevi
  // (spec §5.1). Bulunamazsa boş serbest metin açılır (prev_homework_text).
  const previousWeek = getPreviousWeek(allWeeks, week);
  let prevHomeworkId: string | null = null;
  if (previousWeek) {
    const prevHomework = db
      .prepare(
        `SELECT id FROM homeworks WHERE class_course_id = ? AND week_id = ?`,
      )
      .get(cc.id, previousWeek.id) as { id: string } | undefined;
    prevHomeworkId = prevHomework?.id ?? null;
  }

  // Rapor + satırlar + draft homeworks tek transaction'da (DatabaseSync
  // senkrondur — kısa tutulur).
  db.exec('BEGIN');
  try {
    db.prepare(
      `INSERT INTO reports
         (id, class_course_id, week_id, topic_covered, prev_homework_id,
          prev_homework_text, status, completed_at, created_by, updated_at)
       VALUES (?, ?, ?, NULL, ?, NULL, 'draft', NULL, ?, ?)`,
    ).run(reportId, cc.id, week.id, prevHomeworkId, user.id, now);

    // Öğrenci listesi: hafta başında sınıfta aktif enrollment'lar (spec §5.1).
    const students = db
      .prepare(
        `SELECT s.id AS student_id
         FROM enrollments e
         JOIN students s ON s.id = e.student_id AND s.deleted_at IS NULL
         JOIN users u ON u.id = s.user_id AND u.deleted_at IS NULL
         WHERE e.class_id = ? AND (e.end_date IS NULL OR e.end_date >= ?)`,
      )
      .all(cc.class_id, week.start_date) as { student_id: string }[];

    const insertEntry = db.prepare(
      `INSERT INTO report_entries
         (id, report_id, student_id, attendance, homework_score, interest_score, teacher_note)
       VALUES (?, ?, ?, 'present', NULL, NULL, NULL)`,
    );
    for (const student of students) {
      insertEntry.run(randomUUID(), reportId, student.student_id);
    }

    if (dueDate !== null) {
      db.prepare(
        `INSERT INTO homeworks
           (id, report_id, class_course_id, week_id, description, attachments, due_date)
         VALUES (?, ?, ?, ?, '', NULL, ?)`,
      ).run(randomUUID(), reportId, cc.id, week.id, dueDate);
    }
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }

  res.status(201).json(buildReportPayload(reportId));
});

// ---------- Autosave (PUT) + Tamamla (POST complete) ----------

interface OwnedReportRow {
  id: string;
  class_course_id: string;
  week_id: string;
  topic_covered: string | null;
  prev_homework_id: string | null;
  prev_homework_text: string | null;
  status: string;
  completed_at: string | null;
  teacher_id: string;
}

/**
 * Raporu yükler + sahiplik doğrular (spec.md §2): öğretmen yalnızca kendi
 * class_course'unun raporu, admin tümü. Yoksa 404, yetkisizse 403.
 */
function loadOwnedReport(user: AuthUser, reportId: string): OwnedReportRow {
  const report = db
    .prepare(
      `SELECT r.id, r.class_course_id, r.week_id, r.topic_covered,
              r.prev_homework_id, r.prev_homework_text, r.status, r.completed_at,
              cc.teacher_id
       FROM reports r
       JOIN class_courses cc ON cc.id = r.class_course_id
       WHERE r.id = ?`,
    )
    .get(reportId) as OwnedReportRow | undefined;
  if (!report) {
    throw new AppError('NOT_FOUND', 404, 'Rapor bulunamadı.');
  }
  if (user.role !== 'admin' && (user.role !== 'teacher' || report.teacher_id !== user.id)) {
    throw new AppError('FORBIDDEN', 403, 'Bu rapora erişim yetkiniz yok.');
  }
  return report;
}

const entrySchema = z.object({
  student_id: z.string().trim().min(1),
  attendance: z.enum(['present', 'absent', 'late', 'excused']),
  homework_score: z.number().int().min(1).max(10).nullable(),
  interest_score: z.number().int().min(1).max(10).nullable(),
  teacher_note: z.string().trim().nullable(),
});

const putReportSchema = z.object({
  topic_covered: z.string().trim().nullable().optional(),
  prev_homework_text: z.string().trim().nullable().optional(),
  homework_description: z.string().trim().nullable().optional(),
  due_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Tarih YYYY-MM-DD biçiminde olmalı.')
    .nullable()
    .optional(),
  entries: z.array(entrySchema).optional(),
});

/**
 * Otomatik kaydetme (spec.md §5.1 adım 4). `completed` raporu düzenlemek
 * serbesttir ve `audit_logs`'a yazılır (spec §2); `sent` rapora 403.
 *
 * due_date kuralı: normal haftada sunucu otomatik doldurduğu için öğretmen
 * tarihi **boşaltamaz**, yalnızca değiştirebilir. Null ancak sunucunun zaten
 * null hesapladığı (yılın son haftası, homeworks satırı yok) durumda kabul
 * edilir — aksi halde 400 (CLAUDE.md Aşama 3 due_date kararı).
 */
router.put('/reports/:id', (req, res) => {
  const user = req.user!;
  const { id } = req.params;
  const report = loadOwnedReport(user, id);
  // İlk satırda yetki: gönderilmiş rapor öğretmene kapalı (spec §2).
  if (report.status === 'sent') {
    throw new AppError('FORBIDDEN', 403, 'Gönderilmiş rapor düzenlenemez.');
  }
  const input = putReportSchema.parse(req.body);

  const homework = db
    .prepare(`SELECT due_date, description FROM homeworks WHERE report_id = ?`)
    .get(id) as { due_date: string; description: string } | undefined;

  // due_date boşaltma koruması: dolu tarih null yapılamaz.
  if (input.due_date === null && homework && homework.due_date !== null) {
    throw new AppError(
      'VALIDATION_ERROR',
      400,
      'Teslim tarihi boşaltılamaz, yalnızca değiştirilebilir.',
      { due_date: 'Teslim tarihi boşaltılamaz, yalnızca değiştirilebilir.' },
    );
  }

  // Verilmiş ödev: referans (prev_homework_id) ile metin arasındaki seçim.
  // Referans korunuyorsa metin null; metin değiştiyse referans null yapılır
  // (reports CHECK: ikisi aynı anda dolu olamaz).
  let newPrevId = report.prev_homework_id;
  let newPrevText = report.prev_homework_text;
  if (input.prev_homework_text !== undefined) {
    const incoming = input.prev_homework_text === '' ? null : input.prev_homework_text;
    let refDesc: string | null = null;
    if (report.prev_homework_id) {
      const ref = db
        .prepare(`SELECT description FROM homeworks WHERE id = ?`)
        .get(report.prev_homework_id) as { description: string } | undefined;
      refDesc = ref?.description ?? null;
    }
    if (report.prev_homework_id && incoming === refDesc) {
      newPrevId = report.prev_homework_id;
      newPrevText = null;
    } else {
      newPrevId = null;
      newPrevText = incoming;
    }
  }

  // Gelen satırlar bu rapora ait olmalı.
  const reportStudentIds = new Set(
    (
      db
        .prepare(`SELECT student_id FROM report_entries WHERE report_id = ?`)
        .all(id) as Array<{ student_id: string }>
    ).map((r) => r.student_id),
  );
  for (const entry of input.entries ?? []) {
    if (!reportStudentIds.has(entry.student_id)) {
      throw new AppError(
        'VALIDATION_ERROR',
        400,
        'Raporda kayıtlı olmayan bir öğrenci için satır gönderildi.',
        { entries: 'Bilinmeyen öğrenci.' },
      );
    }
  }

  const now = new Date().toISOString();
  const newTopic = input.topic_covered === undefined ? report.topic_covered : input.topic_covered;

  db.exec('BEGIN');
  try {
    db.prepare(
      `UPDATE reports
       SET topic_covered = ?, prev_homework_id = ?, prev_homework_text = ?, updated_at = ?
       WHERE id = ?`,
    ).run(newTopic, newPrevId, newPrevText, now, id);

    if (homework) {
      const newDue = input.due_date === undefined ? homework.due_date : input.due_date;
      const newDesc =
        input.homework_description === undefined
          ? homework.description
          : (input.homework_description ?? '');
      db.prepare(`UPDATE homeworks SET description = ?, due_date = ? WHERE report_id = ?`).run(
        newDesc,
        newDue,
        id,
      );
    } else if (input.due_date) {
      // Yılın son haftası: satır yoktu, öğretmen tarihi girince oluşturulur.
      db.prepare(
        `INSERT INTO homeworks
           (id, report_id, class_course_id, week_id, description, attachments, due_date)
         VALUES (?, ?, ?, ?, ?, NULL, ?)`,
      ).run(
        randomUUID(),
        id,
        report.class_course_id,
        report.week_id,
        input.homework_description ?? '',
        input.due_date,
      );
    }

    const updateEntry = db.prepare(
      `UPDATE report_entries
       SET attendance = ?, homework_score = ?, interest_score = ?, teacher_note = ?
       WHERE report_id = ? AND student_id = ?`,
    );
    for (const entry of input.entries ?? []) {
      const isAbsent = entry.attendance === 'absent' || entry.attendance === 'excused';
      updateEntry.run(
        entry.attendance,
        isAbsent ? null : entry.homework_score,
        isAbsent ? null : entry.interest_score,
        entry.teacher_note,
        id,
        entry.student_id,
      );
    }
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }

  // completed raporu düzenleme audit'a yazılır (spec §2).
  if (report.status === 'completed') {
    writeAuditLog({
      actorId: user.id,
      action: 'report.update',
      entityType: 'report',
      entityId: id,
      diff: { edited_fields: Object.keys(input), by_role: user.role },
    });
  }

  res.json(buildReportPayload(id));
});

/**
 * Raporu tamamlar (spec.md §5.1 adım 5): devamsız olmayan her öğrenci için iki
 * puan da dolu olmalı; yılın son haftasında teslim tarihi girilmiş olmalı.
 */
router.post('/reports/:id/complete', (req, res) => {
  const user = req.user!;
  const { id } = req.params;
  const report = loadOwnedReport(user, id);
  if (report.status === 'sent') {
    throw new AppError('FORBIDDEN', 403, 'Gönderilmiş rapor düzenlenemez.');
  }

  // Yılın son haftası: homeworks satırı (due_date) yoksa tamamlanamaz (spec §5.2).
  const homework = db
    .prepare(`SELECT due_date FROM homeworks WHERE report_id = ?`)
    .get(id) as { due_date: string } | undefined;
  if (!homework || !homework.due_date) {
    throw new AppError(
      'VALIDATION_ERROR',
      400,
      'Yılın son haftası — teslim tarihini belirleyin.',
      { due_date: 'Teslim tarihi zorunlu.' },
    );
  }

  // Devamsız olmayan her öğrenci için iki puan da dolu olmalı (spec §5.1).
  const entries = db
    .prepare(
      `SELECT student_id, attendance, homework_score, interest_score
       FROM report_entries WHERE report_id = ?`,
    )
    .all(id) as Array<{
    student_id: string;
    attendance: string;
    homework_score: number | null;
    interest_score: number | null;
  }>;
  const missing: Record<string, string> = {};
  for (const entry of entries) {
    if (
      (entry.attendance === 'present' || entry.attendance === 'late') &&
      (entry.homework_score === null || entry.interest_score === null)
    ) {
      missing[entry.student_id] = 'Ödev ve ilgi puanı girilmeli.';
    }
  }
  if (Object.keys(missing).length > 0) {
    throw new AppError(
      'VALIDATION_ERROR',
      400,
      'Devamsız olmayan her öğrenci için ödev ve ilgi puanı girilmelidir.',
      missing,
    );
  }

  const now = new Date().toISOString();
  db.prepare(
    `UPDATE reports
     SET status = 'completed', completed_at = COALESCE(completed_at, ?), updated_at = ?
     WHERE id = ?`,
  ).run(now, now, id);

  res.json(buildReportPayload(id));
});

// ---------- Geçmiş raporlarım ----------

/**
 * GET /teacher/reports — öğretmenin tüm raporları (spec.md §6 "Geçmiş
 * raporlarım"). Dashboard yalnızca draft/açılmamış gösterir; tamamlananlar
 * buradan görüntülenir. Öğretmen: yalnızca kendi atamaları; admin: hepsi.
 * Sıralama: hafta başlangıcı azalan (en yeni üstte).
 */
router.get('/reports', (req, res) => {
  const user = req.user!;
  if (user.role !== 'teacher' && user.role !== 'admin') {
    throw new AppError('FORBIDDEN', 403, 'Bu rapora erişim yetkiniz yok.');
  }

  const statusFilter =
    typeof req.query.status === 'string' &&
    ['draft', 'completed', 'sent'].includes(req.query.status)
      ? req.query.status
      : null;

  const rows = (
    user.role === 'teacher'
      ? db
          .prepare(
            `SELECT r.id, r.class_course_id, r.week_id, r.status, r.completed_at, r.updated_at,
                    cc.day_of_week, cc.lesson_time,
                    c.name AS class_name, co.name AS course_name,
                    w.week_no, w.start_date AS week_start, w.end_date AS week_end,
                    w.label AS week_label,
                    (SELECT COUNT(*) FROM report_entries re WHERE re.report_id = r.id) AS student_count
             FROM reports r
             JOIN class_courses cc ON cc.id = r.class_course_id
             JOIN classes c ON c.id = cc.class_id
             JOIN courses co ON co.id = cc.course_id
             JOIN weeks w ON w.id = r.week_id
             WHERE cc.teacher_id = ? AND cc.deleted_at IS NULL
             ${statusFilter ? 'AND r.status = ?' : ''}
             ORDER BY w.start_date DESC, cc.day_of_week, cc.lesson_time`,
          )
          .all(user.id, ...(statusFilter ? [statusFilter] : []))
      : db
          .prepare(
            `SELECT r.id, r.class_course_id, r.week_id, r.status, r.completed_at, r.updated_at,
                    cc.day_of_week, cc.lesson_time,
                    c.name AS class_name, co.name AS course_name,
                    w.week_no, w.start_date AS week_start, w.end_date AS week_end,
                    w.label AS week_label,
                    (SELECT COUNT(*) FROM report_entries re WHERE re.report_id = r.id) AS student_count
             FROM reports r
             JOIN class_courses cc ON cc.id = r.class_course_id
             JOIN classes c ON c.id = cc.class_id
             JOIN courses co ON co.id = cc.course_id
             JOIN weeks w ON w.id = r.week_id
             WHERE cc.deleted_at IS NULL
             ${statusFilter ? 'AND r.status = ?' : ''}
             ORDER BY w.start_date DESC, cc.day_of_week, cc.lesson_time`,
          )
          .all(...(statusFilter ? [statusFilter] : []))
  ) as Array<{
    id: string;
    status: string;
    completed_at: string | null;
    updated_at: string;
    day_of_week: number;
    lesson_time: string | null;
    class_name: string;
    course_name: string;
    week_no: number;
    week_start: string;
    week_end: string;
    week_label: string;
    student_count: number;
  }>;

  res.json({ items: rows });
});

export default router;

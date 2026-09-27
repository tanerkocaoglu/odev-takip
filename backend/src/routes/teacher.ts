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
import { pdfUpload, MAX_HOMEWORK_ATTACHMENTS } from '../middleware/upload.js';
import { writeAuditLog } from '../services/audit.js';
import {
  ensurePendingDigests,
  firstActiveWeekIdForClass,
  maybeReadyDigests,
} from '../services/digests.js';
import {
  countAttachmentsByReport,
  loadAttachmentsByReportId,
} from '../services/homeworkAttachments.js';
import { savePdfUpload, deleteStored, type StoredFile } from '../services/storage.js';
import { loadSubmissionFiles } from '../services/submissionFiles.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { parsePagination, paged } from '../utils/pagination.js';
import { normalizeTurkish } from '../utils/text.js';
import {
  calculateDueDate,
  classDateForWeek,
  compareWeekdayLessonTime,
  formatDateTR,
  formatWeekLabel,
  getPreviousWeek,
  relativeDayOrderSql,
  type WeekRecord,
} from '../utils/weeks.js';
import {
  hasWeekStarted,
  isClassDayWithinWeek,
  isOverdue,
  localTodayISO,
} from '../utils/time.js';
import type { AuthUser } from '../types.js';

const router = Router();

router.use(requireAuth);

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
type PrevSubmission = {
  is_late: number;
  status: string;
  files: Array<{ key: string; filename: string }>;
};

/**
 * Geçen haftanın ödevi (`prev_homework_id`) için öğrenci bazında teslim
 * durumu — rapor giriş ekranındaki teslim rozetleri (spec.md §5.1). Rapor
 * satırları da bu veriden beslenir; hem mevcut rapor payload'ı hem de
 * gelecek haftanın sentetik önizlemesi bu tek fonksiyonu kullanır.
 */
function loadPrevSubmissions(prevHomeworkId: string | null): Map<string, PrevSubmission> {
  if (!prevHomeworkId) return new Map();
  const rows = db
    .prepare(
      `SELECT s.id AS submission_id, s.student_id, s.is_late, s.status
       FROM submissions s WHERE s.homework_id = ?`,
    )
    .all(prevHomeworkId) as Array<{
    submission_id: string;
    student_id: string;
    is_late: number;
    status: string;
  }>;
  const fileRows = db
    .prepare(
      `SELECT sf.submission_id, sf.key, sf.filename
       FROM submission_files sf
       JOIN submissions s ON s.id = sf.submission_id
       WHERE s.homework_id = ?`,
    )
    .all(prevHomeworkId) as Array<{
    submission_id: string;
    key: string;
    filename: string;
  }>;
  const filesBySubmission = new Map<string, Array<{ key: string; filename: string }>>();
  for (const f of fileRows) {
    const list = filesBySubmission.get(f.submission_id) ?? [];
    list.push({ key: f.key, filename: f.filename });
    filesBySubmission.set(f.submission_id, list);
  }
  return new Map(
    rows.map((r) => [
      r.student_id,
      {
        is_late: r.is_late,
        status: r.status,
        files: filesBySubmission.get(r.submission_id) ?? [],
      },
    ]),
  );
}

/** Hafta başlamadıysa (gelecek hafta) rapora yazma reddi (spec.md §5.1). */
function assertWeekStarted(week: { start_date: string }): void {
  if (!hasWeekStarted(week)) {
    throw new AppError(
      'FORBIDDEN',
      403,
      'Bu hafta henüz başlamadı; rapor hafta başladığında doldurulabilir.',
    );
  }
}

/**
 * **Savunma katmanı (spec.md §3.1):** dersin gerçek takvim günü haftanın
 * `[start_date, end_date]` aralığının dışındaysa yazmayı reddeder. Normal
 * 7 günlük haftada bu koşul asla tetiklenmez; yalnızca hatalı tanımlanmış
 * (7 günden farklı) mevcut veride devreye girer. Hata **409 CONFLICT**'tir:
 * sorun istemci girdisinde değil, yöneticinin hafta tanımındadır.
 */
function assertClassDayInWeek(week: WeekRecord, dayOfWeek: number): void {
  if (isClassDayWithinWeek(week, dayOfWeek)) return;
  const classDate = formatDateTR(classDateForWeek(week.start_date, dayOfWeek));
  const range = formatWeekLabel(week.start_date, week.end_date);
  throw new AppError(
    'CONFLICT',
    409,
    `Hafta tanımı hatalı: bu dersin günü (${classDate}) hafta aralığının ` +
      `(${range}) dışında. Yönetici haftanın tarih aralığını düzeltmeli.`,
  );
}

/**
 * Ödev eki yazma kapısı — `PUT /reports/:id` ile birebir aynı kurallar:
 * `sent` raporda öğretmen 403 (admin ekleyebilir), hafta başlamış olmalı,
 * hafta tanımı geçerli olmalı (ders günü aralık içinde).
 */
function assertAttachmentWriteAllowed(user: AuthUser, report: OwnedReportRow): void {
  if (report.status === 'sent' && user.role !== 'admin') {
    throw new AppError('FORBIDDEN', 403, 'Gönderilmiş rapor düzenlenemez.');
  }
  const week = db.prepare(`SELECT * FROM weeks WHERE id = ?`).get(report.week_id) as
    | WeekRecord
    | undefined;
  if (!week) {
    throw new AppError('NOT_FOUND', 404, 'Hafta bulunamadı.');
  }
  assertWeekStarted(week);
  assertClassDayInWeek(week, report.day_of_week);
}

/** Saklanan ekleri sürücüsünden kaldırır — en iyi çaba; hata yutulur. */
async function removeStoredFiles(
  files: Array<{ key: string; storage: StoredFile['storage'] }>,
): Promise<void> {
  for (const f of files) {
    try {
      await deleteStored(f.storage, f.key);
    } catch {
      // Geri alma yolu; dosya zaten yoksa/erişilemezse umursama.
    }
  }
}

function buildReportPayload(reportId: string, viewerRole: AuthUser['role']): unknown {
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
  let prevHomeworkReportId: string | null = null;
  if (report.prev_homework_id) {
    const prev = db
      .prepare(`SELECT description, report_id FROM homeworks WHERE id = ?`)
      .get(report.prev_homework_id) as
      | { description: string; report_id: string }
      | undefined;
    prevHomeworkText = report.prev_homework_text ?? prev?.description ?? null;
    prevHomeworkReportId = prev?.report_id ?? null;
  } else {
    prevHomeworkText = report.prev_homework_text ?? null;
  }

  const homework = db
    .prepare(
      `SELECT id, description, due_date FROM homeworks WHERE report_id = ?`,
    )
    .get(reportId) as
    | { id: string; description: string | null; due_date: string }
    | undefined;

  // Ödev ekleri (migration #13): bu raporun "Yapılacak ödev"i ve varsa geçen
  // haftanın ("Verilmiş ödev") ekleri. Sahiplik rapor üzerindendir; bu yüzden
  // yılın son haftasında `homeworks` satırı olmasa da ekler görünür/eklenebilir.
  const homeworkAttachments = loadAttachmentsByReportId(reportId);
  const prevHomeworkAttachments = loadAttachmentsByReportId(prevHomeworkReportId);

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
    .all(reportId) as Array<{
    student_id: string;
    student_name: string;
    attendance: string;
    homework_score: number | null;
    interest_score: number | null;
    teacher_note: string | null;
  }>;

  const prevSubmissions = loadPrevSubmissions(report.prev_homework_id);

  const entriesWithSubmission = entries.map((e) => ({
    ...e,
    submission: prevSubmissions.get(e.student_id) ?? null,
  }));

  const rangeInvalid = !isClassDayWithinWeek(
    { start_date: report.week_start, end_date: report.week_end },
    report.day_of_week,
  );

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
      prev_homework_id: report.prev_homework_id,
      // Geçen haftanın ödev ekleri ("Verilmiş ödev" satırı altında gösterilir).
      prev_homework_attachments: prevHomeworkAttachments,
      // Bu raporun "Yapılacak ödev" ekleri — `homeworks` satırı olmasa da var.
      homework_attachments: homeworkAttachments,
      homework: homework
        ? { id: homework.id, description: homework.description, due_date: homework.due_date }
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
    // Hafta henüz başlamadıysa yalnızca önizleme: tüm alanlar salt-okunur
    // (spec.md §5.1). Hafta tanımı hatalıysa (ders günü aralık dışı) da
    // yazma engellenir + `week_range_invalid` ile işaretlenir (§3.1).
    read_only: !hasWeekStarted({ start_date: report.week_start }) || rangeInvalid,
    // Gönderilmiş rapor öğretmene kapalı (spec §2); admin düzenleyebilir. Hafta
    // salt-okunurluğundan AYRI bayrak: ikisi birleşince arayüz kilitlenir ama
    // "neden" farklı bir banner ile anlatılır.
    locked_for_teacher: report.status === 'sent' && viewerRole !== 'admin',
    week_range_invalid: rangeInvalid,
    entries: entriesWithSubmission,
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

  // Sıralama haftanın gerçek başlangıcına göredir (Cumartesi başlangıçlı
  // haftada Pazar, Salı'dan önce gelir). `is_overdue` da aynı göreli güne
  // dayandığından "gecikmiş üstte" ikisiyle tutarlıdır.
  const byWeekDay = compareWeekdayLessonTime<{ day_of_week: number; lesson_time: string | null }>(
    week.start_date,
  );
  const items = rows
    .map((row) => {
      const rangeInvalid = !isClassDayWithinWeek(week, row.day_of_week);
      return {
        class_course_id: row.class_course_id,
        class_name: row.class_name,
        course_name: row.course_name,
        day_of_week: row.day_of_week,
        lesson_time: row.lesson_time,
        report_id: row.report_id,
        status: row.report_status,
        // Hafta tanımı hatalıysa (ders günü aralık dışı) "gecikmiş" hesabı
        // anlamsızdır; rozet bunun yerine `week_range_invalid` gösterir (§3.1).
        is_overdue: rangeInvalid ? false : isOverdue(week, row.day_of_week),
        week_range_invalid: rangeInvalid,
      };
    })
    .sort(
      (a, b) => Number(b.is_overdue) - Number(a.is_overdue) || byWeekDay(a, b),
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
    // Hafta henüz başlamadıysa (bugün < start_date) kayıtlar yalnızca
    // salt-okunur önizlemedir; dashboard bunu banner/rozetle bildirir
    // (spec.md §5.1). Yazma engeli backend guard'ındadır.
    week_not_started: !hasWeekStarted(week),
    // İç hatırlatma (Aşama 6): gecikmiş taslak sayısı — dashboard üstünde
    // "Bu hafta N raporunuz gecikti" banner'ı için (mevcut is_overdue'dan
    // türetilir; arka plan mekanizması yok).
    overdue_count: items.filter((i) => i.is_overdue).length,
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
  // Henüz başlamamış haftaya yazma yok (spec §5.1) — mevcut rapor dalı dahil.
  assertWeekStarted(week);
  // Hafta tanımı hatalıysa (ders günü aralık dışı) yazma reddi (§3.1).
  assertClassDayInWeek(week, cc.day_of_week);

  // Zaten varsa aynı rapor döner (idempotent — dashboard açılışta çalıştırır).
  const existing = db
    .prepare(`SELECT id FROM reports WHERE class_course_id = ? AND week_id = ?`)
    .get(cc.id, week.id) as { id: string } | undefined;
  if (existing) {
    res.json(buildReportPayload(existing.id, user.role));
    return;
  }

  const reportId = randomUUID();
  const now = new Date().toISOString();
  const allWeeks = db.prepare(`SELECT * FROM weeks`).all() as unknown as WeekRecord[];
  // Yılın son haftasında null döner → homeworks satırı, öğretmen tarihi elle
  // girene kadar oluşturulmaz (spec §5.2; `homeworks.due_date` NOT NULL).
  const dueDate = calculateDueDate(week, cc.day_of_week, allWeeks);

  // Verilmiş olan ödev: bir önceki ders haftasının aynı atamadaki ödevi
  // (spec §5.1). **Sınıfın ilk aktif haftasında** otomatik bağlama yapılmaz:
  // o haftada devredilen bir ödev yoktur, alan boş serbest metin açılır
  // (`prev_homework_text`) — yılın ilk haftası davranışıyla aynı. Bulunamazsa
  // da boş açılır. Eşleştirme hafta kimliği (id) üzerindendir; mutlak week_no
  // sarmasından etkilenmez.
  const firstActiveWeekId = firstActiveWeekIdForClass(cc.class_id);
  const isFirstActiveWeek = firstActiveWeekId !== null && firstActiveWeekId === week.id;
  let prevHomeworkId: string | null = null;
  if (!isFirstActiveWeek) {
    const previousWeek = getPreviousWeek(allWeeks, week);
    if (previousWeek) {
      const prevHomework = db
        .prepare(
          `SELECT id FROM homeworks WHERE class_course_id = ? AND week_id = ?`,
        )
        .get(cc.id, previousWeek.id) as { id: string } | undefined;
      prevHomeworkId = prevHomework?.id ?? null;
    }
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
    // "Aktif" tanımı digest/panel/risk ile birebir aynıdır: enrollment hafta
    // başında BAŞLAMIŞ olmalı (`start_date <= hafta_başı`). İleri/orta hafta
    // tarihli bir kayıt (henüz başlamamış öğrenci) rapora ve puana girmez.
    const students = db
      .prepare(
        `SELECT s.id AS student_id
         FROM enrollments e
         JOIN students s ON s.id = e.student_id AND s.deleted_at IS NULL
         JOIN users u ON u.id = s.user_id AND u.deleted_at IS NULL
         WHERE e.class_id = ?
           AND e.start_date <= ?
           AND (e.end_date IS NULL OR e.end_date >= ?)`,
      )
      .all(cc.class_id, week.start_date, week.start_date) as { student_id: string }[];

    // Yeni satırlar 'absent' başlar (spec §5.1): öğretmen yoklama almadan
    // bırakırsa sessizce "herkes geldi" varsayılmaz; rapor "herkes yok" gibi
    // görünerek hatayı fark ettirir. Varsayılan UI'da da "Gelmedi" olarak
    // yansır (satırlar payload'dan gelir).
    const insertEntry = db.prepare(
      `INSERT INTO report_entries
         (id, report_id, student_id, attendance, homework_score, interest_score, teacher_note)
       VALUES (?, ?, ?, 'absent', NULL, NULL, NULL)`,
    );
    for (const student of students) {
      insertEntry.run(randomUUID(), reportId, student.student_id);
    }

    if (dueDate !== null) {
      db.prepare(
        `INSERT INTO homeworks
           (id, report_id, class_course_id, week_id, description, due_date)
         VALUES (?, ?, ?, ?, '', ?)`,
      ).run(randomUUID(), reportId, cc.id, week.id, dueDate);
    }
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }

  res.status(201).json(buildReportPayload(reportId, user.role));
});

// ---------- Autosave (PUT) + Tamamla (POST complete) ----------

interface OwnedReportRow {
  id: string;
  class_course_id: string;
  class_id: string;
  week_id: string;
  topic_covered: string | null;
  prev_homework_id: string | null;
  prev_homework_text: string | null;
  status: string;
  completed_at: string | null;
  teacher_id: string;
  day_of_week: number;
}

/**
 * Raporu yükler + sahiplik doğrular (spec.md §2): öğretmen yalnızca kendi
 * class_course'unun raporu, admin tümü. Yoksa 404, yetkisizse 403.
 */
function loadOwnedReport(user: AuthUser, reportId: string): OwnedReportRow {
  const report = db
    .prepare(
      `SELECT r.id, r.class_course_id, cc.class_id, r.week_id, r.topic_covered,
              r.prev_homework_id, r.prev_homework_text, r.status, r.completed_at,
              cc.teacher_id, cc.day_of_week
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
  // Gönderilmiş rapor öğretmene kapalı (403); admin düzenleyebilir (spec §2).
  // Admin düzenlemesi snapshot'ı DEĞİŞTİRMEZ — veli eski kopyayı görmeye devam
  // eder; admin dilerse ayrıca yeniden gönderir (yeni snapshot, yeni token).
  if (report.status === 'sent' && user.role !== 'admin') {
    throw new AppError('FORBIDDEN', 403, 'Gönderilmiş rapor düzenlenemez.');
  }
  // Henüz başlamamış haftaya yazma yok (spec §5.1) — admin dahil herkes.
  const week = db.prepare(`SELECT * FROM weeks WHERE id = ?`).get(report.week_id) as
    | WeekRecord
    | undefined;
  if (!week) {
    throw new AppError('NOT_FOUND', 404, 'Hafta bulunamadı.');
  }
  assertWeekStarted(week);
  // Hafta tanımı hatalıysa (ders günü aralık dışı) yazma reddi (§3.1).
  assertClassDayInWeek(week, report.day_of_week);
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
           (id, report_id, class_course_id, week_id, description, due_date)
         VALUES (?, ?, ?, ?, ?, ?)`,
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
      // homework_score devamsızlıktan bağımsızdır (spec §4): öğrenci dersten
      // devamsız olsa da önceki haftanın ödevini değerlendirebilir. Yalnızca
      // interest_score (derse katılım) devamsızsa null'a çekilir.
      updateEntry.run(
        entry.attendance,
        entry.homework_score,
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

  // completed (öğretmen/admin) veya sent (yalnızca admin) düzenlemesi audit'e
  // yazılır (spec §2). `sent` buraya yalnızca admin ile gelebildiği için
  // öğretmenin sent düzenlemesi audit'e düşmez (zaten 403).
  if (report.status === 'completed' || report.status === 'sent') {
    writeAuditLog({
      actorId: user.id,
      action: 'report.update',
      entityType: 'report',
      entityId: id,
      diff: { edited_fields: Object.keys(input), by_role: user.role },
    });
  }

  res.json(buildReportPayload(id, user.role));
});

/**
 * Raporu tamamlar (spec.md §5.1 adım 5): devamsız olmayan her öğrenci için iki
 * puan da dolu olmalı; yılın son haftasında teslim tarihi girilmiş olmalı.
 */
router.post('/reports/:id/complete', (req, res) => {
  const user = req.user!;
  const { id } = req.params;
  const report = loadOwnedReport(user, id);
  // Netleştirme (spec §2): `sent` rapor "tamamlanamaz" — burada rol ayrımı
  // YOKTUR ve olmamalıdır. Rapor zaten tamamlanıp gönderilmiştir; "tamamlamak"
  // anlamsızdır. Admin de 403 alır (admin düzenleme hakkı PUT ucundadır).
  if (report.status === 'sent') {
    throw new AppError('FORBIDDEN', 403, 'Gönderilmiş rapor düzenlenemez.');
  }
  // Henüz başlamamış hafta tamamlanamaz (spec §5.1) — admin dahil herkes.
  const week = db.prepare(`SELECT * FROM weeks WHERE id = ?`).get(report.week_id) as
    | WeekRecord
    | undefined;
  if (!week) {
    throw new AppError('NOT_FOUND', 404, 'Hafta bulunamadı.');
  }
  assertWeekStarted(week);
  // Hafta tanımı hatalıysa (ders günü aralık dışı) tamamlanamaz (§3.1).
  assertClassDayInWeek(week, report.day_of_week);

  // "Sınıfın ilk aktif haftası" istisnası (spec §5.1): bir sınıfın gördüğü ilk
  // haftada devredilen bir önceki ödev bağı yoktur; bu yüzden `present`/`late`
  // öğrencilerde puan zorunluluğu **kalkar** (öğretmen isterse yine girer).
  // Eşleştirme hafta kimliği (id) üzerindendir — mutlak week_no sarmasına karşı
  // sağlamdır. `firstActiveWeekId` null ise (sınıfın enrollment'ı yok) katı
  // kural aynen sürer.
  const firstActiveWeekId = firstActiveWeekIdForClass(report.class_id);
  const isFirstActiveWeek =
    firstActiveWeekId !== null && firstActiveWeekId === report.week_id;

  // Yılın son haftası: homeworks satırı (due_date) yoksa tamamlanamaz (spec §5.2).
  const homework = db
    .prepare(`SELECT due_date, description FROM homeworks WHERE report_id = ?`)
    .get(id) as { due_date: string; description: string } | undefined;
  if (!homework || !homework.due_date) {
    throw new AppError(
      'VALIDATION_ERROR',
      400,
      'Yılın son haftası — teslim tarihini belirleyin.',
      { due_date: 'Teslim tarihi zorunlu.' },
    );
  }

  // Üst alanlar zorunlu (spec §5.1): işlenen konu + yapılacak ödev açıklaması
  // boş bırakılırsa rapor tamamlanamaz. (Verilmiş olan ödev çoğunlukla otomatik
  // dolduğu için bu kurala dahil değildir.)
  const topFields: Record<string, string> = {};
  if (!report.topic_covered || report.topic_covered.trim() === '') {
    topFields.topic_covered = 'İşlenen konu girilmeli.';
  }
  if (!homework.description || homework.description.trim() === '') {
    topFields.homework_description = 'Yapılacak ödev girilmeli.';
  }
  if (Object.keys(topFields).length > 0) {
    throw new AppError(
      'VALIDATION_ERROR',
      400,
      'İşlenen konu ve yapılacak ödev girilmelidir.',
      topFields,
    );
  }

  // Devamsız olmayan her öğrenci için iki puan da dolu olmalı (spec §5.1) —
  // ancak sınıfın ilk aktif haftasında bu zorunluluk uygulanmaz.
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
  if (!isFirstActiveWeek) {
    for (const entry of entries) {
      if (
        (entry.attendance === 'present' || entry.attendance === 'late') &&
        (entry.homework_score === null || entry.interest_score === null)
      ) {
        missing[entry.student_id] = 'Ödev ve ders içi performans puanı girilmeli.';
      }
    }
  }
  if (Object.keys(missing).length > 0) {
    throw new AppError(
      'VALIDATION_ERROR',
      400,
      'Devamsız olmayan her öğrenci için ödev ve ders içi performans puanı girilmelidir.',
      missing,
    );
  }

  const now = new Date().toISOString();
  db.prepare(
    `UPDATE reports
     SET status = 'completed', completed_at = COALESCE(completed_at, ?), updated_at = ?
     WHERE id = ?`,
  ).run(now, now, id);

  // Digest tetikleme (spec.md §5.4): ilk tamamlanmada pending açılır; sınıfın
  // o haftadaki tüm dersleri tamamlanınca aynı kayıtlar ready olur.
  const classRow = db
    .prepare(`SELECT class_id FROM class_courses WHERE id = ?`)
    .get(report.class_course_id) as { class_id: string } | undefined;
  if (classRow) {
    ensurePendingDigests(classRow.class_id, report.week_id);
    maybeReadyDigests(classRow.class_id, report.week_id);
  }

  res.json(buildReportPayload(id, user.role));
});

// ---------- Ödev ekleri (öğretmen PDF — migration #13) ----------

/**
 * `POST /teacher/reports/:id/attachments` — "Yapılacak ödev"e PDF ekler.
 * Durum/hafta kapısı `PUT /reports/:id` ile aynıdır (`assertAttachmentWriteAllowed`).
 * Ödev başına en fazla 5 PDF (dosya başına 10 MB); magic-byte PDF doğrulaması
 * `savePdfUpload` içindedir.
 */
router.post(
  '/reports/:id/attachments',
  pdfUpload,
  asyncHandler<{ id: string }>(async (req, res) => {
    const user = req.user!;
    const report = loadOwnedReport(user, req.params.id);
    assertAttachmentWriteAllowed(user, report);

    const files = (req.files ?? []) as Express.Multer.File[];
    if (files.length === 0) {
      throw new AppError('VALIDATION_ERROR', 400, 'En az bir PDF ekleyin.');
    }
    if (countAttachmentsByReport(report.id) + files.length > MAX_HOMEWORK_ATTACHMENTS) {
      throw new AppError(
        'VALIDATION_ERROR',
        400,
        `Bir ödeve en fazla ${MAX_HOMEWORK_ATTACHMENTS} PDF ekleyebilirsiniz.`,
      );
    }

    const stored: StoredFile[] = [];
    try {
      for (const file of files) stored.push(await savePdfUpload(file));
    } catch (err) {
      await removeStoredFiles(stored);
      throw err;
    }

    try {
      db.exec('BEGIN');
      const insert = db.prepare(
        `INSERT INTO homework_attachments
           (id, report_id, key, filename, size, mime, ext, storage)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      );
      for (const a of stored) {
        insert.run(
          randomUUID(),
          report.id,
          a.key,
          a.filename,
          a.size,
          a.mime,
          a.ext,
          a.storage,
        );
      }
      // Yarış güvencesi: transaction içinde toplamı yeniden doğrula.
      if (countAttachmentsByReport(report.id) > MAX_HOMEWORK_ATTACHMENTS) {
        throw new AppError(
          'VALIDATION_ERROR',
          400,
          `Bir ödeve en fazla ${MAX_HOMEWORK_ATTACHMENTS} PDF ekleyebilirsiniz.`,
        );
      }
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      await removeStoredFiles(stored);
      throw err;
    }

    res.status(201).json({ attachments: loadAttachmentsByReportId(report.id) });
  }),
);

/**
 * `DELETE /teacher/reports/:id/attachments/:attachmentId` — eki kaldırır.
 * DB satırı önce silinir, nesne sonra (COMMIT sonrası) — hata olsa da en fazla
 * öksüz nesne kalır (zararsız).
 */
router.delete(
  '/reports/:id/attachments/:attachmentId',
  asyncHandler<{ id: string; attachmentId: string }>(async (req, res) => {
    const user = req.user!;
    const report = loadOwnedReport(user, req.params.id);
    assertAttachmentWriteAllowed(user, report);

    const row = db
      .prepare(
        `SELECT id, key, storage FROM homework_attachments WHERE id = ? AND report_id = ?`,
      )
      .get(req.params.attachmentId, report.id) as
      | { id: string; key: string; storage: StoredFile['storage'] }
      | undefined;
    if (!row) {
      throw new AppError('NOT_FOUND', 404, 'Ek bulunamadı.');
    }

    db.prepare('DELETE FROM homework_attachments WHERE id = ?').run(row.id);
    await removeStoredFiles([{ key: row.key, storage: row.storage }]);

    res.json({ attachments: loadAttachmentsByReportId(report.id) });
  }),
);

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

  const pagination = parsePagination(req.query as Record<string, unknown>);

  const statusFilter =
    typeof req.query.status === 'string' &&
    ['draft', 'completed', 'sent'].includes(req.query.status)
      ? req.query.status
      : null;
  const classId = typeof req.query.class_id === 'string' ? req.query.class_id : null;
  const weekId = typeof req.query.week_id === 'string' ? req.query.week_id : null;
  const teacherId = typeof req.query.teacher_id === 'string' ? req.query.teacher_id : null;
  // Arama: sınıf adı VEYA ders adı (normalize). Türkçe LIKE ASCII'de harf
  // duyarsız olmadığından sorgu sunucuda normalizeTurkish ile indirgenir.
  // **Öğretmen adı yalnızca admin** aramasında dahildir (karar): paylaşılan uç
  // öğretmen "Geçmiş raporlarım" ekranını da beslediğinden öğretmen semantiği
  // bu genişlemeden etkilenmez.
  const q = typeof req.query.q === 'string' ? normalizeTurkish(req.query.q.trim()) : '';

  const extraWhere: string[] = [];
  const extraValues: string[] = [];
  if (statusFilter) {
    extraWhere.push('r.status = ?');
    extraValues.push(statusFilter);
  }
  if (classId) {
    extraWhere.push('cc.class_id = ?');
    extraValues.push(classId);
  }
  if (weekId) {
    extraWhere.push('r.week_id = ?');
    extraValues.push(weekId);
  }
  if (teacherId) {
    extraWhere.push('cc.teacher_id = ?');
    extraValues.push(teacherId);
  }
  if (q) {
    if (user.role === 'admin') {
      // Admin: sınıf VEYA ders VEYA öğretmen adı (hepsi normalize).
      extraWhere.push(
        '(c.name_normalized LIKE ? OR co.name_normalized LIKE ? OR t.full_name_normalized LIKE ?)',
      );
      extraValues.push(`%${q}%`, `%${q}%`, `%${q}%`);
    } else {
      extraWhere.push('(c.name_normalized LIKE ? OR co.name_normalized LIKE ?)');
      extraValues.push(`%${q}%`, `%${q}%`);
    }
  }

  // Kapsam: öğretmen yalnızca kendi atamaları (CLAUDE.md — "önce hepsini çek
  // sonra filtrele" yapılmaz), admin tümü. Sayfalama sorgu seviyesindedir.
  const scopeWhere = user.role === 'teacher' ? 'cc.teacher_id = ? AND cc.deleted_at IS NULL' : 'cc.deleted_at IS NULL';
  const scopeValues = user.role === 'teacher' ? [user.id] : [];
  const where = scopeWhere + (extraWhere.length > 0 ? ' AND ' + extraWhere.join(' AND ') : '');
  const allValues = [...scopeValues, ...extraValues];

  const total = (
    db
      .prepare(
        `SELECT COUNT(*) AS n FROM reports r
         JOIN class_courses cc ON cc.id = r.class_course_id
         JOIN classes c ON c.id = cc.class_id
         JOIN courses co ON co.id = cc.course_id
         JOIN users t ON t.id = cc.teacher_id
         JOIN weeks w ON w.id = r.week_id
         WHERE ${where}`,
      )
      .get(...allValues) as { n: number }
  ).n;

  const rows = db
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
       JOIN users t ON t.id = cc.teacher_id
       JOIN weeks w ON w.id = r.week_id
       WHERE ${where}
       ORDER BY w.start_date DESC,
                ${relativeDayOrderSql('cc.day_of_week', 'w.start_date')},
                cc.lesson_time
       LIMIT ? OFFSET ?`,
    )
    .all(...allValues, pagination.limit, pagination.offset) as Array<{
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

  res.json(paged(rows, total, pagination));
});

/**
 * GET /teacher/reports/filters — geçmiş rapor filtresi için sınıf + hafta
 * seçenekleri. Kapsam role göre **handler'ın ilk satırında** belirlenir:
 * öğretmen yalnızca kendi (silinmemiş) `class_courses` atamalarındaki
 * raporlardan türetir; admin tümü. Seçenekler raporda fiilen geçen
 * sınıf/haftalardan gelir (aktif eğitim yılına bağlı değildir).
 *
 * DİKKAT: `/reports/:id`'den ÖNCE kayıtlı olmalıdır; aksi halde `:id` "filters"
 * değerini yakalar.
 */
router.get('/reports/filters', (req, res) => {
  const user = req.user!;
  if (user.role !== 'teacher' && user.role !== 'admin') {
    throw new AppError('FORBIDDEN', 403, 'Bu rapora erişim yetkiniz yok.');
  }

  const scopeWhere =
    user.role === 'teacher'
      ? 'cc.teacher_id = ? AND cc.deleted_at IS NULL'
      : 'cc.deleted_at IS NULL';
  const scopeValues = user.role === 'teacher' ? [user.id] : [];

  const classes = db
    .prepare(
      `SELECT DISTINCT c.id, c.name
       FROM reports r
       JOIN class_courses cc ON cc.id = r.class_course_id
       JOIN classes c ON c.id = cc.class_id
       WHERE ${scopeWhere}
       ORDER BY c.name`,
    )
    .all(...scopeValues) as Array<{ id: string; name: string }>;

  const weeks = db
    .prepare(
      `SELECT DISTINCT w.id, w.week_no, w.label, w.start_date
       FROM reports r
       JOIN class_courses cc ON cc.id = r.class_course_id
       JOIN weeks w ON w.id = r.week_id
       WHERE ${scopeWhere}
       ORDER BY w.start_date DESC`,
    )
    .all(...scopeValues) as Array<{
    id: string;
    week_no: number;
    label: string;
    start_date: string;
  }>;

  // Öğretmen seçenekleri yalnızca admin içindir (admin "Tüm raporlar"
  // dropdown'ı). Kaynak, classes/weeks ile aynı mantık: raporlarda fiilen geçen
  // öğretmenler (distinct). Öğretmen rolünde boş döner — ekranı kullanmaz.
  const teachers =
    user.role === 'admin'
      ? (db
          .prepare(
            `SELECT DISTINCT t.id, t.full_name
             FROM reports r
             JOIN class_courses cc ON cc.id = r.class_course_id
             JOIN users t ON t.id = cc.teacher_id
             WHERE cc.deleted_at IS NULL
             ORDER BY t.full_name_normalized`,
          )
          .all() as Array<{ id: string; full_name: string }>)
      : [];

  res.json({ classes, weeks, teachers });
});

/**
 * Henüz oluşturulmamış bir rapor için salt-okunur önizleme verisi. DB'ye
 * **hiçbir şey yazmaz** (spec.md §5.1: gelecek hafta önizlemesi) — başlık
 * `class_courses`+`weeks`ten, satırlar aktif enrollment'lardan türetilir.
 * `report.id` null gelir ("henüz yok" sinyali).
 */
function buildEntryPreview(classCourseId: string, week: WeekRecord): unknown {
  const cc = db
    .prepare(
      `SELECT cc.id, cc.class_id, cc.day_of_week, cc.lesson_time,
              c.name AS class_name, co.name AS course_name, t.full_name AS teacher_name
       FROM class_courses cc
       JOIN classes c ON c.id = cc.class_id
       JOIN courses co ON co.id = cc.course_id
       JOIN users t ON t.id = cc.teacher_id
       WHERE cc.id = ?`,
    )
    .get(classCourseId) as {
    id: string;
    class_id: string;
    day_of_week: number;
    lesson_time: string | null;
    class_name: string;
    course_name: string;
    teacher_name: string;
  };

  const allWeeks = db.prepare(`SELECT * FROM weeks`).all() as unknown as WeekRecord[];
  // Verilmiş ödev bağı: yılın ilk haftası / sınıfın ilk aktif haftası / önceki
  // rapor yoksa boş açılır (spec §5.1). POST ile birebir aynı kural.
  const firstActiveWeekId = firstActiveWeekIdForClass(cc.class_id);
  const isFirstActiveWeek = firstActiveWeekId !== null && firstActiveWeekId === week.id;
  let prevHomeworkId: string | null = null;
  if (!isFirstActiveWeek) {
    const previousWeek = getPreviousWeek(allWeeks, week);
    if (previousWeek) {
      const prev = db
        .prepare(`SELECT id FROM homeworks WHERE class_course_id = ? AND week_id = ?`)
        .get(cc.id, previousWeek.id) as { id: string } | undefined;
      prevHomeworkId = prev?.id ?? null;
    }
  }
  const prevDesc = prevHomeworkId
    ? ((
        db.prepare(`SELECT description FROM homeworks WHERE id = ?`).get(prevHomeworkId) as
          | { description: string }
          | undefined
      )?.description ?? null)
    : null;

  const dueDate = calculateDueDate(week, cc.day_of_week, allWeeks);

  const students = db
    .prepare(
      `SELECT s.id AS student_id, u.full_name AS student_name
       FROM enrollments e
       JOIN students s ON s.id = e.student_id AND s.deleted_at IS NULL
       JOIN users u ON u.id = s.user_id AND u.deleted_at IS NULL
       WHERE e.class_id = ?
         AND e.start_date <= ?
         AND (e.end_date IS NULL OR e.end_date >= ?)
       ORDER BY u.full_name_normalized`,
    )
    .all(cc.class_id, week.start_date, week.start_date) as Array<{
    student_id: string;
    student_name: string;
  }>;

  const prevSubmissions = loadPrevSubmissions(prevHomeworkId);
  const rangeInvalid = !isClassDayWithinWeek(week, cc.day_of_week);

  return {
    report: {
      id: null,
      class_course_id: cc.id,
      week_id: week.id,
      status: 'draft',
      completed_at: null,
      updated_at: new Date().toISOString(),
      topic_covered: null,
      prev_homework_text: prevDesc,
      homework: dueDate !== null ? { description: '', due_date: dueDate } : null,
      week: {
        week_no: week.week_no,
        start_date: week.start_date,
        end_date: week.end_date,
        label: week.label,
      },
      class_name: cc.class_name,
      course_name: cc.course_name,
      teacher_name: cc.teacher_name,
      day_of_week: cc.day_of_week,
      lesson_time: cc.lesson_time,
    },
    read_only: !hasWeekStarted(week) || rangeInvalid,
    // Yeni/oluşmamış önizleme her zaman `draft`'tır; sent kilidi söz konusu değil.
    locked_for_teacher: false,
    week_range_invalid: rangeInvalid,
    entries: students.map((s) => ({
      student_id: s.student_id,
      student_name: s.student_name,
      // Yeni rapor satırları 'absent' başlar (spec §5.1) — önizleme de aynı
      // varsayılanı gösterir; yazma olmadığı için kalıcı değildir.
      attendance: 'absent' as const,
      homework_score: null,
      interest_score: null,
      teacher_note: null,
      submission: prevSubmissions.get(s.student_id) ?? null,
    })),
  };
}

const entryQuerySchema = z.object({
  class_course_id: z.string().trim().min(1),
  week_id: z.string().trim().min(1),
});

/**
 * GET /teacher/reports/entry — rapor giriş ekranının yükleme ucu. Rapor
 * varsa onu, yoksa DB'ye **yazmadan** sentetik önizlemeyi döner; ikisi de
 * `read_only` bayrağı taşır (gelecek hafta → true, spec.md §5.1).
 *
 * DİKKAT: `/reports/:id`'den ÖNCE kayıtlıdır; aksi halde `:id` "entry"yi
 * yakalar (aynı desen `/reports/filters`).
 */
router.get('/reports/entry', (req, res) => {
  const user = req.user!;
  if (user.role !== 'teacher' && user.role !== 'admin') {
    throw new AppError('FORBIDDEN', 403, 'Bu ekrana erişim yetkiniz yok.');
  }
  const input = entryQuerySchema.parse(req.query);

  const cc = db
    .prepare(
      `SELECT cc.*, c.academic_year_id
       FROM class_courses cc
       JOIN classes c ON c.id = cc.class_id
       WHERE cc.id = ? AND cc.deleted_at IS NULL`,
    )
    .get(input.class_course_id) as
    | {
        id: string;
        class_id: string;
        teacher_id: string;
        day_of_week: number;
        academic_year_id: string;
      }
    | undefined;
  if (!cc) {
    throw new AppError('NOT_FOUND', 404, 'Atama bulunamadı.');
  }
  assertCanFill(user, cc);

  const week = db.prepare(`SELECT * FROM weeks WHERE id = ?`).get(input.week_id) as
    | WeekRecord
    | undefined;
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

  const existing = db
    .prepare(`SELECT id FROM reports WHERE class_course_id = ? AND week_id = ?`)
    .get(cc.id, week.id) as { id: string } | undefined;
  if (existing) {
    res.json(buildReportPayload(existing.id, user.role));
    return;
  }
  res.json(buildEntryPreview(cc.id, week));
});

/**
 * GET /teacher/reports/:id — tek rapor (salt-okunur içerik). Öğretmen yalnızca
 * kendi raporunu, admin tümünü alır (spec §2 "Haftalık raporu görme ✓ (tümü)").
 * Admin panelinin "Tüm raporlar" görünümü buradan beslenir; `buildReportPayload`
 * hiçbir düzenleme UI'ı gerektirmeyen salt-okunur veriyi döner.
 */
router.get('/reports/:id', (req, res) => {
  const user = req.user!;
  if (user.role !== 'teacher' && user.role !== 'admin') {
    throw new AppError('FORBIDDEN', 403, 'Bu rapora erişim yetkiniz yok.');
  }
  loadOwnedReport(user, req.params.id);
  res.json(buildReportPayload(req.params.id, user.role));
});

// ---------- Teslim kontrol (Aşama 4) ----------

/**
 * Öğretmenin bir ödeve sahipliğini doğrular: homework → class_course →
 * teacher_id = req.user.id (admin tümü). Yoksa 404, yetkisizse 403.
 */
function loadOwnedHomework(user: AuthUser, homeworkId: string): {
  id: string;
  class_course_id: string;
  course_name: string;
  class_name: string;
} {
  const row = db
    .prepare(
      `SELECT h.id, h.class_course_id, cc.teacher_id,
              co.name AS course_name, cl.name AS class_name
       FROM homeworks h
       JOIN class_courses cc ON cc.id = h.class_course_id
       JOIN courses co ON co.id = cc.course_id
       JOIN classes cl ON cl.id = cc.class_id
       WHERE h.id = ?`,
    )
    .get(homeworkId) as
    | {
        id: string;
        class_course_id: string;
        teacher_id: string;
        course_name: string;
        class_name: string;
      }
    | undefined;
  if (!row) {
    throw new AppError('NOT_FOUND', 404, 'Ödev bulunamadı.');
  }
  if (user.role !== 'admin' && (user.role !== 'teacher' || row.teacher_id !== user.id)) {
    throw new AppError('FORBIDDEN', 403, 'Bu ödevin teslimlerine erişim yetkiniz yok.');
  }
  return {
    id: row.id,
    class_course_id: row.class_course_id,
    course_name: row.course_name,
    class_name: row.class_name,
  };
}

/**
 * GET /teacher/submissions — `?homework_id=` verilirse o ödevin tüm teslimleri
 * (öğrenci adı, dosyalar, durum); verilmezse öğretmenin teslimi olan ödev
 * listesi (sayım ile) — "Ödev teslim kontrol ekranı" seçici (spec.md §6).
 */
router.get('/submissions', (req, res) => {
  const user = req.user!;
  if (user.role !== 'teacher' && user.role !== 'admin') {
    throw new AppError('FORBIDDEN', 403, 'Bu ekrana erişim yetkiniz yok.');
  }

  const homeworkId = typeof req.query.homework_id === 'string' ? req.query.homework_id : null;

  if (homeworkId) {
    loadOwnedHomework(user, homeworkId);
    const rows = db
      .prepare(
        `SELECT s.id, s.student_id, s.note, s.submitted_at, s.is_late, s.status,
                s.reviewed_by, s.reviewed_at, u.full_name AS student_name
         FROM submissions s
         JOIN students st ON st.id = s.student_id
         JOIN users u ON u.id = st.user_id
         WHERE s.homework_id = ?
         ORDER BY u.full_name_normalized`,
      )
      .all(homeworkId) as Array<{
      id: string;
      student_id: string;
      note: string | null;
      submitted_at: string;
      is_late: number;
      status: string;
      reviewed_by: string | null;
      reviewed_at: string | null;
      student_name: string;
    }>;

    const filesBySubmission = loadSubmissionFiles(rows.map((r) => r.id));
    res.json({
      items: rows.map((r) => ({
        id: r.id,
        student_id: r.student_id,
        student_name: r.student_name,
        note: r.note,
        submitted_at: r.submitted_at,
        is_late: r.is_late === 1,
        status: r.status,
        reviewed_at: r.reviewed_at,
        files: filesBySubmission.get(r.id) ?? [],
      })),
    });
    return;
  }

  // Seçici: öğretmenin teslimi olan ödevleri (en yeni hafta üstte).
  const rows =
    user.role === 'teacher'
      ? (db
          .prepare(
            `SELECT h.id, h.due_date, co.name AS course_name, cl.name AS class_name,
                    w.week_no, w.start_date AS week_start, w.label AS week_label,
                    (SELECT COUNT(*) FROM submissions s WHERE s.homework_id = h.id) AS submission_count
             FROM homeworks h
             JOIN class_courses cc ON cc.id = h.class_course_id
             JOIN courses co ON co.id = cc.course_id
             JOIN classes cl ON cl.id = cc.class_id
             JOIN weeks w ON w.id = h.week_id
             WHERE cc.teacher_id = ? AND cc.deleted_at IS NULL
               AND EXISTS (SELECT 1 FROM submissions s WHERE s.homework_id = h.id)
             ORDER BY w.start_date DESC, co.name`,
          )
          .all(user.id) as unknown as Array<{
          id: string;
          due_date: string;
          course_name: string;
          class_name: string;
          week_no: number;
          week_start: string;
          week_label: string;
          submission_count: number;
        }>)
      : (db
          .prepare(
            `SELECT h.id, h.due_date, co.name AS course_name, cl.name AS class_name,
                    w.week_no, w.start_date AS week_start, w.label AS week_label,
                    (SELECT COUNT(*) FROM submissions s WHERE s.homework_id = h.id) AS submission_count
             FROM homeworks h
             JOIN class_courses cc ON cc.id = h.class_course_id
             JOIN courses co ON co.id = cc.course_id
             JOIN classes cl ON cl.id = cc.class_id
             JOIN weeks w ON w.id = h.week_id
             WHERE cc.deleted_at IS NULL
               AND EXISTS (SELECT 1 FROM submissions s WHERE s.homework_id = h.id)
             ORDER BY w.start_date DESC, co.name`,
          )
          .all() as unknown as Array<{
          id: string;
          due_date: string;
          course_name: string;
          class_name: string;
          week_no: number;
          week_start: string;
          week_label: string;
          submission_count: number;
        }>);

  res.json({ items: rows });
});

const patchSubmissionSchema = z.object({
  status: z.literal('reviewed', { message: 'Yalnızca "reviewed" durumu işaretlenebilir.' }),
});

/**
 * PATCH /teacher/submissions/:id — teslimi "reviewed" işaretler (spec.md §6
 * "Ödev teslim kontrol ekranı"). Yetki zinciri handler ilk satırında:
 * submission → homework → class_course → teacher_id = req.user.id (admin tümü).
 */
router.patch('/submissions/:id', (req, res) => {
  const user = req.user!;
  const input = patchSubmissionSchema.parse(req.body);

  // Zincir yetki — submission → homework → class_course → teacher_id.
  const submission = db
    .prepare(
      `SELECT s.id, s.homework_id, cc.teacher_id
       FROM submissions s
       JOIN homeworks h ON h.id = s.homework_id
       JOIN class_courses cc ON cc.id = h.class_course_id
       WHERE s.id = ?`,
    )
    .get(req.params.id) as
    | { id: string; homework_id: string; teacher_id: string }
    | undefined;
  if (!submission) {
    throw new AppError('NOT_FOUND', 404, 'Teslim bulunamadı.');
  }
  if (
    user.role !== 'admin' &&
    (user.role !== 'teacher' || submission.teacher_id !== user.id)
  ) {
    throw new AppError('FORBIDDEN', 403, 'Bu teslimi işaretleme yetkiniz yok.');
  }

  const now = new Date().toISOString();
  db.prepare(
    `UPDATE submissions SET status = ?, reviewed_by = ?, reviewed_at = ? WHERE id = ?`,
  ).run(input.status, user.id, now, submission.id);

  res.json({
    id: submission.id,
    status: input.status,
    reviewed_by: user.id,
    reviewed_at: now,
  });
});

export default router;

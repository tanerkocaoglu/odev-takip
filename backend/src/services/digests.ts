/**
 * Haftalık digest iş mantığı — Aşama 5 (spec.md §5.4).
 *
 * - `ensurePendingDigests` — ilk rapor `completed` olduğunda, o sınıf+haftanın
 *   velisi olan aktif öğrencileri için `pending` digest satırı açar
 *   (`INSERT OR IGNORE` — öğrenci-hafta başına tek satır).
 * - `maybeReadyDigests` — o sınıfın o haftadaki tüm ders raporları
 *   completed/sent olunca aynı kayıtları `ready` yapar (sınıf bazlı kontrol).
 * - `buildSnapshot` — gönderim/önizleme için velinin göreceği içeriği kurar.
 *   KVKK (§9): snapshot yalnızca **o öğrencinin** satırlarını içerir; başka
 *   öğrencinin puanı/notu asla snapshot'a girmez.
 * - `maybeCascadeSent` — o sınıf+haftanın tüm digest'leri `sent` olunca
 *   `completed` raporları `sent` yapar. Gönderim transaction'ının **içinden**
 *   çağrılır (ayrı istek değil) — §2 "sent → öğretmen düzenleyemez (403)"
 *   kuralını fiilen tetikleyen kaskad budur.
 */

import { randomBytes, randomUUID } from 'node:crypto';
import { db } from '../db/index.js';
import { AppError } from '../errors.js';
import { localTodayISO } from '../utils/time.js';
import type { WeekRecord } from '../utils/weeks.js';
import { writeAuditLog } from './audit.js';

/** Digest token'ı UUID DEĞİLDİR — kimlik doğrulamasız sayfayı açtığı için fiilen paroladır (CLAUDE.md). */
export function newDigestToken(): string {
  return randomBytes(32).toString('base64url');
}

/** Aktif eğitim yılının "şu anki" haftası; yıl henüz başlamadıysa en erken hafta. */
export function currentDigestWeek(): WeekRecord | undefined {
  const today = localTodayISO();
  return (
    (db
      .prepare(
        `SELECT w.* FROM weeks w
         JOIN academic_years a ON a.id = w.academic_year_id AND a.is_active = 1
         WHERE w.start_date <= ?
         ORDER BY w.start_date DESC LIMIT 1`,
      )
      .get(today) as WeekRecord | undefined) ??
    (db
      .prepare(
        `SELECT w.* FROM weeks w
         JOIN academic_years a ON a.id = w.academic_year_id AND a.is_active = 1
         ORDER BY w.start_date ASC LIMIT 1`,
      )
      .get() as WeekRecord | undefined)
  );
}

/** Digest satırı — veli/öğrenci/guardian bilgileriyle birlikte. */
export interface DigestRecord {
  id: string;
  student_id: string;
  week_id: string;
  guardian_id: string;
  status: string;
  send_count: number;
  is_revoked: number;
  guardian_phone: string | null;
  consent_at: string | null;
  guardian_name: string;
  student_name: string;
}

/** Digest satırını veli/öğrenci/guardian bilgileriyle yükler (yoksa 404). */
export function loadDigest(digestId: string): DigestRecord {
  const row = db
    .prepare(
      `SELECT d.id, d.student_id, d.week_id, d.guardian_id, d.status, d.send_count, d.is_revoked,
              g.whatsapp_phone AS guardian_phone, g.consent_at,
              u_g.full_name AS guardian_name, u_s.full_name AS student_name
       FROM weekly_digests d
       JOIN guardians g ON g.id = d.guardian_id
       JOIN users u_g ON u_g.id = g.user_id
       JOIN students s ON s.id = d.student_id
       JOIN users u_s ON u_s.id = s.user_id
       WHERE d.id = ?`,
    )
    .get(digestId) as DigestRecord | undefined;
  if (!row) {
    throw new AppError('NOT_FOUND', 404, 'Gönderim kaydı bulunamadı.');
  }
  return row;
}

/** Öğrencinin hafta başlangıcı itibarıyla aktif olduğu sınıf; yoksa null. */
export function classIdForStudentAtWeek(studentId: string, week: WeekRecord): string | null {
  const row = db
    .prepare(
      `SELECT e.class_id FROM enrollments e
       WHERE e.student_id = ? AND e.start_date <= ?
         AND (e.end_date IS NULL OR e.end_date >= ?)
       ORDER BY e.start_date DESC LIMIT 1`,
    )
    .get(studentId, week.start_date, week.start_date) as { class_id: string } | undefined;
  return row?.class_id ?? null;
}

/**
 * Bir sınıfın "ilk aktif haftası" (gösterim etiketi — spec §6 Veli):
 * o sınıfa ait EN ERKEN `enrollments.start_date`'in düştüğü haftanın
 * `week_no`'su. Rapor durumuna dayanmaz — rapor doldurulmamış bir hafta,
 * hafta etiketini kaydırmaz. Bulunamazsa (ör. kayıtsız hafta) null döner;
 * çağıran, relative etikette mutlak week_no'ya düşer.
 */
export function firstActiveWeekNoForClass(classId: string): number | null {
  const minStart = db
    .prepare(`SELECT MIN(e.start_date) AS start FROM enrollments e WHERE e.class_id = ?`)
    .get(classId) as { start: string | null } | undefined;
  if (!minStart?.start) return null;

  const week = db
    .prepare(
      `SELECT w.week_no FROM weeks w
       WHERE w.start_date <= ? AND w.end_date >= ?
       ORDER BY w.start_date ASC LIMIT 1`,
    )
    .get(minStart.start, minStart.start) as { week_no: number } | undefined;
  return week?.week_no ?? null;
}

/** Sınıfın silinmemiş atamaları — "o haftadaki tüm dersler" kümesi. */
function classCourseIds(classId: string): string[] {
  return (
    db
      .prepare(`SELECT id FROM class_courses WHERE class_id = ? AND deleted_at IS NULL`)
      .all(classId) as Array<{ id: string }>
  ).map((r) => r.id);
}

/** O hafta başında sınıfta aktif ve velisi olan öğrenci kayıtları. */
function activeStudentsWithGuardian(
  classId: string,
  weekStart: string,
): Array<{ student_id: string; guardian_id: string }> {
  return db
    .prepare(
      `SELECT e.student_id, s.guardian_id
       FROM enrollments e
       JOIN students s ON s.id = e.student_id AND s.deleted_at IS NULL
       JOIN users u ON u.id = s.user_id AND u.deleted_at IS NULL
       WHERE e.class_id = ? AND e.start_date <= ?
         AND (e.end_date IS NULL OR e.end_date >= ?)
         AND s.guardian_id IS NOT NULL`,
    )
    .all(classId, weekStart, weekStart) as Array<{ student_id: string; guardian_id: string }>;
}

/**
 * İlk rapor tamamlandığında `pending` digest'leri açar (spec §5.4).
 * Velisi olmayan öğrenciye digest açılmaz (guardian_id NOT NULL — kural).
 */
export function ensurePendingDigests(classId: string, weekId: string): void {
  const week = db.prepare(`SELECT * FROM weeks WHERE id = ?`).get(weekId) as
    | WeekRecord
    | undefined;
  if (!week) return;
  const students = activeStudentsWithGuardian(classId, week.start_date);
  if (students.length === 0) return;

  const insert = db.prepare(
    `INSERT OR IGNORE INTO weekly_digests
       (id, student_id, week_id, guardian_id, token, status, send_count,
        sent_at, sent_by, snapshot, is_revoked)
     VALUES (?, ?, ?, ?, ?, 'pending', 0, NULL, NULL, NULL, 0)`,
  );
  for (const s of students) {
    insert.run(randomUUID(), s.student_id, weekId, s.guardian_id, newDigestToken());
  }
}

/**
 * Her rapor tamamlandığında çağrılır: o sınıfın o haftadaki tüm ders
 * raporları completed/sent olduysa aynı `pending` digest'ler `ready` yapılır
 * (spec §5.4 — sınıf bazlı kontrol; başka sınıfın digest'lerine dokunulmaz).
 */
export function maybeReadyDigests(classId: string, weekId: string): void {
  const courseIds = classCourseIds(classId);
  if (courseIds.length === 0) return;

  const placeholders = courseIds.map(() => '?').join(',');
  const done = db
    .prepare(
      `SELECT COUNT(*) AS n FROM reports
       WHERE week_id = ? AND class_course_id IN (${placeholders})
         AND status IN ('completed','sent')`,
    )
    .get(weekId, ...courseIds) as { n: number };
  if (done.n < courseIds.length) return;

  const week = db.prepare(`SELECT * FROM weeks WHERE id = ?`).get(weekId) as
    | WeekRecord
    | undefined;
  if (!week) return;
  const studentIds = activeStudentsWithGuardian(classId, week.start_date).map(
    (s) => s.student_id,
  );
  if (studentIds.length === 0) return;

  const sp = studentIds.map(() => '?').join(',');
  db.prepare(
    `UPDATE weekly_digests SET status = 'ready'
     WHERE week_id = ? AND status = 'pending' AND student_id IN (${sp})`,
  ).run(weekId, ...studentIds);
}

export interface DigestSnapshotEntry {
  student_id: string;
  student_name: string;
  attendance: string;
  homework_score: number | null;
  interest_score: number | null;
  teacher_note: string | null;
}

export interface DigestSnapshotCourse {
  class_course_id: string;
  course_name: string;
  teacher_name: string;
  day_of_week: number;
  lesson_time: string | null;
  status: 'completed' | 'sent' | 'missing';
  topic_covered: string | null;
  prev_homework_text: string | null;
  homework: { description: string; due_date: string } | null;
  entry: DigestSnapshotEntry | null;
}

export interface DigestSnapshot {
  week: { id: string; week_no: number; start_date: string; end_date: string; label: string };
  class: { id: string; name: string };
  student: { id: string; name: string };
  guardian_name: string | null;
  courses: DigestSnapshotCourse[];
}

/**
 * Velinin göreceği haftalık içerik (spec §5.4 adım 6). Yalnızca dolu dersler
 * içerik taşır; eksik ders `status: 'missing'` ile "Bu hafta rapor girilmedi"
 * olarak görünür. Kişisel veri minimizasyonu: yalnızca `studentId`'nin satırı.
 */
export function buildSnapshot(
  studentId: string,
  weekId: string,
  classId: string,
): DigestSnapshot {
  const week = db.prepare(`SELECT * FROM weeks WHERE id = ?`).get(weekId) as unknown as WeekRecord;
  const cls = db
    .prepare(`SELECT id, name FROM classes WHERE id = ?`)
    .get(classId) as { id: string; name: string };
  const student = db
    .prepare(
      `SELECT s.id, u.full_name AS name FROM students s
       JOIN users u ON u.id = s.user_id WHERE s.id = ?`,
    )
    .get(studentId) as { id: string; name: string };
  const guardian = db
    .prepare(
      `SELECT u.full_name FROM students s
       JOIN guardians g ON g.id = s.guardian_id
       JOIN users u ON u.id = g.user_id
       WHERE s.id = ?`,
    )
    .get(studentId) as { full_name: string } | undefined;

  const rows = db
    .prepare(
      `SELECT cc.id AS class_course_id, cc.day_of_week, cc.lesson_time,
              co.name AS course_name, t.full_name AS teacher_name,
              r.id AS report_id, r.status, r.topic_covered,
              r.prev_homework_id, r.prev_homework_text,
              hw.description AS homework_description, hw.due_date
       FROM class_courses cc
       JOIN courses co ON co.id = cc.course_id AND co.deleted_at IS NULL
       JOIN users t ON t.id = cc.teacher_id
       LEFT JOIN reports r ON r.class_course_id = cc.id AND r.week_id = ?
       LEFT JOIN homeworks hw ON hw.report_id = r.id
       WHERE cc.class_id = ? AND cc.deleted_at IS NULL
       ORDER BY cc.day_of_week, cc.lesson_time`,
    )
    .all(weekId, classId) as Array<{
    class_course_id: string;
    day_of_week: number;
    lesson_time: string | null;
    course_name: string;
    teacher_name: string;
    report_id: string | null;
    status: string | null;
    topic_covered: string | null;
    prev_homework_id: string | null;
    prev_homework_text: string | null;
    homework_description: string | null;
    due_date: string | null;
  }>;

  const courses: DigestSnapshotCourse[] = rows.map((row) => {
    const isFilled = row.report_id !== null && (row.status === 'completed' || row.status === 'sent');

    let prevHomeworkText: string | null = null;
    if (isFilled) {
      if (row.prev_homework_id) {
        const prev = db
          .prepare(`SELECT description FROM homeworks WHERE id = ?`)
          .get(row.prev_homework_id) as { description: string } | undefined;
        prevHomeworkText = row.prev_homework_text ?? prev?.description ?? null;
      } else {
        prevHomeworkText = row.prev_homework_text ?? null;
      }
    }

    let entry: DigestSnapshotEntry | null = null;
    if (isFilled && row.report_id) {
      entry = (db
        .prepare(
          `SELECT re.student_id, u.full_name AS student_name, re.attendance,
                  re.homework_score, re.interest_score, re.teacher_note
           FROM report_entries re
           JOIN students s ON s.id = re.student_id
           JOIN users u ON u.id = s.user_id
           WHERE re.report_id = ? AND re.student_id = ?`,
        )
        .get(row.report_id, studentId) as DigestSnapshotEntry | undefined) ?? null;
    }

    return {
      class_course_id: row.class_course_id,
      course_name: row.course_name,
      teacher_name: row.teacher_name,
      day_of_week: row.day_of_week,
      lesson_time: row.lesson_time,
      status: isFilled ? (row.status as 'completed' | 'sent') : 'missing',
      topic_covered: isFilled ? row.topic_covered : null,
      prev_homework_text: prevHomeworkText,
      homework:
        isFilled && row.homework_description !== null && row.due_date !== null
          ? { description: row.homework_description, due_date: row.due_date }
          : null,
      entry,
    };
  });

  return {
    week: {
      id: week.id,
      week_no: week.week_no,
      start_date: week.start_date,
      end_date: week.end_date,
      label: week.label,
    },
    class: { id: cls.id, name: cls.name },
    student: { id: student.id, name: student.name },
    guardian_name: guardian?.full_name ?? null,
    courses,
  };
}

/**
 * Gönderim kaskadı (spec §5.4 — zorunlu): o sınıf+haftanın tüm digest'leri
 * `sent` olduysa `completed` raporlar `sent` yapılır. Yalnızca `completed`
 * olanlar kaskadlanır; `draft` raporlar dokunulmadan kalır. **Transaction
 * içinden** çağrılır — ayrı istek değildir.
 */
export function maybeCascadeSent(classId: string, weekId: string): void {
  const week = db.prepare(`SELECT * FROM weeks WHERE id = ?`).get(weekId) as
    | WeekRecord
    | undefined;
  if (!week) return;

  const studentIds = activeStudentsWithGuardian(classId, week.start_date).map(
    (s) => s.student_id,
  );
  if (studentIds.length === 0) return;

  const sp = studentIds.map(() => '?').join(',');
  const remaining = db
    .prepare(
      `SELECT COUNT(*) AS n FROM weekly_digests
       WHERE week_id = ? AND status != 'sent' AND student_id IN (${sp})`,
    )
    .get(weekId, ...studentIds) as { n: number };
  if (remaining.n > 0) return;

  const courseIds = classCourseIds(classId);
  if (courseIds.length === 0) return;

  const cp = courseIds.map(() => '?').join(',');
  db.prepare(
    `UPDATE reports SET status = 'sent'
     WHERE week_id = ? AND status = 'completed' AND class_course_id IN (${cp})`,
  ).run(weekId, ...courseIds);
}

/**
 * Bilinen link-önizleme botu User-Agent imzaları. WhatsApp mesajı gönderilir
 * gönderilmez tarayıcı/uygulama linki otomatik önizleyebilir; bu, gerçek bir
 * veli görüntülemesi DEĞİLDİR ve yanlış "görüntülendi" kaydı üretir. Bu
 * imzalar varsa görüntüleme yazması atlanır (sayfa yine 200 döner — yalnızca
 * zaman damgası güncellenmez). spec.md §5.4 "Bot önizleme atlaması".
 */
const LINK_PREVIEW_BOT_RE = /whatsapp|facebookexternalhit|telegrambot|slackbot|linkedinbot|twitterbot|discordbot|skypeuripreview|snapchat|viber|microedgebot|embed/i;

export function isLinkPreviewBot(userAgent: string | undefined): boolean {
  return typeof userAgent === 'string' && LINK_PREVIEW_BOT_RE.test(userAgent);
}

/**
 * Digest'i görüntüleme takibiyle işaretler (migration #6). İlk görüntüleme
 * `first_viewed_at`'i doldurur; her görüntüleme `last_viewed_at`'i günceller.
 * Ayrı log tablosu YOKTUR — veri minimizasyonu ilkesine uygun iki zaman damgası.
 * Çağıran rota, `isLinkPreviewBot` ise bu fonksiyonu ÇAĞIRMAZ (spec §5.4).
 */
export function markDigestViewed(digestId: string): void {
  const now = new Date().toISOString();
  db.prepare(
    `UPDATE weekly_digests
     SET first_viewed_at = COALESCE(first_viewed_at, ?), last_viewed_at = ?
     WHERE id = ?`,
  ).run(now, now, digestId);
}

// ===========================================================================
// Admin haftalık gönderim ekranı (spec.md §5.4) — liste / önizleme / gönder /
// iptal. İş mantığı burada; route yalnızca parse + yanıt.
// ===========================================================================

export interface DigestListItem {
  id: string;
  student_id: string;
  student_name: string;
  guardian_name: string;
  week: { id: string; week_no: number; start_date: string; label: string };
  class: { id: string | null; name: string | null };
  status: string;
  send_count: number;
  sent_at: string | null;
  is_revoked: boolean;
  first_viewed_at: string | null;
  last_viewed_at: string | null;
  missing_course_count: number;
  total_courses: number;
}

/**
 * GET /admin/digests — pending + ready + sent satırlar (spec §5.4).
 * Sınıf/ha/tarih filtresi; satır başına eksik ders sayısı. `token` dışarı sızmaz.
 */
export function listDigests(params: {
  weekId: string | null;
  status: string | null;
  classId: string | null;
}): { week_id: string | null; items: DigestListItem[] } {
  const { weekId, status, classId } = params;
  const where: string[] = [];
  const values: string[] = [];
  if (weekId) {
    where.push('d.week_id = ?');
    values.push(weekId);
  }
  if (status) {
    where.push('d.status = ?');
    values.push(status);
  }
  if (classId) {
    where.push('c.id = ?');
    values.push(classId);
  }

  const rows = db
    .prepare(
      `SELECT d.id, d.student_id, d.week_id, d.status, d.send_count, d.sent_at, d.is_revoked,
              d.first_viewed_at, d.last_viewed_at,
              u_s.full_name AS student_name, u_g.full_name AS guardian_name,
              w.week_no, w.start_date AS week_start, w.label AS week_label,
              c.id AS class_id, c.name AS class_name,
              (SELECT COUNT(*) FROM class_courses cc
                WHERE cc.class_id = c.id AND cc.deleted_at IS NULL) AS total_courses,
              (SELECT COUNT(*) FROM reports r
                WHERE r.week_id = d.week_id AND r.status IN ('completed','sent')
                  AND r.class_course_id IN (
                    SELECT cc.id FROM class_courses cc
                    WHERE cc.class_id = c.id AND cc.deleted_at IS NULL)) AS done_courses
       FROM weekly_digests d
       JOIN students s ON s.id = d.student_id AND s.deleted_at IS NULL
       JOIN users u_s ON u_s.id = s.user_id
       JOIN guardians g ON g.id = d.guardian_id
       JOIN users u_g ON u_g.id = g.user_id
       JOIN weeks w ON w.id = d.week_id
       LEFT JOIN classes c ON c.id = (
         SELECT e.class_id FROM enrollments e
         WHERE e.student_id = d.student_id
           AND e.start_date <= w.start_date
           AND (e.end_date IS NULL OR e.end_date >= w.start_date)
         ORDER BY e.start_date DESC LIMIT 1
       )
       ${where.length > 0 ? 'WHERE ' + where.join(' AND ') : ''}
       ORDER BY w.start_date DESC, c.name, u_s.full_name_normalized`,
    )
    .all(...values) as Array<{
    id: string;
    student_id: string;
    status: string;
    send_count: number;
    sent_at: string | null;
    is_revoked: number;
    first_viewed_at: string | null;
    last_viewed_at: string | null;
    student_name: string;
    guardian_name: string;
    week_id: string;
    week_no: number;
    week_start: string;
    week_label: string;
    class_id: string | null;
    class_name: string | null;
    total_courses: number;
    done_courses: number;
  }>;

  return {
    week_id: weekId,
    items: rows.map((r) => ({
      id: r.id,
      student_id: r.student_id,
      student_name: r.student_name,
      guardian_name: r.guardian_name,
      week: {
        id: r.week_id,
        week_no: r.week_no,
        start_date: r.week_start,
        label: r.week_label,
      },
      class: { id: r.class_id, name: r.class_name },
      status: r.status,
      send_count: r.send_count,
      sent_at: r.sent_at,
      is_revoked: r.is_revoked === 1,
      first_viewed_at: r.first_viewed_at,
      last_viewed_at: r.last_viewed_at,
      missing_course_count: Math.max(r.total_courses - r.done_courses, 0),
      total_courses: r.total_courses,
    })),
  };
}

/** GET /admin/digests/:id/preview — göndermeden önce velinin göreceği içerik. */
export function previewDigest(digestId: string): DigestSnapshot {
  const digest = loadDigest(digestId);
  const week = db.prepare(`SELECT * FROM weeks WHERE id = ?`).get(digest.week_id) as
    | WeekRecord
    | undefined;
  if (!week) {
    throw new AppError('NOT_FOUND', 404, 'Hafta bulunamadı.');
  }
  const classId = classIdForStudentAtWeek(digest.student_id, week);
  if (!classId) {
    throw new AppError('CONFLICT', 409, 'Bu öğrencinin haftada aktif sınıfı yok.');
  }
  return buildSnapshot(digest.student_id, digest.week_id, classId);
}

export interface SendDigestResult {
  id: string;
  status: 'sent';
  send_count: number;
  sent_at: string;
  token: string;
  snapshot: DigestSnapshot;
  message: string;
  wa_me_url: string;
}

/**
 * POST /admin/digests/:id/send — gönderim (spec §5.4 adım 3-4).
 *
 * KVKK ön kontrolleri (iki ayrı 409) → yeni token/snapshot/status='sent'/
 * send_count+1/sent_at/sent_by/is_revoked=0 tek transaction'da → aynı tx
 * içinde `maybeCascadeSent` → audit (`digest.send`/`digest.resend`) →
 * wa.me linki + mesaj üretimi.
 */
export function sendDigest(digestId: string, actorId: string): SendDigestResult {
  const digest = loadDigest(digestId);

  // KVKK — iki ayrı kontrol, iki ayrı mesaj (spec §9, Aşama 5 kararı).
  if (!digest.guardian_phone || digest.guardian_phone.trim() === '') {
    throw new AppError('CONFLICT', 409, 'Veli için WhatsApp numarası tanımlı değil.');
  }
  if (!digest.consent_at) {
    throw new AppError('CONFLICT', 409, 'Velinin KVKK açık rızası alınmamış.');
  }

  const week = db.prepare(`SELECT * FROM weeks WHERE id = ?`).get(digest.week_id) as
    | WeekRecord
    | undefined;
  if (!week) {
    throw new AppError('NOT_FOUND', 404, 'Hafta bulunamadı.');
  }
  const classId = classIdForStudentAtWeek(digest.student_id, week);
  if (!classId) {
    throw new AppError('CONFLICT', 409, 'Bu öğrencinin haftada aktif sınıfı yok.');
  }

  const snapshot = buildSnapshot(digest.student_id, digest.week_id, classId);
  const token = newDigestToken();
  const now = new Date().toISOString();
  const wasSentBefore = digest.send_count > 0;

  db.exec('BEGIN');
  try {
    db.prepare(
      `UPDATE weekly_digests
       SET token = ?, status = 'sent', send_count = send_count + 1,
           sent_at = ?, sent_by = ?, snapshot = ?, is_revoked = 0
       WHERE id = ?`,
    ).run(token, now, actorId, JSON.stringify(snapshot), digest.id);

    // Zorunlu kaskad: tüm digest'ler sent → completed raporlar sent (aynı tx).
    maybeCascadeSent(classId, digest.week_id);
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }

  writeAuditLog({
    actorId,
    action: wasSentBefore ? 'digest.resend' : 'digest.send',
    entityType: 'digest',
    entityId: digest.id,
    diff: snapshot,
  });

  const baseUrl = process.env.BASE_URL ?? 'http://localhost:5173';
  const message =
    `Sayın ${digest.guardian_name}, ${digest.student_name} için ` +
    `${week.label} haftalık ödev takip raporu hazır:\n${baseUrl}/r/${token}`;
  // wa.me, ülke koduyla birlikte rakam bekler (`+` yok).
  const waPhone = digest.guardian_phone.replace(/\D/g, '');
  const waUrl = `https://wa.me/${waPhone}?text=${encodeURIComponent(message)}`;

  return {
    id: digest.id,
    status: 'sent',
    send_count: digest.send_count + 1,
    sent_at: now,
    token,
    snapshot,
    message,
    wa_me_url: waUrl,
  };
}

/**
 * POST /admin/digests/:id/revoke — token iptali (spec §5.4).
 * Yalnızca gönderilmiş digest iptal edilebilir.
 */
export function revokeDigest(digestId: string, actorId: string): { id: string; is_revoked: true } {
  const digest = loadDigest(digestId);
  if (digest.status !== 'sent') {
    throw new AppError('CONFLICT', 409, 'Yalnızca gönderilmiş raporlar iptal edilebilir.');
  }

  db.prepare(`UPDATE weekly_digests SET is_revoked = 1 WHERE id = ?`).run(digest.id);

  writeAuditLog({
    actorId,
    action: 'digest.revoke',
    entityType: 'digest',
    entityId: digest.id,
  });

  return { id: digest.id, is_revoked: true };
}

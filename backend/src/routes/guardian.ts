/**
 * Veli paneli rotaları — `/api/v1/guardian/*` (spec.md §6 Veli).
 *
 * Kural (spec §2): veli, raporu ancak `status = 'sent'` olduktan sonra görür.
 * Taslak veya tamamlanmış ama gönderilmemiş rapor veliye asla görünmez. Veli
 * yalnızca kendi öğrencisinin (guardian_id eşleşmesi) verilerini alır.
 *
 * - `GET /students` — velinin çocukları (öğrenci seçimi; birden çok çocuk).
 * - `GET /reports?student_id=` — öğrencinin sistemdeki tüm gönderilmiş
 *   raporları; sınıf değişmiş olsa bile geçmiş listede kalır (snapshot'tan
 *   sınıf adı gelir). En yeni üstte.
 * - `GET /reports/:id` — rapor detayı (snapshot) + o haftanın ödev teslim
 *   geçmişi. `token` dışarı dönmez.
 */

import { Router } from 'express';
import { db } from '../db/index.js';
import { AppError } from '../errors.js';
import { requireAuth } from '../middleware/auth.js';
import { classIdForStudentAtWeek } from '../services/digests.js';
import type { WeekRecord } from '../utils/weeks.js';
import type { AuthUser } from '../types.js';

const router = Router();

router.use(requireAuth);

/** İlk satırda yetki: yalnızca veli. */
function assertGuardian(user: AuthUser): void {
  if (user.role !== 'guardian') {
    throw new AppError('FORBIDDEN', 403, 'Bu ekrana erişim yetkiniz yok.');
  }
}

/** Öğrencinin bu veliye ait olduğunu doğrular (yoksa 404 — varlık sızdırmaz). */
function loadOwnChild(user: AuthUser, studentId: string): string {
  assertGuardian(user);
  const row = db
    .prepare(
      `SELECT s.id FROM students s
       JOIN users u ON u.id = s.user_id
       WHERE s.id = ? AND s.guardian_id = ? AND s.deleted_at IS NULL AND u.deleted_at IS NULL`,
    )
    .get(studentId, user.guardian_id) as { id: string } | undefined;
  if (!row) {
    throw new AppError('NOT_FOUND', 404, 'Öğrenci bulunamadı.');
  }
  return row.id;
}

/** GET /guardian/students — velinin çocukları + aktif sınıfı. */
router.get('/students', (req, res) => {
  const user = req.user!;
  assertGuardian(user);

  const rows = db
    .prepare(
      `SELECT s.id AS student_id, u.full_name AS student_name, u.username,
              c.name AS class_name
       FROM students s
       JOIN users u ON u.id = s.user_id AND u.deleted_at IS NULL
       LEFT JOIN enrollments e ON e.student_id = s.id AND e.end_date IS NULL
       LEFT JOIN classes c ON c.id = e.class_id
       WHERE s.guardian_id = ? AND s.deleted_at IS NULL
       ORDER BY u.full_name_normalized`,
    )
    .all(user.guardian_id);

  res.json({ items: rows });
});

/** GET /guardian/reports?student_id= — gönderilmiş raporların listesi. */
router.get('/reports', (req, res) => {
  const user = req.user!;
  const studentId =
    typeof req.query.student_id === 'string' ? req.query.student_id : null;
  if (!studentId) {
    throw new AppError('VALIDATION_ERROR', 400, 'Öğrenci seçilmedi.');
  }
  loadOwnChild(user, studentId);

  const rows = db
    .prepare(
      `SELECT d.id, d.week_id, d.sent_at, d.send_count, d.snapshot,
              w.week_no, w.start_date AS week_start, w.end_date AS week_end,
              w.label AS week_label
       FROM weekly_digests d
       JOIN weeks w ON w.id = d.week_id
       WHERE d.student_id = ? AND d.status = 'sent'
       ORDER BY w.start_date DESC`,
    )
    .all(studentId) as Array<{
    id: string;
    week_id: string;
    sent_at: string;
    send_count: number;
    snapshot: string;
    week_no: number;
    week_start: string;
    week_end: string;
    week_label: string;
  }>;

  res.json({
    items: rows.map((r) => {
      let snapshot: { class?: { name?: string }; courses?: unknown[] } | null = null;
      try {
        snapshot = JSON.parse(r.snapshot);
      } catch {
        // bozuk snapshot → null kalır
      }
      return {
        id: r.id,
        week: {
          id: r.week_id,
          week_no: r.week_no,
          start_date: r.week_start,
          end_date: r.week_end,
          label: r.week_label,
        },
        class_name: snapshot?.class?.name ?? null,
        sent_at: r.sent_at,
        send_count: r.send_count,
        course_count: Array.isArray(snapshot?.courses) ? snapshot.courses.length : 0,
      };
    }),
  });
});

/** GET /guardian/reports/:id — detay (snapshot) + ödev teslim geçmişi. */
router.get('/reports/:id', (req, res) => {
  const user = req.user!;
  assertGuardian(user);

  const digest = db
    .prepare(
      `SELECT d.*, w.week_no, w.start_date AS week_start, w.end_date AS week_end,
              w.label AS week_label
       FROM weekly_digests d
       JOIN weeks w ON w.id = d.week_id
       WHERE d.id = ?`,
    )
    .get(req.params.id) as {
    id: string;
    student_id: string;
    week_id: string;
    status: string;
    sent_at: string | null;
    send_count: number;
    snapshot: string | null;
    week_no: number;
    week_start: string;
    week_end: string;
    week_label: string;
  } | undefined;
  if (!digest || digest.status !== 'sent' || digest.snapshot === null) {
    throw new AppError('NOT_FOUND', 404, 'Rapor bulunamadı.');
  }
  loadOwnChild(user, digest.student_id);

  const snapshot = JSON.parse(digest.snapshot);
  const week = db.prepare(`SELECT * FROM weeks WHERE id = ?`).get(digest.week_id) as
    | WeekRecord
    | undefined;

  // Ödev teslim geçmişi: o hafta, öğrencinin sınıfındaki ödevler + teslimleri.
  let submissions: Array<{
    course_name: string;
    description: string;
    due_date: string;
    submission: unknown;
  }> = [];
  if (week) {
    const classId = classIdForStudentAtWeek(digest.student_id, week);
    if (classId) {
      const homeworks = db
        .prepare(
          `SELECT h.id, h.description, h.due_date, co.name AS course_name
           FROM homeworks h
           JOIN class_courses cc ON cc.id = h.class_course_id AND cc.deleted_at IS NULL
           JOIN courses co ON co.id = cc.course_id AND co.deleted_at IS NULL
           WHERE h.week_id = ? AND cc.class_id = ?
           ORDER BY cc.day_of_week, cc.lesson_time`,
        )
        .all(digest.week_id, classId) as Array<{
        id: string;
        description: string;
        due_date: string;
        course_name: string;
      }>;

      const subRows = db
        .prepare(
          `SELECT s.id, s.homework_id, s.note, s.submitted_at, s.is_late, s.status,
                  s.reviewed_at
           FROM submissions s WHERE s.student_id = ?`,
        )
        .all(digest.student_id) as Array<{
        id: string;
        homework_id: string;
        note: string | null;
        submitted_at: string;
        is_late: number;
        status: string;
        reviewed_at: string | null;
      }>;
      const files = db
        .prepare(
          `SELECT sf.submission_id, sf.key, sf.filename, sf.size, sf.mime
           FROM submission_files sf
           JOIN submissions s ON s.id = sf.submission_id
           WHERE s.student_id = ?`,
        )
        .all(digest.student_id) as Array<{
        submission_id: string;
        key: string;
        filename: string;
        size: number;
        mime: string;
      }>;
      const filesBySub = new Map<string, unknown[]>();
      for (const f of files) {
        const list = filesBySub.get(f.submission_id) ?? [];
        list.push({ key: f.key, filename: f.filename, size: f.size, mime: f.mime });
        filesBySub.set(f.submission_id, list);
      }

      submissions = homeworks.map((h) => {
        const sub = subRows.find((s) => s.homework_id === h.id);
        return {
          course_name: h.course_name,
          description: h.description,
          due_date: h.due_date,
          submission: sub
            ? {
                id: sub.id,
                note: sub.note,
                submitted_at: sub.submitted_at,
                is_late: sub.is_late === 1,
                status: sub.status,
                reviewed_at: sub.reviewed_at,
                files: filesBySub.get(sub.id) ?? [],
              }
            : null,
        };
      });
    }
  }

  res.json({
    digest: {
      id: digest.id,
      week: {
        week_no: digest.week_no,
        start_date: digest.week_start,
        end_date: digest.week_end,
        label: digest.week_label,
      },
      sent_at: digest.sent_at,
      send_count: digest.send_count,
    },
    snapshot,
    submissions,
  });
});

export default router;

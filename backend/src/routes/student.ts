/**
 * Öğrenci rotaları — `/api/v1/student/*` (spec.md §5.3, §6 Öğrenci).
 *
 * Aşama 4:
 * - `GET /student/homeworks` — "Ödevlerim": yalnızca `completed`/`sent`
 *   raporların ödevleri görünür (karar noktası 1); puan/not/rapor asla
 *   dönmez. Teslim durumu: yüklendi / geç yüklendi / yüklenmedi.
 * - `POST /student/homeworks/:id/submit` — çoklu dosya (10 MB × 10),
 *   görsel küçültme, `is_late` (Europe/Istanbul yerel günü > due_date).
 *
 * Yetki (CLAUDE.md): her handler ilk satırında kontrol eder — yalnızca
 * `student` rolü; sorgular `req.user.student_id` ile filtrelidir.
 */

import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import { z } from 'zod';
import { db } from '../db/index.js';
import { AppError } from '../errors.js';
import { requireAuth } from '../middleware/auth.js';
import { upload, MAX_FILES } from '../middleware/upload.js';
import { saveUpload, localPathFor, type StoredFile } from '../services/storage.js';
import { isLateSubmission } from '../utils/time.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import type { AuthUser } from '../types.js';

const router = Router();

router.use(requireAuth);

function assertStudent(user: AuthUser): string {
  if (user.role !== 'student' || !user.student_id) {
    throw new AppError('FORBIDDEN', 403, 'Bu işlemi yapma yetkiniz yok.');
  }
  return user.student_id;
}

/** Diskten dosya kaldırır — en iyi çaba; yoksa yutulur. */
async function removeFilesFromDisk(files: Array<{ key: string }>): Promise<void> {
  for (const f of files) {
    try {
      await fs.unlink(localPathFor(f.key));
    } catch {
      // Dosya zaten yoksa umursama.
    }
  }
}

/** Ödevin öğrenciye ait olup olmadığını (enrollment + completed/sent) doğrular. */
function loadOwnHomework(studentId: string, homeworkId: string): {
  id: string;
  description: string;
  due_date: string;
} {
  const row = db
    .prepare(
      `SELECT h.id, h.description, h.due_date
       FROM homeworks h
       JOIN reports r ON r.id = h.report_id
       JOIN class_courses cc ON cc.id = h.class_course_id
       JOIN weeks w ON w.id = h.week_id
       JOIN enrollments e ON e.class_id = cc.class_id AND e.student_id = ?
         AND e.start_date <= w.start_date
         AND (e.end_date IS NULL OR e.end_date >= w.start_date)
       WHERE h.id = ? AND r.status IN ('completed','sent') AND h.description <> ''`,
    )
    .get(studentId, homeworkId) as
    | { id: string; description: string; due_date: string }
    | undefined;
  if (!row) {
    throw new AppError('NOT_FOUND', 404, 'Bu ödev size verilmedi ya da bulunamadı.');
  }
  return row;
}

interface HomeworkRow {
  id: string;
  description: string;
  due_date: string;
  course_name: string;
  teacher_name: string;
  class_name: string;
  week_no: number;
  week_start: string;
  week_end: string;
  week_label: string;
  submission_id: string | null;
  submitted_at: string | null;
  is_late: number | null;
  submission_status: string | null;
}

const HOMEWORK_SQL = `
  SELECT h.id, h.description, h.due_date,
         c.name AS course_name, t.full_name AS teacher_name, cl.name AS class_name,
         w.week_no, w.start_date AS week_start, w.end_date AS week_end, w.label AS week_label,
         s.id AS submission_id, s.submitted_at, s.is_late, s.status AS submission_status
  FROM homeworks h
  JOIN reports r ON r.id = h.report_id
  JOIN class_courses cc ON cc.id = h.class_course_id
  JOIN courses c ON c.id = cc.course_id
  JOIN classes cl ON cl.id = cc.class_id
  JOIN users t ON t.id = cc.teacher_id
  JOIN weeks w ON w.id = h.week_id
  LEFT JOIN submissions s ON s.homework_id = h.id AND s.student_id = ?
  JOIN enrollments e ON e.class_id = cc.class_id AND e.student_id = ?
    AND e.start_date <= w.start_date
    AND (e.end_date IS NULL OR e.end_date >= w.start_date)
  WHERE r.status IN ('completed','sent') AND h.description <> ''
`;

function buildHomeworkItem(row: HomeworkRow, filesBySubmission: Map<string, unknown[]>): unknown {
  return {
    id: row.id,
    description: row.description,
    due_date: row.due_date,
    course_name: row.course_name,
    teacher_name: row.teacher_name,
    class_name: row.class_name,
    week: {
      week_no: row.week_no,
      start_date: row.week_start,
      end_date: row.week_end,
      label: row.week_label,
    },
    submission: row.submission_id
      ? {
          id: row.submission_id,
          submitted_at: row.submitted_at,
          is_late: row.is_late === 1,
          status: row.submission_status,
          files: filesBySubmission.get(row.submission_id) ?? [],
        }
      : null,
  };
}

/** Aynı listedeki teslim dosyalarını submission_id'ye göre gruplar. */
function loadSubmissionFiles(submissionIds: string[]): Map<string, unknown[]> {
  const map = new Map<string, unknown[]>();
  if (submissionIds.length === 0) return map;
  const placeholders = submissionIds.map(() => '?').join(',');
  const rows = db
    .prepare(
      `SELECT submission_id, key, filename, size, mime, ext
       FROM submission_files WHERE submission_id IN (${placeholders})`,
    )
    .all(...submissionIds) as Array<{
    submission_id: string;
    key: string;
    filename: string;
    size: number;
    mime: string;
    ext: string;
  }>;
  for (const row of rows) {
    const list = map.get(row.submission_id) ?? [];
    list.push({
      key: row.key,
      filename: row.filename,
      size: row.size,
      mime: row.mime,
      ext: row.ext,
    });
    map.set(row.submission_id, list);
  }
  return map;
}

// ---------- GET /student/homeworks ----------

router.get('/homeworks', (req, res) => {
  const studentId = assertStudent(req.user!);

  const rows = db
    .prepare(HOMEWORK_SQL + ' ORDER BY w.start_date DESC')
    .all(studentId, studentId) as unknown as HomeworkRow[];

  const filesBySubmission = loadSubmissionFiles(
    rows.map((r) => r.submission_id).filter((id): id is string => id !== null),
  );

  res.json({ items: rows.map((row) => buildHomeworkItem(row, filesBySubmission)) });
});

// ---------- POST /student/homeworks/:id/submit ----------

const submitSchema = z.object({
  note: z.string().trim().max(1000, 'Not en fazla 1000 karakter olabilir.').optional(),
});

router.post(
  '/homeworks/:id/submit',
  upload.array('files', MAX_FILES),
  asyncHandler<{ id: string }>(async (req, res) => {
    const studentId = assertStudent(req.user!);
    const { id } = req.params;
    const homework = loadOwnHomework(studentId, id);
    const input = submitSchema.parse(req.body);

    const files = (req.files ?? []) as Express.Multer.File[];
    if (files.length === 0) {
      throw new AppError('VALIDATION_ERROR', 400, 'En az bir dosya yükleyin.');
    }

    // 1) Görsel küçültme + saklama (async). Hata olursa yazılanları sil.
    const stored: StoredFile[] = [];
    try {
      for (const file of files) {
        stored.push(await saveUpload(file));
      }
    } catch (err) {
      await removeFilesFromDisk(stored);
      throw err;
    }

    const now = new Date().toISOString();
    const late = isLateSubmission(now, homework.due_date);
    const existing = db
      .prepare('SELECT id FROM submissions WHERE homework_id = ? AND student_id = ?')
      .get(homework.id, studentId) as { id: string } | undefined;
    const subId = existing?.id ?? randomUUID();

    let oldKeys: string[] = [];
    try {
      db.exec('BEGIN');
      if (existing) {
        oldKeys = (
          db
            .prepare('SELECT key FROM submission_files WHERE submission_id = ?')
            .all(existing.id) as Array<{ key: string }>
        ).map((r) => r.key);
        db.prepare('DELETE FROM submission_files WHERE submission_id = ?').run(existing.id);
        db.prepare(
          `UPDATE submissions
           SET note = ?, submitted_at = ?, is_late = ?, status = 'submitted',
               reviewed_by = NULL, reviewed_at = NULL
           WHERE id = ?`,
        ).run(input.note ?? null, now, late ? 1 : 0, existing.id);
      } else {
        db.prepare(
          `INSERT INTO submissions (id, homework_id, student_id, note, submitted_at, is_late, status)
           VALUES (?, ?, ?, ?, ?, ?, 'submitted')`,
        ).run(subId, homework.id, studentId, input.note ?? null, now, late ? 1 : 0);
      }

      const insertFile = db.prepare(
        `INSERT INTO submission_files (id, submission_id, key, filename, size, mime, ext)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      );
      for (const sf of stored) {
        insertFile.run(randomUUID(), subId, sf.key, sf.filename, sf.size, sf.mime, sf.ext);
      }
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      await removeFilesFromDisk(stored);
      throw err;
    }

    // Eski dosyalar diskten kaldırılır (commit sonrası — rollback'te kayıp olmaz).
    await removeFilesFromDisk(oldKeys.map((key) => ({ key })));

    const item = db
      .prepare(HOMEWORK_SQL + ' AND h.id = ?')
      .get(studentId, studentId, homework.id) as unknown as HomeworkRow;
    const filesBySubmission = loadSubmissionFiles(item.submission_id ? [item.submission_id] : []);
    res.json({ item: buildHomeworkItem(item, filesBySubmission) });
  }),
);

export default router;

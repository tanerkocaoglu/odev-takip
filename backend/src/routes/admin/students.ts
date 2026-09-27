/**
 * Öğrenci rotaları — `/api/v1/admin/students*` (spec.md §3.1, §2.1, §6).
 * Sınıf değişikliği hafta sınırında yapılır (tarihli enrollment geçmişi korunur).
 */

import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { db } from '../../db/index.js';
import { AppError } from '../../errors.js';
import { GRADE_LEVELS } from '../../constants.js';
import { normalizeTurkish } from '../../utils/text.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { hashPassword } from '../../utils/hash.js';
import { nextUsername } from '../../utils/username.js';
import { writeAuditLog } from '../../services/audit.js';
import { parsePagination, paged } from '../../utils/pagination.js';
import { getPreviousWeek, type WeekRecord } from '../../utils/weeks.js';
import { prevDay } from '../../utils/time.js';
import { studentsExportCsv } from '../../services/csvExport.js';
import { resolveEnrollmentStartDate } from '../../services/enrollmentStart.js';
import { resetPasswordSchema, sendCsv } from './shared.js';

const router = Router();

const gradeLevelSchema = z.enum(GRADE_LEVELS, { message: 'Geçersiz sınıf seviyesi.' });

const studentSchema = z.object({
  full_name: z.string().trim().min(1, 'Ad boş olamaz.'),
  guardian_id: z.string().trim().min(1),
  class_id: z.string().trim().min(1),
  password: z.string().min(6, 'Şifre en az 6 karakter olmalı.'),
  school_id: z.string().trim().min(1).nullable().optional(),
  grade_level: gradeLevelSchema.nullable().optional(),
  // Öğrencinin hangi haftadan itibaren aktif olacağı (spec §3.1/§5.6).
  // Verilmezse aktif haftanın başlangıcı kullanılır.
  week_id: z.string().trim().min(1).optional(),
});

router.get('/students', (req, res) => {
  const pagination = parsePagination(req.query);
  const q = typeof req.query.q === 'string' ? normalizeTurkish(req.query.q.trim()) : '';
  const classId = typeof req.query.classId === 'string' ? req.query.classId : undefined;

  const where = [
    `u.role = 'student'`,
    `u.deleted_at IS NULL`,
    `s.deleted_at IS NULL`,
  ];
  const values: Array<string | number> = [];
  if (q) {
    where.push(`(u.full_name_normalized LIKE ? OR gu.full_name_normalized LIKE ?)`);
    values.push(`%${q}%`, `%${q}%`);
  }
  if (classId) {
    where.push(`e.class_id = ?`);
    values.push(classId);
  }

  const total = (
    db
      .prepare(
        `SELECT COUNT(*) AS c
         FROM users u
         JOIN students s ON s.user_id = u.id AND s.deleted_at IS NULL
         JOIN enrollments e ON e.student_id = s.id AND e.end_date IS NULL
         LEFT JOIN users gu ON gu.id = (
           SELECT g.user_id FROM guardians g WHERE g.id = s.guardian_id AND g.deleted_at IS NULL
         )
         WHERE ${where.join(' AND ')}`,
      )
      .get(...values) as { c: number }
  ).c;

  const rows = db
    .prepare(
      `SELECT u.id, u.full_name, u.username, u.is_active,
              s.id AS student_id, s.guardian_id, s.grade_level,
              sch.name AS school_name, s.school_id,
              gu.full_name AS guardian_name,
              c.name AS class_name, e.class_id
       FROM users u
       JOIN students s ON s.user_id = u.id AND s.deleted_at IS NULL
       JOIN enrollments e ON e.student_id = s.id AND e.end_date IS NULL
       LEFT JOIN guardians g ON g.id = s.guardian_id AND g.deleted_at IS NULL
       LEFT JOIN users gu ON gu.id = g.user_id
       LEFT JOIN schools sch ON sch.id = s.school_id AND sch.deleted_at IS NULL
       JOIN classes c ON c.id = e.class_id
       WHERE ${where.join(' AND ')}
       ORDER BY u.full_name
       LIMIT ? OFFSET ?`,
    )
    .all(...values, pagination.limit, pagination.offset);

  res.json(paged(rows, total, pagination));
});

router.post(
  '/students',
  asyncHandler(async (req, res) => {
    const input = studentSchema.parse(req.body);

    const guardian = db
      .prepare(
        `SELECT g.id FROM guardians g
         JOIN users u ON u.id = g.user_id
         WHERE g.id = ? AND g.deleted_at IS NULL AND u.deleted_at IS NULL`,
      )
      .get(input.guardian_id);
    if (!guardian) {
      throw new AppError('NOT_FOUND', 404, 'Veli bulunamadı.');
    }

    const cls = db
      .prepare(`SELECT id, academic_year_id FROM classes WHERE id = ? AND deleted_at IS NULL`)
      .get(input.class_id) as { id: string; academic_year_id: string } | undefined;
    if (!cls) {
      throw new AppError('NOT_FOUND', 404, 'Sınıf bulunamadı.');
    }

    // Enrollment başlangıcı bugün değil, admin'in seçtiği haftanın başlangıcı;
    // seçim yoksa aktif haftanın başlangıcı (spec §3.1/§5.6).
    const startDate = resolveEnrollmentStartDate(input.week_id, cls.academic_year_id);

    if (input.school_id !== undefined && input.school_id !== null) {
      const school = db
        .prepare(`SELECT id FROM schools WHERE id = ? AND deleted_at IS NULL`)
        .get(input.school_id);
      if (!school) {
        throw new AppError('NOT_FOUND', 404, 'Okul bulunamadı.');
      }
    }

    const userId = randomUUID();
    const studentId = randomUUID();
    const enrollmentId = randomUUID();
    const username = nextUsername(input.full_name);
    const passwordHash = await hashPassword(input.password);
    const now = new Date().toISOString();

    db.exec('BEGIN');
    try {
      db.prepare(
        `INSERT INTO users
           (id, full_name, full_name_normalized, username, email, password_hash, role,
            is_active, token_version, must_change_password, deleted_at, created_at)
         VALUES (?, ?, ?, ?, NULL, ?, 'student', 1, 1, 1, NULL, ?)`,
      ).run(userId, input.full_name, normalizeTurkish(input.full_name), username, passwordHash, now);

      db.prepare(
        `INSERT INTO students (id, user_id, guardian_id, school_id, grade_level, deleted_at)
         VALUES (?, ?, ?, ?, ?, NULL)`,
      ).run(
        studentId,
        userId,
        input.guardian_id,
        input.school_id ?? null,
        input.grade_level ?? null,
      );

      db.prepare(
        `INSERT INTO enrollments (id, student_id, class_id, start_date, end_date)
         VALUES (?, ?, ?, ?, NULL)`,
      ).run(enrollmentId, studentId, input.class_id, startDate);
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }

    const row = db
      .prepare(
        `SELECT u.id, u.full_name, u.username, s.id AS student_id, c.name AS class_name
         FROM users u
         JOIN students s ON s.user_id = u.id
         JOIN enrollments e ON e.student_id = s.id AND e.end_date IS NULL
         JOIN classes c ON c.id = e.class_id
         WHERE u.id = ?`,
      )
      .get(userId);
    res.status(201).json(row);
  }),
);

const studentPatchSchema = z.object({
  full_name: z.string().trim().min(1).optional(),
  guardian_id: z.string().trim().min(1).optional(),
  school_id: z.string().trim().min(1).nullable().optional(),
  grade_level: gradeLevelSchema.nullable().optional(),
});

router.patch('/students/:id', (req, res) => {
  const { id } = req.params;
  const input = studentPatchSchema.parse(req.body);

  const current = db
    .prepare(
      `SELECT s.id AS student_id FROM users u
       JOIN students s ON s.user_id = u.id AND s.deleted_at IS NULL
       WHERE u.id = ? AND u.role = 'student' AND u.deleted_at IS NULL`,
    )
    .get(id);
  if (!current) {
    throw new AppError('NOT_FOUND', 404, 'Öğrenci bulunamadı.');
  }

  if (input.guardian_id !== undefined) {
    const guardian = db
      .prepare(
        `SELECT g.id FROM guardians g
         JOIN users u ON u.id = g.user_id
         WHERE g.id = ? AND g.deleted_at IS NULL AND u.deleted_at IS NULL`,
      )
      .get(input.guardian_id);
    if (!guardian) {
      throw new AppError('NOT_FOUND', 404, 'Veli bulunamadı.');
    }
  }

  if (input.school_id !== undefined && input.school_id !== null) {
    const school = db
      .prepare(`SELECT id FROM schools WHERE id = ? AND deleted_at IS NULL`)
      .get(input.school_id);
    if (!school) {
      throw new AppError('NOT_FOUND', 404, 'Okul bulunamadı.');
    }
  }

  const userSets: string[] = [];
  const userValues: Array<string | number> = [];
  if (input.full_name !== undefined) {
    userSets.push(`full_name = ?`, `full_name_normalized = ?`);
    userValues.push(input.full_name, normalizeTurkish(input.full_name));
  }
  if (userSets.length > 0) {
    userValues.push(id);
    db.prepare(`UPDATE users SET ${userSets.join(', ')} WHERE id = ?`).run(...userValues);
  }

  const studentSets: string[] = [];
  const studentValues: Array<string | null> = [];
  if (input.guardian_id !== undefined) {
    studentSets.push(`guardian_id = ?`);
    studentValues.push(input.guardian_id);
  }
  if (input.school_id !== undefined) {
    studentSets.push(`school_id = ?`);
    studentValues.push(input.school_id ?? null);
  }
  if (input.grade_level !== undefined) {
    studentSets.push(`grade_level = ?`);
    studentValues.push(input.grade_level ?? null);
  }
  if (studentSets.length > 0) {
    studentValues.push(id);
    db.prepare(`UPDATE students SET ${studentSets.join(', ')} WHERE user_id = ?`).run(
      ...studentValues,
    );
  }

  const row = db
    .prepare(
      `SELECT u.id, u.full_name, u.username, s.id AS student_id, s.guardian_id,
              s.school_id, s.grade_level
       FROM users u JOIN students s ON s.user_id = u.id WHERE u.id = ?`,
    )
    .get(id);
  res.json(row);
});

// Şifre sıfırlama (öğrenci) — spec.md §2.1: e-posta/SMS kanalı yok, tek çıkış
// yolu admin reset-password'tür. token_version +1 ile mevcut oturumlar biter.
router.post(
  '/students/:id/reset-password',
  asyncHandler<{ id: string }>(async (req, res) => {
    const { id } = req.params;
    const { password } = resetPasswordSchema.parse(req.body);

    const current = db
      .prepare(
        `SELECT s.id AS student_id FROM users u
         JOIN students s ON s.user_id = u.id AND s.deleted_at IS NULL
         WHERE u.id = ? AND u.role = 'student' AND u.deleted_at IS NULL`,
      )
      .get(id) as { student_id: string } | undefined;
    if (!current) {
      throw new AppError('NOT_FOUND', 404, 'Öğrenci bulunamadı.');
    }

    const passwordHash = await hashPassword(password);
    db.prepare(
      `UPDATE users SET password_hash = ?, must_change_password = 1, token_version = token_version + 1 WHERE id = ?`,
    ).run(passwordHash, id);

    writeAuditLog({
      actorId: req.user!.id,
      action: 'student.password_reset',
      entityType: 'student',
      entityId: current.student_id,
    });

    res.json({ message: 'Şifre güncellendi.' });
  }),
);

// Sınıf değişikliği — hafta sınırında (spec.md §3.1):
// Admin bir hafta seçer; seçilen haftanın start_date'i yeni enrollment'ın
// start_date'i, önceki ders haftasının end_date'i eski enrollment'ın
// end_date'i olur. Serbest tarih girilmez — kural UI seviyesinde zorlanır.
const changeClassSchema = z.object({
  class_id: z.string().trim().min(1),
  week_id: z.string().trim().min(1),
});

router.post('/students/:id/change-class', (req, res) => {
  const { id } = req.params;
  const input = changeClassSchema.parse(req.body);

  const current = db
    .prepare(
      `SELECT s.id AS student_id FROM users u
       JOIN students s ON s.user_id = u.id AND s.deleted_at IS NULL
       WHERE u.id = ? AND u.role = 'student' AND u.deleted_at IS NULL`,
    )
    .get(id) as { student_id: string } | undefined;
  if (!current) {
    throw new AppError('NOT_FOUND', 404, 'Öğrenci bulunamadı.');
  }

  const targetClass = db
    .prepare(`SELECT id, academic_year_id FROM classes WHERE id = ? AND deleted_at IS NULL`)
    .get(input.class_id) as { id: string; academic_year_id: string } | undefined;
  if (!targetClass) {
    throw new AppError('NOT_FOUND', 404, 'Sınıf bulunamadı.');
  }

  const week = db
    .prepare(`SELECT * FROM weeks WHERE id = ?`)
    .get(input.week_id) as WeekRecord | undefined;
  if (!week) {
    throw new AppError('NOT_FOUND', 404, 'Hafta bulunamadı.');
  }
  if (week.academic_year_id !== targetClass.academic_year_id) {
    throw new AppError(
      'VALIDATION_ERROR',
      400,
      'Seçilen hafta ile hedef sınıf aynı eğitim yılında olmalı.',
    );
  }

  const activeEnrollment = db
    .prepare(
      `SELECT id, class_id FROM enrollments
       WHERE student_id = ? AND end_date IS NULL`,
    )
    .get(current.student_id) as { id: string; class_id: string } | undefined;
  if (!activeEnrollment) {
    throw new AppError(
      'CONFLICT',
      409,
      'Bu öğrencinin aktif sınıf kaydı yok.',
    );
  }
  if (activeEnrollment.class_id === targetClass.id) {
    throw new AppError(
      'CONFLICT',
      409,
      'Öğrenci zaten bu sınıfta.',
    );
  }

  // Önceki ders haftası yoksa (yılın ilk haftası) eski kayıt, haftanın
  // başlangıcından bir gün önce kapatılır.
  const allWeeks = db
    .prepare(`SELECT * FROM weeks WHERE academic_year_id = ?`)
    .all(week.academic_year_id) as unknown as WeekRecord[];
  const previousWeek = getPreviousWeek(allWeeks, week);

  const newStart = week.start_date;
  const oldEnd = previousWeek ? previousWeek.end_date : prevDay(week.start_date);

  db.exec('BEGIN');
  try {
    db.prepare(`UPDATE enrollments SET end_date = ? WHERE id = ?`).run(
      oldEnd,
      activeEnrollment.id,
    );
    db.prepare(
      `INSERT INTO enrollments (id, student_id, class_id, start_date, end_date)
       VALUES (?, ?, ?, ?, NULL)`,
    ).run(randomUUID(), current.student_id, targetClass.id, newStart);
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }

  writeAuditLog({
    actorId: req.user!.id,
    action: 'student.class_change',
    entityType: 'student',
    entityId: current.student_id,
    diff: {
      from_class_id: activeEnrollment.class_id,
      to_class_id: targetClass.id,
      week_id: week.id,
      old_end_date: oldEnd,
      new_start_date: newStart,
    },
  });

  res.json({
    message: 'Sınıf değişikliği kaydedildi.',
    previous_class_id: activeEnrollment.class_id,
    class_id: targetClass.id,
    start_date: newStart,
    previous_enrollment_end: oldEnd,
  });
});

router.delete('/students/:id', (req, res) => {
  const { id } = req.params;
  const current = db
    .prepare(
      `SELECT s.id AS student_id FROM users u
       JOIN students s ON s.user_id = u.id AND s.deleted_at IS NULL
       WHERE u.id = ? AND u.role = 'student' AND u.deleted_at IS NULL`,
    )
    .get(id);
  if (!current) {
    throw new AppError('NOT_FOUND', 404, 'Öğrenci bulunamadı.');
  }

  const now = new Date().toISOString();
  const today = now.slice(0, 10);

  db.exec('BEGIN');
  try {
    db.prepare(`UPDATE users SET deleted_at = ?, token_version = token_version + 1 WHERE id = ?`).run(now, id);
    db.prepare(`UPDATE students SET deleted_at = ? WHERE user_id = ?`).run(now, id);
    // Aktif enrollment kapatılır (tarihli geçmiş korunur).
    db.prepare(
      `UPDATE enrollments SET end_date = ?
       WHERE student_id = ? AND end_date IS NULL`,
    ).run(today, current.student_id);
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }

  res.status(204).end();
});

/** CSV dışa aktarma — GET /admin/students/export (spec §5.7). */
router.get('/students/export', (req, res) => {
  const q = typeof req.query.q === 'string' ? req.query.q : undefined;
  const classId = typeof req.query.classId === 'string' ? req.query.classId : undefined;
  sendCsv(res, 'ogrenciler.csv', studentsExportCsv({ q, classId }));
});

export default router;

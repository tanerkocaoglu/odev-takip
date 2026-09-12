/**
 * Atama rotaları — `/api/v1/admin/class-courses*` (spec.md §3, §6).
 * Takas (`swap`) iki atamanın öğretmenlerini tek transaction'da değiştirir;
 * geçmiş raporlar atamayı izler (spec §2).
 */

import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { db } from '../../db/index.js';
import { AppError } from '../../errors.js';
import { writeAuditLog } from '../../services/audit.js';

const router = Router();

const classCourseSchema = z.object({
  class_id: z.string().trim().min(1),
  course_id: z.string().trim().min(1),
  teacher_id: z.string().trim().min(1),
  day_of_week: z.number().int().min(1).max(7, 'Ders günü 1-7 arası olmalı.'),
  lesson_time: z.string().regex(/^\d{2}:\d{2}$/, 'Saat HH:mm biçiminde olmalı.'),
});

router.get('/class-courses', (req, res) => {
  const classId = typeof req.query.classId === 'string' ? req.query.classId : undefined;
  const rows = classId
    ? db
        .prepare(
          `SELECT cc.id, cc.class_id, cc.course_id, cc.teacher_id, cc.day_of_week,
                  cc.lesson_time, c.name AS class_name, co.name AS course_name,
                  t.full_name AS teacher_name
           FROM class_courses cc
           JOIN classes c ON c.id = cc.class_id
           JOIN courses co ON co.id = cc.course_id
           JOIN users t ON t.id = cc.teacher_id
           WHERE cc.deleted_at IS NULL AND cc.class_id = ?
           ORDER BY cc.day_of_week, cc.lesson_time`,
        )
        .all(classId)
    : db
        .prepare(
          `SELECT cc.id, cc.class_id, cc.course_id, cc.teacher_id, cc.day_of_week,
                  cc.lesson_time, c.name AS class_name, co.name AS course_name,
                  t.full_name AS teacher_name
           FROM class_courses cc
           JOIN classes c ON c.id = cc.class_id
           JOIN courses co ON co.id = cc.course_id
           JOIN users t ON t.id = cc.teacher_id
           WHERE cc.deleted_at IS NULL
           ORDER BY c.name, cc.day_of_week, cc.lesson_time`,
        )
        .all();
  res.json({ items: rows });
});

router.post('/class-courses', (req, res) => {
  const input = classCourseSchema.parse(req.body);

  const cls = db
    .prepare(`SELECT id FROM classes WHERE id = ? AND deleted_at IS NULL`)
    .get(input.class_id);
  if (!cls) throw new AppError('NOT_FOUND', 404, 'Sınıf bulunamadı.');

  const course = db
    .prepare(`SELECT id FROM courses WHERE id = ? AND deleted_at IS NULL`)
    .get(input.course_id);
  if (!course) throw new AppError('NOT_FOUND', 404, 'Ders bulunamadı.');

  const teacher = db
    .prepare(`SELECT id FROM users WHERE id = ? AND role = 'teacher' AND deleted_at IS NULL`)
    .get(input.teacher_id);
  if (!teacher) throw new AppError('NOT_FOUND', 404, 'Öğretmen bulunamadı.');

  const clash = db
    .prepare(
      `SELECT id FROM class_courses
       WHERE class_id = ? AND course_id = ? AND deleted_at IS NULL`,
    )
    .get(input.class_id, input.course_id);
  if (clash) {
    throw new AppError('CONFLICT', 409, 'Bu sınıf-ders ataması zaten var.');
  }

  const id = randomUUID();
  db.prepare(
    `INSERT INTO class_courses (id, class_id, course_id, teacher_id, day_of_week, lesson_time, deleted_at)
     VALUES (?, ?, ?, ?, ?, ?, NULL)`,
  ).run(id, input.class_id, input.course_id, input.teacher_id, input.day_of_week, input.lesson_time);

  const row = db
    .prepare(
      `SELECT cc.*, c.name AS class_name, co.name AS course_name, t.full_name AS teacher_name
       FROM class_courses cc
       JOIN classes c ON c.id = cc.class_id
       JOIN courses co ON co.id = cc.course_id
       JOIN users t ON t.id = cc.teacher_id
       WHERE cc.id = ?`,
    )
    .get(id);
  res.status(201).json(row);
});

const classCoursePatchSchema = z.object({
  teacher_id: z.string().trim().min(1).optional(),
  day_of_week: z.number().int().min(1).max(7).optional(),
  lesson_time: z.string().regex(/^\d{2}:\d{2}$/).optional(),
});

router.patch('/class-courses/:id', (req, res) => {
  const { id } = req.params;
  const input = classCoursePatchSchema.parse(req.body);

  const current = db
    .prepare(`SELECT id FROM class_courses WHERE id = ? AND deleted_at IS NULL`)
    .get(id);
  if (!current) {
    throw new AppError('NOT_FOUND', 404, 'Atama bulunamadı.');
  }

  if (input.teacher_id !== undefined) {
    const teacher = db
      .prepare(
        `SELECT id FROM users WHERE id = ? AND role = 'teacher' AND deleted_at IS NULL`,
      )
      .get(input.teacher_id);
    if (!teacher) throw new AppError('NOT_FOUND', 404, 'Öğretmen bulunamadı.');
  }

  const sets: string[] = [];
  const values: Array<string | number> = [];
  for (const key of ['teacher_id', 'day_of_week', 'lesson_time'] as const) {
    const value = input[key];
    if (value !== undefined) {
      sets.push(`${key} = ?`);
      values.push(value);
    }
  }
  if (sets.length > 0) {
    values.push(id);
    db.prepare(`UPDATE class_courses SET ${sets.join(', ')} WHERE id = ?`).run(...values);
  }

  const row = db.prepare(`SELECT * FROM class_courses WHERE id = ?`).get(id);
  res.json(row);
});

router.delete('/class-courses/:id', (req, res) => {
  const { id } = req.params;
  const current = db
    .prepare(`SELECT id FROM class_courses WHERE id = ? AND deleted_at IS NULL`)
    .get(id);
  if (!current) {
    throw new AppError('NOT_FOUND', 404, 'Atama bulunamadı.');
  }

  const reportCount = db
    .prepare(`SELECT COUNT(*) AS c FROM reports WHERE class_course_id = ?`)
    .get(id) as { c: number };
  if (reportCount.c > 0) {
    throw new AppError(
      'CONFLICT',
      409,
      'Bu atamaya bağlı raporlar var, silinemez.',
    );
  }

  db.prepare(`UPDATE class_courses SET deleted_at = ? WHERE id = ?`).run(
    new Date().toISOString(),
    id,
  );
  res.status(204).end();
});

// ---------- Atama takası (swap) ----------

const swapSchema = z.object({
  cc_id_a: z.string().trim().min(1, 'İlk atama seçilmedi.'),
  cc_id_b: z.string().trim().min(1, 'İkinci atama seçilmedi.'),
});

/** Bir class_course satırını adlarıyla yükler (silinmemiş; yoksa undefined). */
function loadClassCourseWithNames(id: string): unknown {
  return db
    .prepare(
      `SELECT cc.id, cc.class_id, cc.course_id, cc.teacher_id, cc.day_of_week, cc.lesson_time,
              c.name AS class_name, co.name AS course_name, t.full_name AS teacher_name
       FROM class_courses cc
       JOIN classes c ON c.id = cc.class_id
       JOIN courses co ON co.id = cc.course_id
       JOIN users t ON t.id = cc.teacher_id
       WHERE cc.id = ? AND cc.deleted_at IS NULL`,
    )
    .get(id);
}

/**
 * POST /admin/class-courses/swap — iki atamanın öğretmenlerini tek işlemde
 * takas eder (sınıflar arası dahil; tek transaction — iki ayrı PATCH'in
 * yarım kalma riski yok). Her atama için audit yazılır.
 * Tasarım kararı (spec §2): geçmiş raporlar atamayı izler — takas sonrası
 * yeni öğretmen o atamanın geçmiş raporlarını görür.
 */
router.post('/class-courses/swap', (req, res) => {
  const user = req.user!;
  const { cc_id_a, cc_id_b } = swapSchema.parse(req.body);

  if (cc_id_a === cc_id_b) {
    throw new AppError('VALIDATION_ERROR', 400, 'İki farklı atama seçin.', {
      cc_id_b: 'Aynı atama seçilemez.',
    });
  }

  const ccA = loadClassCourseWithNames(cc_id_a) as {
    id: string;
    teacher_id: string;
  };
  const ccB = loadClassCourseWithNames(cc_id_b) as { id: string; teacher_id: string } | undefined;
  if (!ccA || !ccB) {
    throw new AppError('NOT_FOUND', 404, 'Atama bulunamadı.');
  }

  // İki öğretmen de geçerli (role='teacher', silinmemiş) olmalı.
  for (const teacherId of [ccA.teacher_id, ccB.teacher_id]) {
    const t = db
      .prepare(
        `SELECT id FROM users WHERE id = ? AND role = 'teacher' AND deleted_at IS NULL`,
      )
      .get(teacherId);
    if (!t) {
      throw new AppError('VALIDATION_ERROR', 400, 'Atamalardan birinin öğretmeni geçersiz.');
    }
  }
  if (ccA.teacher_id === ccB.teacher_id) {
    throw new AppError(
      'CONFLICT',
      409,
      'Aynı öğretmene ait atamaların yerini değiştirmeye gerek yok.',
    );
  }

  db.exec('BEGIN');
  try {
    db.prepare(`UPDATE class_courses SET teacher_id = ? WHERE id = ?`).run(
      ccB.teacher_id,
      ccA.id,
    );
    db.prepare(`UPDATE class_courses SET teacher_id = ? WHERE id = ?`).run(
      ccA.teacher_id,
      ccB.id,
    );
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }

  writeAuditLog({
    actorId: user.id,
    action: 'class_course.teacher_reassign',
    entityType: 'class_course',
    entityId: ccA.id,
    diff: { from_teacher_id: ccA.teacher_id, to_teacher_id: ccB.teacher_id },
  });
  writeAuditLog({
    actorId: user.id,
    action: 'class_course.teacher_reassign',
    entityType: 'class_course',
    entityId: ccB.id,
    diff: { from_teacher_id: ccB.teacher_id, to_teacher_id: ccA.teacher_id },
  });

  res.json({ items: [loadClassCourseWithNames(ccA.id), loadClassCourseWithNames(ccB.id)] });
});

export default router;

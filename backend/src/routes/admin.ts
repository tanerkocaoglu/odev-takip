/**
 * Admin CRUD rotaları — `/api/v1/admin/*` (spec.md §2b, §6 Admin).
 * Tüm rotalar `requireAuth` + `adminOnly` ile korunur (router seviyesinde
 * tek nokta; ayrı rotada yetki kontrolü tekrarlanmaz).
 *
 * Adım yapısı (küçük adımlar — her commit ayrı kaynak grubu ekler):
 * 1. Eğitim yılı + hafta
 * 2. Sınıf + ders + atamalar (class_courses)
 * 3. Öğretmen + admin ekleme + audit
 * 4. Öğrenci + veli + enrollment (hafta sınırında sınıf değişikliği)
 */

import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { db } from '../db/index.js';
import { AppError } from '../errors.js';
import { requireAuth } from '../middleware/auth.js';
import { adminOnly } from '../middleware/adminOnly.js';
import { normalizeTurkish } from '../utils/text.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { hashPassword } from '../utils/hash.js';
import { normalizePhone } from '../utils/phone.js';
import { writeAuditLog } from '../services/audit.js';
import { parsePagination, paged } from '../utils/pagination.js';

const router = Router();

// Router seviyesinde yetki — tüm /admin/* rotaları yalnızca admin.
router.use(requireAuth, adminOnly);

// ---------- Eğitim yılı ----------

const academicYearSchema = z.object({
  name: z.string().trim().min(1, 'Yıl adı boş olamaz.'),
  start_date: z.string().trim().min(1, 'Başlangıç tarihi zorunlu.'),
  end_date: z.string().trim().min(1, 'Bitiş tarihi zorunlu.'),
  is_active: z.boolean().optional().default(false),
});

router.get('/academic-years', (_req, res) => {
  const rows = db
    .prepare(`SELECT * FROM academic_years ORDER BY start_date DESC`)
    .all();
  res.json({ items: rows });
});

router.post('/academic-years', (req, res) => {
  const { name, start_date, end_date, is_active } = academicYearSchema.parse(req.body);

  const existing = db
    .prepare(`SELECT id FROM academic_years WHERE name = ?`)
    .get(name);
  if (existing) {
    throw new AppError('CONFLICT', 409, 'Bu adla bir eğitim yılı zaten var.');
  }

  const id = randomUUID();
  db.exec('BEGIN');
  try {
    if (is_active) {
      db.exec(`UPDATE academic_years SET is_active = 0`);
    }
    db.prepare(
      `INSERT INTO academic_years (id, name, start_date, end_date, is_active)
       VALUES (?, ?, ?, ?, ?)`,
    ).run(id, name, start_date, end_date, is_active ? 1 : 0);
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }

  const row = db.prepare(`SELECT * FROM academic_years WHERE id = ?`).get(id);
  res.status(201).json(row);
});

const academicYearPatchSchema = z.object({
  name: z.string().trim().min(1).optional(),
  start_date: z.string().trim().min(1).optional(),
  end_date: z.string().trim().min(1).optional(),
  is_active: z.boolean().optional(),
});

router.patch('/academic-years/:id', (req, res) => {
  const { id } = req.params;
  const input = academicYearPatchSchema.parse(req.body);

  const current = db
    .prepare(`SELECT id FROM academic_years WHERE id = ?`)
    .get(id);
  if (!current) {
    throw new AppError('NOT_FOUND', 404, 'Eğitim yılı bulunamadı.');
  }

  if (input.name !== undefined) {
    const clash = db
      .prepare(`SELECT id FROM academic_years WHERE name = ? AND id != ?`)
      .get(input.name, id);
    if (clash) {
      throw new AppError('CONFLICT', 409, 'Bu adla bir eğitim yılı zaten var.');
    }
  }

  db.exec('BEGIN');
  try {
    if (input.is_active === true) {
      db.exec(`UPDATE academic_years SET is_active = 0`);
    }
    const sets: string[] = [];
    const values: Array<string | number> = [];
    for (const key of ['name', 'start_date', 'end_date'] as const) {
      const value = input[key];
      if (value !== undefined) {
        sets.push(`${key} = ?`);
        values.push(value);
      }
    }
    if (input.is_active !== undefined) {
      sets.push(`is_active = ?`);
      values.push(input.is_active ? 1 : 0);
    }
    if (sets.length > 0) {
      values.push(id);
      db.prepare(`UPDATE academic_years SET ${sets.join(', ')} WHERE id = ?`).run(...values);
    }
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }

  const row = db.prepare(`SELECT * FROM academic_years WHERE id = ?`).get(id);
  res.json(row);
});

// ---------- Hafta ----------

const weekSchema = z.object({
  academic_year_id: z.string().trim().min(1),
  week_no: z.number().int().min(1, 'Hafta numarası 1 veya daha büyük olmalı.'),
  start_date: z.string().trim().min(1, 'Başlangıç tarihi zorunlu.'),
  end_date: z.string().trim().min(1, 'Bitiş tarihi zorunlu.'),
  label: z.string().trim().min(1, 'Hafta etiketi zorunlu.'),
});

router.get('/weeks', (req, res) => {
  const yearId = typeof req.query.academicYearId === 'string' ? req.query.academicYearId : undefined;
  const rows = yearId
    ? db
        .prepare(
          `SELECT * FROM weeks WHERE academic_year_id = ? ORDER BY start_date`,
        )
        .all(yearId)
    : db.prepare(`SELECT * FROM weeks ORDER BY start_date`).all();
  res.json({ items: rows });
});

router.post('/weeks', (req, res) => {
  const week = weekSchema.parse(req.body);

  const year = db
    .prepare(`SELECT id, start_date, end_date FROM academic_years WHERE id = ?`)
    .get(week.academic_year_id) as
    | { id: string; start_date: string; end_date: string }
    | undefined;
  if (!year) {
    throw new AppError('NOT_FOUND', 404, 'Eğitim yılı bulunamadı.');
  }
  // Hafta aralığı yıl aralığı dışına taşamaz (due_date hesabını bozar).
  if (week.start_date < year.start_date || week.end_date > year.end_date) {
    throw new AppError('VALIDATION_ERROR', 400, 'Hafta aralığı eğitim yılı dışına taşamaz.');
  }

  const clash = db
    .prepare(`SELECT id FROM weeks WHERE academic_year_id = ? AND week_no = ?`)
    .get(week.academic_year_id, week.week_no);
  if (clash) {
    throw new AppError(
      'CONFLICT',
      409,
      `Hafta ${week.week_no} bu eğitim yılında zaten tanımlı.`,
    );
  }

  const id = randomUUID();
  db.prepare(
    `INSERT INTO weeks (id, academic_year_id, week_no, start_date, end_date, label)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(id, week.academic_year_id, week.week_no, week.start_date, week.end_date, week.label);

  const row = db.prepare(`SELECT * FROM weeks WHERE id = ?`).get(id);
  res.status(201).json(row);
});

// Düzeltme: week_no düzenlenemez — yalnızca tarih/label.
// (week_no değişimi getPreviousWeek/calculateDueDate aritmetiğini bozar;
//  yanlış girilen hafta silinip yeniden eklenir.)
const weekPatchSchema = z.object({
  start_date: z.string().trim().min(1).optional(),
  end_date: z.string().trim().min(1).optional(),
  label: z.string().trim().min(1).optional(),
});

router.patch('/weeks/:id', (req, res) => {
  const { id } = req.params;
  const input = weekPatchSchema.parse(req.body);

  const current = db.prepare(`SELECT id FROM weeks WHERE id = ?`).get(id);
  if (!current) {
    throw new AppError('NOT_FOUND', 404, 'Hafta bulunamadı.');
  }

  const sets: string[] = [];
  const values: Array<string | number> = [];
  for (const key of ['start_date', 'end_date', 'label'] as const) {
    const value = input[key];
    if (value !== undefined) {
      sets.push(`${key} = ?`);
      values.push(value);
    }
  }
  if (sets.length > 0) {
    values.push(id);
    db.prepare(`UPDATE weeks SET ${sets.join(', ')} WHERE id = ?`).run(...values);
  }

  const row = db.prepare(`SELECT * FROM weeks WHERE id = ?`).get(id);
  res.json(row);
});

router.delete('/weeks/:id', (req, res) => {
  const { id } = req.params;
  const current = db.prepare(`SELECT id FROM weeks WHERE id = ?`).get(id);
  if (!current) {
    throw new AppError('NOT_FOUND', 404, 'Hafta bulunamadı.');
  }

  // Raporlu hafta silinemez — geçmiş raporlar haftasına bağlıdır.
  const reportCount = db
    .prepare(`SELECT COUNT(*) AS c FROM reports WHERE week_id = ?`)
    .get(id) as { c: number };
  if (reportCount.c > 0) {
    throw new AppError(
      'CONFLICT',
      409,
      'Bu haftaya bağlı raporlar var, silinemez.',
    );
  }

  db.prepare(`DELETE FROM weeks WHERE id = ?`).run(id);
  res.status(204).end();
});

// ---------- Sınıf ----------

const classSchema = z.object({
  academic_year_id: z.string().trim().min(1),
  name: z.string().trim().min(1, 'Sınıf adı boş olamaz.'),
});

router.get('/classes', (req, res) => {
  const yearId = typeof req.query.academicYearId === 'string' ? req.query.academicYearId : undefined;
  const q = typeof req.query.q === 'string' ? normalizeTurkish(req.query.q.trim()) : '';

  const where: string[] = [`c.deleted_at IS NULL`];
  const values: Array<string | number> = [];
  if (yearId) {
    where.push(`c.academic_year_id = ?`);
    values.push(yearId);
  }
  if (q) {
    where.push(`c.name_normalized LIKE ?`);
    values.push(`%${q}%`);
  }

  const rows = db
    .prepare(
      `SELECT c.id, c.academic_year_id, c.name, c.deleted_at,
              a.name AS academic_year_name
       FROM classes c
       JOIN academic_years a ON a.id = c.academic_year_id
       WHERE ${where.join(' AND ')}
       ORDER BY c.name`,
    )
    .all(...values);
  res.json({ items: rows });
});

router.post('/classes', (req, res) => {
  const input = classSchema.parse(req.body);
  const name = input.name.trim();

  const year = db
    .prepare(`SELECT id FROM academic_years WHERE id = ?`)
    .get(input.academic_year_id);
  if (!year) {
    throw new AppError('NOT_FOUND', 404, 'Eğitim yılı bulunamadı.');
  }

  const clash = db
    .prepare(
      `SELECT id FROM classes
       WHERE academic_year_id = ? AND name_normalized = ? AND deleted_at IS NULL`,
    )
    .get(input.academic_year_id, normalizeTurkish(name));
  if (clash) {
    throw new AppError('CONFLICT', 409, 'Bu sınıf adı bu eğitim yılında zaten var.');
  }

  const id = randomUUID();
  db.prepare(
    `INSERT INTO classes (id, academic_year_id, name, name_normalized, deleted_at)
     VALUES (?, ?, ?, ?, NULL)`,
  ).run(id, input.academic_year_id, name, normalizeTurkish(name));

  const row = db.prepare(`SELECT * FROM classes WHERE id = ?`).get(id);
  res.status(201).json(row);
});

const classPatchSchema = z.object({
  name: z.string().trim().min(1).optional(),
});

router.patch('/classes/:id', (req, res) => {
  const { id } = req.params;
  const input = classPatchSchema.parse(req.body);

  const current = db
    .prepare(`SELECT id, academic_year_id FROM classes WHERE id = ? AND deleted_at IS NULL`)
    .get(id) as { id: string; academic_year_id: string } | undefined;
  if (!current) {
    throw new AppError('NOT_FOUND', 404, 'Sınıf bulunamadı.');
  }

  if (input.name !== undefined) {
    const clash = db
      .prepare(
        `SELECT id FROM classes
         WHERE academic_year_id = ? AND name_normalized = ? AND id != ? AND deleted_at IS NULL`,
      )
      .get(current.academic_year_id, normalizeTurkish(input.name), id);
    if (clash) {
      throw new AppError('CONFLICT', 409, 'Bu sınıf adı bu eğitim yılında zaten var.');
    }
    db.prepare(`UPDATE classes SET name = ?, name_normalized = ? WHERE id = ?`).run(
      input.name,
      normalizeTurkish(input.name),
      id,
    );
  }

  const row = db.prepare(`SELECT * FROM classes WHERE id = ?`).get(id);
  res.json(row);
});

router.delete('/classes/:id', (req, res) => {
  const { id } = req.params;
  const current = db.prepare(`SELECT id FROM classes WHERE id = ? AND deleted_at IS NULL`).get(id);
  if (!current) {
    throw new AppError('NOT_FOUND', 404, 'Sınıf bulunamadı.');
  }

  // Aktif öğrencisi olan sınıf silinemez.
  const active = db
    .prepare(
      `SELECT COUNT(*) AS c FROM enrollments
       WHERE class_id = ? AND end_date IS NULL`,
    )
    .get(id) as { c: number };
  if (active.c > 0) {
    throw new AppError(
      'CONFLICT',
      409,
      'Bu sınıfta aktif öğrenci var, önce öğrencileri taşıyın.',
    );
  }

  db.prepare(`UPDATE classes SET deleted_at = ? WHERE id = ?`).run(
    new Date().toISOString(),
    id,
  );
  res.status(204).end();
});

// ---------- Ders ----------

const courseSchema = z.object({
  name: z.string().trim().min(1, 'Ders adı boş olamaz.'),
});

router.get('/courses', (req, res) => {
  const q = typeof req.query.q === 'string' ? normalizeTurkish(req.query.q.trim()) : '';
  const rows = q
    ? db
        .prepare(
          `SELECT * FROM courses WHERE deleted_at IS NULL AND name_normalized LIKE ?
           ORDER BY name`,
        )
        .all(`%${q}%`)
    : db.prepare(`SELECT * FROM courses WHERE deleted_at IS NULL ORDER BY name`).all();
  res.json({ items: rows });
});

router.post('/courses', (req, res) => {
  const { name } = courseSchema.parse(req.body);

  const clash = db
    .prepare(`SELECT id FROM courses WHERE name_normalized = ? AND deleted_at IS NULL`)
    .get(normalizeTurkish(name));
  if (clash) {
    throw new AppError('CONFLICT', 409, 'Bu ders adı zaten var.');
  }

  const id = randomUUID();
  db.prepare(
    `INSERT INTO courses (id, name, name_normalized, deleted_at)
     VALUES (?, ?, ?, NULL)`,
  ).run(id, name, normalizeTurkish(name));
  const row = db.prepare(`SELECT * FROM courses WHERE id = ?`).get(id);
  res.status(201).json(row);
});

const coursePatchSchema = z.object({
  name: z.string().trim().min(1).optional(),
});

router.patch('/courses/:id', (req, res) => {
  const { id } = req.params;
  const input = coursePatchSchema.parse(req.body);

  const current = db.prepare(`SELECT id FROM courses WHERE id = ? AND deleted_at IS NULL`).get(id);
  if (!current) {
    throw new AppError('NOT_FOUND', 404, 'Ders bulunamadı.');
  }

  if (input.name !== undefined) {
    const clash = db
      .prepare(
        `SELECT id FROM courses WHERE name_normalized = ? AND id != ? AND deleted_at IS NULL`,
      )
      .get(normalizeTurkish(input.name), id);
    if (clash) {
      throw new AppError('CONFLICT', 409, 'Bu ders adı zaten var.');
    }
    db.prepare(`UPDATE courses SET name = ?, name_normalized = ? WHERE id = ?`).run(
      input.name,
      normalizeTurkish(input.name),
      id,
    );
  }

  const row = db.prepare(`SELECT * FROM courses WHERE id = ?`).get(id);
  res.json(row);
});

router.delete('/courses/:id', (req, res) => {
  const { id } = req.params;
  const current = db.prepare(`SELECT id FROM courses WHERE id = ? AND deleted_at IS NULL`).get(id);
  if (!current) {
    throw new AppError('NOT_FOUND', 404, 'Ders bulunamadı.');
  }

  const used = db
    .prepare(
      `SELECT COUNT(*) AS c FROM class_courses WHERE course_id = ? AND deleted_at IS NULL`,
    )
    .get(id) as { c: number };
  if (used.c > 0) {
    throw new AppError(
      'CONFLICT',
      409,
      'Bu ders bir sınıfa atanmış, önce atamayı kaldırın.',
    );
  }

  db.prepare(`UPDATE courses SET deleted_at = ? WHERE id = ?`).run(
    new Date().toISOString(),
    id,
  );
  res.status(204).end();
});

// ---------- Atamalar (class_courses) ----------

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

// ---------- Öğretmen ----------

const teacherSchema = z.object({
  full_name: z.string().trim().min(1, 'Ad boş olamaz.'),
  email: z.string().trim().email('Geçerli bir e-posta adresi girin.'),
  phone: z.string().trim().min(10, 'Geçerli bir telefon numarası girin.'),
  password: z.string().min(6, 'Şifre en az 6 karakter olmalı.'),
});

router.get('/teachers', (req, res) => {
  const pagination = parsePagination(req.query);
  const q = typeof req.query.q === 'string' ? normalizeTurkish(req.query.q.trim()) : '';

  const where = [`role = 'teacher'`, `deleted_at IS NULL`];
  const values: Array<string | number> = [];
  if (q) {
    where.push(`(full_name_normalized LIKE ? OR email LIKE ?)`);
    values.push(`%${q}%`, `%${q}%`);
  }

  const total = (
    db.prepare(`SELECT COUNT(*) AS c FROM users WHERE ${where.join(' AND ')}`).get(...values) as {
      c: number;
    }
  ).c;

  const rows = db
    .prepare(
      `SELECT id, full_name, email, phone, is_active, created_at
       FROM users
       WHERE ${where.join(' AND ')}
       ORDER BY full_name
       LIMIT ? OFFSET ?`,
    )
    .all(...values, pagination.limit, pagination.offset);

  res.json(paged(rows, total, pagination));
});

router.post(
  '/teachers',
  asyncHandler(async (req, res) => {
    const input = teacherSchema.parse(req.body);
    const email = input.email.trim();
    const phone = normalizePhone(input.phone);

    const clash = db
      .prepare(
        `SELECT id FROM users
         WHERE (email = ? OR phone = ?) AND deleted_at IS NULL`,
      )
      .get(email, phone);
    if (clash) {
      throw new AppError(
        'CONFLICT',
        409,
        'Bu e-posta veya telefon ile kayıtlı bir kullanıcı var.',
      );
    }

    const id = randomUUID();
    const passwordHash = await hashPassword(input.password);
    db.prepare(
      `INSERT INTO users
         (id, full_name, full_name_normalized, phone, email, password_hash, role,
          is_active, token_version, deleted_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 'teacher', 1, 1, NULL, ?)`,
    ).run(
      id,
      input.full_name,
      normalizeTurkish(input.full_name),
      phone,
      email,
      passwordHash,
      new Date().toISOString(),
    );

    const row = db
      .prepare(
        `SELECT id, full_name, email, phone, is_active, created_at FROM users WHERE id = ?`,
      )
      .get(id);
    res.status(201).json(row);
  }),
);

const teacherPatchSchema = z.object({
  full_name: z.string().trim().min(1).optional(),
  email: z.string().trim().email().optional(),
  phone: z.string().trim().min(10).optional(),
});

router.patch('/teachers/:id', (req, res) => {
  const { id } = req.params;
  const input = teacherPatchSchema.parse(req.body);

  const current = db
    .prepare(`SELECT id FROM users WHERE id = ? AND role = 'teacher' AND deleted_at IS NULL`)
    .get(id);
  if (!current) {
    throw new AppError('NOT_FOUND', 404, 'Öğretmen bulunamadı.');
  }

  const phone = input.phone !== undefined ? normalizePhone(input.phone) : undefined;
  if (phone !== undefined || input.email !== undefined) {
    const clash = db
      .prepare(
        `SELECT id FROM users
         WHERE (email = ? OR phone = ?) AND id != ? AND deleted_at IS NULL`,
      )
      .get(input.email ?? null, phone ?? null, id);
    if (clash) {
      throw new AppError(
        'CONFLICT',
        409,
        'Bu e-posta veya telefon ile kayıtlı bir kullanıcı var.',
      );
    }
  }

  const sets: string[] = [];
  const values: Array<string | number> = [];
  if (input.full_name !== undefined) {
    sets.push(`full_name = ?`, `full_name_normalized = ?`);
    values.push(input.full_name, normalizeTurkish(input.full_name));
  }
  if (input.email !== undefined) {
    sets.push(`email = ?`);
    values.push(input.email);
  }
  if (phone !== undefined) {
    sets.push(`phone = ?`);
    values.push(phone);
  }
  if (sets.length > 0) {
    values.push(id);
    db.prepare(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`).run(...values);
  }

  const row = db
    .prepare(
      `SELECT id, full_name, email, phone, is_active, created_at FROM users WHERE id = ?`,
    )
    .get(id);
  res.json(row);
});

const resetPasswordSchema = z.object({
  password: z.string().min(6, 'Şifre en az 6 karakter olmalı.'),
});

router.post(
  '/teachers/:id/reset-password',
  asyncHandler<{ id: string }>(async (req, res) => {
    const { id } = req.params;
    const { password } = resetPasswordSchema.parse(req.body);

    const current = db
      .prepare(`SELECT id FROM users WHERE id = ? AND role = 'teacher' AND deleted_at IS NULL`)
      .get(id);
    if (!current) {
      throw new AppError('NOT_FOUND', 404, 'Öğretmen bulunamadı.');
    }

    const passwordHash = await hashPassword(password);
    // Şifre değişince token_version +1 — mevcut oturumlar 401 alır.
    db.prepare(
      `UPDATE users SET password_hash = ?, token_version = token_version + 1 WHERE id = ?`,
    ).run(passwordHash, id);

    writeAuditLog({
      actorId: req.user!.id,
      action: 'teacher.password_reset',
      entityType: 'user',
      entityId: id,
    });

    res.json({ message: 'Şifre güncellendi.' });
  }),
);

router.delete('/teachers/:id', (req, res) => {
  const { id } = req.params;
  const current = db
    .prepare(`SELECT id FROM users WHERE id = ? AND role = 'teacher' AND deleted_at IS NULL`)
    .get(id);
  if (!current) {
    throw new AppError('NOT_FOUND', 404, 'Öğretmen bulunamadı.');
  }

  // Aktif ataması olan öğretmen silinemez — raporlar sahipsiz kalır.
  const activeAssignments = db
    .prepare(
      `SELECT COUNT(*) AS c FROM class_courses
       WHERE teacher_id = ? AND deleted_at IS NULL`,
    )
    .get(id) as { c: number };
  if (activeAssignments.c > 0) {
    throw new AppError(
      'CONFLICT',
      409,
      'Bu öğretmenin aktif atamaları var, önce atamaları kaldırın.',
    );
  }

  db.prepare(
    `UPDATE users SET deleted_at = ?, token_version = token_version + 1 WHERE id = ?`,
  ).run(new Date().toISOString(), id);

  writeAuditLog({
    actorId: req.user!.id,
    action: 'teacher.delete',
    entityType: 'user',
    entityId: id,
  });

  res.status(204).end();
});

// ---------- Admin ekleme ----------

const adminSchema = z.object({
  full_name: z.string().trim().min(1, 'Ad boş olamaz.'),
  email: z.string().trim().email('Geçerli bir e-posta adresi girin.'),
  phone: z.string().trim().min(10, 'Geçerli bir telefon numarası girin.'),
  password: z.string().min(6, 'Şifre en az 6 karakter olmalı.'),
});

router.post(
  '/admins',
  asyncHandler(async (req, res) => {
    const input = adminSchema.parse(req.body);
    const email = input.email.trim();
    const phone = normalizePhone(input.phone);

    const clash = db
      .prepare(
        `SELECT id FROM users
         WHERE (email = ? OR phone = ?) AND deleted_at IS NULL`,
      )
      .get(email, phone);
    if (clash) {
      throw new AppError(
        'CONFLICT',
        409,
        'Bu e-posta veya telefon ile kayıtlı bir kullanıcı var.',
      );
    }

    const id = randomUUID();
    const passwordHash = await hashPassword(input.password);
    db.prepare(
      `INSERT INTO users
         (id, full_name, full_name_normalized, phone, email, password_hash, role,
          is_active, token_version, deleted_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 'admin', 1, 1, NULL, ?)`,
    ).run(
      id,
      input.full_name,
      normalizeTurkish(input.full_name),
      phone,
      email,
      passwordHash,
      new Date().toISOString(),
    );

    // spec.md §2: "Admin başka admin ekleyebilir; bu işlem audit_logs'a yazılır."
    writeAuditLog({
      actorId: req.user!.id,
      action: 'user.create',
      entityType: 'user',
      entityId: id,
      diff: { role: 'admin', email },
    });

    const row = db
      .prepare(
        `SELECT id, full_name, email, phone, is_active, created_at FROM users WHERE id = ?`,
      )
      .get(id);
    res.status(201).json(row);
  }),
);

export default router;

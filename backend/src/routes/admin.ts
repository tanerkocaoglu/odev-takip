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
import { nextUsername } from '../utils/username.js';
import { writeAuditLog } from '../services/audit.js';
import { parsePagination, paged } from '../utils/pagination.js';
import { getPreviousWeek, type WeekRecord } from '../utils/weeks.js';

/** Yerel takvimde bir gün öncesi (YYYY-MM-DD) — UTC çıkarımı yapılmaz. */
function prevDay(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  date.setDate(date.getDate() - 1);
  const py = date.getFullYear();
  const pm = String(date.getMonth() + 1).padStart(2, '0');
  const pd = String(date.getDate()).padStart(2, '0');
  return `${py}-${pm}-${pd}`;
}

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
      `SELECT id, full_name, email, is_active, created_at
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

    const clash = db
      .prepare(
        `SELECT id FROM users
         WHERE email = ? AND deleted_at IS NULL`,
      )
      .get(email);
    if (clash) {
      throw new AppError(
        'CONFLICT',
        409,
        'Bu e-posta ile kayıtlı bir kullanıcı var.',
      );
    }

    const id = randomUUID();
    const passwordHash = await hashPassword(input.password);
    db.prepare(
      `INSERT INTO users
         (id, full_name, full_name_normalized, username, email, password_hash, role,
          is_active, token_version, deleted_at, created_at)
       VALUES (?, ?, ?, NULL, ?, ?, 'teacher', 1, 1, NULL, ?)`,
    ).run(
      id,
      input.full_name,
      normalizeTurkish(input.full_name),
      email,
      passwordHash,
      new Date().toISOString(),
    );

    const row = db
      .prepare(
        `SELECT id, full_name, email, is_active, created_at FROM users WHERE id = ?`,
      )
      .get(id);
    res.status(201).json(row);
  }),
);

const teacherPatchSchema = z.object({
  full_name: z.string().trim().min(1).optional(),
  email: z.string().trim().email().optional(),
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

  if (input.email !== undefined) {
    const clash = db
      .prepare(
        `SELECT id FROM users
         WHERE email = ? AND id != ? AND deleted_at IS NULL`,
      )
      .get(input.email, id);
    if (clash) {
      throw new AppError(
        'CONFLICT',
        409,
        'Bu e-posta ile kayıtlı bir kullanıcı var.',
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
  if (sets.length > 0) {
    values.push(id);
    db.prepare(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`).run(...values);
  }

  const row = db
    .prepare(
      `SELECT id, full_name, email, is_active, created_at FROM users WHERE id = ?`,
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
  password: z.string().min(6, 'Şifre en az 6 karakter olmalı.'),
});

router.post(
  '/admins',
  asyncHandler(async (req, res) => {
    const input = adminSchema.parse(req.body);
    const email = input.email.trim();

    const clash = db
      .prepare(
        `SELECT id FROM users
         WHERE email = ? AND deleted_at IS NULL`,
      )
      .get(email);
    if (clash) {
      throw new AppError(
        'CONFLICT',
        409,
        'Bu e-posta ile kayıtlı bir kullanıcı var.',
      );
    }

    const id = randomUUID();
    const passwordHash = await hashPassword(input.password);
    db.prepare(
      `INSERT INTO users
         (id, full_name, full_name_normalized, username, email, password_hash, role,
          is_active, token_version, deleted_at, created_at)
       VALUES (?, ?, ?, NULL, ?, ?, 'admin', 1, 1, NULL, ?)`,
    ).run(
      id,
      input.full_name,
      normalizeTurkish(input.full_name),
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
        `SELECT id, full_name, email, is_active, created_at FROM users WHERE id = ?`,
      )
      .get(id);
    res.status(201).json(row);
  }),
);

// ---------- Veli ----------

const guardianSchema = z.object({
  full_name: z.string().trim().min(1, 'Ad boş olamaz.'),
  whatsapp_phone: z.string().trim().min(10, 'Geçerli bir WhatsApp numarası girin.'),
  phone_secondary: z.string().trim().min(10).optional().nullable(),
  password: z.string().min(6, 'Şifre en az 6 karakter olmalı.'),
});

router.get('/guardians', (req, res) => {
  const pagination = parsePagination(req.query);
  const q = typeof req.query.q === 'string' ? normalizeTurkish(req.query.q.trim()) : '';

  const where = [`u.role = 'guardian'`, `u.deleted_at IS NULL`];
  const values: Array<string | number> = [];
  if (q) {
    where.push(`u.full_name_normalized LIKE ?`);
    values.push(`%${q}%`);
  }

  const total = (
    db
      .prepare(
        `SELECT COUNT(*) AS c FROM users u WHERE ${where.join(' AND ')}`,
      )
      .get(...values) as { c: number }
  ).c;

  const rows = db
    .prepare(
      `SELECT g.id AS id, u.id AS user_id, u.full_name, u.username, u.email, u.is_active,
              g.whatsapp_phone, g.phone_secondary, g.consent_at,
              (SELECT COUNT(*) FROM students s
                WHERE s.guardian_id = g.id AND s.deleted_at IS NULL) AS child_count
       FROM users u
       JOIN guardians g ON g.user_id = u.id AND g.deleted_at IS NULL
       WHERE ${where.join(' AND ')}
       ORDER BY u.full_name
       LIMIT ? OFFSET ?`,
    )
    .all(...values, pagination.limit, pagination.offset);

  res.json(paged(rows, total, pagination));
});

router.post(
  '/guardians',
  asyncHandler(async (req, res) => {
    const input = guardianSchema.parse(req.body);
    const whatsapp = normalizePhone(input.whatsapp_phone);
    const secondary = input.phone_secondary ? normalizePhone(input.phone_secondary) : null;

    const userId = randomUUID();
    const guardianId = randomUUID();
    const username = nextUsername('guardian');
    const passwordHash = await hashPassword(input.password);
    const now = new Date().toISOString();

    db.exec('BEGIN');
    try {
      db.prepare(
        `INSERT INTO users
           (id, full_name, full_name_normalized, username, email, password_hash, role,
            is_active, token_version, deleted_at, created_at)
         VALUES (?, ?, ?, ?, NULL, ?, 'guardian', 1, 1, NULL, ?)`,
      ).run(userId, input.full_name, normalizeTurkish(input.full_name), username, passwordHash, now);

      db.prepare(
        `INSERT INTO guardians (id, user_id, whatsapp_phone, phone_secondary, consent_at, deleted_at)
         VALUES (?, ?, ?, ?, NULL, NULL)`,
      ).run(guardianId, userId, whatsapp, secondary);
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }

    const row = db
      .prepare(
        `SELECT g.id AS id, u.id AS user_id, u.full_name, u.username, g.whatsapp_phone, g.phone_secondary
         FROM users u JOIN guardians g ON g.user_id = u.id WHERE u.id = ?`,
      )
      .get(userId);
    res.status(201).json(row);
  }),
);

const guardianPatchSchema = z.object({
  full_name: z.string().trim().min(1).optional(),
  whatsapp_phone: z.string().trim().min(10).optional(),
  phone_secondary: z.string().trim().min(10).optional().nullable(),
});

router.patch('/guardians/:id', (req, res) => {
  const { id } = req.params;
  const input = guardianPatchSchema.parse(req.body);

  const current = db
    .prepare(
      `SELECT g.id, g.user_id FROM users u
       JOIN guardians g ON g.user_id = u.id AND g.deleted_at IS NULL
       WHERE g.id = ? AND u.role = 'guardian' AND u.deleted_at IS NULL`,
    )
    .get(id) as { id: string; user_id: string } | undefined;
  if (!current) {
    throw new AppError('NOT_FOUND', 404, 'Veli bulunamadı.');
  }

  const userSets: string[] = [];
  const userValues: Array<string | number> = [];
  if (input.full_name !== undefined) {
    userSets.push(`full_name = ?`, `full_name_normalized = ?`);
    userValues.push(input.full_name, normalizeTurkish(input.full_name));
  }
  if (userSets.length > 0) {
    userValues.push(current.user_id);
    db.prepare(`UPDATE users SET ${userSets.join(', ')} WHERE id = ?`).run(...userValues);
  }

  // whatsapp_phone zorunludur (spec.md §3.1): oluşturmada gerekir; güncellemede
  // opsiyonel-ama-null-olamaz — kısmi güncelleme (yalnızca phone_secondary) bozulmaz,
  // gönderilirse boş/null olamaz.
  const guardianSets: string[] = [];
  const guardianValues: Array<string | null> = [];
  for (const key of ['whatsapp_phone', 'phone_secondary'] as const) {
    const value = input[key];
    if (value !== undefined) {
      guardianSets.push(`${key} = ?`);
      guardianValues.push(value ? normalizePhone(value) : null);
    }
  }
  if (guardianSets.length > 0) {
    guardianValues.push(current.id);
    db.prepare(
      `UPDATE guardians SET ${guardianSets.join(', ')} WHERE id = ?`,
    ).run(...guardianValues);
  }

  const row = db
    .prepare(
      `SELECT g.id AS id, u.id AS user_id, u.full_name, u.username, g.whatsapp_phone, g.phone_secondary
       FROM users u JOIN guardians g ON g.user_id = u.id WHERE g.id = ?`,
    )
    .get(id);
  res.json(row);
});

// Şifre sıfırlama — spec.md §2.1: veli/öğrenci e-posta/SMS kanalı olmadığından
// unutulan şifrenin tek kurtuluşu admin reset-password'tür. token_version +1
// ile mevcut oturumlar biter. Öğretmen deseniyle birebir (resetPasswordSchema
// yukarıda tanımlı).
router.post(
  '/guardians/:id/reset-password',
  asyncHandler<{ id: string }>(async (req, res) => {
    const { id } = req.params;
    const { password } = resetPasswordSchema.parse(req.body);

    const current = db
      .prepare(
        `SELECT g.user_id FROM users u
         JOIN guardians g ON g.user_id = u.id AND g.deleted_at IS NULL
         WHERE g.id = ? AND u.role = 'guardian' AND u.deleted_at IS NULL`,
      )
      .get(id) as { user_id: string } | undefined;
    if (!current) {
      throw new AppError('NOT_FOUND', 404, 'Veli bulunamadı.');
    }

    const passwordHash = await hashPassword(password);
    db.prepare(
      `UPDATE users SET password_hash = ?, token_version = token_version + 1 WHERE id = ?`,
    ).run(passwordHash, current.user_id);

    writeAuditLog({
      actorId: req.user!.id,
      action: 'guardian.password_reset',
      entityType: 'guardian',
      entityId: id,
    });

    res.json({ message: 'Şifre güncellendi.' });
  }),
);

router.delete('/guardians/:id', (req, res) => {
  const { id } = req.params;
  const current = db
    .prepare(
      `SELECT g.id, g.user_id FROM users u
       JOIN guardians g ON g.user_id = u.id AND g.deleted_at IS NULL
       WHERE g.id = ? AND u.role = 'guardian' AND u.deleted_at IS NULL`,
    )
    .get(id) as { id: string; user_id: string } | undefined;
  if (!current) {
    throw new AppError('NOT_FOUND', 404, 'Veli bulunamadı.');
  }

  // Çocuğu olan veli silinemez.
  const children = db
    .prepare(
      `SELECT COUNT(*) AS c FROM students
       WHERE guardian_id = ? AND deleted_at IS NULL`,
    )
    .get(current.id) as { c: number };
  if (children.c > 0) {
    throw new AppError(
      'CONFLICT',
      409,
      'Bu velinin kayıtlı öğrencileri var, silinemez.',
    );
  }

  const now = new Date().toISOString();
  db.exec('BEGIN');
  try {
    db.prepare(
      `UPDATE users SET deleted_at = ?, token_version = token_version + 1 WHERE id = ?`,
    ).run(now, current.user_id);
    db.prepare(`UPDATE guardians SET deleted_at = ? WHERE id = ?`).run(now, current.id);
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }

  writeAuditLog({
    actorId: req.user!.id,
    action: 'guardian.delete',
    entityType: 'guardian',
    entityId: current.id,
  });

  res.status(204).end();
});

// ---------- Öğrenci ----------

const studentSchema = z.object({
  full_name: z.string().trim().min(1, 'Ad boş olamaz.'),
  guardian_id: z.string().trim().min(1),
  class_id: z.string().trim().min(1),
  password: z.string().min(6, 'Şifre en az 6 karakter olmalı.'),
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
              s.id AS student_id, s.guardian_id,
              gu.full_name AS guardian_name,
              c.name AS class_name, e.class_id
       FROM users u
       JOIN students s ON s.user_id = u.id AND s.deleted_at IS NULL
       JOIN enrollments e ON e.student_id = s.id AND e.end_date IS NULL
       LEFT JOIN guardians g ON g.id = s.guardian_id AND g.deleted_at IS NULL
       LEFT JOIN users gu ON gu.id = g.user_id
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
      .prepare(`SELECT id FROM classes WHERE id = ? AND deleted_at IS NULL`)
      .get(input.class_id);
    if (!cls) {
      throw new AppError('NOT_FOUND', 404, 'Sınıf bulunamadı.');
    }

    const userId = randomUUID();
    const studentId = randomUUID();
    const enrollmentId = randomUUID();
    const username = nextUsername('student');
    const passwordHash = await hashPassword(input.password);
    const now = new Date().toISOString();
    const today = now.slice(0, 10);

    db.exec('BEGIN');
    try {
      db.prepare(
        `INSERT INTO users
           (id, full_name, full_name_normalized, username, email, password_hash, role,
            is_active, token_version, deleted_at, created_at)
         VALUES (?, ?, ?, ?, NULL, ?, 'student', 1, 1, NULL, ?)`,
      ).run(userId, input.full_name, normalizeTurkish(input.full_name), username, passwordHash, now);

      db.prepare(
        `INSERT INTO students (id, user_id, guardian_id, deleted_at)
         VALUES (?, ?, ?, NULL)`,
      ).run(studentId, userId, input.guardian_id);

      db.prepare(
        `INSERT INTO enrollments (id, student_id, class_id, start_date, end_date)
         VALUES (?, ?, ?, ?, NULL)`,
      ).run(enrollmentId, studentId, input.class_id, today);
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

  if (input.guardian_id !== undefined) {
    db.prepare(`UPDATE students SET guardian_id = ? WHERE user_id = ?`).run(
      input.guardian_id,
      id,
    );
  }

  const row = db
    .prepare(
      `SELECT u.id, u.full_name, u.username, s.id AS student_id, s.guardian_id
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
      `UPDATE users SET password_hash = ?, token_version = token_version + 1 WHERE id = ?`,
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

export default router;

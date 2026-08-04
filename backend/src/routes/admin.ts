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

export default router;

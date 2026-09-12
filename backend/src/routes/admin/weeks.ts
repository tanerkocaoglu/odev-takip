/**
 * Hafta rotaları — `/api/v1/admin/weeks*` (spec.md §3).
 * `week_no` düzenlenemez — yalnızca tarih/label (aritmetiği bozmamak için).
 */

import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { db } from '../../db/index.js';
import { AppError } from '../../errors.js';

const router = Router();

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

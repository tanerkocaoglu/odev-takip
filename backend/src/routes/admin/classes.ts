/**
 * Sınıf rotaları — `/api/v1/admin/classes*` (spec.md §3).
 * `classes` dershane grubudur (okul değil — bkz. `schools.ts`).
 */

import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { db } from '../../db/index.js';
import { AppError } from '../../errors.js';
import { normalizeTurkish } from '../../utils/text.js';

const router = Router();

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

export default router;

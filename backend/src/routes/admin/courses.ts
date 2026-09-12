/**
 * Ders rotaları — `/api/v1/admin/courses*` (spec.md §3).
 */

import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { db } from '../../db/index.js';
import { AppError } from '../../errors.js';
import { normalizeTurkish } from '../../utils/text.js';

const router = Router();

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

export default router;

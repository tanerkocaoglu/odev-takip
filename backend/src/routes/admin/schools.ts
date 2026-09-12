/**
 * Okul rotaları — `/api/v1/admin/schools*` (migration #6).
 * `classes`/`courses` deseninin birebir kopyası. Arayüzde "Okul" olarak
 * anılır (spec §3.1 terim uyarısı — `classes` dershane grubudur).
 */

import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { db } from '../../db/index.js';
import { AppError } from '../../errors.js';
import { normalizeTurkish } from '../../utils/text.js';

const router = Router();

const schoolSchema = z.object({
  name: z.string().trim().min(1, 'Okul adı boş olamaz.'),
});

router.get('/schools', (req, res) => {
  const q = typeof req.query.q === 'string' ? normalizeTurkish(req.query.q.trim()) : '';
  const rows = q
    ? db
        .prepare(
          `SELECT * FROM schools WHERE deleted_at IS NULL AND name_normalized LIKE ?
           ORDER BY name`,
        )
        .all(`%${q}%`)
    : db.prepare(`SELECT * FROM schools WHERE deleted_at IS NULL ORDER BY name`).all();
  res.json({ items: rows });
});

router.post('/schools', (req, res) => {
  const { name } = schoolSchema.parse(req.body);

  const clash = db
    .prepare(`SELECT id FROM schools WHERE name_normalized = ? AND deleted_at IS NULL`)
    .get(normalizeTurkish(name));
  if (clash) {
    throw new AppError('CONFLICT', 409, 'Bu okul adı zaten var.');
  }

  const id = randomUUID();
  db.prepare(
    `INSERT INTO schools (id, name, name_normalized, deleted_at)
     VALUES (?, ?, ?, NULL)`,
  ).run(id, name, normalizeTurkish(name));
  const row = db.prepare(`SELECT * FROM schools WHERE id = ?`).get(id);
  res.status(201).json(row);
});

const schoolPatchSchema = z.object({
  name: z.string().trim().min(1).optional(),
});

router.patch('/schools/:id', (req, res) => {
  const { id } = req.params;
  const input = schoolPatchSchema.parse(req.body);

  const current = db
    .prepare(`SELECT id FROM schools WHERE id = ? AND deleted_at IS NULL`)
    .get(id);
  if (!current) {
    throw new AppError('NOT_FOUND', 404, 'Okul bulunamadı.');
  }

  if (input.name !== undefined) {
    const clash = db
      .prepare(
        `SELECT id FROM schools WHERE name_normalized = ? AND id != ? AND deleted_at IS NULL`,
      )
      .get(normalizeTurkish(input.name), id);
    if (clash) {
      throw new AppError('CONFLICT', 409, 'Bu okul adı zaten var.');
    }
    db.prepare(`UPDATE schools SET name = ?, name_normalized = ? WHERE id = ?`).run(
      input.name,
      normalizeTurkish(input.name),
      id,
    );
  }

  const row = db.prepare(`SELECT * FROM schools WHERE id = ?`).get(id);
  res.json(row);
});

router.delete('/schools/:id', (req, res) => {
  const { id } = req.params;
  const current = db
    .prepare(`SELECT id FROM schools WHERE id = ? AND deleted_at IS NULL`)
    .get(id);
  if (!current) {
    throw new AppError('NOT_FOUND', 404, 'Okul bulunamadı.');
  }

  const used = db
    .prepare(
      `SELECT COUNT(*) AS c FROM students WHERE school_id = ? AND deleted_at IS NULL`,
    )
    .get(id) as { c: number };
  if (used.c > 0) {
    throw new AppError('CONFLICT', 409, 'Bu okula öğrenci bağlı, önce öğrenciyi düzenleyin.');
  }

  db.prepare(`UPDATE schools SET deleted_at = ? WHERE id = ?`).run(
    new Date().toISOString(),
    id,
  );
  res.status(204).end();
});

export default router;

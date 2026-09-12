/**
 * Öğretmen rotaları — `/api/v1/admin/teachers*` (spec.md §2, §6).
 */

import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { db } from '../../db/index.js';
import { AppError } from '../../errors.js';
import { normalizeTurkish } from '../../utils/text.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { hashPassword } from '../../utils/hash.js';
import { writeAuditLog } from '../../services/audit.js';
import { parsePagination, paged } from '../../utils/pagination.js';
import { resetPasswordSchema } from './shared.js';

const router = Router();

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

// ---------- Öğretmen atamalarını devretme ----------

const transferSchema = z.object({
  target_teacher_id: z.string().trim().min(1, 'Hedef öğretmen seçilmedi.'),
});

/**
 * POST /admin/teachers/:id/transfer-assignments — öğretmenin TÜM atamalarını
 * tek hedef öğretmene devreder (tek transaction; per-atama audit).
 *
 * Ayrılan öğretmen akışı: önce "atamaları devret", sonra "sil" —
 * `DELETE /teachers/:id` 409'dan 204'e döner. Tasarım kararı (spec §2):
 * geçmiş raporlar atamayı izler, yeni öğretmen o atamaların geçmiş raporlarını
 * görür; eski öğretmen erişemez.
 */
router.post('/teachers/:id/transfer-assignments', (req, res) => {
  const user = req.user!;
  const sourceId = req.params.id;
  const { target_teacher_id } = transferSchema.parse(req.body);

  const source = db
    .prepare(
      `SELECT id FROM users WHERE id = ? AND role = 'teacher' AND deleted_at IS NULL`,
    )
    .get(sourceId);
  if (!source) {
    throw new AppError('NOT_FOUND', 404, 'Öğretmen bulunamadı.');
  }
  const target = db
    .prepare(
      `SELECT id FROM users WHERE id = ? AND role = 'teacher' AND deleted_at IS NULL`,
    )
    .get(target_teacher_id);
  if (!target) {
    throw new AppError('NOT_FOUND', 404, 'Hedef öğretmen bulunamadı.');
  }
  if (sourceId === target_teacher_id) {
    throw new AppError('CONFLICT', 409, 'Kaynak ve hedef öğretmen aynı.');
  }

  const ccRows = db
    .prepare(
      `SELECT id FROM class_courses WHERE teacher_id = ? AND deleted_at IS NULL`,
    )
    .all(sourceId) as Array<{ id: string }>;
  if (ccRows.length === 0) {
    throw new AppError('CONFLICT', 409, 'Devredilecek atama yok.');
  }

  db.exec('BEGIN');
  try {
    db.prepare(
      `UPDATE class_courses SET teacher_id = ?
       WHERE teacher_id = ? AND deleted_at IS NULL`,
    ).run(target_teacher_id, sourceId);
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }

  for (const cc of ccRows) {
    writeAuditLog({
      actorId: user.id,
      action: 'class_course.teacher_reassign',
      entityType: 'class_course',
      entityId: cc.id,
      diff: { from_teacher_id: sourceId, to_teacher_id: target_teacher_id },
    });
  }

  res.json({ reassigned: ccRows.length });
});

export default router;

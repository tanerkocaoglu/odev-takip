/**
 * Veli rotaları — `/api/v1/admin/guardians*` (spec.md §3.1, §2.1).
 * `whatsapp_phone` zorunludur (fallback yok); `username` isim tabanlı otomatik.
 */

import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { db } from '../../db/index.js';
import { AppError } from '../../errors.js';
import { normalizeTurkish } from '../../utils/text.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { hashPassword } from '../../utils/hash.js';
import { normalizePhone } from '../../utils/phone.js';
import { nextUsername } from '../../utils/username.js';
import { writeAuditLog } from '../../services/audit.js';
import { parsePagination, paged } from '../../utils/pagination.js';
import { guardiansExportCsv } from '../../services/csvExport.js';
import { resetPasswordSchema, sendCsv } from './shared.js';

const router = Router();

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
    const username = nextUsername(input.full_name);
    const passwordHash = await hashPassword(input.password);
    const now = new Date().toISOString();

    db.exec('BEGIN');
    try {
      db.prepare(
        `INSERT INTO users
           (id, full_name, full_name_normalized, username, email, password_hash, role,
            is_active, token_version, must_change_password, deleted_at, created_at)
         VALUES (?, ?, ?, ?, NULL, ?, 'guardian', 1, 1, 1, NULL, ?)`,
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
  // KVKK açık rızası: true → şimdiki zamanı yaz, false → null'a sıfırla
  consent_at: z.boolean().optional(),
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
  if (input.consent_at !== undefined) {
    guardianSets.push(`consent_at = ?`);
    guardianValues.push(input.consent_at ? new Date().toISOString() : null);
  }
  if (guardianSets.length > 0) {
    guardianValues.push(current.id);
    db.prepare(
      `UPDATE guardians SET ${guardianSets.join(', ')} WHERE id = ?`,
    ).run(...guardianValues);
  }

  const row = db
    .prepare(
      `SELECT g.id AS id, u.id AS user_id, u.full_name, u.username, g.whatsapp_phone, g.phone_secondary, g.consent_at
       FROM users u JOIN guardians g ON g.user_id = u.id WHERE g.id = ?`,
    )
    .get(id);
  res.json(row);
});

// Şifre sıfırlama — spec.md §2.1: veli/öğrenci e-posta/SMS kanalı olmadığından
// unutulan şifrenin tek kurtuluşu admin reset-password'tür. token_version +1
// ile mevcut oturumlar biter. Öğretmen deseniyle birebir (`resetPasswordSchema`
// `shared.ts`'te tanımlı).
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
      `UPDATE users SET password_hash = ?, must_change_password = 1, token_version = token_version + 1 WHERE id = ?`,
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

/** CSV dışa aktarma — GET /admin/guardians/export (spec §5.7). */
router.get('/guardians/export', (req, res) => {
  const q = typeof req.query.q === 'string' ? req.query.q : undefined;
  sendCsv(res, 'veliler.csv', guardiansExportCsv({ q }));
});

export default router;

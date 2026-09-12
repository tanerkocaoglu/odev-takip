/**
 * Admin ekleme rotası — `POST /api/v1/admin/admins` (spec.md §2).
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

const router = Router();

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

export default router;

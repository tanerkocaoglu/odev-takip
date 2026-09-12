/**
 * Toplu öğrenci içe aktarma rotaları — `/api/v1/admin/students/import*`
 * (spec.md §5.6). Rate limit → multer sırası korunur (Bulgu #7/#8).
 */

import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { AppError } from '../../errors.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { hashPassword } from '../../utils/hash.js';
import { writeAuditLog } from '../../services/audit.js';
import { rateLimit } from '../../middleware/rateLimit.js';
import { csvUploadSingle } from '../../middleware/upload.js';
import {
  commitImport,
  prepareImportFromBuffer,
  studentImportTemplateCsv,
} from '../../services/studentImport.js';
import { ADMIN_IMPORT_RATE_LIMIT_MAX, EXPENSIVE_OP_WINDOW_MS } from './shared.js';

const router = Router();

/** Boş CSV şablonu (başlık satırı, UTF-8 BOM'lu). */
router.get('/students/import/template', (_req, res) => {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader(
    'Content-Disposition',
    'attachment; filename="ogrenci-ice-aktarma-sablonu.csv"',
  );
  res.send(studentImportTemplateCsv());
});

/**
 * POST /admin/students/import?dry_run=true|false
 * `dry_run=true` → yalnızca doğrular (hiçbir şey yazmaz), özet + hata/uyarı
 * döner. `dry_run=false` → yeniden doğrular ve tek transaction'da yazar
 * (hepsi ya da hiçbiri). Satır hatası varsa commit **400 VALIDATION_ERROR**
 * döner (`error.details.errors` satır listesi) ve hiçbir kayıt oluşmaz.
 */
router.post(
  '/students/import',
  rateLimit({
    windowMs: EXPENSIVE_OP_WINDOW_MS,
    max: ADMIN_IMPORT_RATE_LIMIT_MAX,
    keyFn: (req) => `admin-import:${req.user!.id}`,
    message:
      'Çok fazla öğrenci içe aktarma isteği yapıldı, lütfen bir süre sonra tekrar deneyin.',
  }),
  csvUploadSingle,
  asyncHandler(async (req, res) => {
    const dryRun = req.query.dry_run === 'true';
    const file = req.file;
    if (!file) {
      throw new AppError('VALIDATION_ERROR', 400, 'CSV dosyası seçilmedi.');
    }

    const { preview, plan } = prepareImportFromBuffer(file.buffer);
    const base = {
      dry_run: dryRun,
      ok: preview.ok,
      summary: preview.summary,
      errors: preview.errors,
      warnings: preview.warnings,
    };

    if (dryRun) {
      res.json({ ...base, committed: false });
      return;
    }

    // Hepsi ya da hiçbiri: tek satır hatalıysa hiçbir kayıt yazılmaz.
    if (!preview.ok) {
      throw new AppError(
        'VALIDATION_ERROR',
        400,
        `CSV dosyasında ${preview.errors.length} hata var; hiçbir kayıt oluşturulmadı.`,
        undefined,
        { errors: preview.errors, warnings: preview.warnings, summary: preview.summary },
      );
    }

    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    if (password.length < 6) {
      throw new AppError(
        'VALIDATION_ERROR',
        400,
        'Başlangıç şifresi en az 6 karakter olmalı.',
        { password: 'Başlangıç şifresi en az 6 karakter olmalı.' },
      );
    }

    const passwordHash = await hashPassword(password);
    const created = commitImport(plan, passwordHash);

    writeAuditLog({
      actorId: req.user!.id,
      action: 'student.import',
      entityType: 'student_import',
      entityId: randomUUID(),
      diff: { ...preview.summary, created },
    });

    res.status(201).json({ ...base, committed: true, created });
  }),
);

export default router;

/**
 * Korumalı dosya rotası — `GET /api/v1/files/:key` (spec.md §8, CLAUDE.md).
 *
 * `express.static` KULLANILMAZ. Rota `auth` + yetki matrisi içerir:
 * - öğrenci: kendi teslimi
 * - öğretmen: kendi ödevinin teslimi
 * - veli: çocuğunun teslimi (guardian_id eşleşmesi)
 * - admin: hepsi
 *
 * Yerel modda `res.sendFile()`. R2 modunda (Aşama 6) imzalı URL'ye 302.
 * Saklama politikası (§8): `files_purged_at` doluysa 404.
 *
 * `GET /:key/thumb` aynı yetkiyi kullanarak grid için küçük thumbnail'ı servis
 * eder (migration #8 `thumb_key`); thumbnail yoksa orijinale düşer.
 */

import { Router, type Response as ExpressResponse } from 'express';
import fs from 'node:fs';
import { db } from '../db/index.js';
import { AppError } from '../errors.js';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import {
  localPathFor,
  presignedGetUrl,
  type StorageDriver,
} from '../services/storage.js';
import type { AuthUser } from '../types.js';

const router = Router();

// Bulgu #9: dosya yanıtlarında tarayıcının MIME sniffing'ini engelle.
router.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  next();
});

router.use(requireAuth);

interface FileRow {
  key: string;
  thumb_key: string | null;
  mime: string;
  storage: StorageDriver;
  student_id: string;
  files_purged_at: string | null;
  teacher_id: string;
  guardian_id: string | null;
}

/** key → submission_files → submissions → homeworks → class_courses zinciri. */
function loadFileRow(key: string): FileRow | undefined {
  return db
    .prepare(
      `SELECT sf.key, sf.thumb_key, sf.mime, sf.storage,
              s.student_id, s.files_purged_at,
              cc.teacher_id,
              st.guardian_id
       FROM submission_files sf
       JOIN submissions s ON s.id = sf.submission_id
       JOIN homeworks h ON h.id = s.homework_id
       JOIN class_courses cc ON cc.id = h.class_course_id
       JOIN students st ON st.id = s.student_id
       WHERE sf.key = ?`,
    )
    .get(key) as FileRow | undefined;
}

/** Yetki matrisi — her rol için tek yol. */
function assertAccess(user: AuthUser, row: FileRow): void {
  let allowed = false;
  if (user.role === 'admin') {
    allowed = true;
  } else if (user.role === 'student') {
    allowed = user.student_id === row.student_id;
  } else if (user.role === 'teacher') {
    allowed = row.teacher_id === user.id;
  } else if (user.role === 'guardian') {
    allowed = user.guardian_id === row.guardian_id;
  }
  if (!allowed) {
    throw new AppError('FORBIDDEN', 403, 'Bu dosyaya erişim yetkiniz yok.');
  }
}

/**
 * Nesneyi sürücüsüne göre servis eder: `local` → `res.sendFile()`,
 * `r2` → 5 dk ömürlü imzalı GET URL'ine `302` (proxy/stream değil — spec §8).
 */
async function sendStored(
  res: ExpressResponse,
  storage: StorageDriver,
  key: string,
  mime: string,
): Promise<void> {
  if (storage === 'r2') {
    const url = await presignedGetUrl(key, mime);
    res.redirect(302, url);
    return;
  }
  const filePath = localPathFor(key);
  if (!fs.existsSync(filePath)) {
    throw new AppError('NOT_FOUND', 404, 'Dosya bulunamadı.');
  }
  res.sendFile(filePath);
}

router.get(
  '/:key',
  asyncHandler<{ key: string }>(async (req, res) => {
    const user = req.user!;
    const row = loadFileRow(req.params.key);
    if (!row) {
      throw new AppError('NOT_FOUND', 404, 'Dosya bulunamadı.');
    }
    assertAccess(user, row);

    if (row.files_purged_at) {
      throw new AppError('NOT_FOUND', 404, 'Dosya saklama süresi dolduğu için silindi.');
    }

    await sendStored(res, row.storage, row.key, row.mime);
  }),
);

router.get(
  '/:key/thumb',
  asyncHandler<{ key: string }>(async (req, res) => {
    const user = req.user!;
    const row = loadFileRow(req.params.key);
    if (!row) {
      throw new AppError('NOT_FOUND', 404, 'Dosya bulunamadı.');
    }
    assertAccess(user, row);

    if (row.files_purged_at) {
      throw new AppError('NOT_FOUND', 404, 'Dosya saklama süresi dolduğu için silindi.');
    }

    // Eski kayıtta thumbnail yoksa orijinali servis et (yine de doğru yetki).
    await sendStored(res, row.storage, row.thumb_key ?? row.key, row.mime);
  }),
);

export default router;

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
 */

import { Router } from 'express';
import fs from 'node:fs';
import { db } from '../db/index.js';
import { AppError } from '../errors.js';
import { requireAuth } from '../middleware/auth.js';
import { localPathFor } from '../services/storage.js';

const router = Router();

router.use(requireAuth);

router.get('/:key', (req, res) => {
  const user = req.user!;
  const { key } = req.params;

  // key → submission_files → submissions → homeworks → class_courses → öğrenci
  const row = db
    .prepare(
      `SELECT sf.key, sf.mime,
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
    .get(key) as
    | {
        key: string;
        mime: string;
        student_id: string;
        files_purged_at: string | null;
        teacher_id: string;
        guardian_id: string | null;
      }
    | undefined;

  if (!row) {
    throw new AppError('NOT_FOUND', 404, 'Dosya bulunamadı.');
  }

  // Yetki matrisi — her rol için tek yol.
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

  if (row.files_purged_at) {
    throw new AppError('NOT_FOUND', 404, 'Dosya saklama süresi dolduğu için silindi.');
  }

  const filePath = localPathFor(row.key);
  if (!fs.existsSync(filePath)) {
    throw new AppError('NOT_FOUND', 404, 'Dosya bulunamadı.');
  }

  res.sendFile(filePath);
});

export default router;

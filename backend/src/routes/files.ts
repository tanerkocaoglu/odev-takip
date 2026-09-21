/**
 * Korumalı dosya rotası — `GET /api/v1/files/:key` (spec.md §8, CLAUDE.md).
 *
 * `express.static` KULLANILMAZ. Rota `auth` + yetki matrisi içerir. İki kaynak
 * vardır (key küresel benzersizdir; önce teslim, sonra ödev eki denenir):
 * - **Teslim dosyası** (`submission_files → submissions → homeworks`):
 *   öğrenci kendi teslimi; öğretmen kendi ödevinin teslimi; veli çocuğununki;
 *   admin hepsi.
 * - **Ödev eki** (`homework_attachments → homeworks`; migration #13):
 *   öğretmen dersin sahibi; admin hepsi; öğrenci ödevin sınıfına kayıtlı ve
 *   rapor `completed`/`sent` ise; veli çocuğu o sınıfa kayıtlı ve rapor
 *   `completed`/`sent` ise. Böylece taslak bir raporun ekleri öğrenci/veliye
 *   sızmaz.
 *
 * Yerel modda `res.sendFile()`. R2 modunda imzalı URL'ye 302.
 * Saklama politikası (§8): teslimde `files_purged_at` doluysa 404.
 *
 * `GET /:key/thumb` aynı yetkiyi kullanarak grid için küçük thumbnail'ı servis
 * eder; thumbnail yoksa orijinale düşer (ödev ekleri PDF'tir → her zaman orijinal).
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

interface SubmissionFileRow {
  key: string;
  thumb_key: string | null;
  mime: string;
  storage: StorageDriver;
  student_id: string;
  files_purged_at: string | null;
  teacher_id: string;
  guardian_id: string | null;
}

interface AttachmentFileRow {
  key: string;
  mime: string;
  storage: StorageDriver;
  teacher_id: string;
  class_id: string;
  week_start: string;
  report_status: string;
}

/** key → submission_files → submissions → homeworks → class_courses zinciri. */
function loadSubmissionFileRow(key: string): SubmissionFileRow | undefined {
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
    .get(key) as SubmissionFileRow | undefined;
}

/** key → homework_attachments → homeworks → class_courses/reports/weeks. */
function loadAttachmentFileRow(key: string): AttachmentFileRow | undefined {
  return db
    .prepare(
      `SELECT ha.key, ha.mime, ha.storage,
              cc.teacher_id, cc.class_id, w.start_date AS week_start,
              r.status AS report_status
       FROM homework_attachments ha
       JOIN reports r ON r.id = ha.report_id
       JOIN class_courses cc ON cc.id = r.class_course_id
       JOIN weeks w ON w.id = r.week_id
       WHERE ha.key = ?`,
    )
    .get(key) as AttachmentFileRow | undefined;
}

/** Teslim dosyası yetki matrisi — her rol için tek yol. */
function assertSubmissionAccess(user: AuthUser, row: SubmissionFileRow): void {
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

/** Öğrenci/veli için: ödevin sınıfına (hafta başında) kayıtlı mı? */
function enrollmentCoversClass(
  role: 'student' | 'guardian',
  user: AuthUser,
  row: AttachmentFileRow,
): boolean {
  if (role === 'student') {
    if (!user.student_id) return false;
    const hit = db
      .prepare(
        `SELECT 1 FROM enrollments e
          WHERE e.student_id = ? AND e.class_id = ?
            AND e.start_date <= ? AND (e.end_date IS NULL OR e.end_date >= ?)`,
      )
      .get(user.student_id, row.class_id, row.week_start, row.week_start);
    return hit !== undefined;
  }
  if (!user.guardian_id) return false;
  const hit = db
    .prepare(
      `SELECT 1 FROM enrollments e
        JOIN students s ON s.id = e.student_id
        WHERE s.guardian_id = ? AND e.class_id = ?
          AND e.start_date <= ? AND (e.end_date IS NULL OR e.end_date >= ?)`,
    )
    .get(user.guardian_id, row.class_id, row.week_start, row.week_start);
  return hit !== undefined;
}

/**
 * Ödev eki yetki matrisi. Öğrenci/veli yalnızca **yayımlanmış** (completed/sent)
 * raporun ekini görür — taslak rapor eki sızmaz.
 */
function assertAttachmentAccess(user: AuthUser, row: AttachmentFileRow): void {
  let allowed = false;
  if (user.role === 'admin') {
    allowed = true;
  } else if (user.role === 'teacher') {
    allowed = row.teacher_id === user.id;
  } else if (user.role === 'student' || user.role === 'guardian') {
    const published = row.report_status === 'completed' || row.report_status === 'sent';
    allowed = published && enrollmentCoversClass(user.role, user, row);
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
    const key = req.params.key;

    const submission = loadSubmissionFileRow(key);
    if (submission) {
      assertSubmissionAccess(user, submission);
      if (submission.files_purged_at) {
        throw new AppError('NOT_FOUND', 404, 'Dosya saklama süresi dolduğu için silindi.');
      }
      await sendStored(res, submission.storage, submission.key, submission.mime);
      return;
    }

    const attachment = loadAttachmentFileRow(key);
    if (attachment) {
      assertAttachmentAccess(user, attachment);
      await sendStored(res, attachment.storage, attachment.key, attachment.mime);
      return;
    }

    throw new AppError('NOT_FOUND', 404, 'Dosya bulunamadı.');
  }),
);

router.get(
  '/:key/thumb',
  asyncHandler<{ key: string }>(async (req, res) => {
    const user = req.user!;
    const key = req.params.key;

    const submission = loadSubmissionFileRow(key);
    if (submission) {
      assertSubmissionAccess(user, submission);
      if (submission.files_purged_at) {
        throw new AppError('NOT_FOUND', 404, 'Dosya saklama süresi dolduğu için silindi.');
      }
      // Eski kayıtta thumbnail yoksa orijinali servis et (yine de doğru yetki).
      await sendStored(res, submission.storage, submission.thumb_key ?? submission.key, submission.mime);
      return;
    }

    const attachment = loadAttachmentFileRow(key);
    if (attachment) {
      assertAttachmentAccess(user, attachment);
      // PDF'lerin thumbnail'ı yoktur → orijinal.
      await sendStored(res, attachment.storage, attachment.key, attachment.mime);
      return;
    }

    throw new AppError('NOT_FOUND', 404, 'Dosya bulunamadı.');
  }),
);

export default router;

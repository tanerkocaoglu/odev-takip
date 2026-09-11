/**
 * Dosya yükleme middleware'i — Multer `memoryStorage` (CLAUDE.md §Dosya).
 * Kısıtlar (spec.md §5.3): jpg/jpeg/png/heic/pdf, dosya başına 10 MB,
 * teslim başına 10 dosya. Ham dosya diskte tutulmaz; yalnızca memory buffer.
 */

import multer, { MulterError } from 'multer';
import type { RequestHandler } from 'express';
import { AppError } from '../errors.js';

export const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
export const MAX_FILES = 10;

const ALLOWED_MIMES = new Set([
  'image/jpeg',
  'image/png',
  'image/heic',
  'image/heif',
  'application/pdf',
]);

const ALLOWED_EXT = new Set(['jpg', 'jpeg', 'png', 'heic', 'heif', 'pdf']);

export const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE, files: MAX_FILES },
  fileFilter: (_req, file, cb) => {
    const ext = file.originalname.toLowerCase().split('.').pop() ?? '';
    if (ALLOWED_MIMES.has(file.mimetype.toLowerCase()) || ALLOWED_EXT.has(ext)) {
      cb(null, true);
    } else {
      cb(
        new AppError(
          'VALIDATION_ERROR',
          400,
          'Yalnızca JPEG, PNG, HEIC veya PDF dosyası yükleyebilirsiniz.',
        ),
      );
    }
  },
});

// ---------- CSV (toplu öğrenci içe aktarma) ----------

export const MAX_CSV_SIZE = 2 * 1024 * 1024; // 2 MB

const CSV_MIMES = new Set([
  'text/csv',
  'application/csv',
  'application/vnd.ms-excel',
  'text/plain',
  'application/octet-stream',
]);

const csvMulter = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_CSV_SIZE, files: 1 },
  fileFilter: (_req, file, cb) => {
    const ext = file.originalname.toLowerCase().split('.').pop() ?? '';
    if (ext === 'csv' || CSV_MIMES.has(file.mimetype.toLowerCase())) {
      cb(null, true);
    } else {
      cb(new AppError('VALIDATION_ERROR', 400, 'Yalnızca CSV dosyası yükleyebilirsiniz.'));
    }
  },
});

/**
 * Tek CSV dosyası (`file` alanı) alan wrapper middleware. Multer'ın boyut
 * limiti ihlalini CSV'ye özgü Türkçe mesaja çevirir (genel 10 MB mesajı
 * görsel yükleme içindir).
 */
export const csvUploadSingle: RequestHandler = (req, res, next) => {
  csvMulter.single('file')(req, res, (err: unknown) => {
    if (err instanceof MulterError && err.code === 'LIMIT_FILE_SIZE') {
      next(new AppError('VALIDATION_ERROR', 400, 'CSV dosyası en fazla 2 MB olabilir.'));
      return;
    }
    next(err);
  });
};

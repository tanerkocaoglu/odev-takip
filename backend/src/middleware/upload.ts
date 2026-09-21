/**
 * Dosya yükleme middleware'i — Multer `memoryStorage` (CLAUDE.md §Dosya).
 * Kısıtlar (spec.md §5.3): jpg/jpeg/png/heic/pdf, dosya başına 10 MB,
 * teslim başına 30 dosya. Ham dosya diskte tutulmaz; yalnızca memory buffer.
 */

import multer, { MulterError } from 'multer';
import type { RequestHandler } from 'express';
import { AppError } from '../errors.js';
import { MAX_CSV_BYTES } from '../constants.js';

export const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
export const MAX_FILES = 30;

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
  // Tarayıcı `filename=` alanına UTF-8 baytları yazar; multer varsayılanı
  // `latin1` olduğu için Türkçe adlar mojibake gelirdi. UTF-8'e sabitlenir.
  defParamCharset: 'utf8',
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

// ---------- Öğretmen ödev ekleri (yalnızca PDF) ----------

/** Bir ödeve eklenebilecek en fazla PDF sayısı (kullanıcı kararı). */
export const MAX_HOMEWORK_ATTACHMENTS = 5;

const pdfMulter = multer({
  storage: multer.memoryStorage(),
  defParamCharset: 'utf8',
  limits: { fileSize: MAX_FILE_SIZE, files: MAX_HOMEWORK_ATTACHMENTS },
  fileFilter: (_req, file, cb) => {
    const ext = file.originalname.toLowerCase().split('.').pop() ?? '';
    if (ext === 'pdf' || file.mimetype.toLowerCase() === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new AppError('VALIDATION_ERROR', 400, 'Yalnızca PDF dosyası ekleyebilirsiniz.'));
    }
  },
});

/**
 * Ödev eki yükleme middleware'i: `files` alanı, yalnızca PDF, dosya başına
 * 10 MB, istek başına en fazla 5. Multer limit ihlalleri Türkçe mesaja çevrilir.
 */
export const pdfUpload: RequestHandler = (req, res, next) => {
  pdfMulter.array('files', MAX_HOMEWORK_ATTACHMENTS)(req, res, (err: unknown) => {
    if (err instanceof MulterError && err.code === 'LIMIT_FILE_SIZE') {
      next(new AppError('VALIDATION_ERROR', 400, 'PDF dosyası en fazla 10 MB olabilir.'));
      return;
    }
    if (err instanceof MulterError && err.code === 'LIMIT_FILE_COUNT') {
      next(
        new AppError(
          'VALIDATION_ERROR',
          400,
          `Bir ödeve en fazla ${MAX_HOMEWORK_ATTACHMENTS} PDF ekleyebilirsiniz.`,
        ),
      );
      return;
    }
    next(err);
  });
};

// ---------- CSV (toplu öğrenci içe aktarma) ----------

const CSV_MIMES = new Set([
  'text/csv',
  'application/csv',
  'application/vnd.ms-excel',
  'text/plain',
  'application/octet-stream',
]);

const csvMulter = multer({
  storage: multer.memoryStorage(),
  defParamCharset: 'utf8',
  limits: { fileSize: MAX_CSV_BYTES, files: 1 },
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

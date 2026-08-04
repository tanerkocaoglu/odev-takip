/**
 * Dosya yükleme middleware'i — Multer `memoryStorage` (CLAUDE.md §Dosya).
 * Kısıtlar (spec.md §5.3): jpg/jpeg/png/heic/pdf, dosya başına 10 MB,
 * teslim başına 10 dosya. Ham dosya diskte tutulmaz; yalnızca memory buffer.
 */

import multer from 'multer';
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

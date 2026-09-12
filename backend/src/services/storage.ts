/**
 * Dosya depolama (CLAUDE.md §Dosya yükleme ve servis; spec.md §8).
 *
 * Aşama 4: yerel disk (`backend/uploads`). Multer `memoryStorage` → HEIC ise
 * `heic-convert` → JPEG buffer → sharp (uzun kenar max 2000px, JPEG q80) →
 * diske yaz. PDF aynen saklanır. Ham dosya diskte tutulmaz.
 *
 * Dosya adı/key: `{timestamp}-{randomHex}.{ext}`. R2'ye geçiş (Aşama 6) bu
 * modülün içi değiştirilerek yapılır — çağıran kod driver'ı bilmez.
 */

import path from 'node:path';
import fs from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import sharp from 'sharp';
import convert from 'heic-convert';
import { AppError } from '../errors.js';
import { detectFileFormat, declaredFormat } from '../utils/fileSignature.js';

/** Multer'ın verdiği ham dosya. */
export interface UploadedFile {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

/** İşlenmiş + saklanmış dosyanın meta bilgisi (`submission_files` satırı). */
export interface StoredFile {
  key: string;
  filename: string; // orijinal kullanıcı dosya adı
  size: number;     // saklanan bayt (görsel küçültme sonrası gerçek boyut)
  mime: string;     // saklanan mime (görsel her zaman image/jpeg)
  ext: string;      // saklanan uzantı (jpg | pdf)
  thumbKey: string | null; // görsel thumbnail anahtarı; PDF'te null
}

// Test ortamı `UPLOADS_DIR` ile ayrı dizin kullanabilir (vitest.config.ts);
// üretim kodu her zaman backend/uploads.
const uploadsDir =
  process.env.UPLOADS_DIR ?? path.join(import.meta.dirname, '..', '..', 'uploads');

const IMAGE_MIMES = new Set(['image/jpeg', 'image/png', 'image/heic', 'image/heif']);
const HEIC_MIMES = new Set(['image/heic', 'image/heif']);

/** Thumbnail grid için kare küçük görsel kenarı (px). */
export const THUMB_SIZE = 300;

/** Mime eksikse/bozuksa orijinal dosya adının uzantısına bakar. */
function resolveMime(file: UploadedFile): string {
  const lower = file.mimetype.toLowerCase();
  if (lower && lower !== 'application/octet-stream') return lower;
  const ext = file.originalname.toLowerCase().split('.').pop() ?? '';
  if (ext === 'heic') return 'image/heic';
  if (ext === 'heif') return 'image/heif';
  if (ext === 'png') return 'image/png';
  if (ext === 'pdf') return 'application/pdf';
  return 'image/jpeg';
}

function generateKey(ext: string): string {
  return `${Date.now()}-${randomBytes(8).toString('hex')}.${ext}`;
}

/**
 * Bulgu #9: beyan edilen uzantı/mime ile dosyanın GERÇEK içeriğini karşılaştırır.
 * Diske yazmadan önce çağrılır; uyumsuzlukta Türkçe 400 fırlatır.
 */
function assertContentMatches(file: UploadedFile): void {
  const actual = detectFileFormat(file.buffer);
  if (actual === 'unknown') {
    throw new AppError(
      'VALIDATION_ERROR',
      400,
      'Dosya içeriği tanınamadı; yalnızca geçerli JPEG, PNG, HEIC veya PDF yükleyebilirsiniz.',
    );
  }
  const declared = declaredFormat(file.originalname, file.mimetype);
  if (declared !== null && declared !== actual) {
    throw new AppError(
      'VALIDATION_ERROR',
      400,
      'Dosyanın içeriği uzantısıyla uyuşmuyor. Lütfen dosyayı kontrol edip yeniden yükleyin.',
    );
  }
}

/**
 * Yüklenen dosyayı işler ve saklar (CLAUDE.md: ham dosya saklanmaz).
 * Görsel: uzun kenar max 2000px, JPEG q80. PDF: aynen.
 * HEIC dönüşümü başarısız olursa Türkçe hata fırlatılır (spec.md §5.3).
 */
export async function saveUpload(file: UploadedFile): Promise<StoredFile> {
  // Bulgu #9: diske YAZMADAN önce beyan ↔ gerçek içerik tutarlılığı.
  assertContentMatches(file);

  const mime = resolveMime(file);

  if (IMAGE_MIMES.has(mime)) {
    let source: Buffer;
    if (HEIC_MIMES.has(mime)) {
      try {
        source = await convert({ buffer: file.buffer, format: 'JPEG', quality: 0.9 });
      } catch {
        throw new AppError(
          'VALIDATION_ERROR',
          400,
          'Bu fotoğraf formatı işlenemedi, lütfen JPEG olarak yükleyin.',
        );
      }
    } else {
      source = file.buffer;
    }

    let processed: Buffer;
    try {
      processed = await sharp(source)
        .rotate() // EXIF yönü dikkate alınır
        .resize({ width: 2000, height: 2000, fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 80 })
        .toBuffer();
    } catch {
      // İmza doğru ama derin decode başarısız (bozuk/kesik görsel) → 500 yerine 400.
      throw new AppError(
        'VALIDATION_ERROR',
        400,
        'Görsel dosyası okunamadı veya bozuk. Lütfen geçerli bir görsel yükleyin.',
      );
    }

    const key = generateKey('jpg');
    // Grid için kare thumbnail (2000px orijinali indirmemek adına).
    const thumbKey = generateKey('jpg');
    const thumb = await sharp(processed)
      .resize({ width: THUMB_SIZE, height: THUMB_SIZE, fit: 'cover' })
      .jpeg({ quality: 70 })
      .toBuffer();
    await fs.mkdir(uploadsDir, { recursive: true });
    await fs.writeFile(path.join(uploadsDir, key), processed);
    await fs.writeFile(path.join(uploadsDir, thumbKey), thumb);
    return {
      key,
      filename: file.originalname,
      size: processed.length,
      mime: 'image/jpeg',
      ext: 'jpg',
      thumbKey,
    };
  }

  // PDF — görsel işlemeden aynen saklanır.
  const key = generateKey('pdf');
  await fs.mkdir(uploadsDir, { recursive: true });
  await fs.writeFile(path.join(uploadsDir, key), file.buffer);
  return {
    key,
    filename: file.originalname,
    size: file.buffer.length,
    mime: 'application/pdf',
    ext: 'pdf',
    thumbKey: null,
  };
}

/**
 * Key'in yerel disk yolunu döner. `GET /api/v1/files/:key` `res.sendFile()`
 * kullanır; `express.static` kullanılmaz. Key formatı sıkı doğrulanır —
 * path traversal (`..`, `/`) burada engellenir.
 */
export function localPathFor(key: string): string {
  if (!/^[0-9]+-[a-f0-9]{16}\.(jpg|pdf)$/.test(key)) {
    throw new AppError('NOT_FOUND', 404, 'Dosya bulunamadı.');
  }
  return path.join(uploadsDir, key);
}

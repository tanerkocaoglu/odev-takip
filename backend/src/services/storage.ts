/**
 * Dosya depolama (CLAUDE.md §Dosya yükleme ve servis; spec.md §8).
 *
 * İki sürücü (spec §8):
 * - `local` (varsayılan): yerel disk (`UPLOADS_DIR`, dev'de `backend/uploads`).
 * - `r2`: Cloudflare R2 (S3-uyumlu API) — `@aws-sdk/client-s3` +
 *   `@aws-sdk/s3-request-presigner`. Bucket **private**; erişim yalnızca
 *   yetki kontrolünden geçen 5 dk ömürlü imzalı GET URL'i (302) ile.
 *
 * `STORAGE_DRIVER` env'i **yeni yüklemelerin** nereye yazılacağını belirler.
 * Mevcut nesnenin nerede olduğu `submission_files.storage` satırında saklanır
 * (migration #12) — okuma yolu çalışma anında yeniden türetmez.
 *
 * İşleme akışı sürücüden bağımsızdır: multer `memoryStorage` → HEIC ise
 * `heic-convert` → JPEG buffer → sharp (uzun kenar max 2000px, JPEG q80) →
 * sürücüye yaz. PDF aynen saklanır. Ham dosya saklanmaz.
 *
 * Not (kapsam sınırı): `db:backup`, `cleanup-submissions`, `wipe`/`reset` gibi
 * bakım script'leri bu turda R2'yi kapsamaz; mevcut disk dosyalarıyla çalışır.
 */

import path from 'node:path';
import fs from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import sharp from 'sharp';
import convert from 'heic-convert';
import { AppError } from '../errors.js';
import { detectFileFormat, declaredFormat } from '../utils/fileSignature.js';
import type { S3Client } from '@aws-sdk/client-s3';

/** Multer'ın verdiği ham dosya. */
export interface UploadedFile {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

/** Desteklenen depolama sürücüleri (`submission_files.storage`). */
export type StorageDriver = 'local' | 'r2';

/** İşlenmiş + saklanmış dosyanın meta bilgisi (`submission_files` satırı). */
export interface StoredFile {
  key: string;
  filename: string; // orijinal kullanıcı dosya adı
  size: number;     // saklanan bayt (görsel küçültme sonrası gerçek boyut)
  mime: string;     // saklanan mime (görsel her zaman image/jpeg)
  ext: string;      // saklanan uzantı (jpg | pdf)
  thumbKey: string | null; // görsel thumbnail anahtarı; PDF'te null
  storage: StorageDriver;  // nesnenin bulunduğu sürücü (migration #12)
}

/** İmzalı GET URL ömrü (spec §8/§9: kısa ömürlü). */
export const PRESIGN_TTL_SECONDS = 300;

export interface R2Config {
  endpoint: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
}

/**
 * `STORAGE_DRIVER=r2` için gerekli env'leri doğrular; eksikse açıklayıcı hata
 * fırlatır (açılışta fail-fast — eksik yapılandırmayla sessizce local'e düşmez).
 */
export function r2ConfigFromEnv(env: NodeJS.ProcessEnv = process.env): R2Config {
  const endpoint = env.R2_ENDPOINT?.trim();
  const bucket = env.R2_BUCKET?.trim();
  const accessKeyId = env.R2_ACCESS_KEY_ID?.trim();
  const secretAccessKey = env.R2_SECRET_ACCESS_KEY?.trim();
  const missing = [
    ['R2_ENDPOINT', endpoint],
    ['R2_BUCKET', bucket],
    ['R2_ACCESS_KEY_ID', accessKeyId],
    ['R2_SECRET_ACCESS_KEY', secretAccessKey],
  ]
    .filter(([, v]) => !v)
    .map(([k]) => k);
  if (missing.length > 0) {
    throw new Error(
      `STORAGE_DRIVER=r2 için eksik ortam değişkenleri: ${missing.join(', ')}`,
    );
  }
  // S3 SDK'nın kriptik "Invalid URL" hatası yerine açık doğrulama.
  let parsedEndpoint: URL;
  try {
    parsedEndpoint = new URL(endpoint!);
  } catch {
    throw new Error(
      `R2_ENDPOINT geçerli bir URL olmalı (örn. https://<ACCOUNT_ID>.r2.cloudflarestorage.com). ` +
        `Şu an: "${endpoint}"`,
    );
  }
  if (parsedEndpoint.protocol !== 'http:' && parsedEndpoint.protocol !== 'https:') {
    throw new Error(`R2_ENDPOINT http(s) ile başlamalı. Şu an: "${endpoint}"`);
  }
  return {
    endpoint: endpoint!,
    bucket: bucket!,
    accessKeyId: accessKeyId!,
    secretAccessKey: secretAccessKey!,
    region: env.R2_REGION?.trim() || 'auto',
  };
}

/** `STORAGE_DRIVER`'ı çözer; bilinmeyen değer veya eksik R2 yapılandırmasında fırlatır. */
export function resolveStorageDriver(env: NodeJS.ProcessEnv = process.env): StorageDriver {
  const raw = (env.STORAGE_DRIVER ?? 'local').toLowerCase();
  if (raw === 'local') return 'local';
  if (raw === 'r2') {
    r2ConfigFromEnv(env); // fail-fast
    return 'r2';
  }
  throw new Error(`Bilinmeyen STORAGE_DRIVER: ${raw} (beklenen: local | r2)`);
}

/** Uygulamanın yeni yüklemeler için kullandığı sürücü. */
export const storageDriver: StorageDriver = resolveStorageDriver();

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

// ---- S3/R2 istemcisi (yalnızca r2 sürücüsünde, tembel oluşturulur) ----

let cachedClient: S3Client | null = null;

async function getR2Client(): Promise<S3Client> {
  if (cachedClient) return cachedClient;
  const cfg = r2ConfigFromEnv();
  const { S3Client: S3 } = await import('@aws-sdk/client-s3');
  cachedClient = new S3({
    region: cfg.region,
    endpoint: cfg.endpoint,
    credentials: { accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey },
    // R2 S3 API: path-style adresleme ile deterministik.
    forcePathStyle: true,
  });
  return cachedClient;
}

/** Nesneyi seçili sürücüye yazar (local: disk, r2: PutObject). */
async function putObject(key: string, body: Buffer, contentType: string): Promise<void> {
  if (storageDriver === 'local') {
    await fs.mkdir(uploadsDir, { recursive: true });
    await fs.writeFile(path.join(uploadsDir, key), body);
    return;
  }
  const { PutObjectCommand } = await import('@aws-sdk/client-s3');
  const client = await getR2Client();
  await client.send(
    new PutObjectCommand({
      Bucket: r2ConfigFromEnv().bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
    }),
  );
}

/**
 * Saklanan nesneyi siler (en iyi çaba çağıran tarafındadır). Yerel modda
 * `localPathFor` doğrulaması kullanılır; r2 modunda `DeleteObject`.
 */
export async function deleteStored(storage: StorageDriver, key: string): Promise<void> {
  if (storage === 'local') {
    await fs.unlink(localPathFor(key));
    return;
  }
  const { DeleteObjectCommand } = await import('@aws-sdk/client-s3');
  const client = await getR2Client();
  await client.send(
    new DeleteObjectCommand({ Bucket: r2ConfigFromEnv().bucket, Key: key }),
  );
}

/**
 * R2 nesnesi için kısa ömürlü (5 dk) imzalı GET URL'i üretir. Yalnızca
 * `GET /api/v1/files/:key` yetki kontrolünden geçtikten sonra çağrılır.
 */
export async function presignedGetUrl(key: string, mime?: string): Promise<string> {
  const { GetObjectCommand } = await import('@aws-sdk/client-s3');
  const { getSignedUrl } = await import('@aws-sdk/s3-request-presigner');
  const client = await getR2Client();
  const command = new GetObjectCommand({
    Bucket: r2ConfigFromEnv().bucket,
    Key: key,
    ...(mime ? { ResponseContentType: mime } : {}),
  });
  return getSignedUrl(client, command, { expiresIn: PRESIGN_TTL_SECONDS });
}

/**
 * Yüklenen dosyayı işler ve saklar (CLAUDE.md: ham dosya saklanmaz).
 * Görsel: uzun kenar max 2000px, JPEG q80. PDF: aynen.
 * HEIC dönüşümü başarısız olursa Türkçe hata fırlatılır (spec.md §5.3).
 */
export async function saveUpload(file: UploadedFile): Promise<StoredFile> {
  // Bulgu #9: yazmadan ÖNCE beyan ↔ gerçek içerik tutarlılığı.
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
    await putObject(key, processed, 'image/jpeg');
    await putObject(thumbKey, thumb, 'image/jpeg');
    return {
      key,
      filename: file.originalname,
      size: processed.length,
      mime: 'image/jpeg',
      ext: 'jpg',
      thumbKey,
      storage: storageDriver,
    };
  }

  // PDF — görsel işlemeden aynen saklanır.
  const key = generateKey('pdf');
  await putObject(key, file.buffer, 'application/pdf');
  return {
    key,
    filename: file.originalname,
    size: file.buffer.length,
    mime: 'application/pdf',
    ext: 'pdf',
    thumbKey: null,
    storage: storageDriver,
  };
}

/**
 * Key'in yerel disk yolunu döner. `GET /api/v1/files/:key` (local sürücü)
 * `res.sendFile()` kullanır; `express.static` kullanılmaz. Key formatı sıkı
 * doğrulanır — path traversal (`..`, `/`) burada engellenir.
 */
export function localPathFor(key: string): string {
  if (!/^[0-9]+-[a-f0-9]{16}\.(jpg|pdf)$/.test(key)) {
    throw new AppError('NOT_FOUND', 404, 'Dosya bulunamadı.');
  }
  return path.join(uploadsDir, key);
}

/**
 * Storage servis testleri — key üretimi, görsel küçültme, PDF aynen saklama,
 * HEIC dönüşüm hatası ve key doğrulama (path traversal koruması).
 * (vitest.config.ts `UPLOADS_DIR` ile ayrı temp dizin kullanır.)
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { saveUpload, localPathFor, resolveStorageDriver, r2ConfigFromEnv, type StoredFile } from './services/storage.js';
import { AppError } from './errors.js';

const PDF_BUFFER = Buffer.from('%PDF-1.4 test icerik');

const FIXTURES = path.join(import.meta.dirname, 'test', 'fixtures');
const fixture = (name: string): Buffer => fs.readFileSync(path.join(FIXTURES, name));

function countUploads(): number {
  return fs.readdirSync(process.env.UPLOADS_DIR!).length;
}

const createdKeys: string[] = [];

beforeAll(() => {
  fs.mkdirSync(process.env.UPLOADS_DIR!, { recursive: true });
});

afterAll(() => {
  for (const key of createdKeys) {
    try {
      fs.unlinkSync(localPathFor(key));
    } catch {
      // zaten silinmiş olabilir
    }
  }
});

function track(f: StoredFile): StoredFile {
  createdKeys.push(f.key);
  if (f.thumbKey) createdKeys.push(f.thumbKey);
  return f;
}

describe('saveUpload', () => {
  it('görseli JPEG q80 + max 2000px olarak küçültür ve saklar; thumbnail üretir', async () => {
    // Gerçekçi boyut: 1200×900 kaynak (thumbnail orijinalden küçük olmalı).
    const big = await sharp({
      create: { width: 1200, height: 900, channels: 3, background: { r: 120, g: 80, b: 40 } },
    })
      .png()
      .toBuffer();
    const stored = track(
      await saveUpload({ originalname: 'foto.png', mimetype: 'image/png', size: big.length, buffer: big }),
    );
    expect(stored.ext).toBe('jpg');
    expect(stored.mime).toBe('image/jpeg');
    expect(stored.storage).toBe('local'); // varsayılan sürücü
    expect(stored.key).toMatch(/^[0-9]+-[a-f0-9]{16}\.jpg$/);
    expect(fs.existsSync(localPathFor(stored.key))).toBe(true);
    // Orijinalden daha küçük ya da işlenmiş JPEG.
    expect(stored.size).toBeGreaterThan(0);
    // Thumbnail: ayrı dosya, geçerli key, orijinalden küçük.
    expect(stored.thumbKey).toMatch(/^[0-9]+-[a-f0-9]{16}\.jpg$/);
    expect(stored.thumbKey).not.toBe(stored.key);
    const thumbPath = localPathFor(stored.thumbKey!);
    expect(fs.existsSync(thumbPath)).toBe(true);
    expect(fs.statSync(thumbPath).size).toBeLessThan(stored.size);
    const meta = await sharp(fs.readFileSync(thumbPath)).metadata();
    expect(meta.width).toBe(300);
    expect(meta.height).toBe(300);
  });

  it('PDF dosyasını görsel işlemeden aynen saklar; thumbnail üretmez', async () => {
    const stored = track(
      await saveUpload({ originalname: 'odev.pdf', mimetype: 'application/pdf', size: PDF_BUFFER.length, buffer: PDF_BUFFER }),
    );
    expect(stored.ext).toBe('pdf');
    expect(stored.mime).toBe('application/pdf');
    expect(stored.size).toBe(PDF_BUFFER.length);
    expect(stored.key).toMatch(/^[0-9]+-[a-f0-9]{16}\.pdf$/);
    expect(stored.thumbKey).toBeNull();
    const saved = fs.readFileSync(localPathFor(stored.key));
    expect(saved.equals(PDF_BUFFER)).toBe(true);
  });

  it('HEIC dönüşümü başarısızsa Türkçe hata fırlatır', async () => {
    // İmza (ftyp/heic) geçerli, ama gerçek HEIC olmayan baytlar → heic-convert patlar.
    const fakeHeic = Buffer.concat([
      Buffer.from([0x00, 0x00, 0x00, 0x18]),
      Buffer.from('ftypheic', 'latin1'),
      Buffer.from([0x00, 0x00, 0x00, 0x00]),
      Buffer.from('mif1heic', 'latin1'),
      Buffer.from('bu gecerli bir heic degil'),
    ]);
    await expect(
      saveUpload({ originalname: 'foto.heic', mimetype: 'image/heic', size: fakeHeic.length, buffer: fakeHeic }),
    ).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
      status: 400,
      message: 'Bu fotoğraf formatı işlenemedi, lütfen JPEG olarak yükleyin.',
    });
  });

  it('mime eksikse dosya adı uzantısından tipi çıkarır', async () => {
    const stored = track(
      await saveUpload({ originalname: 'belge.pdf', mimetype: 'application/octet-stream', size: PDF_BUFFER.length, buffer: PDF_BUFFER }),
    );
    expect(stored.ext).toBe('pdf');
  });

  // --- Bulgu #9: beyan ↔ gerçek içerik tutarlılığı ---

  it('uyumsuz içerik: .jpg adıyla HTML içerik → 400 ve diske yazılmaz', async () => {
    const html = Buffer.from('<html><body>merhaba</body></html>');
    const before = countUploads();
    await expect(
      saveUpload({ originalname: 'foo.jpg', mimetype: 'image/jpeg', size: html.length, buffer: html }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR', status: 400 });
    expect(countUploads()).toBe(before);
  });

  it('uyumsuz içerik: .pdf adıyla görsel → 400', async () => {
    const jpg = fixture('sample.jpg');
    await expect(
      saveUpload({ originalname: 'rapor.pdf', mimetype: 'application/pdf', size: jpg.length, buffer: jpg }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR', status: 400 });
  });

  it('uyumsuz içerik: .png adıyla JPEG → 400 (tür uyuşmazlığı)', async () => {
    const jpg = fixture('sample.jpg');
    await expect(
      saveUpload({ originalname: 'sahte.png', mimetype: 'image/png', size: jpg.length, buffer: jpg }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR', status: 400 });
  });

  it('gerçek JPEG/PNG/PDF/HEIC dosyaları sorunsuz kabul edilir', async () => {
    const jpgBuf = fixture('sample.jpg');
    const jpg = track(await saveUpload({ originalname: 'foto.jpg', mimetype: 'image/jpeg', size: jpgBuf.length, buffer: jpgBuf }));
    expect(jpg.ext).toBe('jpg');
    expect(jpg.thumbKey).toBeTruthy();

    const pngBuf = fixture('sample.png');
    const png = track(await saveUpload({ originalname: 'foto.png', mimetype: 'image/png', size: pngBuf.length, buffer: pngBuf }));
    expect(png.ext).toBe('jpg');
    expect(png.thumbKey).toBeTruthy();

    const pdfBuf = fixture('sample.pdf');
    const pdf = track(await saveUpload({ originalname: 'odev.pdf', mimetype: 'application/pdf', size: pdfBuf.length, buffer: pdfBuf }));
    expect(pdf.ext).toBe('pdf');
    expect(pdf.thumbKey).toBeNull();

    const heicBuf = fixture('sample.heic');
    const heic = track(await saveUpload({ originalname: 'foto.heic', mimetype: 'image/heic', size: heicBuf.length, buffer: heicBuf }));
    expect(heic.ext).toBe('jpg');
    expect(heic.thumbKey).toBeTruthy();
  });
});

describe('localPathFor', () => {
  it('geçerli key için yol döner', () => {
    const p = localPathFor('1234567890-0123456789abcdef.jpg');
    expect(p.endsWith('1234567890-0123456789abcdef.jpg')).toBe(true);
  });

  it('path traversal ve bozuk keyleri 404 ile reddeder', () => {
    for (const bad of ['../secret.jpg', '..\\secret.jpg', 'foo', 'a-b.jpg', '123-x.jpg', '123-abcdef.jpg']) {
      expect(() => localPathFor(bad)).toThrowError(AppError);
    }
  });
});

describe('storage driver çözümleme (fail-fast)', () => {
  const R2_ENV = {
    STORAGE_DRIVER: 'r2',
    R2_ENDPOINT: 'https://acc.r2.cloudflarestorage.com',
    R2_BUCKET: 'dershane',
    R2_ACCESS_KEY_ID: 'ak',
    R2_SECRET_ACCESS_KEY: 'sk',
  };

  it('varsayılan local', () => {
    expect(resolveStorageDriver({})).toBe('local');
  });

  it('r2 için eksik env varsa açıklayıcı hata fırlatır', () => {
    expect(() => resolveStorageDriver({ STORAGE_DRIVER: 'r2' })).toThrow(
      /R2_ENDPOINT.*R2_BUCKET.*R2_ACCESS_KEY_ID.*R2_SECRET_ACCESS_KEY/s,
    );
  });

  it('r2 tam yapılandırıldığında kabul eder; region varsayılan auto', () => {
    expect(resolveStorageDriver(R2_ENV)).toBe('r2');
    expect(r2ConfigFromEnv(R2_ENV).region).toBe('auto');
    expect(r2ConfigFromEnv({ ...R2_ENV, R2_REGION: 'weur' }).region).toBe('weur');
  });

  it('bilinmeyen sürücüyü reddeder', () => {
    expect(() => resolveStorageDriver({ STORAGE_DRIVER: 's3' })).toThrow(/Bilinmeyen STORAGE_DRIVER/);
  });

  it('geçersiz R2_ENDPOINT\'i açık hata ile reddeder (kriptik "Invalid URL" yerine)', () => {
    expect(() =>
      r2ConfigFromEnv({ ...R2_ENV, R2_ENDPOINT: 'acc.r2.cloudflarestorage.com' }),
    ).toThrow(/geçerli bir URL/);
    expect(() =>
      r2ConfigFromEnv({ ...R2_ENV, R2_ENDPOINT: 'https://<acc>.r2.cloudflarestorage.com' }),
    ).toThrow(/geçerli bir URL/);
  });
});

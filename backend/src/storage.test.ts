/**
 * Storage servis testleri — key üretimi, görsel küçültme, PDF aynen saklama,
 * HEIC dönüşüm hatası ve key doğrulama (path traversal koruması).
 * (vitest.config.ts `UPLOADS_DIR` ile ayrı temp dizin kullanır.)
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import sharp from 'sharp';
import { saveUpload, localPathFor, type StoredFile } from './services/storage.js';
import { AppError } from './errors.js';

const PDF_BUFFER = Buffer.from('%PDF-1.4 test icerik');

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
    const fakeHeic = Buffer.from('not a real heic file');
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

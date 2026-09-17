/**
 * Yerel depo sıfırlama (wipe/reset) testleri.
 *
 * İki garanti:
 *  1) `removeLocalUploads` yalnızca verilen yerel klasörü siler.
 *  2) `wipe`/`reset` script'leri ve yardımcı, uzak depoya (R2/S3) dair hiçbir
 *     çağrı/token içermez — kaynak-koruma testi (regresyon kilidi).
 */

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { removeLocalUploads } from './localReset.js';

const BACKEND_ROOT = path.join(import.meta.dirname, '..', '..');

describe('removeLocalUploads', () => {
  it('yalnızca verilen yerel klasörü siler; komşusuna dokunmaz', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'localreset-'));
    const uploads = path.join(root, 'uploads');
    const sibling = path.join(root, 'baska');
    fs.mkdirSync(path.join(uploads, 'alt'), { recursive: true });
    fs.writeFileSync(path.join(uploads, 'a.jpg'), 'A');
    fs.mkdirSync(sibling, { recursive: true });
    fs.writeFileSync(path.join(sibling, 'korun.jpg'), 'K');

    expect(removeLocalUploads(uploads)).toBe(true);
    expect(fs.existsSync(uploads)).toBe(false);
    expect(fs.existsSync(path.join(sibling, 'korun.jpg'))).toBe(true);

    fs.rmSync(root, { recursive: true, force: true });
  });

  it('klasör yoksa false döner, hiçbir şey yapmaz', () => {
    expect(removeLocalUploads(path.join(os.tmpdir(), 'yok-boyle-dizin-xyz'))).toBe(false);
  });
});

describe('wipe/reset — R2 dokunmaz (kaynak koruma)', () => {
  // Uzak depoya işaret eden herhangi bir kod token'ı varsa test kırılır.
  const FORBIDDEN = /deleteStored|presignedGetUrl|downloadToFile|GetObjectCommand|PutObjectCommand|DeleteObjectCommand|ListObjectsV2|S3Client|@aws-sdk|storage\.js/;

  for (const rel of ['scripts/wipe.ts', 'scripts/reset.ts', 'src/services/localReset.ts']) {
    it(`${rel} uzak depo çağrısı içermez`, () => {
      const src = fs.readFileSync(path.join(BACKEND_ROOT, rel), 'utf8');
      expect(FORBIDDEN.test(src)).toBe(false);
    });
  }
});

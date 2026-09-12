/**
 * Dosya imzası (magic-byte) doğrulama birim testleri — Bulgu #9.
 * Gerçek fixture dosyaları `src/test/fixtures/` altındadır.
 */

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  detectFileFormat,
  declaredFormat,
  looksLikeUtf8Text,
} from './fileSignature.js';

const FIXTURES = path.join(import.meta.dirname, '..', 'test', 'fixtures');
const fixture = (name: string): Buffer => fs.readFileSync(path.join(FIXTURES, name));

describe('detectFileFormat', () => {
  it('gerçek fixture dosyalarını doğru tanır', () => {
    expect(detectFileFormat(fixture('sample.jpg'))).toBe('jpeg');
    expect(detectFileFormat(fixture('sample.png'))).toBe('png');
    expect(detectFileFormat(fixture('sample.pdf'))).toBe('pdf');
    expect(detectFileFormat(fixture('sample.heic'))).toBe('heic');
  });

  it('görsel/PDF olmayan içerikleri unknown döner', () => {
    expect(detectFileFormat(Buffer.from('<html><body>hi</body></html>'))).toBe('unknown');
    expect(detectFileFormat(Buffer.from('MZ this is an exe'))).toBe('unknown');
    expect(detectFileFormat(Buffer.alloc(0))).toBe('unknown');
  });

  it('PDF imzasını ilk 1024 baytta arar (BOM/ön söz toleransı)', () => {
    expect(detectFileFormat(Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from('%PDF-1.7')]))).toBe('pdf');
    const late = Buffer.concat([Buffer.alloc(2000, 0x20), Buffer.from('%PDF-1.7')]);
    expect(detectFileFormat(late)).toBe('unknown'); // 1024 dışında
  });
});

describe('declaredFormat', () => {
  it('uzantı öncelikli, sonra mime', () => {
    expect(declaredFormat('foto.JPG', 'application/octet-stream')).toBe('jpeg');
    expect(declaredFormat('x.png', 'image/png')).toBe('png');
    expect(declaredFormat('x.heif', 'image/heif')).toBe('heic');
    expect(declaredFormat('x.pdf', 'application/pdf')).toBe('pdf');
    expect(declaredFormat('bilinmeyen.bin', 'image/jpeg')).toBe('jpeg');
    expect(declaredFormat('x.txt', 'text/plain')).toBeNull();
  });
});

describe('looksLikeUtf8Text', () => {
  it('geçerli CSV metnini kabul eder (BOM dahil)', () => {
    expect(looksLikeUtf8Text(Buffer.from('ad,sinif\r\nAli,6\r\n', 'utf8'))).toBe(true);
    expect(looksLikeUtf8Text(Buffer.from('\uFEFFad,sinif\r\nAli,6\r\n', 'utf8'))).toBe(true);
  });

  it('ikili içeriği reddeder (NUL veya bozuk UTF-8)', () => {
    expect(looksLikeUtf8Text(Buffer.from([0x61, 0x00, 0x62]))).toBe(false);
    expect(looksLikeUtf8Text(Buffer.from([0xff, 0xfe, 0x00, 0x01]))).toBe(false);
  });
});

import { describe, it, expect } from 'vitest';
import {
  hashPassword,
  hashPasswordSync,
  verifyPassword,
  verifyPasswordSync,
} from './hash.js';

describe('hash — senkron', () => {
  it('hash üretir ve doğru parolayla doğrular', () => {
    const encoded = hashPasswordSync('admin123');
    expect(encoded.startsWith('scrypt$')).toBe(true);
    expect(verifyPasswordSync('admin123', encoded)).toBe(true);
  });

  it('yanlış parolayı reddeder', () => {
    const encoded = hashPasswordSync('admin123');
    expect(verifyPasswordSync('yanlis', encoded)).toBe(false);
  });

  it('aynı parola farklı salt ile farklı hash üretir', () => {
    const a = hashPasswordSync('admin123');
    const b = hashPasswordSync('admin123');
    expect(a).not.toBe(b);
  });

  it('bozuk formatı reddeder', () => {
    expect(() => verifyPasswordSync('x', 'bozuk-format')).toThrow();
  });
});

describe('hash — asenkron', () => {
  it('hash üretir ve doğrular', async () => {
    const encoded = await hashPassword('sifre123');
    expect(await verifyPassword('sifre123', encoded)).toBe(true);
    expect(await verifyPassword('yanlis', encoded)).toBe(false);
  });

  it('senkron üretilen hash asenkron doğrulanabilir (ve tersi)', async () => {
    const syncHash = hashPasswordSync('ortak-parola');
    expect(await verifyPassword('ortak-parola', syncHash)).toBe(true);

    const asyncHash = await hashPassword('ortak-parola');
    expect(verifyPasswordSync('ortak-parola', asyncHash)).toBe(true);
  });
});
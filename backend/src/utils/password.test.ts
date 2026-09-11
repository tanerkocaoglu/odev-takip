import { describe, expect, it } from 'vitest';
import { passwordSchema } from './password.js';

describe('passwordSchema (kullanıcı şifresi politikası)', () => {
  it('8+ karakter, büyük, küçük ve rakam içeren şifreyi kabul eder', () => {
    expect(passwordSchema.safeParse('GucluSifre1').success).toBe(true);
    expect(passwordSchema.safeParse('Aaaa1111').success).toBe(true);
  });

  it('Türkçe büyük/küçük harfleri de kabul eder', () => {
    expect(passwordSchema.safeParse('Şifreli123').success).toBe(true);
    expect(passwordSchema.safeParse('İstanbul1x').success).toBe(true);
  });

  it('kısa şifreyi reddeder', () => {
    const res = passwordSchema.safeParse('Ab1');
    expect(res.success).toBe(false);
  });

  it('büyük harf olmadan reddeder', () => {
    expect(passwordSchema.safeParse('sifre1234').success).toBe(false);
  });

  it('küçük harf olmadan reddeder', () => {
    expect(passwordSchema.safeParse('SIFRE1234').success).toBe(false);
  });

  it('rakam olmadan reddeder', () => {
    expect(passwordSchema.safeParse('SifreSifre').success).toBe(false);
  });
});

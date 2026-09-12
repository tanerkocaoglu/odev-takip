/**
 * Rate limit middleware birim testleri (Bulgu #7).
 * Express'e gerek kalmadan factory doğrudan çağrılır: pencere/max/anahtar
 * izolasyonu/pencere sıfırlama/mesaj ve env-okuma davranışı.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  rateLimit,
  clearRateLimits,
  envPositiveInt,
} from './middleware/rateLimit.js';
import { AppError } from './errors.js';

type NextSpy = ReturnType<typeof vi.fn>;

function run(mw: ReturnType<typeof rateLimit>, key = 'k'): { next: NextSpy; err: unknown } {
  const next: NextSpy = vi.fn();
  mw({ ip: '1.1.1.1', key } as never, {} as never, next);
  return { next, err: next.mock.calls.at(-1)?.[0] };
}

beforeEach(() => {
  clearRateLimits();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('rateLimit middleware', () => {
  it('max kadar geçirir, aşınca 429 RATE_LIMITED + özel mesaj', () => {
    const mw = rateLimit({ windowMs: 1000, max: 2, keyFn: () => 'k', message: 'Özel limit.' });
    expect(run(mw).err).toBeUndefined();
    expect(run(mw).err).toBeUndefined();
    const third = run(mw).err;
    expect(third).toBeInstanceOf(AppError);
    expect((third as AppError).code).toBe('RATE_LIMITED');
    expect((third as AppError).status).toBe(429);
    expect((third as AppError).message).toBe('Özel limit.');
  });

  it('farklı anahtarlar bağımsız kovadır', () => {
    const mw = rateLimit({ windowMs: 1000, max: 1, keyFn: (req) => String((req as { key?: string }).key) });
    expect(run(mw, 'a').err).toBeUndefined();
    expect(run(mw, 'a').err).toBeInstanceOf(AppError); // a dolu
    expect(run(mw, 'b').err).toBeUndefined(); // b etkilenmez
  });

  it('pencere geçince sayaç sıfırlanır', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    const mw = rateLimit({ windowMs: 1000, max: 1, keyFn: () => 'k' });
    expect(run(mw).err).toBeUndefined();
    expect(run(mw).err).toBeInstanceOf(AppError);
    vi.setSystemTime(new Date('2026-01-01T00:00:02Z')); // +2 sn > pencere
    expect(run(mw).err).toBeUndefined();
  });
});

describe('envPositiveInt', () => {
  const NAME = 'ZZ_TEST_RATE_MAX';
  afterEach(() => delete process.env[NAME]);

  it('geçerli pozitif tamsayıyı okur', () => {
    process.env[NAME] = '8';
    expect(envPositiveInt(NAME, 5)).toBe(8);
  });

  it('boş/geçersiz/0/sıfır-olmayan-negatif değerde fallback döner', () => {
    delete process.env[NAME];
    expect(envPositiveInt(NAME, 5)).toBe(5);
    process.env[NAME] = 'abc';
    expect(envPositiveInt(NAME, 5)).toBe(5);
    process.env[NAME] = '0';
    expect(envPositiveInt(NAME, 5)).toBe(5);
    process.env[NAME] = '-3';
    expect(envPositiveInt(NAME, 5)).toBe(5);
  });
});

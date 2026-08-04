/**
 * OTP servis birim testleri — spec.md §2.1:
 * 6 hane, 10 dk geçerlilik, 2 dk yeniden gönderim aralığı,
 * 5 hatalı deneme, yeni OTP isteğinde eski OTP'lerin iptali, tek kullanım.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { db } from '../db/index.js';
import { AppError } from '../errors.js';
import {
  requestOtp,
  verifyOtp,
  OTP_TTL_MS,
  OTP_RESEND_MS,
} from '../services/otp.js';
import { resetDb, insertTestUsers } from '../test/helpers.js';

beforeEach(() => {
  resetDb();
  insertTestUsers();
});

afterEach(() => {
  vi.useRealTimers();
});

function latestOtpRow(userId: string): {
  code: string;
  is_valid: number;
  attempts: number;
} | null {
  return (
    (db
      .prepare(
        `SELECT code, is_valid, attempts FROM otp_codes
         WHERE user_id = ? ORDER BY created_at DESC, id DESC LIMIT 1`,
      )
      .get(userId) as { code: string; is_valid: number; attempts: number } | undefined) ??
    null
  );
}

describe('requestOtp', () => {
  it('6 haneli kod üretir ve geçerli kaydı oluşturur', () => {
    const { code } = requestOtp('test-guardian');
    expect(code).toMatch(/^\d{6}$/);

    const row = latestOtpRow('test-guardian');
    expect(row).not.toBeNull();
    expect(row!.code).toBe(code);
    expect(row!.is_valid).toBe(1);
    expect(row!.attempts).toBe(0);
  });

  it('2 dakika içinde ikinci istek 429 RATE_LIMITED fırlatır', () => {
    requestOtp('test-guardian');
    expect(() => requestOtp('test-guardian')).toThrow(AppError);
    try {
      requestOtp('test-guardian');
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      expect((err as AppError).code).toBe('RATE_LIMITED');
    }
  });

  it('2 dakika sonra yeni OTP istenebilir ve eski OTP geçersiz kılınır', () => {
    vi.useFakeTimers({ toFake: ['Date'] });

    const first = requestOtp('test-guardian');
    vi.advanceTimersByTime(OTP_RESEND_MS + 1);

    const second = requestOtp('test-guardian');
    expect(second.code).not.toBe(first.code);

    const firstRow = db
      .prepare(
        `SELECT is_valid FROM otp_codes WHERE user_id = ? AND code = ?`,
      )
      .get('test-guardian', first.code) as { is_valid: number };
    expect(firstRow.is_valid).toBe(0);

    const latest = latestOtpRow('test-guardian');
    expect(latest!.code).toBe(second.code);
    expect(latest!.is_valid).toBe(1);
  });

  it('süresi dolmuş eski OTP varken de 2 dakika kuralı geçerlidir', () => {
    vi.useFakeTimers({ toFake: ['Date'] });

    requestOtp('test-guardian');
    vi.advanceTimersByTime(OTP_TTL_MS + OTP_RESEND_MS + 1);
    // Süresi doldu ama "gönderim" 2 dk önce yapılmadı — yeni istek engellenmez.
    const { code } = requestOtp('test-guardian');
    expect(code).toMatch(/^\d{6}$/);
  });
});

describe('verifyOtp', () => {
  it('doğru kodla ok döner; OTP tek kullanımlıktır', () => {
    const { code } = requestOtp('test-student');

    expect(verifyOtp('test-student', code)).toBe('ok');
    expect(verifyOtp('test-student', code)).toBe('invalid');

    const row = latestOtpRow('test-student');
    expect(row!.is_valid).toBe(0);
  });

  it('hatalı kod attempts sayısını artırır', () => {
    requestOtp('test-guardian');
    expect(verifyOtp('test-guardian', '000000')).toBe('invalid');
    const row = latestOtpRow('test-guardian');
    expect(row!.attempts).toBe(1);
  });

  it('5 hatalı denemede OTP geçersiz kılınır (locked)', () => {
    requestOtp('test-guardian');
    for (let i = 0; i < 4; i++) {
      expect(verifyOtp('test-guardian', '000000')).toBe('invalid');
    }
    expect(verifyOtp('test-guardian', '000000')).toBe('locked');

    const row = latestOtpRow('test-guardian');
    expect(row!.is_valid).toBe(0);
  });

  it('kilitlendikten sonra doğru kod bile kabul edilmez', () => {
    const { code } = requestOtp('test-guardian');
    for (let i = 0; i < 5; i++) {
      verifyOtp('test-guardian', '000000');
    }
    expect(verifyOtp('test-guardian', code)).toBe('invalid');
  });

  it('süresi dolan kod expired döner', () => {
    vi.useFakeTimers({ toFake: ['Date'] });

    const { code } = requestOtp('test-guardian');
    vi.advanceTimersByTime(OTP_TTL_MS + 1);

    expect(verifyOtp('test-guardian', code)).toBe('expired');
    const row = latestOtpRow('test-guardian');
    expect(row!.is_valid).toBe(0);
  });

  it('kayıt yoksa invalid döner', () => {
    expect(verifyOtp('test-guardian', '123456')).toBe('invalid');
  });
});

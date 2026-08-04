/**
 * OTP üretim ve doğrulama — spec.md §2.1:
 * - 6 hane (`crypto.randomInt` — `Math.random` kullanılmaz)
 * - 10 dakika geçerli
 * - Aynı telefona 2 dakika içinde ikinci OTP gönderilemez (429)
 * - 5 hatalı denemede OTP geçersiz kılınır (yeni OTP alınması gerekir)
 * - Yeni OTP isteği, kullanıcının kullanılmamış tüm eski OTP'lerini geçersiz kılar
 * - Tek kullanımlık: başarılı doğrulama `used_at` doldurur, `is_valid = 0` yapar
 */

import { randomInt, randomUUID } from 'node:crypto';
import { db } from '../db/index.js';
import { AppError } from '../errors.js';

export const OTP_TTL_MS = 10 * 60 * 1000;
export const OTP_RESEND_MS = 2 * 60 * 1000;
export const OTP_MAX_ATTEMPTS = 5;

function iso(offsetMs = 0): string {
  return new Date(Date.now() + offsetMs).toISOString();
}

interface OtpRow {
  id: string;
  code: string;
  is_valid: number;
  attempts: number;
  expires_at: string;
  last_sent_at: string;
}

/** Kullanıcının en son OTP kaydı (yoksa null). */
function latestOtp(userId: string): OtpRow | null {
  return (
    (db
      .prepare(
        `SELECT id, code, is_valid, attempts, expires_at, last_sent_at
         FROM otp_codes
         WHERE user_id = ?
         ORDER BY created_at DESC, id DESC
         LIMIT 1`,
      )
      .get(userId) as OtpRow | undefined) ?? null
  );
}

/**
 * Yeni OTP üretir ve kaydeder. 2 dakika içinde ikinci istek olursa 429.
 * Dönen kod SMS'e gider; API yanıtına yazılmaz (geliştirmede console.log).
 */
export function requestOtp(userId: string): { code: string } {
  const latest = latestOtp(userId);
  if (latest) {
    const lastSent = Date.parse(latest.last_sent_at);
    if (Date.now() - lastSent < OTP_RESEND_MS) {
      throw new AppError(
        'RATE_LIMITED',
        429,
        'Bu numaraya 2 dakika içinde tekrar kod gönderilemez.',
      );
    }
  }

  // Kullanılmamış tüm eski OTP'ler geçersiz.
  db.prepare(
    `UPDATE otp_codes SET is_valid = 0 WHERE user_id = ? AND is_valid = 1`,
  ).run(userId);

  const code = String(randomInt(100000, 1000000));
  db.prepare(
    `INSERT INTO otp_codes
       (id, user_id, code, is_valid, attempts, expires_at, last_sent_at, used_at, created_at)
     VALUES (?, ?, ?, 1, 0, ?, ?, NULL, ?)`,
  ).run(randomUUID(), userId, code, iso(OTP_TTL_MS), iso(), iso());

  return { code };
}

export type OtpVerifyResult = 'ok' | 'invalid' | 'expired' | 'locked';

/**
 * Kodu doğrular; başarılıysa OTP tek kullanımlık olarak tüketilir.
 * - `invalid`: kod hatalı (deneme sayısı artar)
 * - `expired`: süresi dolmuş
 * - `locked`: 5 hatalı deneme aşılmış (OTP geçersiz kılınır)
 */
export function verifyOtp(userId: string, code: string): OtpVerifyResult {
  const latest = latestOtp(userId);
  if (!latest || latest.is_valid !== 1) {
    return 'invalid';
  }

  if (Date.parse(latest.expires_at) <= Date.now()) {
    db.prepare(`UPDATE otp_codes SET is_valid = 0 WHERE id = ?`).run(latest.id);
    return 'expired';
  }

  if (latest.attempts >= OTP_MAX_ATTEMPTS) {
    db.prepare(`UPDATE otp_codes SET is_valid = 0 WHERE id = ?`).run(latest.id);
    return 'locked';
  }

  if (latest.code !== code) {
    const attempts = latest.attempts + 1;
    db.prepare(`UPDATE otp_codes SET attempts = ? WHERE id = ?`).run(
      attempts,
      latest.id,
    );
    if (attempts >= OTP_MAX_ATTEMPTS) {
      // 5. hatalı deneme: OTP geçersiz kılınır, yeni OTP alınmalı.
      db.prepare(`UPDATE otp_codes SET is_valid = 0 WHERE id = ?`).run(latest.id);
      return 'locked';
    }
    return 'invalid';
  }

  db.prepare(
    `UPDATE otp_codes SET is_valid = 0, used_at = ? WHERE id = ?`,
  ).run(iso(), latest.id);
  return 'ok';
}

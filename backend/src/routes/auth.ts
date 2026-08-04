/**
 * Auth rotaları — `/api/v1/auth/*` (spec.md §2, §2.1):
 *
 * - `POST /auth/login`       — admin/öğretmen: e-posta + şifre
 *                              (scrypt doğrulama ASENKRON — seed'in senkron
 *                              sürümü login'de kullanılmaz, event loop bloklanmaz)
 * - `POST /auth/otp/request` — veli/öğrenci: telefon → OTP gönder
 * - `POST /auth/otp/verify`  — veli/öğrenci: telefon + kod → JWT
 * - `GET  /auth/me`          — oturum bilgisi (korunan; frontend oturum kontrolü)
 */

import { Router, type NextFunction, type Request, type RequestHandler, type Response } from 'express';
import { z } from 'zod';
import { db } from '../db/index.js';
import { AppError } from '../errors.js';
import { verifyPassword } from '../utils/hash.js';
import { signToken } from '../utils/token.js';
import { sendSms } from '../services/sms.js';
import { requestOtp, verifyOtp } from '../services/otp.js';
import { requireAuth } from '../middleware/auth.js';
import { rateLimit } from '../middleware/rateLimit.js';
import type { AuthUser, Role } from '../types.js';

const router = Router();

/** Express 4 async hataları otomatik yakalamaz; next'e iletir. */
function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
): RequestHandler {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
}

/** Kullanıcının girdiği numaradan boşluk/tire/parantezleri temizler. */
function normalizePhone(raw: string): string {
  return raw.replace(/[\s\-()]/g, '');
}

interface LoadedUser {
  authUser: AuthUser;
  full_name: string;
  phone: string;
  email: string | null;
  tv: number;
}

/** Kullanıcıyı detaylarıyla yükler; aktif değilse/seçilemezse null. */
function loadAuthUser(userId: string): LoadedUser | null {
  const row = db
    .prepare(
      `SELECT u.id, u.full_name, u.phone, u.email, u.role,
              u.token_version AS tv, u.is_active, u.deleted_at,
              s.id AS student_id, g.id AS guardian_id
       FROM users u
       LEFT JOIN students s ON s.user_id = u.id AND s.deleted_at IS NULL
       LEFT JOIN guardians g ON g.user_id = u.id AND g.deleted_at IS NULL
       WHERE u.id = ?`,
    )
    .get(userId) as
    | {
        id: string;
        full_name: string;
        phone: string;
        email: string | null;
        role: Role;
        tv: number;
        is_active: number;
        deleted_at: string | null;
        student_id: string | null;
        guardian_id: string | null;
      }
    | undefined;

  if (!row || row.deleted_at !== null || row.is_active !== 1) {
    return null;
  }

  return {
    authUser: {
      id: row.id,
      role: row.role,
      teacher_id: row.role === 'teacher' ? row.id : null,
      student_id: row.student_id,
      guardian_id: row.guardian_id,
    },
    full_name: row.full_name,
    phone: row.phone,
    email: row.email,
    tv: row.tv,
  };
}

function publicUser(loaded: LoadedUser) {
  return {
    id: loaded.authUser.id,
    full_name: loaded.full_name,
    role: loaded.authUser.role,
    phone: loaded.phone,
    email: loaded.email,
  };
}

// ---------- POST /auth/login ----------

const loginSchema = z.object({
  email: z.string().trim().email('Geçerli bir e-posta adresi girin.'),
  password: z.string().min(1, 'Şifre boş olamaz.'),
});

router.post(
  '/login',
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    // IP + hesap bazlı — aynı e-postaya farklı IP'lerden de sınırlı.
    keyFn: (req) => `${req.ip}:login:${String(req.body?.email ?? '').toLowerCase()}`,
  }),
  asyncHandler(async (req, res) => {
    const { email, password } = loginSchema.parse(req.body);

    const found = db
      .prepare(
        `SELECT id, password_hash, role, is_active
         FROM users WHERE email = ? AND deleted_at IS NULL`,
      )
      .get(email) as
      | { id: string; password_hash: string | null; role: Role; is_active: number }
      | undefined;

    const passwordOk =
      found &&
      found.password_hash !== null &&
      (found.role === 'admin' || found.role === 'teacher')
        ? await verifyPassword(password, found.password_hash)
        : false;

    // Hesap var/yok ayrımı sızdırılmaz — aynı hata mesajı.
    if (!found || !passwordOk) {
      throw new AppError('UNAUTHORIZED', 401, 'E-posta veya şifre hatalı.');
    }

    if (found.is_active !== 1) {
      throw new AppError('UNAUTHORIZED', 401, 'Bu hesap pasif durumda. Yöneticiyle iletişime geçin.');
    }

    const loaded = loadAuthUser(found.id);
    if (!loaded) {
      throw new AppError('UNAUTHORIZED', 401, 'E-posta veya şifre hatalı.');
    }

    const token = signToken(loaded.authUser, loaded.tv);
    res.json({ token, user: publicUser(loaded) });
  }),
);

// ---------- POST /auth/otp/request ----------

const otpRequestSchema = z.object({
  phone: z.string().trim().min(10, 'Geçerli bir telefon numarası girin.'),
});

router.post(
  '/otp/request',
  asyncHandler(async (req, res) => {
    const { phone: rawPhone } = otpRequestSchema.parse(req.body);
    const phone = normalizePhone(rawPhone);

    const user = db
      .prepare(
        `SELECT id, role FROM users
         WHERE phone = ? AND deleted_at IS NULL AND is_active = 1`,
      )
      .get(phone) as { id: string; role: Role } | undefined;

    if (!user || (user.role !== 'guardian' && user.role !== 'student')) {
      throw new AppError('NOT_FOUND', 404, 'Bu telefona kayıtlı hesap bulunamadı.');
    }

    const { code } = requestOtp(user.id);
    await sendSms(phone, `Dershane giriş kodunuz: ${code}. Kod 10 dakika geçerlidir.`);

    res.json({ message: 'Giriş kodu gönderildi.' });
  }),
);

// ---------- POST /auth/otp/verify ----------

const otpVerifySchema = z.object({
  phone: z.string().trim().min(10, 'Geçerli bir telefon numarası girin.'),
  code: z.string().regex(/^\d{6}$/, 'Kod 6 haneli olmalı.'),
});

router.post(
  '/otp/verify',
  asyncHandler(async (req, res) => {
    const { phone: rawPhone, code } = otpVerifySchema.parse(req.body);
    const phone = normalizePhone(rawPhone);

    const user = db
      .prepare(
        `SELECT id, role FROM users
         WHERE phone = ? AND deleted_at IS NULL AND is_active = 1`,
      )
      .get(phone) as { id: string; role: Role } | undefined;

    if (!user || (user.role !== 'guardian' && user.role !== 'student')) {
      // Hesap yoksa da genel hata — telefon sızdırılmaz.
      throw new AppError('UNAUTHORIZED', 401, 'Kod geçersiz.');
    }

    const result = verifyOtp(user.id, code);
    if (result !== 'ok') {
      const message =
        result === 'expired'
          ? 'Kodun süresi doldu, yeni kod isteyin.'
          : result === 'locked'
            ? 'Çok fazla hatalı deneme yapıldı, yeni kod isteyin.'
            : 'Kod geçersiz.';
      throw new AppError('UNAUTHORIZED', 401, message);
    }

    const loaded = loadAuthUser(user.id);
    if (!loaded) {
      throw new AppError('UNAUTHORIZED', 401, 'Kod geçersiz.');
    }

    const token = signToken(loaded.authUser, loaded.tv);
    res.json({ token, user: publicUser(loaded) });
  }),
);

// ---------- GET /auth/me ----------

router.get('/me', requireAuth, (req, res) => {
  const loaded = loadAuthUser(req.user!.id);
  if (!loaded) {
    throw new AppError('UNAUTHORIZED', 401, 'Oturum geçersiz, tekrar giriş yapın.');
  }
  res.json({ user: publicUser(loaded) });
});

export default router;

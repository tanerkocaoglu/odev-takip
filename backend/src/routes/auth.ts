/**
 * Auth rotaları — `/api/v1/auth/*` (spec.md §2, §2.1):
 *
 * - `POST /auth/login` — tek giriş noktası:
 *     admin/öğretmen: `email` + şifre (değişmedi)
 *     veli/öğrenci:   `username` + şifre (OTP kaldırıldı — migration #5)
 *   İstemci `identifier` gönderir; sunucu email mi username mi olduğuna göre
 *   çözer ve rolü buna göre sınırlar (email → admin/teacher,
 *   username → guardian/student).
 * - `GET  /auth/me` — oturum bilgisi (korunan; frontend oturum kontrolü)
 *
 * Güvenlik notları:
 * - Hesap var/yok sızıntısı önlenir: bulunamayan identifier için de sahte bir
 *   hash'e karşı `verifyPassword` çalıştırılır (yanıt süresinden sızma olmaz).
 * - Brute-force: IP + identifier bazlı 15 dk / 5 deneme → 429 (rateLimit).
 */

import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db/index.js';
import { AppError } from '../errors.js';
import { verifyPassword, hashPasswordSync, hashPassword } from '../utils/hash.js';
import { passwordSchema } from '../utils/password.js';
import { signToken } from '../utils/token.js';
import { requireAuth } from '../middleware/auth.js';
import { rateLimit } from '../middleware/rateLimit.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import type { AuthUser, Role } from '../types.js';

const router = Router();

interface LoadedUser {
  authUser: AuthUser;
  full_name: string;
  username: string | null;
  email: string | null;
  mustChangePassword: boolean;
  tv: number;
}

/** Kullanıcıyı detaylarıyla yükler; aktif değilse/seçilemezse null. */
function loadAuthUser(userId: string): LoadedUser | null {
  const row = db
    .prepare(
      `SELECT u.id, u.full_name, u.username, u.email, u.role,
              u.token_version AS tv, u.is_active, u.deleted_at,
              u.must_change_password,
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
      username: string | null;
      email: string | null;
      role: Role;
      tv: number;
      is_active: number;
      deleted_at: string | null;
      must_change_password: number;
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
    username: row.username,
    email: row.email,
    mustChangePassword: row.must_change_password === 1,
    tv: row.tv,
  };
}

function publicUser(loaded: LoadedUser) {
  return {
    id: loaded.authUser.id,
    full_name: loaded.full_name,
    role: loaded.authUser.role,
    username: loaded.username,
    email: loaded.email,
    must_change_password: loaded.mustChangePassword,
  };
}

// ---------- POST /auth/login ----------

const loginSchema = z.object({
  identifier: z
    .string()
    .trim()
    .min(1, 'E-posta veya kullanıcı adı boş olamaz.'),
  password: z.string().min(1, 'Şifre boş olamaz.'),
});

// Kullanıcı bulunamadığında da zamanlama eşitlensin — hesap var/yok sızmasın.
// (Yüklenme sırasında bir kez üretilir; doğrulanması amaçlanan bir hash değil.)
const DUMMY_HASH = hashPasswordSync('timing-equality-dummy');

// LOGIN_RATE_LIMIT_MAX env'den okunur; varsayılan 5 (production güvenli).
// Demo ortamında .env'e LOGIN_RATE_LIMIT_MAX=10 yazarak gevşetilebilir.
const LOGIN_RATE_LIMIT_MAX = Number(process.env.LOGIN_RATE_LIMIT_MAX ?? 5);

router.post(
  '/login',
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: LOGIN_RATE_LIMIT_MAX,
    // IP + hesap bazlı — aynı identifier'a farklı IP'lerden de sınırlı.
    keyFn: (req) =>
      `${req.ip}:login:${String(req.body?.identifier ?? '').toLowerCase()}`,
  }),
  asyncHandler(async (req, res) => {
    const { identifier, password } = loginSchema.parse(req.body);
    const idKey = identifier.toLowerCase();

    const found = db
      .prepare(
        `SELECT id, username, email, password_hash, role, is_active
         FROM users
         WHERE (email = ? OR username = ?) AND deleted_at IS NULL`,
      )
      .get(idKey, idKey) as
      | {
        id: string;
        username: string | null;
        email: string | null;
        password_hash: string | null;
        role: Role;
        is_active: number;
      }
      | undefined;

    // Eşleşme anahtarı rolü doğrulamalı: email → admin/teacher,
    // username → guardian/student. (Aksi halde bir e-posta başka bir kullanıcının
    // username'i olarak kullanılamaz.)
    const matchedByEmail =
      found !== undefined && found.email !== null && found.email.toLowerCase() === idKey;
    const matchedByUsername =
      found !== undefined &&
      found.username !== null &&
      found.username.toLowerCase() === idKey;

    const loginAllowed =
      (matchedByEmail && (found!.role === 'admin' || found!.role === 'teacher')) ||
      (matchedByUsername &&
        (found!.role === 'guardian' || found!.role === 'student'));

    const passwordOk =
      loginAllowed && found!.password_hash !== null
        ? await verifyPassword(password, found!.password_hash)
        : await verifyPassword(password, DUMMY_HASH);

    // Hesap var/yok ayrımı sızdırılmaz — aynı hata mesajı.
    if (!found || !loginAllowed || !passwordOk) {
      throw new AppError('UNAUTHORIZED', 401, 'E-posta/kullanıcı adı veya şifre hatalı.');
    }

    if (found.is_active !== 1) {
      throw new AppError('UNAUTHORIZED', 401, 'Bu hesap pasif durumda. Yöneticiyle iletişime geçin.');
    }

    const loaded = loadAuthUser(found.id);
    if (!loaded) {
      throw new AppError('UNAUTHORIZED', 401, 'E-posta/kullanıcı adı veya şifre hatalı.');
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

// ---------- POST /auth/change-password ----------
// Kullanıcının kendi şifresini belirlemesi (zorunlu ilk değişim dahil).
// Mevcut şifre doğrulanır; yeni şifre katı politikaya tabidir (spec §2.1).
// Başarıda `must_change_password = 0` ve `token_version + 1`; eski token ölür,
// istemciye yeni token döner.

const changePasswordSchema = z.object({
  current_password: z.string().min(1, 'Mevcut şifre boş olamaz.'),
  new_password: passwordSchema,
});

router.post(
  '/change-password',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { current_password, new_password } = changePasswordSchema.parse(req.body);

    const row = db
      .prepare(
        `SELECT id, password_hash FROM users WHERE id = ? AND deleted_at IS NULL`,
      )
      .get(req.user!.id) as { id: string; password_hash: string | null } | undefined;
    if (!row || row.password_hash === null) {
      throw new AppError('UNAUTHORIZED', 401, 'Oturum geçersiz, tekrar giriş yapın.');
    }

    const currentOk = await verifyPassword(current_password, row.password_hash);
    if (!currentOk) {
      throw new AppError(
        'VALIDATION_ERROR',
        400,
        'Mevcut şifre hatalı.',
        { current_password: 'Mevcut şifre hatalı.' },
      );
    }

    const sameAsOld = await verifyPassword(new_password, row.password_hash);
    if (sameAsOld) {
      throw new AppError(
        'VALIDATION_ERROR',
        400,
        'Yeni şifre mevcut şifreyle aynı olamaz.',
        { new_password: 'Yeni şifre mevcut şifreyle aynı olamaz.' },
      );
    }

    const passwordHash = await hashPassword(new_password);
    db.prepare(
      `UPDATE users
       SET password_hash = ?, must_change_password = 0, token_version = token_version + 1
       WHERE id = ?`,
    ).run(passwordHash, row.id);

    const loaded = loadAuthUser(row.id);
    if (!loaded) {
      throw new AppError('UNAUTHORIZED', 401, 'Oturum geçersiz, tekrar giriş yapın.');
    }

    const token = signToken(loaded.authUser, loaded.tv);
    res.json({ token, user: publicUser(loaded) });
  }),
);

export default router;

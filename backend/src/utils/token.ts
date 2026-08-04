/**
 * JWT sarmalayıcı — jsonwebtoken üzerinde ince bir katman.
 *
 * JWT payload: `{ id, role, teacher_id?, student_id?, guardian_id?, tv }`
 * (CLAUDE.md). Ömür rol bazlıdır (spec.md §2.1):
 * - admin/öğretmen: 7 gün
 * - veli/öğrenci: 30 gün
 */

import jwt from 'jsonwebtoken';
import type { AuthUser, Role } from '../types.js';

export const TOKEN_TTL = {
  admin: '7d',
  teacher: '7d',
  guardian: '30d',
  student: '30d',
} as const satisfies Record<Role, string>;

export interface JwtPayload extends AuthUser {
  tv: number;
}

function secret(): string {
  const value = process.env.JWT_SECRET?.trim();
  if (!value) {
    throw new Error('JWT_SECRET ortam değişkeni boş. backend/.env dosyasını kontrol edin.');
  }
  return value;
}

export function signToken(user: AuthUser, tv: number): string {
  return jwt.sign({ ...user, tv }, secret(), {
    expiresIn: TOKEN_TTL[user.role],
  });
}

/** Token geçersiz/süresi dolmuşsa hata fırlatır. */
export function verifyToken(token: string): JwtPayload {
  return jwt.verify(token, secret()) as JwtPayload;
}

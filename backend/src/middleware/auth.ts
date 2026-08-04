/**
 * JWT kimlik doğrulama middleware'i (CLAUDE.md):
 * - `Authorization: Bearer <token>` zorunlu; yoksa/geçersizse 401
 * - `token_version` (`tv`) her istekte DB ile karşılaştırılır; eşit
 *   değilse 401 (kullanıcı pasifleştirildi/silindi/şifresi değişti)
 * - `req.user` kurulur; role DB'den okunur (payload'a güvenilmez)
 */

import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { db } from '../db/index.js';
import { AppError } from '../errors.js';
import { verifyToken } from '../utils/token.js';
import type { AuthUser } from '../types.js';

const UNAUTHORIZED_MESSAGE = 'Oturum geçersiz veya süresi dolmuş, tekrar giriş yapın.';

export const requireAuth: RequestHandler = (
  req: Request,
  _res: Response,
  next: NextFunction,
): void => {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    next(new AppError('UNAUTHORIZED', 401, 'Giriş yapmanız gerekiyor.'));
    return;
  }

  const token = header.slice('Bearer '.length).trim();
  let payload;
  try {
    payload = verifyToken(token);
  } catch {
    next(new AppError('UNAUTHORIZED', 401, UNAUTHORIZED_MESSAGE));
    return;
  }

  const user = db
    .prepare(
      `SELECT id, role, token_version, is_active, deleted_at
       FROM users WHERE id = ?`,
    )
    .get(payload.id) as
    | { id: string; role: AuthUser['role']; token_version: number; is_active: number; deleted_at: string | null }
    | undefined;

  if (
    !user ||
    user.deleted_at !== null ||
    user.is_active !== 1 ||
    payload.tv !== user.token_version
  ) {
    next(new AppError('UNAUTHORIZED', 401, UNAUTHORIZED_MESSAGE));
    return;
  }

  req.user = {
    id: user.id,
    role: user.role,
    teacher_id: payload.teacher_id ?? null,
    student_id: payload.student_id ?? null,
    guardian_id: payload.guardian_id ?? null,
  };
  next();
};

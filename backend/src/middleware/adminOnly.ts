/**
 * Admin-only koruma — `requireAuth`'tan SONRA kullanılır.
 * Rol admin değilse 403 FORBIDDEN.
 */

import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { AppError } from '../errors.js';

export const adminOnly: RequestHandler = (
  req: Request,
  _res: Response,
  next: NextFunction,
): void => {
  if (req.user?.role !== 'admin') {
    next(new AppError('FORBIDDEN', 403, 'Bu işlem için yönetici yetkisi gerekli.'));
    return;
  }
  next();
};

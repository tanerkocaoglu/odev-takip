/**
 * Genel rate limit middleware — in-memory sabit pencere.
 *
 * Brute-force koruması için kullanılır (login vb.); CLAUDE.md'de planlanan
 * rateLimit middleware'i budur. Pencere key başına `max` isteği kabul eder,
 * aşımda `429 RATE_LIMITED` döner.
 *
 * Not: Tek işlemcili/single-process geliştirme ortamı için yeterlidir;
 * üretimde birden fazla örnek çalışırsa paylaşılan bir mağazaya geçilir.
 */

import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { AppError } from '../errors.js';

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

/** Testlerde kullanım: tüm kovaları temizler. */
export function clearRateLimits(): void {
  buckets.clear();
}

export interface RateLimitOptions {
  windowMs: number;
  max: number;
  /** İsteği kimin sayılacağı — genelde IP + hesap anahtarı. */
  keyFn: (req: Request) => string;
  message?: string;
}

export function rateLimit(options: RateLimitOptions): RequestHandler {
  const message =
    options.message ??
    'Çok fazla deneme yapıldı, lütfen birkaç dakika sonra tekrar deneyin.';

  return (req: Request, _res: Response, next: NextFunction): void => {
    const key = options.keyFn(req);
    const now = Date.now();
    const bucket = buckets.get(key);

    if (!bucket || bucket.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + options.windowMs });
      next();
      return;
    }

    bucket.count += 1;
    if (bucket.count > options.max) {
      next(new AppError('RATE_LIMITED', 429, message));
      return;
    }
    next();
  };
}

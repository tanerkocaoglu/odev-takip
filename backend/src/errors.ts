import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { MulterError } from 'multer';

export type ApiErrorCode =
  | 'VALIDATION_ERROR'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'RATE_LIMITED'
  | 'INTERNAL'
  | 'GONE';

export class AppError extends Error {
  constructor(
    public readonly code: ApiErrorCode,
    public readonly status: number,
    message: string,
    public readonly fields?: Record<string, string>,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

/**
 * Tek biçimli hata yanıtı:
 * { "error": { "code": "...", "message": "...", "fields": { ... } } }
 * Rotalar hata fırlatır; bu middleware yanıtı biçimlendirir.
 */
export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (err instanceof ZodError) {
    const fieldErrors: Record<string, string> = {};
    const flattened = err.flatten().fieldErrors as Record<
      string,
      string[] | undefined
    >;
    for (const [field, messages] of Object.entries(flattened)) {
      const firstMessage = messages?.[0];
      if (firstMessage) {
        fieldErrors[field] = firstMessage;
      }
    }
    res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Girilen bilgiler geçersiz.',
        fields: fieldErrors,
      },
    });
    return;
  }

  if (err instanceof AppError) {
    const body: Record<string, unknown> = {
      error: {
        code: err.code,
        message: err.message,
      },
    };
    if (err.fields) {
      body.error = { ...(body.error as object), fields: err.fields };
    }
    res.status(err.status).json(body);
    return;
  }

  // Multer limit ihlalleri (10 MB / 10 dosya) — Türkçe, tek biçimli hata.
  if (err instanceof MulterError) {
    const message =
      err.code === 'LIMIT_FILE_SIZE'
        ? 'Dosya başına en fazla 10 MB yükleyebilirsiniz.'
        : err.code === 'LIMIT_FILE_COUNT'
          ? 'Teslim başına en fazla 10 dosya yükleyebilirsiniz.'
          : 'Dosya yüklenemedi.';
    res.status(400).json({
      error: { code: 'VALIDATION_ERROR', message },
    });
    return;
  }

  // Beklenmeyen hata — istemciye yığın izi gönderilmez.
  console.error(err);
  res.status(500).json({
    error: {
      code: 'INTERNAL',
      message: 'Bir hata oluştu.',
    },
  });
}
/**
 * Admin alt router'ları arasında paylaşılan sabitler/yardımcılar.
 *
 * Pahalı admin işlemleri (CSV import, yedek) için düşük frekanslı limit
 * (Bulgu #7); anahtar admin kullanıcı ID'sidir. Import ile backup AYRI kovadır.
 */

import type { Response } from 'express';
import { z } from 'zod';
import { envPositiveInt } from '../../middleware/rateLimit.js';

export const EXPENSIVE_OP_WINDOW_MS = 60 * 60 * 1000; // 1 saat
export const ADMIN_IMPORT_RATE_LIMIT_MAX = envPositiveInt('ADMIN_IMPORT_RATE_LIMIT_MAX', 5);
export const ADMIN_BACKUP_RATE_LIMIT_MAX = envPositiveInt('ADMIN_BACKUP_RATE_LIMIT_MAX', 3);

/** Öğretmen/veli/öğrenci şifre sıfırlama gövdesi (ortak — üç grubun reset'i). */
export const resetPasswordSchema = z.object({
  password: z.string().min(6, 'Şifre en az 6 karakter olmalı.'),
});

/** CSV dosyasını ekranın aktif filtresiyle indirtir (UTF-8, BOM'lu). */
export function sendCsv(res: Response, filename: string, csv: string): void {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(csv);
}

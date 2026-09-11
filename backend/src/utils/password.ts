/**
 * Kullanıcının kendi seçtiği şifre politikası (spec.md §2.1):
 * en az 8 karakter + en az bir büyük harf + bir küçük harf + bir rakam.
 *
 * Yalnızca `change-password` (kullanıcı seçimi) için geçerlidir. Admin'in
 * girdiği geçici başlangıç şifresi ve CSV ortak şifresi min 6 ile sınırlıdır.
 *
 * Unicode sınıfları (`\p{Lu}`/`\p{Ll}`) kullanılır — Türkçe büyük/küçük
 * harfler (İ, Ş, ğ, ı) de geçerli sayılır.
 */

import { z } from 'zod';

export const PASSWORD_MIN_LENGTH = 8;

export const passwordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH, `Şifre en az ${PASSWORD_MIN_LENGTH} karakter olmalı.`)
  .regex(/\p{Lu}/u, 'Şifre en az bir büyük harf içermeli.')
  .regex(/\p{Ll}/u, 'Şifre en az bir küçük harf içermeli.')
  .regex(/\d/, 'Şifre en az bir rakam içermeli.');

export type Password = z.infer<typeof passwordSchema>;

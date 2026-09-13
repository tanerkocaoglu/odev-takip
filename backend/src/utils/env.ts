/**
 * backend/.env dosyasını okur ve process.env'e yazar (mevcut değerleri ezmez).
 *
 * Harici paket (dotenv) yok — satır satır basit ayrıştırıcı.
 * CLAUDE.md: backend/.env'de PORT, BASE_URL, JWT_SECRET, ADMIN_PASSWORD,
 * SEED_USER_PASSWORD, STORAGE_DRIVER bulunur.
 */

import fs from 'node:fs';
import path from 'node:path';

export function loadEnv(): void {
  const envPath = path.join(import.meta.dirname, '..', '..', '.env');
  if (!fs.existsSync(envPath)) return;

  const content = fs.readFileSync(envPath, 'utf-8');
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    const eq = line.indexOf('=');
    if (eq <= 0) continue;

    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    // Süreç ortamında zaten varsa ezme (test ortamı için).
    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

/**
 * Veliye gönderilen `/r/{token}` linki için genel taban URL (spec §5.4).
 *
 * Öncelik sırası:
 * 1. Açık `BASE_URL` — özel alan adı veya yerel geliştirme için.
 * 2. Render'ın otomatik `RENDER_EXTERNAL_URL`'i (web servisi için
 *    `https://odev-takip.example.com`) — üretimde elle env girmeyi gerektirmez.
 * 3. Geliştirme varsayılanı `http://localhost:5173`.
 *
 * Sondaki `/` temizlenir; böylece `.../r/{token}` çift slash üretmez.
 */
export function resolveBaseUrl(): string {
  const explicit = process.env.BASE_URL?.trim();
  if (explicit) return explicit.replace(/\/+$/, '');

  const renderUrl = process.env.RENDER_EXTERNAL_URL?.trim();
  if (renderUrl) return renderUrl.replace(/\/+$/, '');

  return 'http://localhost:5173';
}
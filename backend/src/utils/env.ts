/**
 * backend/.env dosyasını okur ve process.env'e yazar (mevcut değerleri ezmez).
 *
 * Harici paket (dotenv) yok — satır satır basit ayrıştırıcı.
 * CLAUDE.md: backend/.env'de PORT, BASE_URL, JWT_SECRET, ADMIN_PASSWORD,
 * SMS_PROVIDER_KEY, STORAGE_DRIVER bulunur.
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
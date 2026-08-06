/**
 * Yedek CLI — `npm run db:backup`.
 *
 * Sunucu isteği dışında, ayrı process'te çalışır (CLAUDE.md: `DatabaseSync`
 * senkrondur; toplu işlemler sunucu içinden değil). Tutarlı bir SQLite kopyası
 * (`VACUUM INTO`) + uploads klasörünü tek .zip'te birleştirir.
 * Çıktı: üretilen zip dosyasının yolu (admin endpoint'i stdout'tan okur).
 */

import { loadEnv } from '../src/utils/env.js';
import { createBackup } from '../src/services/backup.js';

loadEnv();

const zipPath = createBackup();
console.log(zipPath);

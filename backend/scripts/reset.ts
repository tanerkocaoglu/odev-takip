import fs from 'node:fs';
import path from 'node:path';

/**
 * CLI: npm run db:reset
 * app.db'yi siler, migration'ları yeniden çalıştırır, seed yükler.
 * Yalnızca geliştirme ortamı içindir.
 */

const dbPath = path.join(import.meta.dirname, '..', 'db', 'app.db');

// WAL/SHM dosyaları da silinir (açık bağlantı varsa Windows'ta kilitlenebilir).
for (const suffix of ['', '-wal', '-shm']) {
  const file = dbPath + suffix;
  if (fs.existsSync(file)) {
    fs.rmSync(file);
  }
}

console.log('Veritabanı silindi. Migration çalıştırılıyor…');

// Migration'ları çalıştır (import yan etkisi olarak bağlantı kurulur).
await import('../src/db/migrate.js');

// Seed placeholder — Aşama 1'de doldurulacak.
// await import('../src/db/seed.js');

console.log('Reset tamam.');
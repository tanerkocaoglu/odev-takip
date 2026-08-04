import fs from 'node:fs';
import path from 'node:path';
import { loadEnv } from '../src/utils/env.js';

/**
 * CLI: npm run db:reset
 * app.db'yi siler, migration'ları yeniden çalıştırır ve seed yükler.
 * Yalnızca geliştirme ortamı içindir.
 */

loadEnv();

const adminPassword = process.env.ADMIN_PASSWORD?.trim();
if (!adminPassword) {
  console.error('ADMIN_PASSWORD ortam değişkeni boş. backend/.env dosyasını kontrol edin.');
  process.exit(1);
}

const userPassword = process.env.SEED_USER_PASSWORD?.trim();
if (!userPassword) {
  console.error('SEED_USER_PASSWORD ortam değişkeni boş. backend/.env dosyasını kontrol edin.');
  process.exit(1);
}

const dbPath = path.join(import.meta.dirname, '..', 'db', 'app.db');

// WAL/SHM dosyaları da silinir (açık bağlantı varsa Windows'ta kilitlenebilir).
for (const suffix of ['', '-wal', '-shm']) {
  const file = dbPath + suffix;
  if (fs.existsSync(file)) {
    fs.rmSync(file);
  }
}

console.log('Veritabanı silindi. Migration + seed çalıştırılıyor…');

// Migration'ları + seed'i şema kurulduktan sonra yükle.
// (Statik import olsaydı `db` bağlantısı silme işleminden önce açılırdı
// ve Windows'ta app.db kilitli kalırdı — bu yüzden dinamik import.)
const { seedDatabase } = await import('../src/db/seed.js');

// Seed, runMigrations'ı da çağırır (idempotenttir).
await seedDatabase(adminPassword, userPassword);

console.log('Reset tamam.');

import fs from 'node:fs';
import path from 'node:path';
import { loadEnv } from '../src/utils/env.js';
import { removeLocalUploads } from '../src/services/localReset.js';

/**
 * CLI: npm run db:reset
 * app.db'yi siler, migration'ları yeniden çalıştırır ve seed yükler.
 * Yalnızca geliştirme ortamı içindir.
 */

loadEnv();

// Üretimde varsayılan olarak çalışmaz: DB ve yerel dosya deposunu geri
// döndürülemez şekilde siler. Yalnızca açık bir opt-in ile (ör. diski kalıcı
// olmayan demo servisi) üretimde de izin verilir.
const allowReset =
  process.env.ALLOW_DB_RESET === '1' || process.env.ALLOW_DB_RESET === 'true';
if (process.env.NODE_ENV === 'production' && !allowReset) {
  console.error(
    'db:reset üretim ortamında çalıştırılamaz (NODE_ENV=production). ' +
      'Bilinçli demo için ALLOW_DB_RESET=1 verin.',
  );
  process.exit(1);
}

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

// DB yolu tek kaynaktan (db/index.ts ile aynı kural): önce `DB_PATH`, yoksa
// geliştirme varsayılanı `backend/db/app.db`. Üretimde render.yaml
// `DB_PATH=/var/data/app.db` tanımlar; sabit yola bakmak yanlış dosyayı siler
// (gerçek DB dokunulmadan kalır, seed ise DB_PATH'e yazar) — bu yüzden zorunlu.
const dbPath = process.env.DB_PATH ?? path.join(import.meta.dirname, '..', 'db', 'app.db');

console.log(`DB yolu:     ${dbPath}`);

// WAL/SHM dosyaları da silinir (açık bağlantı varsa Windows'ta kilitlenebilir).
for (const suffix of ['', '-wal', '-shm']) {
  const file = dbPath + suffix;
  if (fs.existsSync(file)) {
    fs.rmSync(file);
  }
}

console.log('Veritabanı silindi. Migration + seed çalıştırılıyor…');

// DB ile birlikte yerel yüklemeleri de temizle; aksi hâlde yetim dosyalar
// diskte kalır. `storage.ts` ile aynı kural: önce `UPLOADS_DIR` (render.yaml:
// /var/data/uploads), yoksa `backend/uploads`.
// NOT: Bu yalnızca YEREL klasörü siler; uzak depoya (R2) dokunulmaz.
const uploadsDir =
  process.env.UPLOADS_DIR ?? path.join(import.meta.dirname, '..', 'uploads');
console.log(`Uploads yolu: ${uploadsDir}`);
if (removeLocalUploads(uploadsDir)) {
  console.log('Yüklenen dosyalar silindi (uploads).');
}

// Migration'ları + seed'i şema kurulduktan sonra yükle.
// (Statik import olsaydı `db` bağlantısı silme işleminden önce açılırdı
// ve Windows'ta app.db kilitli kalırdı — bu yüzden dinamik import.)
const { seedDatabase } = await import('../src/db/seed.js');

// Seed, runMigrations'ı da çağırır (idempotenttir).
await seedDatabase(adminPassword, userPassword);

console.log('Reset tamam.');

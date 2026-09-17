import fs from 'node:fs';
import path from 'node:path';
import { loadEnv } from '../src/utils/env.js';
import { removeLocalUploads } from '../src/services/localReset.js';

/**
 * CLI: npm run db:wipe
 *
 * Veritabanı dosyasını ve uploads klasörünü siler, migration'ları yeniden
 * çalıştırır ve **seed ÇAĞIRMAZ**. Sonuç: şeması kurulu, içinde hiç kayıt
 * olmayan temiz bir veritabanı. Render Shell'den elle çalıştırılır.
 *
 * `reset.ts`'ten tek farkı: demo/örnek veri (seed) yüklemez. Yollar
 * `db/index.ts` ve `storage.ts` ile aynı kuraldan gelir: önce `DB_PATH` /
 * `UPLOADS_DIR` (üretimde render.yaml: /var/data/...), yoksa geliştirme
 * varsayılanları.
 *
 * Yıkıcıdır: üretimde yalnızca açık `ALLOW_DB_WIPE=1` (veya `true`) ile çalışır.
 */

loadEnv();

// Üretimde varsayılan olarak çalışmaz: DB'yi ve yerel dosya deposunu geri
// döndürülemez şekilde siler. Bilinçli kullanım için açık opt-in gerekir
// (mevcut ALLOW_DB_RESET deseniyle tutarlı).
const allowWipe =
  process.env.ALLOW_DB_WIPE === '1' || process.env.ALLOW_DB_WIPE === 'true';
if (process.env.NODE_ENV === 'production' && !allowWipe) {
  console.error(
    'db:wipe üretim ortamında çalıştırılamaz (NODE_ENV=production). ' +
      'Bilinçli kullanım için ALLOW_DB_WIPE=1 verin.',
  );
  process.exit(1);
}

// DB yolu tek kaynaktan (db/index.ts ile aynı kural): önce `DB_PATH`, yoksa
// geliştirme varsayılanı `backend/db/app.db`.
const dbPath = process.env.DB_PATH ?? path.join(import.meta.dirname, '..', 'db', 'app.db');

console.log(`DB yolu:     ${dbPath}`);

// WAL/SHM dosyaları da silinir (açık bağlantı varsa Windows'ta kilitlenebilir).
for (const suffix of ['', '-wal', '-shm']) {
  const file = dbPath + suffix;
  if (fs.existsSync(file)) {
    fs.rmSync(file);
  }
}

// Yerel dosya deposunu da temizle; aksi hâlde yetim dosyalar diskte kalır.
// `storage.ts` ile aynı kural: önce `UPLOADS_DIR`, yoksa `backend/uploads`.
// NOT: Bu yalnızca YEREL klasörü siler; uzak depoya (R2) dokunulmaz.
const uploadsDir =
  process.env.UPLOADS_DIR ?? path.join(import.meta.dirname, '..', 'uploads');
console.log(`Uploads yolu: ${uploadsDir}`);
if (removeLocalUploads(uploadsDir)) {
  console.log('Yüklenen dosyalar silindi (uploads).');
}

console.log('Boş veritabanı oluşturuluyor (yalnızca migration, seed yok)…');

// DB bağlantısı silme işleminden SONRA açılsın diye dinamik import: statik
// import edilseydi `db` bağlantısı dosya silinmeden önce açılır ve Windows'ta
// app.db kilitli kalırdı. Seed KASITLI olarak çağrılmaz.
const { runMigrations } = await import('../src/db/migrations.js');
runMigrations();

console.log('Wipe tamam. Veritabanı şeması kurulu ve boş.');

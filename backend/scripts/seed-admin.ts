/**
 * CLI: npm run seed-admin
 *
 * Üretimde İLK admin hesabını oluşturur. Seed'in aksine yalnızca admin yazar;
 * demo verisi (öğretmen/öğrenci/sınıf/rapor) üretmez.
 *
 * - İdempotent: aktif bir admin zaten varsa hiçbir şeye dokunmaz.
 * - `ADMIN_PASSWORD` zorunludur (backend/.env veya Render env).
 * - Bekleyen migration'ları da çalıştırır; DB bağlantısı `loadEnv()` SONRASINDA
 *   dinamik import ile açılır ki `DB_PATH` doğru okunsun.
 *
 * Kullanım (deploy sonrası, Render Shell):
 *   npm run seed-admin --prefix backend
 */

import { randomUUID } from 'node:crypto';
import { loadEnv } from '../src/utils/env.js';
import { normalizeTurkish } from '../src/utils/text.js';
import { hashPassword } from '../src/utils/hash.js';

loadEnv();

const adminPassword = process.env.ADMIN_PASSWORD?.trim();
if (!adminPassword) {
  console.error('ADMIN_PASSWORD ortam değişkeni boş. backend/.env veya Render env kontrol edin.');
  process.exit(1);
}

const adminName = process.env.ADMIN_NAME?.trim() || 'Sistem Yöneticisi';
const adminEmail = process.env.ADMIN_EMAIL?.trim() || 'admin@dershane.local';

const { db } = await import('../src/db/index.js');
const { runMigrations } = await import('../src/db/migrations.js');

runMigrations();

const existing = db
  .prepare(`SELECT id, email FROM users WHERE role = 'admin' AND deleted_at IS NULL LIMIT 1`)
  .get() as { id: string; email: string | null } | undefined;

if (existing) {
  console.log(`Admin zaten mevcut (${existing.email ?? existing.id}); değişiklik yapılmadı.`);
  process.exit(0);
}

const passwordHash = await hashPassword(adminPassword);

db.prepare(
  `INSERT INTO users
     (id, full_name, full_name_normalized, email, password_hash, role,
      is_active, token_version, deleted_at, created_at, username, must_change_password)
   VALUES (?, ?, ?, ?, ?, 'admin', 1, 1, NULL, ?, NULL, 0)`,
).run(
  randomUUID(),
  adminName,
  normalizeTurkish(adminName),
  adminEmail,
  passwordHash,
  new Date().toISOString(),
);

console.log(`İlk admin oluşturuldu: ${adminEmail}`);

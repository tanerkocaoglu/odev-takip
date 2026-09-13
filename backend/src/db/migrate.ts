import { db } from './index.js';
import { latestMigrationVersion, runMigrations } from './migrations.js';
import { createBackup } from '../services/backup.js';

/**
 * CLI: npm run db:migrate
 * Bekleyen migration'ları çalıştırır. Hata olursa uygulama açılmaz.
 *
 * Güvenlik (CLAUDE.md): bekleyen migration varsa önce tam yedek alınır
 * (`createBackup`) — geri dönüşsüz şema/veri değişikliği öncesi proje kuralı.
 * Yedek başarısız olursa migration hiç başlamaz.
 */
try {
  const current = (
    db.prepare('PRAGMA user_version').get() as { user_version: number }
  ).user_version;
  const latest = latestMigrationVersion();

  if (latest <= current) {
    console.log(`Bekleyen migration yok (sürüm ${current}).`);
  } else {
    const backupPath = createBackup();
    console.log(`Yedek alındı: ${backupPath}`);
    runMigrations();
    console.log(`Migration tamam (${current} → ${latest}).`);
  }
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
}

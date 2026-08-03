import { runMigrations } from './migrations.js';

/**
 * CLI: npm run db:migrate
 * Bekleyen migration'ları çalıştırır. Hata olursa uygulama açılmaz.
 */
try {
  runMigrations();
  console.log('Migration tamam.');
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
}
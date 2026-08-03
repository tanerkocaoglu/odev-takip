import { db } from './index.js';

/**
 * Migration listesi — PRAGMA user_version tabanlı sıralı runner.
 * Her migration bir fonksiyondur; BEGIN/COMMIT/ROLLBACK ile sarılır.
 * Hata olursa uygulama açılmaz (hata yutulmaz).
 *
 * Dondurma kuralı: Aşama 1 bitmeden #1 düzenlenebilir; sonrası yeni numara.
 */
const migrations: Array<{ version: number; name: string; up: () => void }> = [];

export function registerMigration(
  version: number,
  name: string,
  up: () => void,
): void {
  migrations.push({ version, name, up });
}

export function runMigrations(): void {
  const row = db.prepare('SELECT user_version FROM pragma_user_version').get() as
    | { user_version: number }
    | undefined;
  const currentVersion = row?.user_version ?? 0;

  const pending = migrations
    .filter((m) => m.version > currentVersion)
    .sort((a, b) => a.version - b.version);

  for (const migration of pending) {
    // Migration #1 Aşama 1'de eklenecek; Aşama 0'da runner hazırdır.
    // Migration mutlaka 1'den başlamalıdır.
    if (migration.version !== currentVersion + 1) {
      throw new Error(
        `Migration sırası bozuk: beklenen ${currentVersion + 1}, alınan ${migration.version} (${migration.name})`,
      );
    }

    db.exec('BEGIN');
    try {
      migration.up();
      db.exec(`PRAGMA user_version = ${migration.version}`);
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw new Error(
        `Migration #${migration.version} (${migration.name}) başarısız: ${
          err instanceof Error ? err.message : String(err)
        }`,
        { cause: err },
      );
    }
  }
}
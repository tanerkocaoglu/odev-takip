import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import fs from 'node:fs';

// Test ortamı `DB_PATH` env'i ile ayrı/geçici bir veritabanı kullanabilir
// (vitest.config.ts); üretim kodunda her zaman backend/db/app.db.
const dbPath = process.env.DB_PATH ?? path.join(import.meta.dirname, '..', '..', 'db', 'app.db');
const dbDir = path.dirname(dbPath);

// db dizini yoksa oluştur (ilk çalıştırmada)
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

export const db = new DatabaseSync(dbPath);

// Zorunlu PRAGMA'lar — bağlantı kurulduktan hemen sonra
db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');
import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import fs from 'node:fs';

const dbDir = path.join(import.meta.dirname, '..', '..', 'db');
const dbPath = path.join(dbDir, 'app.db');

// db dizini yoksa oluştur (ilk çalıştırmada)
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

export const db = new DatabaseSync(dbPath);

// Zorunlu PRAGMA'lar — bağlantı kurulduktan hemen sonra
db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');
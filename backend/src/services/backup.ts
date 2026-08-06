/**
 * Yedekleme servisi — `npm run db:backup` CLI'ının çekirdeği (madde 3).
 *
 * Kural (CLAUDE.md): `DatabaseSync` senkrondur; yedek toplu bir işlem olduğu
 * için **sunucu isteği içinde değil, ayrı process'te** çalışır. Bu modül ayrı
 * script'ten (`scripts/backup.ts`) çağrılır; admin "Yedek indir" butonu CLI'ı
 * `child_process` ile spawn eder ve üretilen .zip'i indirir.
 *
 * Adımlar:
 * 1. `VACUUM INTO` ile tutarlı bir SQLite kopyası (WAL güvenli — çalışan
 *    sunucunun bağlantısına dokunmadan, ayrı bağlantıdan okur).
 * 2. DB kopyası + `uploads` klasörünü tek .zip dosyada birleştirir (adm-zip).
 * 3. Geçici DB kopyasını temizler; zip yolunu döner.
 */

import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import AdmZip from 'adm-zip';

function stamp(): string {
  const d = new Date();
  const p = (n: number): string => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(
    d.getMinutes(),
  )}${p(d.getSeconds())}`;
}

export interface BackupOptions {
  dbPath?: string;
  uploadsDir?: string;
  outDir?: string;
}

/** DB kopyasının yolunu SQL string literal'ine güvenli şekilde gömer (tek tırnak iki katına alınır). */
function sqlLiteral(p: string): string {
  return `'${p.replace(/'/g, "''")}'`;
}

/**
 * Tutarlı yedek üretir: `{outDir}/dershane-yedek-{zaman}.zip` döner.
 * DB kopyası zip içinde `veritabani/app.db`, uploads içeriği `uploads/` altında.
 */
export function createBackup(options: BackupOptions = {}): string {
  const dbPath = options.dbPath ?? process.env.DB_PATH ?? path.join('db', 'app.db');
  const uploadsDir =
    options.uploadsDir ?? process.env.UPLOADS_DIR ?? path.join('uploads');
  const outDir = options.outDir ?? path.join('backups');

  fs.mkdirSync(outDir, { recursive: true });
  const tmpDir = path.join(os.tmpdir(), `dershane-backup-${process.pid}`);
  fs.mkdirSync(tmpDir, { recursive: true });

  const dbCopy = path.join(tmpDir, 'app.db');
  const zipPath = path.join(outDir, `dershane-yedek-${stamp()}.zip`);

  try {
    // 1) Tutarlı SQLite kopyası — VACUUM INTO (ayrı bağlantı, WAL içeriğini kapsar).
    const db = new DatabaseSync(dbPath);
    db.exec(`VACUUM INTO ${sqlLiteral(dbCopy)}`);
    db.close();

    // 2) DB kopyası + uploads klasörü → tek .zip.
    const zip = new AdmZip();
    zip.addFile('veritabani/app.db', fs.readFileSync(dbCopy));
    if (fs.existsSync(uploadsDir)) {
      zip.addLocalFolder(uploadsDir, 'uploads');
    }
    zip.writeZip(zipPath);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }

  return zipPath;
}

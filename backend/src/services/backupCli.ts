/**
 * Yedek CLI köprüsü — admin "Yedek indir" butonunun spawn mantığı.
 *
 * Kural (CLAUDE.md): `DatabaseSync` senkrondur; yedek toplu bir işlem olduğu
 * için **sunucu isteği içinde değil, ayrı process'te** çalışır. Bu modül
 * `db:backup` CLI'ını ayrı process'te spawn eder, stdout'taki zip yolunu
 * doğrular (path traversal koruması) ve sonucu döner. Yanıtı route kurar.
 */

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

/** `services/` → `src/` → backend kökü (script ve tsx yolları buradan). */
const BACKEND_ROOT = path.join(import.meta.dirname, '..', '..');
/**
 * Backup CLI çıktısının yazıldığı dizin (script ile aynı kural): önce
 * `BACKUPS_DIR` (üretimde render.yaml: /var/data/backups), yoksa
 * geliştirme varsayılanı `backend/backups`.
 */
const BACKUPS_DIR = process.env.BACKUPS_DIR ?? path.join(BACKEND_ROOT, 'backups');

export interface BackupSpawnResult {
  ok: boolean;
  zipPath?: string;
  /** `ok: false` iken route'un 500 mesajı (davranış birebir korunur). */
  message?: string;
}

/** `db:backup` CLI'ını spawn eder; başarıda doğrulanmış zip yolunu döner. */
export function spawnBackup(): Promise<BackupSpawnResult> {
  return new Promise((resolve) => {
    const scriptPath = path.join(BACKEND_ROOT, 'scripts', 'backup.ts');
    const tsxCli = path.join(BACKEND_ROOT, 'node_modules', 'tsx', 'dist', 'cli.mjs');

    const child = spawn(process.execPath, [tsxCli, scriptPath], {
      cwd: BACKEND_ROOT,
      windowsHide: true,
      env: process.env,
    });

    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d: Buffer) => {
      stdout += String(d);
    });
    child.stderr.on('data', (d: Buffer) => {
      stderr += String(d);
    });
    child.on('error', (err) => {
      console.error('Yedek spawn hatası:', err);
      resolve({ ok: false, message: 'Yedek oluşturulamadı.' });
    });
    child.on('close', (code) => {
      if (code !== 0) {
        console.error('Yedek CLI hatası:', stderr);
        resolve({ ok: false, message: 'Yedek oluşturulamadı.' });
        return;
      }
      const lines = stdout
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean);
      const zipPath = lines[lines.length - 1] ?? '';
      const resolved = path.resolve(zipPath);
      if (!resolved.startsWith(path.resolve(BACKUPS_DIR)) || !fs.existsSync(resolved)) {
        console.error('Yedek dosyası bulunamadı:', zipPath);
        resolve({ ok: false, message: 'Yedek dosyası bulunamadı.' });
        return;
      }
      resolve({ ok: true, zipPath: resolved });
    });
  });
}

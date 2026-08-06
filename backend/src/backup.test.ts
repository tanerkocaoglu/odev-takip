/**
 * Yedekleme birim testi (madde 3) — `createBackup`:
 * `VACUUM INTO` ile tutarlı SQLite kopyası + uploads klasörü tek .zip'te.
 * Yalnızca servisi test eder; CLI spawn'ı (POST /admin/backup) canlı doğrulamada.
 */

import { describe, it, expect, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import AdmZip from 'adm-zip';
import { createBackup } from './services/backup.js';

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'dershane-backup-test-'));
const dbPath = path.join(tmpRoot, 'app.db');
const uploadsDir = path.join(tmpRoot, 'uploads');
const outDir = path.join(tmpRoot, 'out');

describe('createBackup', () => {
  it('VACUUM INTO kopyası + uploads içeriğini tek zip üretir', () => {
    fs.mkdirSync(uploadsDir, { recursive: true });
    fs.writeFileSync(path.join(uploadsDir, 'ornek.jpg'), 'JPEG-DATA');

    const db = new DatabaseSync(dbPath);
    db.exec('CREATE TABLE t (id TEXT PRIMARY KEY) STRICT');
    db.prepare('INSERT INTO t (id) VALUES (?)').run('satir-1');
    db.close();

    const zipPath = createBackup({ dbPath, uploadsDir, outDir });
    expect(fs.existsSync(zipPath)).toBe(true);

    const zip = new AdmZip(zipPath);
    const entries = zip.getEntries().map((e) => e.entryName);
    expect(entries).toContain('veritabani/app.db');
    expect(entries).toContain('uploads/ornek.jpg');

    // Kopya VACUUM ile tutarlıdır — veri içerir.
    expect(zip.readAsText('veritabani/app.db')).toContain('satir-1');
    expect(zip.readAsText('uploads/ornek.jpg')).toBe('JPEG-DATA');
  });

  it('uploads klasörü yoksa yalnızca veritabanı zip\'lenir', () => {
    const emptyOut = path.join(tmpRoot, 'out-empty');
    const zipPath = createBackup({ dbPath, uploadsDir: path.join(tmpRoot, 'yok'), outDir: emptyOut });
    const zip = new AdmZip(zipPath);
    const names = zip.getEntries().map((e) => e.entryName);
    expect(names).toContain('veritabani/app.db');
    expect(names.some((n) => n.startsWith('uploads/'))).toBe(false);
  });
});

afterAll(() => {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

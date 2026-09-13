/**
 * Yedekleme testleri — `createBackup`:
 * - `VACUUM INTO` tutarlı SQLite kopyası
 * - uploads dosyalarının DB ilişkisiyle anlamlı hiyerarşiye kopyalanması
 *   (`Ad_Soyad_kullaniciadi/Ders_Adi/Hafta_N/orijinal_dosya_adi`)
 * - ad çakışması, Türkçe/boşluk temizleme, tarihsel class_course
 * - thumbnail/sahipsiz → `_depo/`, canlı uploads değişmezliği, geçici temizlik
 * Yalnızca servisi test eder; CLI spawn'ı (POST /admin/backup) canlı doğrulamada.
 */

import { describe, it, expect, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import AdmZip from 'adm-zip';
import {
  createBackup,
  pruneBackups,
  asciiFoldTr,
  sanitizeSegment,
  sanitizeFilename,
} from './services/backup.js';

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'dershane-backup-test-'));

let seq = 0;
function freshCase(): { dbPath: string; uploadsDir: string; outDir: string } {
  seq += 1;
  const dir = path.join(tmpRoot, `case-${seq}`);
  const uploadsDir = path.join(dir, 'uploads');
  fs.mkdirSync(uploadsDir, { recursive: true });
  return { dbPath: path.join(dir, 'app.db'), uploadsDir, outDir: path.join(dir, 'out') };
}

/** Zincir tabloları (üretim şemasının yedek için gereken alt kümesi) + veri. */
function openFixture(dbPath: string): DatabaseSync {
  const db = new DatabaseSync(dbPath);
  db.exec('CREATE TABLE users (id TEXT PRIMARY KEY, full_name TEXT NOT NULL, username TEXT) STRICT');
  db.exec('CREATE TABLE students (id TEXT PRIMARY KEY, user_id TEXT NOT NULL) STRICT');
  db.exec('CREATE TABLE courses (id TEXT PRIMARY KEY, name TEXT NOT NULL) STRICT');
  db.exec('CREATE TABLE weeks (id TEXT PRIMARY KEY, week_no INTEGER NOT NULL) STRICT');
  db.exec(
    'CREATE TABLE class_courses (id TEXT PRIMARY KEY, class_id TEXT NOT NULL, course_id TEXT NOT NULL) STRICT',
  );
  db.exec(
    'CREATE TABLE enrollments (id TEXT PRIMARY KEY, student_id TEXT NOT NULL, class_id TEXT NOT NULL) STRICT',
  );
  db.exec(
    'CREATE TABLE homeworks (id TEXT PRIMARY KEY, report_id TEXT NOT NULL, class_course_id TEXT NOT NULL, week_id TEXT NOT NULL) STRICT',
  );
  db.exec(
    'CREATE TABLE submissions (id TEXT PRIMARY KEY, homework_id TEXT NOT NULL, student_id TEXT NOT NULL) STRICT',
  );
  db.exec(
    'CREATE TABLE submission_files (id TEXT PRIMARY KEY, submission_id TEXT NOT NULL, key TEXT NOT NULL, filename TEXT NOT NULL, thumb_key TEXT) STRICT',
  );
  return db;
}

function writeUpload(uploadsDir: string, key: string, content: string): void {
  fs.writeFileSync(path.join(uploadsDir, key), content);
}

function zipEntries(zipPath: string): string[] {
  return new AdmZip(zipPath)
    .getEntries()
    .map((e) => e.entryName)
    .sort();
}

function hashDir(dir: string): Record<string, string> {
  const out: Record<string, string> = {};
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!e.isFile()) continue;
    out[e.name] = createHash('sha256')
      .update(fs.readFileSync(path.join(dir, e.name)))
      .digest('hex');
  }
  return out;
}

function tempBackupDirs(): string[] {
  return fs
    .readdirSync(os.tmpdir(), { withFileTypes: true })
    .filter((e) => e.isDirectory() && e.name.startsWith('dershane-backup-'))
    .map((e) => e.name);
}

afterAll(() => {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

describe('isim temizleme yardımcıları', () => {
  it('Türkçe karakterleri ASCII\'ye indirger ama harf durumunu korur', () => {
    expect(asciiFoldTr('İstanbul Çözüm Şükrü Örnek')).toBe('Istanbul Cozum Sukru Ornek');
  });

  it('boşluk/geçersiz karakterleri alt çizgiye çevirir, ayılmış adları güvenceye alır', () => {
    expect(sanitizeSegment('Örnek Kişi 8')).toBe('Ornek_Kisi_8');
    expect(sanitizeSegment('C++ / C#')).toBe('C_C');
    expect(sanitizeSegment('CON')).toBe('CON_');
    expect(sanitizeSegment('   ')).toBe('_');
  });

  it('dosya adında uzantıyı korur', () => {
    expect(sanitizeFilename('çözüm ödevi.pdf')).toBe('cozum_odevi.pdf');
    expect(sanitizeFilename('IMG_001.JPG')).toBe('IMG_001.JPG');
    expect(sanitizeFilename('')).toBe('dosya');
  });
});

describe('createBackup — yapılandırılmış hiyerarşi', () => {
  it('dosyayı öğrenci/ders/hafta hiyerarşisine koyar; thumbnail _depo\'ya gider', () => {
    const { dbPath, uploadsDir, outDir } = freshCase();
    writeUpload(uploadsDir, '1111-aaaaaaaaaaaaaaaa.jpg', 'ORIJINAL');
    writeUpload(uploadsDir, '2222-bbbbbbbbbbbbbbbb.jpg', 'THUMB');

    const db = openFixture(dbPath);
    db.exec(`INSERT INTO users VALUES ('u1','Örnek Kişi 8','ornekkisi81')`);
    db.exec(`INSERT INTO students VALUES ('st1','u1')`);
    db.exec(`INSERT INTO courses VALUES ('c1','Matematik')`);
    db.exec(`INSERT INTO weeks VALUES ('w19',19)`);
    db.exec(`INSERT INTO class_courses VALUES ('cc1','classA','c1')`);
    db.exec(`INSERT INTO homeworks VALUES ('h1','r1','cc1','w19')`);
    db.exec(`INSERT INTO submissions VALUES ('s1','h1','st1')`);
    db.exec(
      `INSERT INTO submission_files VALUES
         ('f1','s1','1111-aaaaaaaaaaaaaaaa.jpg','odev_cozumu.jpg','2222-bbbbbbbbbbbbbbbb.jpg')`,
    );
    db.close();

    const zipPath = createBackup({ dbPath, uploadsDir, outDir });
    const entries = zipEntries(zipPath);

    expect(entries).toContain('veritabani/app.db');
    expect(entries).toContain(
      'Ornek_Kisi_8_ornekkisi81/Matematik/Hafta_19/odev_cozumu.jpg',
    );
    expect(entries).toContain('_depo/2222-bbbbbbbbbbbbbbbb.jpg');
    // Thumbnail hiyerarşiye girmez.
    expect(entries.some((e) => e.startsWith('Ornek_Kisi_8_ornekkisi81') && e.includes('2222'))).toBe(
      false,
    );

    const zip = new AdmZip(zipPath);
    expect(zip.readAsText('Ornek_Kisi_8_ornekkisi81/Matematik/Hafta_19/odev_cozumu.jpg')).toBe(
      'ORIJINAL',
    );
  });

  it('aynı klasörde ad çakışırsa _2 eki verir (sessiz üzerine yazma yok)', () => {
    const { dbPath, uploadsDir, outDir } = freshCase();
    writeUpload(uploadsDir, 'aaaa-0000000000000001.jpg', 'BIR');
    writeUpload(uploadsDir, 'bbbb-0000000000000002.jpg', 'IKI');

    const db = openFixture(dbPath);
    db.exec(`INSERT INTO users VALUES ('u1','Örnek Kişi 1','ornekkisi11')`);
    db.exec(`INSERT INTO students VALUES ('st1','u1')`);
    db.exec(`INSERT INTO courses VALUES ('c1','Fizik')`);
    db.exec(`INSERT INTO weeks VALUES ('w5',5)`);
    db.exec(`INSERT INTO class_courses VALUES ('cc1','classA','c1')`);
    db.exec(`INSERT INTO homeworks VALUES ('h1','r1','cc1','w5')`);
    db.exec(`INSERT INTO submissions VALUES ('s1','h1','st1')`);
    db.exec(
      `INSERT INTO submission_files VALUES
         ('f1','s1','aaaa-0000000000000001.jpg','IMG_001.jpg',NULL),
         ('f2','s1','bbbb-0000000000000002.jpg','IMG_001.jpg',NULL)`,
    );
    db.close();

    const entries = zipEntries(createBackup({ dbPath, uploadsDir, outDir }));
    expect(entries).toContain('Ornek_Kisi_1_ornekkisi11/Fizik/Hafta_5/IMG_001.jpg');
    expect(entries).toContain('Ornek_Kisi_1_ornekkisi11/Fizik/Hafta_5/IMG_001_2.jpg');
  });

  it('Türkçe karakterli ad/ders/dosya adını güvenli biçime çevirir', () => {
    const { dbPath, uploadsDir, outDir } = freshCase();
    writeUpload(uploadsDir, 'cccc-0000000000000003.pdf', 'PDF');

    const db = openFixture(dbPath);
    db.exec(`INSERT INTO users VALUES ('u1','Şükrü Örnek','sukruornek1')`);
    db.exec(`INSERT INTO students VALUES ('st1','u1')`);
    db.exec(`INSERT INTO courses VALUES ('c1','Coğrafya')`);
    db.exec(`INSERT INTO weeks VALUES ('w3',3)`);
    db.exec(`INSERT INTO class_courses VALUES ('cc1','classA','c1')`);
    db.exec(`INSERT INTO homeworks VALUES ('h1','r1','cc1','w3')`);
    db.exec(`INSERT INTO submissions VALUES ('s1','h1','st1')`);
    db.exec(
      `INSERT INTO submission_files VALUES
         ('f1','s1','cccc-0000000000000003.pdf','çözüm ödevi.pdf',NULL)`,
    );
    db.close();

    const entries = zipEntries(createBackup({ dbPath, uploadsDir, outDir }));
    expect(entries).toContain('Sukru_Ornek_sukruornek1/Cografya/Hafta_3/cozum_odevi.pdf');
  });

  it('öğrenci sınıf değiştirmişse homework\'in tarihsel class_course dersini kullanır', () => {
    const { dbPath, uploadsDir, outDir } = freshCase();
    writeUpload(uploadsDir, 'dddd-0000000000000004.jpg', 'ESKI');

    const db = openFixture(dbPath);
    // Öğrenci "eski" sınıfta Matematik görmüş; şimdi "yeni" sınıfta Fizik görüyor.
    db.exec(`INSERT INTO users VALUES ('u1','Deniz Demir','denizdemir1')`);
    db.exec(`INSERT INTO students VALUES ('st1','u1')`);
    db.exec(`INSERT INTO courses VALUES ('c-mat','Matematik'),('c-fiz','Fizik')`);
    db.exec(`INSERT INTO weeks VALUES ('w19',19)`);
    db.exec(
      `INSERT INTO class_courses VALUES
         ('cc-old','classEski','c-mat'),
         ('cc-new','classYeni','c-fiz')`,
    );
    // Güncel enrollment yeni sınıfa işaret ediyor...
    db.exec(`INSERT INTO enrollments VALUES ('en1','st1','classYeni')`);
    // ...ama ödev geçmişte eski class_course'ta verilmişti.
    db.exec(`INSERT INTO homeworks VALUES ('h1','r1','cc-old','w19')`);
    db.exec(`INSERT INTO submissions VALUES ('s1','h1','st1')`);
    db.exec(
      `INSERT INTO submission_files VALUES
         ('f1','s1','dddd-0000000000000004.jpg','eski_odev.jpg',NULL)`,
    );
    db.close();

    const entries = zipEntries(createBackup({ dbPath, uploadsDir, outDir }));
    expect(entries).toContain('Deniz_Demir_denizdemir1/Matematik/Hafta_19/eski_odev.jpg');
    expect(entries.some((e) => e.includes('/Fizik/'))).toBe(false);
  });

  it('teslim edilmeyen ödev için klasör/dosya oluşmaz', () => {
    const { dbPath, uploadsDir, outDir } = freshCase();
    writeUpload(uploadsDir, 'eeee-0000000000000005.jpg', 'TESLIM');

    const db = openFixture(dbPath);
    db.exec(`INSERT INTO users VALUES
      ('u1','Teslim Eden','teslimeden1'),('u2','Teslim Etmeyen','teslimetmeyen1')`);
    db.exec(`INSERT INTO students VALUES ('st1','u1'),('st2','u2')`);
    db.exec(`INSERT INTO courses VALUES ('c1','Kimya')`);
    db.exec(`INSERT INTO weeks VALUES ('w7',7)`);
    db.exec(`INSERT INTO class_courses VALUES ('cc1','classA','c1')`);
    db.exec(`INSERT INTO homeworks VALUES ('h1','r1','cc1','w7')`);
    db.exec(`INSERT INTO submissions VALUES ('s1','h1','st1')`);
    db.exec(
      `INSERT INTO submission_files VALUES
         ('f1','s1','eeee-0000000000000005.jpg','kimya.jpg',NULL)`,
    );
    db.close();

    const entries = zipEntries(createBackup({ dbPath, uploadsDir, outDir }));
    expect(entries).toContain('Teslim_Eden_teslimeden1/Kimya/Hafta_7/kimya.jpg');
    expect(entries.some((e) => e.startsWith('Teslim_Etmetmeyen'))).toBe(false);
  });

  it('DB\'de karşılığı olmayan (sahipsiz) dosyayı _depo\'ya koyar', () => {
    const { dbPath, uploadsDir, outDir } = freshCase();
    writeUpload(uploadsDir, 'ffff-0000000000000006.jpg', 'YETIM');

    const db = openFixture(dbPath);
    db.close();

    const entries = zipEntries(createBackup({ dbPath, uploadsDir, outDir }));
    expect(entries).toContain('_depo/ffff-0000000000000006.jpg');
  });

  it('canlı uploads klasörünü değiştirmez (hash öncesi/sonrası eşit)', () => {
    const { dbPath, uploadsDir, outDir } = freshCase();
    writeUpload(uploadsDir, 'abcd-1111111111111111.jpg', 'BIR');
    writeUpload(uploadsDir, 'abcd-2222222222222222.pdf', 'IKI');

    const db = openFixture(dbPath);
    db.exec(`INSERT INTO users VALUES ('u1','A B','ab1')`);
    db.exec(`INSERT INTO students VALUES ('st1','u1')`);
    db.exec(`INSERT INTO courses VALUES ('c1','Tarih')`);
    db.exec(`INSERT INTO weeks VALUES ('w1',1)`);
    db.exec(`INSERT INTO class_courses VALUES ('cc1','classA','c1')`);
    db.exec(`INSERT INTO homeworks VALUES ('h1','r1','cc1','w1')`);
    db.exec(`INSERT INTO submissions VALUES ('s1','h1','st1')`);
    db.exec(
      `INSERT INTO submission_files VALUES
         ('f1','s1','abcd-1111111111111111.jpg','a.jpg',NULL),
         ('f2','s1','abcd-2222222222222222.pdf','b.pdf',NULL)`,
    );
    db.close();

    const before = hashDir(uploadsDir);
    createBackup({ dbPath, uploadsDir, outDir });
    const after = hashDir(uploadsDir);

    expect(after).toEqual(before);
    expect(Object.keys(after)).toHaveLength(2);
  });

  it('uploads klasörü yoksa yalnızca veritabanı zip\'lenir', () => {
    const { dbPath, outDir } = freshCase();
    const emptyOut = path.join(outDir, 'empty');
    const missingUploads = path.join(tmpRoot, `yok-${seq}`);
    const db = openFixture(dbPath);
    db.close();

    const names = zipEntries(createBackup({ dbPath, uploadsDir: missingUploads, outDir: emptyOut }));
    expect(names).toContain('veritabani/app.db');
    expect(names).toHaveLength(1);
  });

  it('başarılı ve hatalı çalıştırmada geçici klasör bırakmaz', () => {
    const { dbPath, uploadsDir, outDir } = freshCase();
    const db = openFixture(dbPath);
    db.close();

    const before = tempBackupDirs().length;
    createBackup({ dbPath, uploadsDir, outDir });
    expect(tempBackupDirs().length).toBe(before);

    // Hata yolu: DB yolu bir klasör → DatabaseSync açamaz, finally temizler.
    const dirAsDb = path.join(tmpRoot, `dir-db-${seq}`);
    fs.mkdirSync(dirAsDb);
    const errorOut = path.join(tmpRoot, `error-out-${seq}`);
    expect(() => createBackup({ dbPath: dirAsDb, uploadsDir, outDir: errorOut })).toThrow();
    expect(tempBackupDirs().length).toBe(before);
    expect(fs.existsSync(errorOut) ? fs.readdirSync(errorOut) : []).toHaveLength(0);
  });
});

describe('pruneBackups', () => {
  it('en yeni keep tanesini tutar; eskileri siler, ilgisiz dosyalara dokunmaz', () => {
    const dir = path.join(tmpRoot, `prune-${(seq += 1)}`);
    fs.mkdirSync(dir, { recursive: true });
    const names = [
      'dershane-yedek-20250101-000001.zip',
      'dershane-yedek-20250102-000002.zip',
      'dershane-yedek-20250103-000003.zip',
      'dershane-yedek-20250104-000004.zip',
    ];
    for (const n of names) fs.writeFileSync(path.join(dir, n), 'x');
    fs.writeFileSync(path.join(dir, 'baska-dosya.txt'), 'x');
    fs.writeFileSync(path.join(dir, 'dershane-yedek-bozuk.zip'), 'x');

    const removed = pruneBackups(dir, 2);
    expect(removed).toEqual([names[0], names[1]]);
    expect(fs.existsSync(path.join(dir, names[2]))).toBe(true);
    expect(fs.existsSync(path.join(dir, names[3]))).toBe(true);
    // Desene uymayan / bozuk adlı dosyalar korunur.
    expect(fs.existsSync(path.join(dir, 'baska-dosya.txt'))).toBe(true);
    expect(fs.existsSync(path.join(dir, 'dershane-yedek-bozuk.zip'))).toBe(true);
  });

  it('dizin yoksa sessizce boş döner', () => {
    expect(pruneBackups(path.join(tmpRoot, 'yok-boyle-dizin'), 5)).toEqual([]);
  });
});

describe('createBackup — yaşlandırma (keep)', () => {
  it('en yeni N yedeği tutar; eski yedekler silinir', () => {
    const { dbPath, uploadsDir, outDir } = freshCase();
    const db = openFixture(dbPath);
    db.close();
    fs.mkdirSync(outDir, { recursive: true });
    const old = [
      'dershane-yedek-20250101-000001.zip',
      'dershane-yedek-20250102-000002.zip',
      'dershane-yedek-20250103-000003.zip',
    ];
    for (const n of old) fs.writeFileSync(path.join(outDir, n), 'x');

    createBackup({ dbPath, uploadsDir, outDir, keep: 2 });

    const zips = fs.readdirSync(outDir).filter((n) => n.endsWith('.zip')).sort();
    expect(zips).toHaveLength(2);
    // En yeni eski yedek korunur, en eskiler silinir; yeni üretilen de yerinde.
    expect(zips).toContain(old[2]);
    expect(zips.some((n) => !old.includes(n))).toBe(true);
  });
});

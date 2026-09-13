/**
 * Teslim dosyası temizliği testleri.
 *
 * Gerçek `submission_files` + disk ilişkisini kurar; dry-run'ın hiçbir şey
 * silmediğini, execute'ın DB ve diski tutarlı temizlediğini, ödev/rapor/teslim
 * yapısına dokunmadığını ve filtresiz çalışmanın reddedildiğini doğrular.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { db } from '../db/index.js';
import { resetDb, insertTestUsers } from '../test/helpers.js';
import { planCleanup, runCleanup } from './submissionCleanup.js';
import { localPathFor } from './storage.js';

const NOW = '2026-01-15T10:00:00.000Z';

const FILES = {
  s1a: '1000000000001-aaaaaaaaaaaaaaaa.jpg',
  s1aThumb: '1000000000002-bbbbbbbbbbbbbbbb.jpg',
  s2a: '1000000000003-cccccccccccccccc.jpg',
  s2aThumb: '1000000000004-dddddddddddddddd.jpg',
  s2b: '1000000000005-eeeeeeeeeeeeeeee.jpg',
} as const;

const writtenFiles = new Set<string>();
let backupDir: string;

function writeFile(key: string): void {
  fs.writeFileSync(localPathFor(key), Buffer.from(`icerik-${key}`));
  writtenFiles.add(key);
}

function exists(key: string): boolean {
  return fs.existsSync(localPathFor(key));
}

function countSubmissionFiles(submissionId?: string): number {
  const row = (
    submissionId
      ? db
          .prepare('SELECT COUNT(*) AS n FROM submission_files WHERE submission_id = ?')
          .get(submissionId)
      : db.prepare('SELECT COUNT(*) AS n FROM submission_files').get()
  ) as { n: number };
  return row.n;
}

function filesPurgedAt(submissionId: string): string | null {
  const row = db
    .prepare('SELECT files_purged_at FROM submissions WHERE id = ?')
    .get(submissionId) as { files_purged_at: string | null } | undefined;
  return row?.files_purged_at ?? null;
}

/**
 * Grafik: 2 hafta, 1 sınıf/ders/öğretmen, aynı öğrenci için 2 ödev/teslim.
 * s1 → 2025-12-01 (1 dosya + thumb), s2 → 2026-02-01 (2 dosya + 1 thumb).
 */
function insertGraph(): void {
  db.prepare(
    `INSERT INTO academic_years (id, name, start_date, end_date, is_active)
     VALUES ('ay1', '2025-2026', '2025-09-01', '2026-06-30', 1)`,
  ).run();
  db.prepare(
    `INSERT INTO weeks (id, academic_year_id, week_no, start_date, end_date, label)
     VALUES ('w1', 'ay1', 1, '2025-09-01', '2025-09-07', '01.09 - 07.09.2025')`,
  ).run();
  db.prepare(
    `INSERT INTO weeks (id, academic_year_id, week_no, start_date, end_date, label)
     VALUES ('w2', 'ay1', 2, '2025-09-08', '2025-09-14', '08.09 - 14.09.2025')`,
  ).run();
  db.prepare(
    `INSERT INTO classes (id, academic_year_id, name, name_normalized, deleted_at)
     VALUES ('c1', 'ay1', 'ÖKLİD', 'oklid', NULL)`,
  ).run();
  db.prepare(
    `INSERT INTO courses (id, name, name_normalized, deleted_at)
     VALUES ('co1', 'Matematik', 'matematik', NULL)`,
  ).run();
  db.prepare(
    `INSERT INTO class_courses (id, class_id, course_id, teacher_id, day_of_week, lesson_time, deleted_at)
     VALUES ('cc1', 'c1', 'co1', 'test-teacher', 1, '10:00', NULL)`,
  ).run();

  db.prepare(
    `INSERT INTO reports (id, class_course_id, week_id, status, created_by, updated_at)
     VALUES ('r1', 'cc1', 'w1', 'draft', 'test-teacher', ?)`,
  ).run(NOW);
  db.prepare(
    `INSERT INTO reports (id, class_course_id, week_id, status, created_by, updated_at)
     VALUES ('r2', 'cc1', 'w2', 'draft', 'test-teacher', ?)`,
  ).run(NOW);
  db.prepare(
    `INSERT INTO homeworks (id, report_id, class_course_id, week_id, description, due_date)
     VALUES ('h1', 'r1', 'cc1', 'w1', 'Ödev 1', '2025-09-08')`,
  ).run();
  db.prepare(
    `INSERT INTO homeworks (id, report_id, class_course_id, week_id, description, due_date)
     VALUES ('h2', 'r2', 'cc1', 'w2', 'Ödev 2', '2025-09-15')`,
  ).run();

  db.prepare(
    `INSERT INTO submissions (id, homework_id, student_id, note, submitted_at, is_late, status)
     VALUES ('s1', 'h1', 'test-student-rec', NULL, '2025-12-01T09:00:00.000Z', 0, 'submitted')`,
  ).run();
  db.prepare(
    `INSERT INTO submissions (id, homework_id, student_id, note, submitted_at, is_late, status)
     VALUES ('s2', 'h2', 'test-student-rec', NULL, '2026-02-01T09:00:00.000Z', 0, 'submitted')`,
  ).run();

  const insertFile = db.prepare(
    `INSERT INTO submission_files (id, submission_id, key, filename, size, mime, ext, thumb_key)
     VALUES (?, ?, ?, ?, ?, 'image/jpeg', 'jpg', ?)`,
  );
  insertFile.run('sf1', 's1', FILES.s1a, 'cozum1.jpg', 1000, FILES.s1aThumb);
  insertFile.run('sf2', 's2', FILES.s2a, 'cozum2.jpg', 2000, FILES.s2aThumb);
  insertFile.run('sf3', 's2', FILES.s2b, 'cozum3.jpg', 3000, null);

  writeFile(FILES.s1a);
  writeFile(FILES.s1aThumb);
  writeFile(FILES.s2a);
  writeFile(FILES.s2aThumb);
  writeFile(FILES.s2b);
}

beforeEach(() => {
  resetDb();
  insertTestUsers();
  insertGraph();
  backupDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cleanup-test-backup-'));
});

afterEach(() => {
  for (const key of writtenFiles) {
    try {
      fs.unlinkSync(localPathFor(key));
    } catch {
      // zaten silinmiş olabilir
    }
  }
  writtenFiles.clear();
  fs.rmSync(backupDir, { recursive: true, force: true });
});

describe('planCleanup — filtre doğrulama', () => {
  it('filtre yoksa ve all yoksa hata fırlatır', () => {
    expect(() => planCleanup({})).toThrowError(/En az bir filtre/);
  });

  it('geçersiz tarih formatını reddeder', () => {
    expect(() => planCleanup({ before: '01-01-2026' })).toThrowError(/YYYY-MM-DD/);
  });

  it('all verildiğinde filtre gerekmez ve tüm dosyaları seçer', () => {
    const plan = planCleanup({ all: true });
    expect(plan.fileCount).toBe(3);
    expect(plan.submissionCount).toBe(2);
  });
});

describe('planCleanup — seçim', () => {
  it('before filtresi yalnızca eski teslimi seçer', () => {
    const plan = planCleanup({ before: '2026-01-01' });
    expect(plan.fileCount).toBe(1);
    expect(plan.files[0]!.key).toBe(FILES.s1a);
    expect(plan.fullyPurgedSubmissions).toEqual(['s1']);
    expect(plan.totalBytes).toBe(1000);
    expect(plan.existingOnDisk).toBe(2); // orijinal + thumb
  });

  it('after filtresi yalnızca yeni teslimi seçer', () => {
    const plan = planCleanup({ after: '2026-01-01' });
    expect(plan.fileCount).toBe(2);
    expect(plan.fullyPurgedSubmissions).toEqual(['s2']);
  });

  it('week ve class filtreleri çalışır', () => {
    expect(planCleanup({ weekNo: 1 }).fileCount).toBe(1);
    expect(planCleanup({ className: 'ÖKLİD' }).fileCount).toBe(3);
    expect(planCleanup({ className: 'c1' }).fileCount).toBe(3);
  });

  it('student filtresi kullanıcı adı ve id ile eşleşir', () => {
    expect(planCleanup({ student: 'test-student' }).fileCount).toBe(3);
    expect(planCleanup({ student: 'test-student-rec' }).fileCount).toBe(3);
    expect(planCleanup({ student: 'yok' }).fileCount).toBe(0);
  });

  it('tek key filtresi yalnızca o dosyayı seçer; teslim boşalmazsa purge işaretlenmez', () => {
    const plan = planCleanup({ key: FILES.s2a });
    expect(plan.fileCount).toBe(1);
    expect(plan.fullyPurgedSubmissions).toEqual([]);
  });
});

describe('runCleanup — dry-run', () => {
  it('execute yoksa DB ve disk değişmez, yedek alınmaz', () => {
    const result = runCleanup({ before: '2026-01-01' }, { backupOutDir: backupDir });
    expect(result.executed).toBe(false);
    expect(result.backupPath).toBeNull();
    expect(result.deletedFileRows).toBe(0);
    expect(countSubmissionFiles()).toBe(3);
    expect(exists(FILES.s1a)).toBe(true);
    expect(exists(FILES.s1aThumb)).toBe(true);
    expect(fs.readdirSync(backupDir)).toHaveLength(0);
  });
});

describe('runCleanup — execute', () => {
  it('önce yedek alır; DB satırı + disk dosyası birlikte silinir', () => {
    const result = runCleanup(
      { before: '2026-01-01' },
      { execute: true, backupOutDir: backupDir, now: () => NOW },
    );

    expect(result.executed).toBe(true);
    expect(result.backupPath).toBeTruthy();
    expect(fs.existsSync(result.backupPath!)).toBe(true);
    expect(result.deletedFileRows).toBe(1);
    expect(result.deletedDiskFiles).toBe(2); // orijinal + thumb
    expect(result.purgedSubmissions).toBe(1);
    expect(result.diskDeleteErrors).toEqual([]);

    // Disk: s1 dosyaları gitti, s2 dosyaları duruyor.
    expect(exists(FILES.s1a)).toBe(false);
    expect(exists(FILES.s1aThumb)).toBe(false);
    expect(exists(FILES.s2a)).toBe(true);
    expect(exists(FILES.s2aThumb)).toBe(true);
    expect(exists(FILES.s2b)).toBe(true);

    // DB: yalnızca s1 dosyası silindi; s1 purge işaretlendi, s2 etkilenmedi.
    expect(countSubmissionFiles()).toBe(2);
    expect(countSubmissionFiles('s1')).toBe(0);
    expect(countSubmissionFiles('s2')).toBe(2);
    expect(filesPurgedAt('s1')).toBe(NOW);
    expect(filesPurgedAt('s2')).toBeNull();

    // Yapı korunur: teslim/ödev/rapor kayıtları yerinde.
    expect(
      (db.prepare('SELECT COUNT(*) AS n FROM submissions').get() as { n: number }).n,
    ).toBe(2);
    expect(
      (db.prepare('SELECT COUNT(*) AS n FROM homeworks').get() as { n: number }).n,
    ).toBe(2);
    expect((db.prepare('SELECT COUNT(*) AS n FROM reports').get() as { n: number }).n).toBe(2);
  });

  it('kısmi silmede teslim boşalmadığı için files_purged_at yazılmaz', () => {
    const result = runCleanup(
      { key: FILES.s2a },
      { execute: true, backupOutDir: backupDir },
    );

    expect(result.deletedFileRows).toBe(1);
    expect(result.deletedDiskFiles).toBe(2); // s2a + thumb
    expect(result.purgedSubmissions).toBe(0);
    expect(exists(FILES.s2a)).toBe(false);
    expect(exists(FILES.s2b)).toBe(true);
    expect(countSubmissionFiles('s2')).toBe(1);
    expect(filesPurgedAt('s2')).toBeNull();
  });

  it('eşleşme yoksa yedek almadan temiz çıkar', () => {
    const result = runCleanup(
      { student: 'yok' },
      { execute: true, backupOutDir: backupDir },
    );
    expect(result.executed).toBe(true);
    expect(result.backupPath).toBeNull();
    expect(result.fileCount).toBe(0);
    expect(countSubmissionFiles()).toBe(3);
  });
});

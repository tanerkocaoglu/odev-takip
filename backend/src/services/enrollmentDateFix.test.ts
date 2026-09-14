/**
 * Enrollment tarih onarımı testleri.
 *
 * Senaryo: enrollment `start_date` hafta başından 1 gün sonra girilmiş;
 * migration #11 backfill'i `class_id`'yi çözemediği için digest NULL kalmış.
 * Onarım enrollment'ı düzeltir ve digest `class_id`'sini doldurur. Dry-run
 * yazmaz; execute yedek alır; ikinci çalıştırma idempotenttir.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { db } from '../db/index.js';
import { resetDb, insertTestUsers } from '../test/helpers.js';
import { planEnrollmentDateFix, runEnrollmentDateFix } from './enrollmentDateFix.js';

const NOW = '2026-09-13T10:00:00.000Z';
const ENR_ID = 'fx-enr-1';
const DIGEST_ID = 'fx-digest-1';
let backupDir: string;

function insertGraph(): void {
  db.prepare(
    `INSERT INTO academic_years (id, name, start_date, end_date, is_active)
     VALUES ('fx-year', '2026-2027', '2026-09-01', '2027-06-30', 1)`,
  ).run();
  db.prepare(
    `INSERT INTO weeks (id, academic_year_id, week_no, start_date, end_date, label)
     VALUES ('fx-week', 'fx-year', 50, '2026-09-12', '2026-09-18', '12.09 - 18.09.2026')`,
  ).run();
  db.prepare(
    `INSERT INTO classes (id, academic_year_id, name, name_normalized, deleted_at)
     VALUES ('fx-class', 'fx-year', 'FİBONACCİ', 'fibonacci', NULL)`,
  ).run();
  db.prepare(
    `INSERT INTO courses (id, name, name_normalized, deleted_at)
     VALUES ('fx-course', 'Geometri', 'geometri', NULL)`,
  ).run();
  db.prepare(
    `INSERT INTO class_courses (id, class_id, course_id, teacher_id, day_of_week, lesson_time, deleted_at)
     VALUES ('fx-cc', 'fx-class', 'fx-course', 'test-teacher', 1, '09:00', NULL)`,
  ).run();
  db.prepare(
    `INSERT INTO reports (id, class_course_id, week_id, topic_covered, status, completed_at, created_by, updated_at)
     VALUES ('fx-report', 'fx-cc', 'fx-week', 'Konu', 'completed', ?, 'test-teacher', ?)`,
  ).run(NOW, NOW);
  db.prepare(
    `INSERT INTO report_entries (id, report_id, student_id, attendance, homework_score, interest_score, teacher_note)
     VALUES ('fx-entry', 'fx-report', 'test-student-rec', 'present', 7, 8, NULL)`,
  ).run();

  // Kurulum hatası: start_date hafta başından (09-12) 1 gün sonra.
  db.prepare(
    `INSERT INTO enrollments (id, student_id, class_id, start_date, end_date)
     VALUES (?, 'test-student-rec', 'fx-class', '2026-09-13', NULL)`,
  ).run(ENR_ID);

  db.prepare(
    `INSERT INTO weekly_digests (id, student_id, week_id, guardian_id, class_id, token, status)
     VALUES (?, 'test-student-rec', 'fx-week', 'test-guardian-rec', NULL, 'fx-token', 'ready')`,
  ).run(DIGEST_ID);
}

function enrollmentStartDate(): string {
  return (db.prepare(`SELECT start_date FROM enrollments WHERE id = ?`).get(ENR_ID) as {
    start_date: string;
  }).start_date;
}

function digestClassId(): string | null {
  return (db.prepare(`SELECT class_id FROM weekly_digests WHERE id = ?`).get(DIGEST_ID) as {
    class_id: string | null;
  }).class_id;
}

beforeEach(() => {
  resetDb();
  insertTestUsers();
  insertGraph();
  backupDir = fs.mkdtempSync(path.join(os.tmpdir(), 'enrfix-test-'));
});

afterEach(() => {
  try {
    fs.rmSync(backupDir, { recursive: true, force: true });
  } catch {
    // yok sayılır
  }
});

describe('planEnrollmentDateFix', () => {
  it('eski→yeni tarihi ve doldurulacak digest class_id\'sini planlar; yazmaz', () => {
    const plan = planEnrollmentDateFix([ENR_ID], '2026-09-12');
    expect(plan.enrollments).toHaveLength(1);
    expect(plan.enrollments[0]).toMatchObject({
      enrollmentId: ENR_ID,
      oldStartDate: '2026-09-13',
      newStartDate: '2026-09-12',
      className: 'FİBONACCİ',
      changed: true,
    });
    expect(plan.enrollmentUpdateCount).toBe(1);
    expect(plan.digests).toHaveLength(1);
    expect(plan.digests[0]).toMatchObject({
      digestId: DIGEST_ID,
      resolvedClassId: 'fx-class',
      willUpdate: true,
    });
    expect(plan.digestUpdateCount).toBe(1);
    // Plan hiçbir şey yazmaz.
    expect(enrollmentStartDate()).toBe('2026-09-13');
    expect(digestClassId()).toBeNull();
  });

  it('bilinmeyen enrollment id\'sinde hata fırlatır', () => {
    expect(() => planEnrollmentDateFix(['yok-boyle'], '2026-09-12')).toThrow(/bulunamadı/);
  });

  it('geçersiz tarih biçimini reddeder', () => {
    expect(() => planEnrollmentDateFix([ENR_ID], '12.09.2026')).toThrow(/YYYY-MM-DD/);
  });
});

describe('runEnrollmentDateFix', () => {
  it('dry-run hiçbir şey yazmaz', () => {
    const result = runEnrollmentDateFix([ENR_ID], '2026-09-12', { execute: false });
    expect(result.executed).toBe(false);
    expect(result.enrollmentUpdated).toBe(0);
    expect(result.digestUpdated).toBe(0);
    expect(result.backupPath).toBeNull();
    expect(enrollmentStartDate()).toBe('2026-09-13');
    expect(digestClassId()).toBeNull();
  });

  it('execute yedek alır; enrollment ve digest class_id\'sini günceller', () => {
    const result = runEnrollmentDateFix([ENR_ID], '2026-09-12', {
      execute: true,
      backupOutDir: backupDir,
    });
    expect(result.executed).toBe(true);
    expect(result.enrollmentUpdated).toBe(1);
    expect(result.digestUpdated).toBe(1);
    expect(result.backupPath).not.toBeNull();
    expect(fs.existsSync(result.backupPath!)).toBe(true);

    expect(enrollmentStartDate()).toBe('2026-09-12');
    expect(digestClassId()).toBe('fx-class');
  });

  it('ikinci çalıştırma idempotenttir (değişiklik yok, yedek yok)', () => {
    runEnrollmentDateFix([ENR_ID], '2026-09-12', { execute: true, backupOutDir: backupDir });
    const again = runEnrollmentDateFix([ENR_ID], '2026-09-12', {
      execute: true,
      backupOutDir: backupDir,
    });
    expect(again.enrollmentUpdateCount).toBe(0);
    expect(again.digestUpdateCount).toBe(0);
    expect(again.enrollmentUpdated).toBe(0);
    expect(again.digestUpdated).toBe(0);
    expect(again.backupPath).toBeNull();
  });
});

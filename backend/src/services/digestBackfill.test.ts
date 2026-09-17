/**
 * Digest telafi (backfill) testleri.
 *
 * Senaryo: rapora puanlanmış ama `enrollments.start_date` hafta başından sonra
 * olduğu için digest'i açılmamış öğrenci. Backfill, rapor satırındaki (fiilen
 * puanlanan) öğrencilere digest açar; dry-run'ın yazmadığını, execute'ın
 * idempotent olduğunu, velisi olmayanı atladığını ve `pending`/`ready`
 * ayrımını doğrular.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { db } from '../db/index.js';
import { resetDb, insertTestUsers } from '../test/helpers.js';
import { planBackfill, runBackfill } from './digestBackfill.js';
import { previewDigest, sendDigest } from './digests.js';

const NOW = '2026-01-15T10:00:00.000Z';
let backupDir: string;

type GraphOptions = { secondCourseDone?: boolean; noGuardianStudent?: boolean };

function insertGraph(opts: GraphOptions = {}): void {
  db.prepare(
    `INSERT INTO academic_years (id, name, start_date, end_date, is_active)
     VALUES ('ay1', '2025-2026', '2025-09-01', '2026-06-30', 1)`,
  ).run();
  db.prepare(
    `INSERT INTO weeks (id, academic_year_id, week_no, start_date, end_date, label)
     VALUES ('w1', 'ay1', 1, '2025-09-01', '2025-09-07', '01.09 - 07.09.2025')`,
  ).run();
  db.prepare(
    `INSERT INTO classes (id, academic_year_id, name, name_normalized, deleted_at)
     VALUES ('c1', 'ay1', 'ÖKLİD', 'oklid', NULL)`,
  ).run();
  db.prepare(
    `INSERT INTO courses (id, name, name_normalized, deleted_at)
     VALUES ('co1', 'Matematik', 'matematik', NULL), ('co2', 'Fizik', 'fizik', NULL)`,
  ).run();
  db.prepare(
    `INSERT INTO class_courses (id, class_id, course_id, teacher_id, day_of_week, lesson_time, deleted_at)
     VALUES ('cc1', 'c1', 'co1', 'test-teacher', 1, '10:00', NULL),
            ('cc2', 'c1', 'co2', 'test-teacher', 2, '10:00', NULL)`,
  ).run();

  db.prepare(
    `INSERT INTO reports (id, class_course_id, week_id, status, created_by, updated_at)
     VALUES ('r1', 'cc1', 'w1', 'completed', 'test-teacher', ?)`,
  ).run(NOW);
  if (opts.secondCourseDone) {
    db.prepare(
      `INSERT INTO reports (id, class_course_id, week_id, status, created_by, updated_at)
       VALUES ('r2', 'cc2', 'w1', 'completed', 'test-teacher', ?)`,
    ).run(NOW);
  }

  // Öğrenci 1 (velisi var) — r1'de puanlanmış.
  db.prepare(
    `INSERT INTO report_entries (id, report_id, student_id, attendance, homework_score, interest_score, teacher_note)
     VALUES ('re1', 'r1', 'test-student-rec', 'present', 7, 8, NULL)`,
  ).run();
  if (opts.secondCourseDone) {
    db.prepare(
      `INSERT INTO report_entries (id, report_id, student_id, attendance, homework_score, interest_score, teacher_note)
       VALUES ('re2', 'r2', 'test-student-rec', 'present', 6, 6, NULL)`,
    ).run();
  }

  // Öğrenci 2 (velisi YOK) — puanlanmış → backfill listelenmeli, yazılmamalı.
  if (opts.noGuardianStudent) {
    db.prepare(
      `INSERT INTO users (id, full_name, full_name_normalized, username, email, password_hash, role, is_active, token_version, deleted_at, created_at)
       VALUES ('test-student2', 'Test Student2', 'test student2', 'test-student2', NULL, 'x', 'student', 1, 1, NULL, ?)`,
    ).run(NOW);
    db.prepare(
      `INSERT INTO students (id, user_id, guardian_id, deleted_at)
       VALUES ('test-student-rec2', 'test-student2', NULL, NULL)`,
    ).run();
    db.prepare(
      `INSERT INTO report_entries (id, report_id, student_id, attendance, homework_score, interest_score, teacher_note)
       VALUES ('re3', 'r1', 'test-student-rec2', 'present', 5, 5, NULL)`,
    ).run();
  }

  // Orijinal hatanın koşulu: enrollment hafta başından SONRA başlıyor.
  // (Backfill enrollment'a bakmaz — rapora bakar; bu yalnızca bağlam.)
  db.prepare(
    `INSERT INTO enrollments (id, student_id, class_id, start_date, end_date)
     VALUES ('enr1', 'test-student-rec', 'c1', '2025-09-05', NULL)`,
  ).run();
}

function digestCount(weekId = 'w1'): number {
  return (db.prepare('SELECT COUNT(*) AS n FROM weekly_digests WHERE week_id = ?').get(weekId) as {
    n: number;
  }).n;
}

beforeEach(() => {
  resetDb();
  insertTestUsers();
  backupDir = fs.mkdtempSync(path.join(os.tmpdir(), 'backfill-test-'));
});

afterEach(() => {
  try {
    fs.rmSync(backupDir, { recursive: true, force: true });
  } catch {
    // yok sayılır
  }
});

describe('planBackfill', () => {
  it('rapora puanlanmış + velisi olan öğrenci için ready satır planlar; yazmaz', () => {
    insertGraph({ secondCourseDone: true });
    const plan = planBackfill({ className: 'ÖKLİD', weekNo: 1 });
    expect(plan.classId).toBe('c1');
    expect(plan.weekId).toBe('w1');
    expect(plan.insertCount).toBe(1);
    expect(plan.items).toHaveLength(1);
    expect(plan.items[0]).toMatchObject({ studentId: 'test-student-rec', status: 'ready' });
    expect(digestCount()).toBe(0); // plan yazmaz
  });

  it('tüm dersler tamamlanmadıysa pending planlar', () => {
    insertGraph({ secondCourseDone: false });
    const plan = planBackfill({ className: 'öklid', weekNo: 1 });
    expect(plan.items[0]!.status).toBe('pending');
  });

  it('velisi olmayan puanlanmış öğrenciyi atlar ve listeler', () => {
    insertGraph({ secondCourseDone: true, noGuardianStudent: true });
    const plan = planBackfill({ className: 'ÖKLİD', weekNo: 1 });
    expect(plan.items.map((i) => i.studentId)).toEqual(['test-student-rec']);
    expect(plan.skippedNoGuardian.map((s) => s.studentId)).toEqual(['test-student-rec2']);
    expect(plan.insertCount).toBe(1);
  });

  it('bilinmeyen sınıfta hata fırlatır', () => {
    insertGraph();
    expect(() => planBackfill({ className: 'Yok Sınıf', weekNo: 1 })).toThrow(/bulunamadı/);
  });
});

describe('runBackfill', () => {
  it('dry-run hiçbir şey yazmaz', async () => {
    insertGraph({ secondCourseDone: true });
    const result = await runBackfill({ className: 'ÖKLİD', weekNo: 1 }, { execute: false });
    expect(result.executed).toBe(false);
    expect(result.inserted).toBe(0);
    expect(result.backupPath).toBeNull();
    expect(digestCount()).toBe(0);
  });

  it('execute yedek alır, satırı yazar; ikinci çalıştırma idempotenttir', async () => {
    insertGraph({ secondCourseDone: true });

    const first = await runBackfill(
      { className: 'ÖKLİD', weekNo: 1 },
      { execute: true, backupOutDir: backupDir },
    );
    expect(first.executed).toBe(true);
    expect(first.inserted).toBe(1);
    expect(first.backupPath).not.toBeNull();
    expect(fs.existsSync(first.backupPath!)).toBe(true);
    expect(digestCount()).toBe(1);

    const row = db
      .prepare(`SELECT status, guardian_id, class_id, token, send_count FROM weekly_digests WHERE student_id = ?`)
      .get('test-student-rec') as {
      status: string;
      guardian_id: string;
      class_id: string | null;
      token: string;
      send_count: number;
    };
    expect(row.status).toBe('ready');
    expect(row.guardian_id).toBe('test-guardian-rec');
    expect(row.class_id).toBe('c1');
    expect(row.token.length).toBeGreaterThan(16);
    expect(row.send_count).toBe(0);

    const second = await runBackfill(
      { className: 'ÖKLİD', weekNo: 1 },
      { execute: true, backupOutDir: backupDir },
    );
    expect(second.inserted).toBe(0);
    expect(digestCount()).toBe(1);
  });

  it('yazılacak satır yoksa (ikinci çalıştırma) yedek almaz', async () => {
    insertGraph({ secondCourseDone: true });
    await runBackfill({ className: 'ÖKLİD', weekNo: 1 }, { execute: true, backupOutDir: backupDir });
    const again = await runBackfill(
      { className: 'ÖKLİD', weekNo: 1 },
      { execute: true, backupOutDir: backupDir },
    );
    expect(again.insertCount).toBe(0);
    expect(again.inserted).toBe(0);
    expect(again.backupPath).toBeNull();
    expect(digestCount()).toBe(1);
  });

  it('telafi sonrası önizleme ve gönderim 409 vermez; kaskad raporları sent yapar', async () => {
    // Öğrencinin enrollment'ı hafta başından SONRA (orijinal hata koşulu);
    // sınıfın tüm dersleri tamam. Backfill class_id ile ready satır açar.
    insertGraph({ secondCourseDone: true });
    const result = await runBackfill(
      { className: 'ÖKLİD', weekNo: 1 },
      { execute: true, backupOutDir: backupDir },
    );
    expect(result.inserted).toBe(1);

    const digest = db
      .prepare(`SELECT id FROM weekly_digests WHERE student_id = 'test-student-rec'`)
      .get() as { id: string };

    // Eski davranış: classIdForStudentAtWeek null → preview/send 409.
    // Yeni davranış: satırdaki class_id kullanılır.
    const preview = previewDigest(digest.id);
    expect(preview.class.id).toBe('c1');
    expect(preview.student.id).toBe('test-student-rec');
    expect(preview.courses.length).toBe(2);

    const sent = sendDigest(digest.id, 'test-admin');
    expect(sent.status).toBe('sent');
    expect(sent.send_count).toBe(1);
    expect(sent.token.length).toBeGreaterThan(16);

    // Kaskad: sınıf+haftanın tüm digest'leri sent olduğu için completed
    // raporlar sent'e geçer (spec §5.4).
    const statuses = db
      .prepare(`SELECT status FROM reports WHERE week_id = 'w1'`)
      .all() as Array<{ status: string }>;
    expect(statuses.every((r) => r.status === 'sent')).toBe(true);
  });
});

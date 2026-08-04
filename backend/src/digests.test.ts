/**
 * Digest tetikleme entegrasyon testleri — Aşama 5 (spec.md §5.4):
 * rapor `completed` → `pending` digest'leri açılır; sınıfın o haftadaki
 * tüm dersleri tamamlanınca aynı kayıtlar `ready` olur. Velisi olmayan
 * öğrenciye digest açılmaz (guardian_id NOT NULL — kural).
 *
 * Tarihler deterministik: `Date` 2026-08-04 Salı olarak fake'lenir.
 * Hafta 2 = 2026-08-03..08-09 bu haftadır. `fileParallelism: false`.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import request from 'supertest';
import { createApp } from './app.js';
import { db } from './db/index.js';
import { resetDb, insertTestUsers, TEST_PASSWORD } from './test/helpers.js';
import { signToken } from './utils/token.js';
import { hashPasswordSync } from './utils/hash.js';
import type { Role } from './types.js';

const app = createApp();

const FAKE_NOW = new Date('2026-08-04T10:00:00');
const WEEK2 = { id: 'd-week-2', start: '2026-08-03', end: '2026-08-09' };
const WEEK3 = { id: 'd-week-3', start: '2026-08-10', end: '2026-08-16' };

const CC_1 = 'd-cc-1';
const CC_2 = 'd-cc-2';

let teacherToken: string;

function signTokenFor(userId: string, role: Role): string {
  return signToken(
    { id: userId, role, teacher_id: null, student_id: null, guardian_id: null },
    1,
  );
}

async function login(email: string): Promise<string> {
  const res = await request(app)
    .post('/api/v1/auth/login')
    .send({ identifier: email, password: TEST_PASSWORD });
  return res.body.token as string;
}

/** Rapor oluştur → tüm satırları puanla → tamamla. */
async function completeReport(ccId: string, weekId: string): Promise<void> {
  const created = await request(app)
    .post('/api/v1/teacher/reports')
    .set('Authorization', `Bearer ${teacherToken}`)
    .send({ class_course_id: ccId, week_id: weekId });
  expect([200, 201]).toContain(created.status); // get-or-create: yeni 201, varolan 200
  const id = created.body.report.id as string;
  const entries = created.body.entries as Array<{ student_id: string }>;
  await request(app)
    .put(`/api/v1/teacher/reports/${id}`)
    .set('Authorization', `Bearer ${teacherToken}`)
    .send({
      homework_description: 'Ödev ' + ccId,
      entries: entries.map((e) => ({
        student_id: e.student_id,
        attendance: 'present',
        homework_score: 7,
        interest_score: 8,
        teacher_note: null,
      })),
    });
  const done = await request(app)
    .post(`/api/v1/teacher/reports/${id}/complete`)
    .set('Authorization', `Bearer ${teacherToken}`);
  expect(done.status).toBe(200);
}

beforeAll(async () => {
  vi.useFakeTimers({ toFake: ['Date'], now: FAKE_NOW });
  resetDb();
  insertTestUsers();

  // --- Yıl (aktif) + haftalar ---
  db.prepare(
    `INSERT INTO academic_years (id, name, start_date, end_date, is_active)
     VALUES (?, ?, ?, ?, 1)`,
  ).run('d-year', '2026-2027', '2026-07-20', '2026-08-16');
  const insertWeek = db.prepare(
    `INSERT INTO weeks (id, academic_year_id, week_no, start_date, end_date, label)
     VALUES (?, ?, ?, ?, ?, ?)`,
  );
  insertWeek.run('d-week-1', 'd-year', 1, '2026-07-27', '2026-08-02', 'Hafta 1');
  insertWeek.run(WEEK2.id, 'd-year', 2, WEEK2.start, WEEK2.end, 'Hafta 2');
  insertWeek.run(WEEK3.id, 'd-year', 3, WEEK3.start, WEEK3.end, 'Hafta 3');

  // --- Sınıf + dersler + atamalar (2 ders — tamamlanınca digest ready) ---
  db.prepare(
    `INSERT INTO classes (id, academic_year_id, name, name_normalized, deleted_at)
     VALUES (?, ?, ?, ?, NULL)`,
  ).run('d-class', 'd-year', 'Digest Sınıfı', 'digest sinifi');
  const insertCourse = db.prepare(
    `INSERT INTO courses (id, name, name_normalized, deleted_at) VALUES (?, ?, ?, NULL)`,
  );
  insertCourse.run('d-course-1', 'Ders 1', 'ders 1');
  insertCourse.run('d-course-2', 'Ders 2', 'ders 2');
  const insertCc = db.prepare(
    `INSERT INTO class_courses
       (id, class_id, course_id, teacher_id, day_of_week, lesson_time, deleted_at)
     VALUES (?, ?, ?, ?, ?, ?, NULL)`,
  );
  insertCc.run(CC_1, 'd-class', 'd-course-1', 'test-teacher', 1, '09:00');
  insertCc.run(CC_2, 'd-class', 'd-course-2', 'test-teacher', 2, '10:00');

  // --- Öğrenciler: 2'sinin velisi var, 1'inin yok ---
  const now = new Date().toISOString();
  const insertStudent = db.prepare(
    `INSERT INTO users
       (id, full_name, full_name_normalized, username, email, password_hash, role,
        is_active, token_version, deleted_at, created_at)
     VALUES (?, ?, ?, ?, NULL, NULL, 'student', 1, 1, NULL, ?)`,
  );
  const insertStudentRec = db.prepare(
    `INSERT INTO students (id, user_id, guardian_id, deleted_at) VALUES (?, ?, ?, NULL)`,
  );
  const insertEnrollment = db.prepare(
    `INSERT INTO enrollments (id, student_id, class_id, start_date, end_date)
     VALUES (?, ?, ?, ?, NULL)`,
  );
  insertStudent.run('d-stu-1', 'Digest Öğrenci 1', 'digest ogrenci 1', 'd-stu-1', now);
  insertStudentRec.run('d-stu-rec-1', 'd-stu-1', 'test-guardian-rec');
  insertEnrollment.run('d-enr-1', 'd-stu-rec-1', 'd-class', '2026-07-20');

  insertStudent.run('d-stu-2', 'Digest Öğrenci 2', 'digest ogrenci 2', 'd-stu-2', now);
  insertStudentRec.run('d-stu-rec-2', 'd-stu-2', 'test-guardian-rec');
  insertEnrollment.run('d-enr-2', 'd-stu-rec-2', 'd-class', '2026-07-20');

  // Velisiz öğrenci — digest açılmamalı.
  insertStudent.run('d-stu-3', 'Velisiz Öğrenci', 'velisiz ogrenci', 'd-stu-3', now);
  insertStudentRec.run('d-stu-rec-3', 'd-stu-3', null);
  insertEnrollment.run('d-enr-3', 'd-stu-rec-3', 'd-class', '2026-07-20');

  teacherToken = await login('teacher@test.local');
});

afterAll(() => {
  vi.useRealTimers();
});

describe('Rapor tamamlanınca digest tetiklemesi (spec §5.4)', () => {
  it('ilk rapor completed olunca velisi olan öğrenciler için pending açılır; velisize açılmaz', async () => {
    await completeReport(CC_1, WEEK2.id);

    const rows = db
      .prepare(
        `SELECT d.student_id, d.status, d.guardian_id, d.send_count
         FROM weekly_digests d WHERE d.week_id = ? ORDER BY d.student_id`,
      )
      .all(WEEK2.id) as Array<{
      student_id: string;
      status: string;
      guardian_id: string;
      send_count: number;
    }>;

    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.student_id).sort()).toEqual(['d-stu-rec-1', 'd-stu-rec-2']);
    expect(rows.every((r) => r.status === 'pending')).toBe(true);
    expect(rows.every((r) => r.guardian_id === 'test-guardian-rec')).toBe(true);
    expect(rows.every((r) => r.send_count === 0)).toBe(true);
  });

  it('aynı raporu tekrar tamamlamak digest çoğaltmaz (INSERT OR IGNORE)', async () => {
    await completeReport(CC_1, WEEK2.id);
    const count = db
      .prepare(`SELECT COUNT(*) AS n FROM weekly_digests WHERE week_id = ?`)
      .get(WEEK2.id) as { n: number };
    expect(count.n).toBe(2);
  });

  it('sınıfın tüm dersleri tamamlanınca pending → ready olur', async () => {
    await completeReport(CC_2, WEEK2.id);

    const rows = db
      .prepare(`SELECT status FROM weekly_digests WHERE week_id = ?`)
      .all(WEEK2.id) as Array<{ status: string }>;
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.status === 'ready')).toBe(true);
  });
});

/**
 * Admin panel + salt-okunur rapor testleri — Aşama 5 (spec.md §5.5).
 * - `GET /teacher/reports/:id` — salt-okunur: öğretmen kendi, admin tümü;
 *   başka öğretmen / veli / öğrenci 403.
 * - `GET /admin/dashboard` — özet ("N rapordan M'si tamamlandı"), eksik rapor
 *   listesi (draft / hiç açılmamış, günü geçen üstte), tam matris, digest
 *   sayaçları.
 *
 * Tarihler deterministik: `Date` 2026-08-04 Salı. Hafta 2 = bu hafta.
 * `fileParallelism: false` — sıralı koşulur.
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
const WEEK2 = { id: 'ds-week-2', start: '2026-08-03', end: '2026-08-09' };
const WEEK3 = { id: 'ds-week-3', start: '2026-08-10', end: '2026-08-16' };

const CC_1 = 'ds-cc-1'; // Ders 1, Pazartesi — tamamlanacak
const CC_2 = 'ds-cc-2'; // Ders 2, Pazartesi — hiç açılmamış, günü geçmiş
const CC_3 = 'ds-cc-3'; // diğer sınıf, Cuma — hiç açılmamış

let adminToken: string;
let teacherToken: string;
let teacher2Token: string;
let doneReportId: string;

function signTokenFor(userId: string, role: Role): string {
  return signToken(
    { id: userId, role, teacher_id: null, student_id: null, guardian_id: null },
    1,
  );
}

async function login(identifier: string): Promise<string> {
  const res = await request(app)
    .post('/api/v1/auth/login')
    .send({ identifier, password: TEST_PASSWORD });
  return res.body.token as string;
}

/** Rapor oluştur → doldur → tamamla; rapor id'sini döner. */
async function completeReport(ccId: string, weekId: string): Promise<string> {
  const created = await request(app)
    .post('/api/v1/teacher/reports')
    .set('Authorization', `Bearer ${teacherToken}`)
    .send({ class_course_id: ccId, week_id: weekId });
  expect([200, 201]).toContain(created.status);
  const id = created.body.report.id as string;
  const entries = created.body.entries as Array<{ student_id: string }>;
  await request(app)
    .put(`/api/v1/teacher/reports/${id}`)
    .set('Authorization', `Bearer ${teacherToken}`)
    .send({
      homework_description: 'Ödev',
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
  return id;
}

beforeAll(async () => {
  vi.useFakeTimers({ toFake: ['Date'], now: FAKE_NOW });
  resetDb();
  insertTestUsers();

  db.prepare(
    `INSERT INTO academic_years (id, name, start_date, end_date, is_active)
     VALUES (?, ?, ?, ?, 1)`,
  ).run('ds-year', '2026-2027', '2026-07-20', '2026-08-16');
  const insertWeek = db.prepare(
    `INSERT INTO weeks (id, academic_year_id, week_no, start_date, end_date, label)
     VALUES (?, ?, ?, ?, ?, ?)`,
  );
  insertWeek.run('ds-week-1', 'ds-year', 1, '2026-07-27', '2026-08-02', 'Hafta 1');
  insertWeek.run(WEEK2.id, 'ds-year', 2, WEEK2.start, WEEK2.end, 'Hafta 2');
  insertWeek.run(WEEK3.id, 'ds-year', 3, WEEK3.start, WEEK3.end, 'Hafta 3');

  const insertClass = db.prepare(
    `INSERT INTO classes (id, academic_year_id, name, name_normalized, deleted_at)
     VALUES (?, ?, ?, ?, NULL)`,
  );
  insertClass.run('ds-class', 'ds-year', 'Panel Sınıfı', 'panel sinifi');
  insertClass.run('ds-class-2', 'ds-year', 'Diğer Sınıf', 'diger sinif');

  // İkinci öğretmen (yetki + matris için).
  db.prepare(
    `INSERT INTO users
       (id, full_name, full_name_normalized, username, email, password_hash, role,
        is_active, token_version, deleted_at, created_at)
     VALUES (?, ?, ?, NULL, ?, ?, 'teacher', 1, 1, NULL, ?)`,
  ).run(
    'test-teacher-2',
    'Test Teacher 2',
    'test teacher 2',
    'teacher2@test.local',
    hashPasswordSync(TEST_PASSWORD),
    new Date().toISOString(),
  );

  const insertCourse = db.prepare(
    `INSERT INTO courses (id, name, name_normalized, deleted_at) VALUES (?, ?, ?, NULL)`,
  );
  insertCourse.run('ds-course-1', 'Ders 1', 'ders 1');
  insertCourse.run('ds-course-2', 'Ders 2', 'ders 2');
  insertCourse.run('ds-course-3', 'Ders 3', 'ders 3');

  const insertCc = db.prepare(
    `INSERT INTO class_courses
       (id, class_id, course_id, teacher_id, day_of_week, lesson_time, deleted_at)
     VALUES (?, ?, ?, ?, ?, ?, NULL)`,
  );
  insertCc.run(CC_1, 'ds-class', 'ds-course-1', 'test-teacher', 1, '09:00');
  insertCc.run(CC_2, 'ds-class', 'ds-course-2', 'test-teacher', 1, '10:00'); // Pazartesi — günü geçmiş
  insertCc.run(CC_3, 'ds-class-2', 'ds-course-3', 'test-teacher-2', 5, '11:00');

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
  insertStudent.run('ds-stu-1', 'Panel Öğrenci', 'panel ogrenci', 'ds-stu-1', now);
  insertStudentRec.run('ds-stu-rec-1', 'ds-stu-1', 'test-guardian-rec');
  insertEnrollment.run('ds-enr-1', 'ds-stu-rec-1', 'ds-class', '2026-07-20');

  adminToken = await login('admin@test.local');
  teacherToken = await login('teacher@test.local');
  teacher2Token = await login('teacher2@test.local');

  doneReportId = await completeReport(CC_1, WEEK2.id);
});

afterAll(() => {
  vi.useRealTimers();
});

describe('GET /api/v1/teacher/reports/:id (salt-okunur)', () => {
  it('sahip öğretmen raporu alır (completed içerik + satırlar)', async () => {
    const res = await request(app)
      .get(`/api/v1/teacher/reports/${doneReportId}`)
      .set('Authorization', `Bearer ${teacherToken}`);
    expect(res.status).toBe(200);
    expect(res.body.report.status).toBe('completed');
    expect(res.body.report.course_name).toBe('Ders 1');
    expect(res.body.entries).toHaveLength(1);
    expect(res.body.entries[0].homework_score).toBe(7);
  });

  it('admin her raporu alır', async () => {
    const res = await request(app)
      .get(`/api/v1/teacher/reports/${doneReportId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.report.status).toBe('completed');
  });

  it('başka öğretmen 403 döner', async () => {
    const res = await request(app)
      .get(`/api/v1/teacher/reports/${doneReportId}`)
      .set('Authorization', `Bearer ${teacher2Token}`);
    expect(res.status).toBe(403);
  });

  it('veli ve öğrenci 403 döner', async () => {
    for (const [id, role] of [
      ['test-guardian', 'guardian'],
      ['test-student', 'student'],
    ] as Array<[string, Role]>) {
      const res = await request(app)
        .get(`/api/v1/teacher/reports/${doneReportId}`)
        .set('Authorization', `Bearer ${signTokenFor(id, role)}`);
      expect(res.status).toBe(403);
    }
  });

  it('olmayan rapor 404 döner', async () => {
    const res = await request(app)
      .get('/api/v1/teacher/reports/yok-rapor')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(404);
  });
});

describe('GET /api/v1/admin/dashboard (spec §5.5)', () => {
  it('özet + eksik listesi + matris + digest sayaçları döner', async () => {
    const res = await request(app)
      .get(`/api/v1/admin/dashboard?week_id=${WEEK2.id}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);

    // Özet: 3 atamadan 1'i tamamlandı.
    expect(res.body.summary).toEqual({ total: 3, completed: 1 });

    // Eksikler: CC_2 (hiç açılmamış) + CC_3 (hiç açılmamış). CC_1 düşer.
    const missing = res.body.missing as Array<{
      class_course_id: string;
      status: string;
      is_overdue: boolean;
    }>;
    expect(missing).toHaveLength(2);
    expect(missing.map((m) => m.class_course_id).sort()).toEqual([CC_2, CC_3].sort());
    expect(missing.every((m) => m.status === 'not_started')).toBe(true);
    // CC_2 Pazartesi (bugün 08-04'te geçti) → overdue; CC_3 Cuma → değil.
    const cc2 = missing.find((m) => m.class_course_id === CC_2)!;
    const cc3 = missing.find((m) => m.class_course_id === CC_3)!;
    expect(cc2.is_overdue).toBe(true);
    expect(cc3.is_overdue).toBe(false);
    // Günü geçenler üstte.
    expect(missing[0].is_overdue).toBe(true);

    // Matris: 2 sınıf; Panel Sınıfı'nda 2 ders, Diğer'de 1.
    const matrix = res.body.matrix as Array<{ class_id: string; courses: unknown[] }>;
    expect(matrix).toHaveLength(2);
    const panel = matrix.find((m) => m.class_id === 'ds-class')!;
    expect(panel.courses).toHaveLength(2);

    // Digest: CC_1 tamamlandı → 1 pending.
    expect(res.body.digests).toEqual({ pending: 1, ready: 0, sent: 0 });
  });

  it('veli/öğrenci dashboard erişemez (adminOnly router)', async () => {
    const res = await request(app)
      .get(`/api/v1/admin/dashboard?week_id=${WEEK2.id}`)
      .set('Authorization', `Bearer ${signTokenFor('test-student', 'student')}`);
    expect(res.status).toBe(403);
  });
});

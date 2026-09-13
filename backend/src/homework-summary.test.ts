/**
 * Admin haftalık ödev özeti entegrasyon testleri (spec.md §5.8).
 *
 * Bir sınıf + hafta için tüm ders atamaları listelenir; raporu
 * `completed`/`sent` olan dersin "yapılacak ödev"i gösterilir, raporu
 * olmayan/`draft` ders **atlanmaz** → "Rapor girilmedi" (`missing`).
 * Görece hafta numarası sınıfın ilk aktif haftasına göre hesaplanır.
 *
 * Tarihler deterministik: `Date` 2026-08-04 Salı olarak fake'lenir; hafta 2
 * bu haftadır → `week_id` verilmezse aktif hafta (2) döner.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import request from 'supertest';
import { createApp } from './app.js';
import { db } from './db/index.js';
import { resetDb, insertTestUsers, TEST_PASSWORD } from './test/helpers.js';

const app = createApp();

const FAKE_NOW = new Date('2026-08-04T10:00:00');
const WEEK1 = { id: 'hs-week-1', start: '2026-07-27', end: '2026-08-02' };
const WEEK2 = { id: 'hs-week-2', start: '2026-08-03', end: '2026-08-09' };
const WEEK3 = { id: 'hs-week-3', start: '2026-08-10', end: '2026-08-16' };

const CC_1 = 'hs-cc-1';
const CC_2 = 'hs-cc-2';

let adminToken: string;
let teacherToken: string;

async function login(identifier: string): Promise<string> {
  const res = await request(app)
    .post('/api/v1/auth/login')
    .send({ identifier, password: TEST_PASSWORD });
  return res.body.token as string;
}

/** Rapor oluştur → satırları puanla → tamamla (ödev metni verilir). */
async function completeReport(ccId: string, weekId: string, homework: string): Promise<void> {
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
      topic_covered: 'Konu ' + ccId,
      homework_description: homework,
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

  db.prepare(
    `INSERT INTO academic_years (id, name, start_date, end_date, is_active)
     VALUES (?, ?, ?, ?, 1)`,
  ).run('hs-year', '2026-2027', '2026-07-20', '2026-08-16');
  const insertWeek = db.prepare(
    `INSERT INTO weeks (id, academic_year_id, week_no, start_date, end_date, label)
     VALUES (?, ?, ?, ?, ?, ?)`,
  );
  insertWeek.run(WEEK1.id, 'hs-year', 1, WEEK1.start, WEEK1.end, '27.07 - 02.08.2026');
  insertWeek.run(WEEK2.id, 'hs-year', 2, WEEK2.start, WEEK2.end, '03.08 - 09.08.2026');
  insertWeek.run(WEEK3.id, 'hs-year', 3, WEEK3.start, WEEK3.end, '10.08 - 16.08.2026');

  db.prepare(
    `INSERT INTO classes (id, academic_year_id, name, name_normalized, deleted_at)
     VALUES (?, ?, ?, ?, NULL)`,
  ).run('hs-class', 'hs-year', 'HS Sınıfı', 'hs sinifi');
  const insertCourse = db.prepare(
    `INSERT INTO courses (id, name, name_normalized, deleted_at) VALUES (?, ?, ?, NULL)`,
  );
  insertCourse.run('hs-course-1', 'Cebir', 'cebir');
  insertCourse.run('hs-course-2', 'Geometri', 'geometri');
  const insertCc = db.prepare(
    `INSERT INTO class_courses
       (id, class_id, course_id, teacher_id, day_of_week, lesson_time, deleted_at)
     VALUES (?, ?, ?, ?, ?, ?, NULL)`,
  );
  insertCc.run(CC_1, 'hs-class', 'hs-course-1', 'test-teacher', 1, '09:00');
  insertCc.run(CC_2, 'hs-class', 'hs-course-2', 'test-teacher', 2, '10:00');

  // İlk aktif hafta = WEEK1 (enrollment WEEK1 içinde başlar) → WEEK2 görece 2.
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO users
       (id, full_name, full_name_normalized, username, email, password_hash, role,
        is_active, token_version, deleted_at, created_at)
     VALUES (?, ?, ?, ?, NULL, 'x', 'student', 1, 1, NULL, ?)`,
  ).run('hs-stu-1', 'HS Öğrenci 1', 'hs ogrenci 1', 'hs-stu-1', now);
  db.prepare(
    `INSERT INTO students (id, user_id, guardian_id, deleted_at) VALUES (?, ?, NULL, NULL)`,
  ).run('hs-stu-rec-1', 'hs-stu-1');
  db.prepare(
    `INSERT INTO enrollments (id, student_id, class_id, start_date, end_date)
     VALUES (?, ?, ?, ?, NULL)`,
  ).run('hs-enr-1', 'hs-stu-rec-1', 'hs-class', WEEK1.start);

  teacherToken = await login('teacher@test.local');
  adminToken = await login('admin@test.local');

  // Yalnızca CC_1 tamamlanır; CC_2 eksik kalır.
  await completeReport(CC_1, WEEK2.id, 'Cebir: 10. sayfa ödev');
});

afterAll(() => {
  vi.useRealTimers();
});

function getSummary(query: string) {
  return request(app)
    .get(`/api/v1/admin/homework-summary?${query}`)
    .set('Authorization', `Bearer ${adminToken}`);
}

describe('GET /admin/homework-summary (spec §5.8)', () => {
  it('tüm dersleri listeler; dolu dersin ödevini, eksik dersi "missing" döner', async () => {
    const res = await getSummary(`class_id=hs-class&week_id=${WEEK2.id}`);
    expect(res.status).toBe(200);

    expect(res.body.class).toEqual({ id: 'hs-class', name: 'HS Sınıfı' });
    expect(res.body.week.week_no).toBe(2);
    expect(res.body.week.label).toBe('03.08 - 09.08.2026');
    // İlk aktif hafta WEEK1 → WEEK2 görece 2. hafta.
    expect(res.body.relative_week_no).toBe(2);

    const rows = res.body.rows as Array<{
      class_course_id: string;
      course_name: string;
      teacher_name: string;
      status: string;
      homework_description: string | null;
    }>;
    expect(rows).toHaveLength(2);
    // Ders günü sırası korunur.
    expect(rows.map((r) => r.class_course_id)).toEqual([CC_1, CC_2]);

    const algebra = rows[0];
    expect(algebra.course_name).toBe('Cebir');
    expect(algebra.teacher_name).toBe('Test Teacher');
    expect(algebra.status).toBe('completed');
    expect(algebra.homework_description).toBe('Cebir: 10. sayfa ödev');

    const geometry = rows[1];
    expect(geometry.course_name).toBe('Geometri');
    expect(geometry.status).toBe('missing');
    expect(geometry.homework_description).toBeNull();
  });

  it('week_id verilmezse aktif (şu anki) haftaya düşer', async () => {
    const res = await getSummary('class_id=hs-class');
    expect(res.status).toBe(200);
    expect(res.body.week.id).toBe(WEEK2.id);
    expect(res.body.rows).toHaveLength(2);
  });

  it('yılın sonraki haftası için (rapor yok) tüm satırlar "missing" olur', async () => {
    const res = await getSummary(`class_id=hs-class&week_id=${WEEK3.id}`);
    expect(res.status).toBe(200);
    expect(res.body.relative_week_no).toBe(3);
    expect(
      (res.body.rows as Array<{ status: string }>).every((r) => r.status === 'missing'),
    ).toBe(true);
  });

  it('class_id yoksa 400 VALIDATION_ERROR', async () => {
    const res = await request(app)
      .get('/api/v1/admin/homework-summary')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('bilinmeyen class_id → 404', async () => {
    const res = await getSummary(`class_id=yok&week_id=${WEEK2.id}`);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('yetki: token yok → 401, öğretmen → 403 (yalnızca admin)', async () => {
    const noToken = await request(app).get(
      `/api/v1/admin/homework-summary?class_id=hs-class&week_id=${WEEK2.id}`,
    );
    expect(noToken.status).toBe(401);

    const teacher = await request(app)
      .get(`/api/v1/admin/homework-summary?class_id=hs-class&week_id=${WEEK2.id}`)
      .set('Authorization', `Bearer ${teacherToken}`);
    expect(teacher.status).toBe(403);
  });
});

/**
 * Geçmiş rapor filtreleri — arama (q) + `/teacher/reports/filters` kapsamı.
 *
 * Kapsam kuralı (spec §2): öğretmen yalnızca kendi `class_courses`
 * atamalarındaki raporlardan türetilen sınıf/haftaları görür; başka
 * öğretmenin sınıf adı filtre listesinde görünmez. Admin tümünü görür.
 *
 * İzole fixture: mevcut sayfalama testlerinin toplamlarını etkilememek için
 * ayrı dosya. `fileParallelism: false` — tek test.db, sıralı çalışır.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { createApp } from './app.js';
import { db } from './db/index.js';
import { resetDb, insertTestUsers, TEST_PASSWORD } from './test/helpers.js';
import { signToken } from './utils/token.js';
import { hashPasswordSync } from './utils/hash.js';
import type { Role } from './types.js';

const app = createApp();

const CA = 'rf-class-a'; // ÖKLİD (normalize: oklid)
const CB = 'rf-class-b'; // PİSAGOR (normalize: pisagor)
const CCA = 'rf-cc-a'; // test-teacher
const CCB = 'rf-cc-b'; // test-teacher-2

let adminToken: string;
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

beforeAll(async () => {
  resetDb();
  insertTestUsers();

  db.prepare(
    `INSERT INTO academic_years (id, name, start_date, end_date, is_active)
     VALUES ('rf-year', '2026-2027', '2026-09-01', '2027-06-30', 1)`,
  ).run();
  const insertWeek = db.prepare(
    `INSERT INTO weeks (id, academic_year_id, week_no, start_date, end_date, label)
     VALUES (?, 'rf-year', ?, ?, ?, ?)`,
  );
  insertWeek.run('rf-w1', 1, '2026-09-01', '2026-09-07', '1 - 7 Eylül');
  insertWeek.run('rf-w2', 2, '2026-09-08', '2026-09-14', '8 - 14 Eylül');

  db.prepare(
    `INSERT INTO classes (id, academic_year_id, name, name_normalized, deleted_at)
     VALUES (?, 'rf-year', ?, ?, NULL)`,
  ).run(CA, 'ÖKLİD', 'oklid');
  db.prepare(
    `INSERT INTO classes (id, academic_year_id, name, name_normalized, deleted_at)
     VALUES (?, 'rf-year', ?, ?, NULL)`,
  ).run(CB, 'PİSAGOR', 'pisagor');

  db.prepare(
    `INSERT INTO courses (id, name, name_normalized, deleted_at) VALUES ('rf-co-a', 'Cebir', 'cebir', NULL)`,
  ).run();
  db.prepare(
    `INSERT INTO courses (id, name, name_normalized, deleted_at) VALUES ('rf-co-b', 'Fizik', 'fizik', NULL)`,
  ).run();

  db.prepare(
    `INSERT INTO users
       (id, full_name, full_name_normalized, username, email, password_hash, role,
        is_active, token_version, deleted_at, created_at)
     VALUES ('test-teacher-2', 'Test Teacher 2', 'test teacher 2', NULL,
             'teacher2@test.local', ?, 'teacher', 1, 1, NULL, ?)`,
  ).run(hashPasswordSync(TEST_PASSWORD), new Date().toISOString());

  const insertCc = db.prepare(
    `INSERT INTO class_courses
       (id, class_id, course_id, teacher_id, day_of_week, lesson_time, deleted_at)
     VALUES (?, ?, ?, ?, 1, '09:00', NULL)`,
  );
  insertCc.run(CCA, CA, 'rf-co-a', 'test-teacher');
  insertCc.run(CCB, CB, 'rf-co-b', 'test-teacher-2');

  const insertReport = db.prepare(
    `INSERT INTO reports (id, class_course_id, week_id, status, completed_at, created_by, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  );
  const now = new Date().toISOString();
  insertReport.run('rf-report-a', CCA, 'rf-w1', 'completed', now, 'test-teacher', now);
  insertReport.run('rf-report-b', CCB, 'rf-w2', 'completed', now, 'test-teacher-2', now);

  adminToken = await login('admin@test.local');
  teacherToken = await login('teacher@test.local');
});

describe('GET /teacher/reports — q (sınıf + ders, normalize)', () => {
  it('öğretmen yalnızca kendi raporlarında arar; Türkçe karakter normalize edilir', async () => {
    const all = await request(app)
      .get('/api/v1/teacher/reports')
      .set('Authorization', `Bearer ${teacherToken}`);
    expect(all.body.total).toBe(1);

    // "ÖKLİD" → normalizeTurkish("öklid") = "oklid" = classes.name_normalized.
    const byClass = await request(app)
      .get('/api/v1/teacher/reports?q=%C3%96KL%C4%B0D')
      .set('Authorization', `Bearer ${teacherToken}`);
    expect(byClass.body.total).toBe(1);

    const byCourse = await request(app)
      .get('/api/v1/teacher/reports?q=cebir')
      .set('Authorization', `Bearer ${teacherToken}`);
    expect(byCourse.body.total).toBe(1);

    // Başka öğretmenin sınıf/dersi öğretmene sızmaz.
    const otherClass = await request(app)
      .get('/api/v1/teacher/reports?q=pisagor')
      .set('Authorization', `Bearer ${teacherToken}`);
    expect(otherClass.body.total).toBe(0);
    const otherCourse = await request(app)
      .get('/api/v1/teacher/reports?q=fizik')
      .set('Authorization', `Bearer ${teacherToken}`);
    expect(otherCourse.body.total).toBe(0);
  });

  it('admin tüm raporlarda arar (normalize)', async () => {
    const all = await request(app)
      .get('/api/v1/teacher/reports')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(all.body.total).toBe(2);

    const byClass = await request(app)
      .get('/api/v1/teacher/reports?q=pisagor')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(byClass.body.total).toBe(1);

    const byCourse = await request(app)
      .get('/api/v1/teacher/reports?q=Fizik')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(byCourse.body.total).toBe(1);
  });

  it('q diğer filtrelerle birleşir', async () => {
    const hit = await request(app)
      .get(`/api/v1/teacher/reports?q=cebir&status=completed&class_id=${CA}&week_id=rf-w1`)
      .set('Authorization', `Bearer ${teacherToken}`);
    expect(hit.body.total).toBe(1);

    const miss = await request(app)
      .get(`/api/v1/teacher/reports?q=cebir&status=draft`)
      .set('Authorization', `Bearer ${teacherToken}`);
    expect(miss.body.total).toBe(0);
    expect(miss.body.items).toHaveLength(0);
  });

  it('veli/öğrenci 403 döner', async () => {
    for (const [id, role] of [
      ['test-guardian', 'guardian'],
      ['test-student', 'student'],
    ] as Array<[string, Role]>) {
      const res = await request(app)
        .get('/api/v1/teacher/reports?q=cebir')
        .set('Authorization', `Bearer ${signTokenFor(id, role)}`);
      expect(res.status).toBe(403);
    }
  });
});

describe('GET /teacher/reports/filters — role göre kapsam', () => {
  it('öğretmen yalnızca kendi sınıf/haftalarını görür', async () => {
    const res = await request(app)
      .get('/api/v1/teacher/reports/filters')
      .set('Authorization', `Bearer ${teacherToken}`);
    expect(res.status).toBe(200);

    const classes = (res.body.classes as Array<{ name: string }>).map((c) => c.name);
    expect(classes).toEqual(['ÖKLİD']);
    expect(classes).not.toContain('PİSAGOR');

    const weekIds = (res.body.weeks as Array<{ id: string }>).map((w) => w.id);
    expect(weekIds).toEqual(['rf-w1']);
    expect(weekIds).not.toContain('rf-w2');
  });

  it('admin tüm sınıf/haftaları görür', async () => {
    const res = await request(app)
      .get('/api/v1/teacher/reports/filters')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);

    const classes = (res.body.classes as Array<{ name: string }>).map((c) => c.name);
    expect(classes).toContain('ÖKLİD');
    expect(classes).toContain('PİSAGOR');

    const weekIds = (res.body.weeks as Array<{ id: string }>).map((w) => w.id);
    expect(weekIds).toContain('rf-w1');
    expect(weekIds).toContain('rf-w2');
  });

  it('veli/öğrenci 403 döner', async () => {
    for (const [id, role] of [
      ['test-guardian', 'guardian'],
      ['test-student', 'student'],
    ] as Array<[string, Role]>) {
      const res = await request(app)
        .get('/api/v1/teacher/reports/filters')
        .set('Authorization', `Bearer ${signTokenFor(id, role)}`);
      expect(res.status).toBe(403);
    }
  });
});

/**
 * Veli paneli entegrasyon testleri — Aşama 5 (spec.md §6 Veli).
 * - `GET /guardian/students` — velinin çocukları.
 * - `GET /guardian/reports?student_id=` — yalnızca `sent` digest'ler
 *   (pending/ready asla görünmez), snapshot'tan sınıf adı.
 * - `GET /guardian/reports/:id` — detay (snapshot) + ödev teslim geçmişi.
 * - Sahiplik: başka velinin öğrencisi → 404 (varlık sızdırmaz).
 *
 * `fileParallelism: false` — sıralı koşulur.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { createApp } from './app.js';
import { db } from './db/index.js';
import { resetDb, insertTestUsers } from './test/helpers.js';
import { hashPasswordSync } from './utils/hash.js';

const app = createApp();

const WEEK1 = { id: 'g-week-1', start: '2026-07-27', end: '2026-08-02' };
const WEEK2 = { id: 'g-week-2', start: '2026-08-03', end: '2026-08-09' };
const WEEK3 = { id: 'g-week-3', start: '2026-08-10', end: '2026-08-16' };

const SNAPSHOT = JSON.stringify({
  week: { id: WEEK2.id, week_no: 2, start_date: WEEK2.start, end_date: WEEK2.end, label: 'Hafta 2' },
  class: { id: 'g-class', name: 'Veli Sınıfı' },
  student: { id: 'test-student-rec', name: 'Test Student' },
  guardian_name: 'Test Guardian',
  courses: [
    {
      class_course_id: 'g-cc-1',
      course_name: 'Ders 1',
      teacher_name: 'Test Teacher',
      day_of_week: 1,
      lesson_time: '09:00',
      status: 'completed',
      topic_covered: 'Denklemler',
      prev_homework_text: null,
      homework: { description: 'Sayfa 10', due_date: '2026-08-10' },
      entry: {
        student_id: 'test-student-rec',
        student_name: 'Test Student',
        attendance: 'present',
        homework_score: 8,
        interest_score: 9,
        teacher_note: null,
      },
    },
  ],
});

let guardianToken: string;
let otherGuardianToken: string;
let sentDigestId: string;

beforeAll(async () => {
  resetDb();
  insertTestUsers();

  db.prepare(
    `INSERT INTO academic_years (id, name, start_date, end_date, is_active)
     VALUES (?, ?, ?, ?, 1)`,
  ).run('g-year', '2026-2027', '2026-07-20', '2026-08-16');
  const insertWeek = db.prepare(
    `INSERT INTO weeks (id, academic_year_id, week_no, start_date, end_date, label)
     VALUES (?, ?, ?, ?, ?, ?)`,
  );
  insertWeek.run(WEEK1.id, 'g-year', 1, WEEK1.start, WEEK1.end, 'Hafta 1');
  insertWeek.run(WEEK2.id, 'g-year', 2, WEEK2.start, WEEK2.end, 'Hafta 2');
  insertWeek.run(WEEK3.id, 'g-year', 3, WEEK3.start, WEEK3.end, 'Hafta 3');

  db.prepare(
    `INSERT INTO classes (id, academic_year_id, name, name_normalized, deleted_at)
     VALUES (?, ?, ?, ?, NULL)`,
  ).run('g-class', 'g-year', 'Veli Sınıfı', 'veli sinifi');
  db.prepare(
    `INSERT INTO courses (id, name, name_normalized, deleted_at) VALUES (?, ?, ?, NULL)`,
  ).run('g-course-1', 'Ders 1', 'ders 1');
  db.prepare(
    `INSERT INTO class_courses
       (id, class_id, course_id, teacher_id, day_of_week, lesson_time, deleted_at)
     VALUES (?, ?, ?, ?, ?, ?, NULL)`,
  ).run('g-cc-1', 'g-class', 'g-course-1', 'test-teacher', 1, '09:00');

  // test-student-rec (test-guardian-rec'in çocuğu) sınıfa kayıt edilir.
  db.prepare(
    `INSERT INTO enrollments (id, student_id, class_id, start_date, end_date)
     VALUES (?, ?, ?, ?, NULL)`,
  ).run('g-enr-1', 'test-student-rec', 'g-class', '2026-07-20');

  // Başka veli + çocuğu (sahiplik 404 testi için).
  db.prepare(
    `INSERT INTO users
       (id, full_name, full_name_normalized, username, email, password_hash, role,
        is_active, token_version, deleted_at, created_at)
     VALUES (?, ?, ?, ?, NULL, ?, 'guardian', 1, 1, NULL, ?)`,
  ).run(
    'g-g2-user',
    'Başka Veli',
    'baska veli',
    'g-guardian-2',
    hashPasswordSync('Password123!'),
    new Date().toISOString(),
  );
  db.prepare(
    `INSERT INTO guardians (id, user_id, whatsapp_phone, phone_secondary, consent_at, deleted_at)
     VALUES (?, ?, '+905009990009', NULL, ?, NULL)`,
  ).run('g-g2-rec', 'g-g2-user', new Date().toISOString());
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO users
       (id, full_name, full_name_normalized, username, email, password_hash, role,
        is_active, token_version, deleted_at, created_at)
     VALUES (?, ?, ?, ?, NULL, ?, 'student', 1, 1, NULL, ?)`,
  ).run('g-stu-2', 'Başka Öğrenci', 'baska ogrenci', 'g-stu-2', hashPasswordSync('x'), now);
  db.prepare(
    `INSERT INTO students (id, user_id, guardian_id, deleted_at) VALUES (?, ?, ?, NULL)`,
  ).run('g-stu-rec-2', 'g-stu-2', 'g-g2-rec');

  // Ödev + teslim (detay ucu "ödev teslim geçmişi" için). homeworks.report_id
  // NOT NULL — detay sorgusu yalnızca class_id+week_id kullandığı için rapor
  // satırı minimal kurulur.
  const gNow = new Date().toISOString();
  db.prepare(
    `INSERT INTO reports
       (id, class_course_id, week_id, topic_covered, prev_homework_id,
        prev_homework_text, status, completed_at, created_by, updated_at)
     VALUES (?, ?, ?, NULL, NULL, NULL, 'completed', ?, ?, ?)`,
  ).run('g-report-1', 'g-cc-1', WEEK2.id, gNow, 'test-teacher', gNow);
  db.prepare(
    `INSERT INTO homeworks (id, report_id, class_course_id, week_id, description, attachments, due_date)
     VALUES (?, ?, 'g-cc-1', ?, ?, NULL, ?)`,
  ).run('g-hw-1', 'g-report-1', WEEK2.id, 'Sayfa 10', '2026-08-10');
  db.prepare(
    `INSERT INTO submissions
       (id, homework_id, student_id, note, submitted_at, is_late, status, reviewed_by, reviewed_at, files_purged_at)
     VALUES (?, ?, ?, NULL, ?, 0, 'submitted', NULL, NULL, NULL)`,
  ).run('g-sub-1', 'g-hw-1', 'test-student-rec', '2026-08-08T18:00:00.000Z');

  // Digest'ler: week2 sent (veli görür), week1 sent (geçmiş), week3 pending (görünmez).
  const insertDigest = db.prepare(
    `INSERT INTO weekly_digests
       (id, student_id, week_id, guardian_id, token, status, send_count,
        sent_at, sent_by, snapshot, is_revoked)
     VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?, 0)`,
  );
  insertDigest.run(
    'g-dig-2',
    'test-student-rec',
    WEEK2.id,
    'test-guardian-rec',
    'g-token-2',
    'sent',
    '2026-08-09T08:00:00.000Z',
    'test-admin',
    SNAPSHOT,
  );
  insertDigest.run(
    'g-dig-1',
    'test-student-rec',
    WEEK1.id,
    'test-guardian-rec',
    'g-token-1',
    'sent',
    '2026-08-02T08:00:00.000Z',
    'test-admin',
    JSON.stringify({
      week: { id: WEEK1.id, week_no: 1, start_date: WEEK1.start, end_date: WEEK1.end, label: 'Hafta 1' },
      class: { id: 'g-class', name: 'Veli Sınıfı' },
      student: { id: 'test-student-rec', name: 'Test Student' },
      guardian_name: 'Test Guardian',
      courses: [],
    }),
  );
  insertDigest.run(
    'g-dig-3',
    'test-student-rec',
    WEEK3.id,
    'test-guardian-rec',
    'g-token-3',
    'pending',
    null,
    null,
    null,
  );

  const login = await request(app)
    .post('/api/v1/auth/login')
    .send({ identifier: 'test-guardian', password: 'Password123!' });
  guardianToken = login.body.token as string;

  const login2 = await request(app)
    .post('/api/v1/auth/login')
    .send({ identifier: 'g-guardian-2', password: 'Password123!' });
  otherGuardianToken = login2.body.token as string;

  sentDigestId = 'g-dig-2';
});

describe('GET /api/v1/guardian/students', () => {
  it('velinin çocuklarını döner (yalnızca kendi)', async () => {
    const res = await request(app)
      .get('/api/v1/guardian/students')
      .set('Authorization', `Bearer ${guardianToken}`);
    expect(res.status).toBe(200);
    const ids = (res.body.items as Array<{ student_id: string }>).map((s) => s.student_id);
    expect(ids).toContain('test-student-rec');
    expect(ids).not.toContain('g-stu-rec-2');
    expect(res.body.items[0].class_name).toBe('Veli Sınıfı');
  });

  it('öğrenci rolü 403 döner', async () => {
    const studentLogin = await request(app)
      .post('/api/v1/auth/login')
      .send({ identifier: 'test-student', password: 'Password123!' });
    const res = await request(app)
      .get('/api/v1/guardian/students')
      .set('Authorization', `Bearer ${studentLogin.body.token}`);
    expect(res.status).toBe(403);
  });

  it('token yokken 401', async () => {
    const res = await request(app).get('/api/v1/guardian/students');
    expect(res.status).toBe(401);
  });
});

describe('GET /api/v1/guardian/reports (liste)', () => {
  it('yalnızca sent digest\'leri döner; pending görünmez; en yeni üstte', async () => {
    const res = await request(app)
      .get(`/api/v1/guardian/reports?student_id=test-student-rec`)
      .set('Authorization', `Bearer ${guardianToken}`);
    expect(res.status).toBe(200);
    const items = res.body.items as Array<{
      id: string;
      week: { week_no: number };
      class_name: string;
      course_count: number;
    }>;
    expect(items.map((i) => i.id).sort()).toEqual(['g-dig-1', 'g-dig-2']);
    // En yeni (week 2) üstte.
    expect(items[0].week.week_no).toBe(2);
    expect(items[0].class_name).toBe('Veli Sınıfı');
    expect(items[1].course_count).toBe(0);
    // pending digest (g-dig-3) listede yok.
    expect(items.some((i) => i.id === 'g-dig-3')).toBe(false);
  });

  it('başka velinin öğrencisi → 404 (varlık sızdırmaz)', async () => {
    const res = await request(app)
      .get(`/api/v1/guardian/reports?student_id=g-stu-rec-2`)
      .set('Authorization', `Bearer ${guardianToken}`);
    expect(res.status).toBe(404);
  });

  it('student_id eksik → 400', async () => {
    const res = await request(app)
      .get('/api/v1/guardian/reports')
      .set('Authorization', `Bearer ${guardianToken}`);
    expect(res.status).toBe(400);
  });
});

describe('GET /api/v1/guardian/reports/:id (detay)', () => {
  it('snapshot + ödev teslim geçmişini döner', async () => {
    const res = await request(app)
      .get(`/api/v1/guardian/reports/${sentDigestId}`)
      .set('Authorization', `Bearer ${guardianToken}`);
    expect(res.status).toBe(200);
    expect(res.body.snapshot.class.name).toBe('Veli Sınıfı');
    expect(res.body.snapshot.courses).toHaveLength(1);

    const submissions = res.body.submissions as Array<{
      course_name: string;
      description: string;
      submission: { submitted_at: string; is_late: boolean } | null;
    }>;
    expect(submissions).toHaveLength(1);
    expect(submissions[0].course_name).toBe('Ders 1');
    expect(submissions[0].submission).not.toBeNull();
    expect(submissions[0].submission!.is_late).toBe(false);
  });

  it('başka velinin digest\'i → 404', async () => {
    const res = await request(app)
      .get(`/api/v1/guardian/reports/${sentDigestId}`)
      .set('Authorization', `Bearer ${otherGuardianToken}`);
    expect(res.status).toBe(404);
  });

  it('gönderilmemiş digest detayı görünmez (404)', async () => {
    const res = await request(app)
      .get('/api/v1/guardian/reports/g-dig-3')
      .set('Authorization', `Bearer ${guardianToken}`);
    expect(res.status).toBe(404);
  });
});

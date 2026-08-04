/**
 * Public token endpoint testleri — Aşama 5 (spec.md §5.4 "Token iptali").
 * `/r/{token}` sayfasını besleyen `GET /api/v1/public/digests/:token`:
 * geçerli sent digest → 200 + snapshot; bilinmeyen / revoked / gönderilmemiş
 * token → aynı mesajla 410 (token varlığı dışarı sızmaz).
 */

import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { createApp } from './app.js';
import { db } from './db/index.js';
import { resetDb, insertTestUsers } from './test/helpers.js';

const app = createApp();

const SNAPSHOT = JSON.stringify({
  week: { id: 'w1', week_no: 1, start_date: '2026-07-27', end_date: '2026-08-02', label: 'Hafta 1' },
  class: { id: 'c1', name: 'Test Sınıf' },
  student: { id: 'test-student-rec', name: 'Test Student' },
  guardian_name: 'Test Guardian',
  courses: [
    {
      class_course_id: 'cc1',
      course_name: 'Matematik',
      teacher_name: 'Test Teacher',
      day_of_week: 1,
      lesson_time: '09:00',
      status: 'completed',
      topic_covered: 'Denklemler',
      prev_homework_text: null,
      homework: { description: 'Sayfa 10', due_date: '2026-08-03' },
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

beforeAll(() => {
  resetDb();
  insertTestUsers();

  db.prepare(
    `INSERT INTO academic_years (id, name, start_date, end_date, is_active)
     VALUES (?, ?, ?, ?, 1)`,
  ).run('p-year', '2026-2027', '2026-07-20', '2026-08-16');
  const insertWeek = db.prepare(
    `INSERT INTO weeks (id, academic_year_id, week_no, start_date, end_date, label)
     VALUES (?, ?, ?, ?, ?, ?)`,
  );
  insertWeek.run('w1', 'p-year', 1, '2026-07-27', '2026-08-02', 'Hafta 1');
  insertWeek.run('w2', 'p-year', 2, '2026-08-03', '2026-08-09', 'Hafta 2');
  insertWeek.run('w3', 'p-year', 3, '2026-08-10', '2026-08-16', 'Hafta 3');

  const insert = db.prepare(
    `INSERT INTO weekly_digests
       (id, student_id, week_id, guardian_id, token, status, send_count,
        sent_at, sent_by, snapshot, is_revoked)
     VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?)`,
  );
  insert.run(
    'pd-valid',
    'test-student-rec',
    'w1',
    'test-guardian-rec',
    'tok-valid',
    'sent',
    '2026-08-02T10:00:00.000Z',
    'test-admin',
    SNAPSHOT,
    0,
  );
  insert.run(
    'pd-revoked',
    'test-student-rec',
    'w2',
    'test-guardian-rec',
    'tok-revoked',
    'sent',
    '2026-08-02T10:00:00.000Z',
    'test-admin',
    SNAPSHOT,
    1,
  );
  insert.run(
    'pd-pending',
    'test-student-rec',
    'w3',
    'test-guardian-rec',
    'tok-pending',
    'pending',
    null,
    null,
    null,
    0,
  );
});

describe('GET /api/v1/public/digests/:token', () => {
  it('geçerli sent digest → 200 + snapshot (auth gerekmez)', async () => {
    const res = await request(app).get('/api/v1/public/digests/tok-valid');
    expect(res.status).toBe(200);
    expect(res.body.snapshot).toEqual(JSON.parse(SNAPSHOT));
    expect(res.body.sent_at).toBe('2026-08-02T10:00:00.000Z');
  });

  it('bilinmeyen token → 410 (404 değil)', async () => {
    const res = await request(app).get('/api/v1/public/digests/unknown-token');
    expect(res.status).toBe(410);
    expect(res.body.error.code).toBe('GONE');
    expect(res.body.error.message).toBe('Bu rapor artık geçerli değil.');
  });

  it('iptal edilmiş (is_revoked) token → 410', async () => {
    const res = await request(app).get('/api/v1/public/digests/tok-revoked');
    expect(res.status).toBe(410);
    expect(res.body.error.code).toBe('GONE');
  });

  it('gönderilmemiş (pending) token → 410 (token hiç paylaşılmamış)', async () => {
    const res = await request(app).get('/api/v1/public/digests/tok-pending');
    expect(res.status).toBe(410);
    expect(res.body.error.code).toBe('GONE');
  });
});

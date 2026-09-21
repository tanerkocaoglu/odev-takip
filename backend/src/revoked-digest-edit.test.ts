/**
 * Geri çekilmiş (is_revoked) digest sonrası admin rapor düzenleme + yeniden
 * gönderim — spec.md §5.4. İki öğrencili senaryo:
 *
 * - A ve B aynı sınıf+haftada; rapor (class_course+week) ikisine ortaktır.
 * - A'nın digest'i geri çekilir; admin paylaşılan raporu düzenler (PUT 200,
 *   rapor `sent` kalır) — düzenleme HİÇBİR digest snapshot'ını değiştirmez.
 * - Yeniden gönderim yalnızca A'nın snapshot/token'ını tazeler; B'nin snapshot'ı
 *   bit-bit aynı kalır ve A'nın eski token'ı kalıcı olarak 410 döner.
 *
 * "Diğer öğrenciler etkilenmiyor" iddiasının kilit testi budur.
 * Tarihler deterministik: `Date` 2026-08-04 Salı; hafta 2 = bu hafta.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import request from 'supertest';
import { createApp } from './app.js';
import { db } from './db/index.js';
import { resetDb, insertTestUsers, TEST_PASSWORD } from './test/helpers.js';

const app = createApp();

const FAKE_NOW = new Date('2026-08-04T10:00:00');
const WEEK = { id: 'rev-week-2', start: '2026-08-03', end: '2026-08-09' };
const CC_1 = 'rev-cc-1';
const CC_2 = 'rev-cc-2';
const STU_REC_A = 'rev-stu-rec-a';
const STU_REC_B = 'rev-stu-rec-b';

let adminToken: string;
let teacherToken: string;
let reportId: string;

async function login(identifier: string): Promise<string> {
  const res = await request(app)
    .post('/api/v1/auth/login')
    .send({ identifier, password: TEST_PASSWORD });
  return res.body.token as string;
}

async function completeReport(ccId: string): Promise<string> {
  const created = await request(app)
    .post('/api/v1/teacher/reports')
    .set('Authorization', `Bearer ${teacherToken}`)
    .send({ class_course_id: ccId, week_id: WEEK.id });
  expect([200, 201]).toContain(created.status);
  const id = created.body.report.id as string;
  const entries = created.body.entries as Array<{ student_id: string }>;
  await request(app)
    .put(`/api/v1/teacher/reports/${id}`)
    .set('Authorization', `Bearer ${teacherToken}`)
    .send({
      topic_covered: 'İlk konu',
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

function digestRow(studentRecId: string): {
  id: string;
  token: string;
  snapshot: string | null;
  is_revoked: number;
  send_count: number;
  status: string;
} {
  return db
    .prepare(
      `SELECT id, token, snapshot, is_revoked, send_count, status
       FROM weekly_digests WHERE student_id = ?`,
    )
    .get(studentRecId) as {
    id: string;
    token: string;
    snapshot: string | null;
    is_revoked: number;
    send_count: number;
    status: string;
  };
}

function sendAsAdmin(digestId: string) {
  return request(app)
    .post(`/api/v1/admin/digests/${digestId}/send`)
    .set('Authorization', `Bearer ${adminToken}`);
}

beforeAll(async () => {
  vi.useFakeTimers({ toFake: ['Date'], now: FAKE_NOW });
  resetDb();
  insertTestUsers();

  db.prepare(
    `INSERT INTO academic_years (id, name, start_date, end_date, is_active)
     VALUES ('rev-year', '2026-2027', '2026-07-20', '2026-08-16', 1)`,
  ).run();
  db.prepare(
    `INSERT INTO weeks (id, academic_year_id, week_no, start_date, end_date, label)
     VALUES (?, 'rev-year', 2, ?, ?, 'Hafta 2'),
            ('rev-week-3', 'rev-year', 3, '2026-08-10', '2026-08-16', 'Hafta 3')`,
  ).run(WEEK.id, WEEK.start, WEEK.end);

  db.prepare(
    `INSERT INTO classes (id, academic_year_id, name, name_normalized, deleted_at)
     VALUES ('rev-class', 'rev-year', 'Geri Çekme Sınıfı', 'geri cekme sinifi', NULL)`,
  ).run();
  db.prepare(
    `INSERT INTO courses (id, name, name_normalized, deleted_at)
     VALUES ('rev-co-1', 'Ders 1', 'ders 1', NULL), ('rev-co-2', 'Ders 2', 'ders 2', NULL)`,
  ).run();
  db.prepare(
    `INSERT INTO class_courses
       (id, class_id, course_id, teacher_id, day_of_week, lesson_time, deleted_at)
     VALUES (?, 'rev-class', 'rev-co-1', 'test-teacher', 1, '09:00', NULL),
            (?, 'rev-class', 'rev-co-2', 'test-teacher', 2, '10:00', NULL)`,
  ).run(CC_1, CC_2);

  const now = new Date().toISOString();
  const insertUser = db.prepare(
    `INSERT INTO users
       (id, full_name, full_name_normalized, username, email, password_hash, role,
        is_active, token_version, deleted_at, created_at)
     VALUES (?, ?, ?, NULL, NULL, 'x', ?, 1, 1, NULL, ?)`,
  );
  const insertGuardian = db.prepare(
    `INSERT INTO guardians (id, user_id, whatsapp_phone, phone_secondary, consent_at, deleted_at)
     VALUES (?, ?, ?, NULL, ?, NULL)`,
  );
  const insertStudent = db.prepare(
    `INSERT INTO students (id, user_id, guardian_id, deleted_at)
     VALUES (?, ?, ?, NULL)`,
  );
  const insertEnrollment = db.prepare(
    `INSERT INTO enrollments (id, student_id, class_id, start_date, end_date)
     VALUES (?, ?, 'rev-class', '2026-07-20', NULL)`,
  );

  const people = [
    { key: 'a', name: 'Geri Çekilen Öğrenci', phone: '+905009990011' },
    { key: 'b', name: 'Diğer Öğrenci', phone: '+905009990012' },
  ];
  for (const p of people) {
    insertUser.run(`rev-${p.key}-user`, p.name, `geri cekilen ${p.key}`, 'guardian', now);
    insertGuardian.run(`rev-${p.key}-g-rec`, `rev-${p.key}-user`, p.phone, now);
    insertUser.run(`rev-${p.key}-stu-user`, p.name, `ogrenci ${p.key}`, 'student', now);
    insertStudent.run(`rev-stu-rec-${p.key}`, `rev-${p.key}-stu-user`, `rev-${p.key}-g-rec`);
    insertEnrollment.run(`rev-enr-${p.key}`, `rev-stu-rec-${p.key}`);
  }

  adminToken = await login('admin@test.local');
  teacherToken = await login('teacher@test.local');

  await completeReport(CC_1);
  await completeReport(CC_2);
  reportId = (
    db
      .prepare(`SELECT id FROM reports WHERE class_course_id = ? AND week_id = ?`)
      .get(CC_1, WEEK.id) as { id: string }
  ).id;
});

afterAll(() => {
  vi.useRealTimers();
});

describe('geri çekilmiş digest — paylaşılan rapor düzenleme ve yeniden gönderim', () => {
  it('her iki öğrenciye gönderim → kaskad: rapor sent', async () => {
    expect((await sendAsAdmin(digestRow(STU_REC_A).id)).status).toBe(200);
    expect((await sendAsAdmin(digestRow(STU_REC_B).id)).status).toBe(200);

    const status = (
      db.prepare(`SELECT status FROM reports WHERE id = ?`).get(reportId) as { status: string }
    ).status;
    expect(status).toBe('sent');
  });

  it('A geri çekilir; A ve B snapshot\'ları değişmez', async () => {
    const before = { a: digestRow(STU_REC_A).snapshot, b: digestRow(STU_REC_B).snapshot };

    const revoke = await request(app)
      .post(`/api/v1/admin/digests/${digestRow(STU_REC_A).id}/revoke`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(revoke.status).toBe(200);
    expect(revoke.body.is_revoked).toBe(true);

    expect(digestRow(STU_REC_A).snapshot).toBe(before.a);
    expect(digestRow(STU_REC_B).snapshot).toBe(before.b);
  });

  it('admin sent raporu düzenler (200) — paylaşılan satır değişir, snapshot\'lar dokunulmaz', async () => {
    const snapA = digestRow(STU_REC_A).snapshot;
    const snapB = digestRow(STU_REC_B).snapshot;

    const put = await request(app)
      .put(`/api/v1/teacher/reports/${reportId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        topic_covered: 'Düzeltilmiş konu',
        entries: [
          {
            student_id: STU_REC_A,
            attendance: 'present',
            homework_score: 3,
            interest_score: 4,
            teacher_note: 'revize',
          },
        ],
      });
    expect(put.status).toBe(200);
    expect(put.body.report.status).toBe('sent');

    // Paylaşılan rapor güncellendi...
    const report = db
      .prepare(`SELECT topic_covered, status FROM reports WHERE id = ?`)
      .get(reportId) as { topic_covered: string; status: string };
    expect(report.topic_covered).toBe('Düzeltilmiş konu');
    expect(report.status).toBe('sent');

    // ...ama hiçbir gönderilmiş snapshot değişmedi (Bulgu #6 davranışı).
    expect(digestRow(STU_REC_A).snapshot).toBe(snapA);
    expect(digestRow(STU_REC_B).snapshot).toBe(snapB);
  });

  it('A yeniden gönderilir: yalnızca A tazelenir, B bit-bit aynı kalır, eski A token 410', async () => {
    const oldTokenA = digestRow(STU_REC_A).token;
    const snapB = digestRow(STU_REC_B).snapshot;

    // Geri çekilmiş token ölü.
    expect((await request(app).get(`/api/v1/public/digests/${oldTokenA}`)).status).toBe(410);

    const resend = await sendAsAdmin(digestRow(STU_REC_A).id);
    expect(resend.status).toBe(200);

    const rowA = digestRow(STU_REC_A);
    expect(rowA.is_revoked).toBe(0);
    expect(rowA.send_count).toBe(2);
    expect(rowA.token).not.toBe(oldTokenA);
    expect(rowA.snapshot).not.toBe(null);
    expect(rowA.snapshot).toContain('Düzeltilmiş konu');

    // B hiç etkilenmedi.
    const rowB = digestRow(STU_REC_B);
    expect(rowB.snapshot).toBe(snapB);
    expect(rowB.send_count).toBe(1);

    // Eski A token hâlâ 410; yeni A token 200.
    expect((await request(app).get(`/api/v1/public/digests/${oldTokenA}`)).status).toBe(410);
    expect((await request(app).get(`/api/v1/public/digests/${rowA.token}`)).status).toBe(200);
  });
});

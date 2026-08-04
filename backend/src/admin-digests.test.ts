/**
 * Admin haftalık gönderim entegrasyon testleri — Aşama 5 (spec.md §5.4):
 * - list (pending/ready/sent, sınıf filtresi, eksik ders sayısı)
 * - preview (snapshot; yalnızca o öğrencinin satırları)
 * - send: yeni token + snapshot + send_count + wa.me; **KVKK 409'lar**
 *   (whatsapp yok / consent yok — iki ayrı mesaj)
 * - **reports.status='sent' kaskadı**: o sınıf+haftanın tüm digest'leri
 *   sent olunca completed raporlar sent olur (aynı transaction)
 * - re-send (yeni token, audit resend), revoke (is_revoked → /r 410)
 *
 * Tarihler deterministik: `Date` 2026-08-04 Salı. Hafta 2 = bu hafta.
 * `fileParallelism: false` — sıralı koşulur.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import request from 'supertest';
import { createApp } from './app.js';
import { db } from './db/index.js';
import { resetDb, insertTestUsers, TEST_PASSWORD } from './test/helpers.js';

const app = createApp();

const FAKE_NOW = new Date('2026-08-04T10:00:00');
const WEEK2 = { id: 'ad-week-2', start: '2026-08-03', end: '2026-08-09' };
const WEEK3 = { id: 'ad-week-3', start: '2026-08-10', end: '2026-08-16' };

const CC_1 = 'ad-cc-1';
const CC_2 = 'ad-cc-2';

let adminToken: string;
let teacherToken: string;

async function login(identifier: string): Promise<string> {
  const res = await request(app)
    .post('/api/v1/auth/login')
    .send({ identifier, password: TEST_PASSWORD });
  return res.body.token as string;
}

/** Rapor oluştur → tüm satırları puanla → tamamla (digest tetikler). */
async function completeReport(ccId: string, weekId: string): Promise<void> {
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
}

/** Öğrencinin digest id'si. */
function digestIdFor(studentRecId: string): string {
  const row = db
    .prepare(`SELECT id FROM weekly_digests WHERE student_id = ?`)
    .get(studentRecId) as { id: string };
  return row.id;
}

function digestToken(studentRecId: string): string {
  const row = db
    .prepare(`SELECT token FROM weekly_digests WHERE student_id = ?`)
    .get(studentRecId) as { token: string };
  return row.token;
}

beforeAll(async () => {
  vi.useFakeTimers({ toFake: ['Date'], now: FAKE_NOW });
  resetDb();
  insertTestUsers();

  // --- Yıl + haftalar ---
  db.prepare(
    `INSERT INTO academic_years (id, name, start_date, end_date, is_active)
     VALUES (?, ?, ?, ?, 1)`,
  ).run('ad-year', '2026-2027', '2026-07-20', '2026-08-16');
  const insertWeek = db.prepare(
    `INSERT INTO weeks (id, academic_year_id, week_no, start_date, end_date, label)
     VALUES (?, ?, ?, ?, ?, ?)`,
  );
  insertWeek.run('ad-week-1', 'ad-year', 1, '2026-07-27', '2026-08-02', 'Hafta 1');
  insertWeek.run(WEEK2.id, 'ad-year', 2, WEEK2.start, WEEK2.end, 'Hafta 2');
  insertWeek.run(WEEK3.id, 'ad-year', 3, WEEK3.start, WEEK3.end, 'Hafta 3');

  // --- Sınıf + dersler + atamalar ---
  db.prepare(
    `INSERT INTO classes (id, academic_year_id, name, name_normalized, deleted_at)
     VALUES (?, ?, ?, ?, NULL)`,
  ).run('ad-class', 'ad-year', 'Gönderim Sınıfı', 'gonderim sinifi');
  const insertCourse = db.prepare(
    `INSERT INTO courses (id, name, name_normalized, deleted_at) VALUES (?, ?, ?, NULL)`,
  );
  insertCourse.run('ad-course-1', 'Ders 1', 'ders 1');
  insertCourse.run('ad-course-2', 'Ders 2', 'ders 2');
  const insertCc = db.prepare(
    `INSERT INTO class_courses
       (id, class_id, course_id, teacher_id, day_of_week, lesson_time, deleted_at)
     VALUES (?, ?, ?, ?, ?, ?, NULL)`,
  );
  insertCc.run(CC_1, 'ad-class', 'ad-course-1', 'test-teacher', 1, '09:00');
  insertCc.run(CC_2, 'ad-class', 'ad-course-2', 'test-teacher', 2, '10:00');

  // --- Veliler: geçerli / consentsız / telefon numarasız ---
  const now = new Date().toISOString();
  const insertUser = db.prepare(
    `INSERT INTO users
       (id, full_name, full_name_normalized, username, email, password_hash, role,
        is_active, token_version, deleted_at, created_at)
     VALUES (?, ?, ?, NULL, NULL, NULL, 'guardian', 1, 1, NULL, ?)`,
  );
  const insertGuardian = db.prepare(
    `INSERT INTO guardians (id, user_id, whatsapp_phone, phone_secondary, consent_at, deleted_at)
     VALUES (?, ?, ?, NULL, ?, NULL)`,
  );
  insertUser.run('g2-user', 'Consent Yok Veli', 'consent yok veli', now);
  insertGuardian.run('g2-rec', 'g2-user', '+905009990004', null);
  insertUser.run('g3-user', 'Telefon Yok Veli', 'telefon yok veli', now);
  insertGuardian.run('g3-rec', 'g3-user', null, now);

  // --- Öğrenciler (3'ü de aynı sınıfta) ---
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
  insertStudent.run('ad-stu-1', 'Gönderim Öğrenci 1', 'gonderim ogrenci 1', 'ad-stu-1', now);
  insertStudentRec.run('ad-stu-rec-1', 'ad-stu-1', 'test-guardian-rec');
  insertEnrollment.run('ad-enr-1', 'ad-stu-rec-1', 'ad-class', '2026-07-20');

  insertStudent.run('ad-stu-2', 'Gönderim Öğrenci 2', 'gonderim ogrenci 2', 'ad-stu-2', now);
  insertStudentRec.run('ad-stu-rec-2', 'ad-stu-2', 'g2-rec');
  insertEnrollment.run('ad-enr-2', 'ad-stu-rec-2', 'ad-class', '2026-07-20');

  insertStudent.run('ad-stu-3', 'Gönderim Öğrenci 3', 'gonderim ogrenci 3', 'ad-stu-3', now);
  insertStudentRec.run('ad-stu-rec-3', 'ad-stu-3', 'g3-rec');
  insertEnrollment.run('ad-enr-3', 'ad-stu-rec-3', 'ad-class', '2026-07-20');

  adminToken = await login('admin@test.local');
  teacherToken = await login('teacher@test.local');

  // Sınıfın tüm dersleri tamamlanır → 3 digest ready.
  await completeReport(CC_1, WEEK2.id);
  await completeReport(CC_2, WEEK2.id);
});

afterAll(() => {
  vi.useRealTimers();
});

describe('GET /api/v1/admin/digests', () => {
  it('öğretmen 403 döner (adminOnly)', async () => {
    const res = await request(app)
      .get('/api/v1/admin/digests')
      .set('Authorization', `Bearer ${teacherToken}`);
    expect(res.status).toBe(403);
  });

  it('pending/ready/sent satırları + eksik ders sayısı + sınıf adı döner', async () => {
    const res = await request(app)
      .get(`/api/v1/admin/digests?week_id=${WEEK2.id}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);

    const items = res.body.items as Array<{
      student_id: string;
      status: string;
      class: { id: string | null; name: string | null };
      missing_course_count: number;
      total_courses: number;
      is_revoked: boolean;
    }>;
    expect(items).toHaveLength(3);
    expect(items.every((i) => i.status === 'ready')).toBe(true);
    expect(items.every((i) => i.class.name === 'Gönderim Sınıfı')).toBe(true);
    expect(items.every((i) => i.missing_course_count === 0 && i.total_courses === 2)).toBe(true);
    expect(items.every((i) => i.is_revoked === false)).toBe(true);
    // token dışarı sızmaz
    expect(res.body.items[0]).not.toHaveProperty('token');
  });
});

describe('GET /api/v1/admin/digests/:id/preview', () => {
  it('önizleme snapshot içerir; yalnızca o öğrencinin satırı vardır', async () => {
    const res = await request(app)
      .get(`/api/v1/admin/digests/${digestIdFor('ad-stu-rec-1')}/preview`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    const { preview } = res.body;
    expect(preview.student.name).toBe('Gönderim Öğrenci 1');
    expect(preview.class.name).toBe('Gönderim Sınıfı');
    expect(preview.courses).toHaveLength(2);
    expect(preview.courses.every((c: { entry: { student_id: string } | null }) =>
      c.entry === null || c.entry.student_id === 'ad-stu-rec-1',
    )).toBe(true);
  });
});

describe('POST /api/v1/admin/digests/:id/send', () => {
  it('gönderim: yeni token + snapshot + send_count + wa.me + audit digest.send', async () => {
    const id = digestIdFor('ad-stu-rec-1');
    const res = await request(app)
      .post(`/api/v1/admin/digests/${id}/send`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('sent');
    expect(res.body.send_count).toBe(1);
    expect(res.body.wa_me_url).toContain('wa.me/905009990003');
    expect(res.body.snapshot.courses).toHaveLength(2);
    expect(res.body.token).toMatch(/^[A-Za-z0-9_-]{43}$/); // randomBytes(32).base64url

    const audit = db
      .prepare(
        `SELECT action, diff FROM audit_logs
         WHERE entity_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 1`,
      )
      .get(id) as { action: string; diff: string };
    expect(audit.action).toBe('digest.send');
    expect(JSON.parse(audit.diff)).toHaveProperty('week');
  });

  it('consent_at yok → 409 farklı mesajla', async () => {
    const res = await request(app)
      .post(`/api/v1/admin/digests/${digestIdFor('ad-stu-rec-2')}/send`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CONFLICT');
    expect(res.body.error.message).toBe('Velinin KVKK açık rızası alınmamış.');
  });

  it('whatsapp_phone yok → 409 farklı mesajla', async () => {
    const res = await request(app)
      .post(`/api/v1/admin/digests/${digestIdFor('ad-stu-rec-3')}/send`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CONFLICT');
    expect(res.body.error.message).toBe('Veli için WhatsApp numarası tanımlı değil.');
  });

  it('tüm digest\'ler gönderilmeden kaskad tetiklenmez (raporlar completed kalır)', async () => {
    const statuses = db
      .prepare(`SELECT status FROM reports WHERE week_id = ?`)
      .all(WEEK2.id) as Array<{ status: string }>;
    expect(statuses.every((r) => r.status === 'completed')).toBe(true);
  });

  it('kalan digest\'ler gönderilince reports.status=sent kaskadı çalışır (aynı transaction)', async () => {
    // Admin 409'ları giderir (kayıt düzeltilir) → kalan iki veli de gönderilir.
    db.prepare(`UPDATE guardians SET consent_at = ? WHERE id = 'g2-rec'`).run(
      new Date().toISOString(),
    );
    db.prepare(`UPDATE guardians SET whatsapp_phone = ? WHERE id = 'g3-rec'`).run(
      '+905009990005',
    );

    const r2 = await request(app)
      .post(`/api/v1/admin/digests/${digestIdFor('ad-stu-rec-2')}/send`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(r2.status).toBe(200);
    const r3 = await request(app)
      .post(`/api/v1/admin/digests/${digestIdFor('ad-stu-rec-3')}/send`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(r3.status).toBe(200);

    // Kaskad: sınıf+haftanın tüm digest'leri sent → completed raporlar sent.
    const statuses = db
      .prepare(`SELECT status FROM reports WHERE week_id = ?`)
      .all(WEEK2.id) as Array<{ status: string }>;
    expect(statuses.every((r) => r.status === 'sent')).toBe(true);
  });

  it('re-send: yeni token + send_count +1 + audit digest.resend; yeni token /r çalışır', async () => {
    const id = digestIdFor('ad-stu-rec-1');
    const oldToken = digestToken('ad-stu-rec-1');
    const res = await request(app)
      .post(`/api/v1/admin/digests/${id}/send`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.send_count).toBe(2);
    expect(res.body.token).not.toBe(oldToken);

    const audit = db
      .prepare(
        `SELECT action FROM audit_logs
         WHERE entity_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 1`,
      )
      .get(id) as { action: string };
    expect(audit.action).toBe('digest.resend');

    // Yeni token /r sayfasında çalışır (canlı 410/200 döngüsü).
    const page = await request(app).get(`/api/v1/public/digests/${res.body.token}`);
    expect(page.status).toBe(200);
  });
});

describe('POST /api/v1/admin/digests/:id/revoke', () => {
  it('iptal sonrası eski token kalıcı ölü (/r → 410); yeniden gönderim yeni token açar', async () => {
    const id = digestIdFor('ad-stu-rec-1');
    const tokenBeforeRevoke = digestToken('ad-stu-rec-1');

    const revoke = await request(app)
      .post(`/api/v1/admin/digests/${id}/revoke`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(revoke.status).toBe(200);
    expect(revoke.body.is_revoked).toBe(true);

    const audit = db
      .prepare(
        `SELECT action FROM audit_logs
         WHERE entity_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 1`,
      )
      .get(id) as { action: string };
    expect(audit.action).toBe('digest.revoke');

    // İptal edilen token ölü.
    const dead = await request(app).get(`/api/v1/public/digests/${tokenBeforeRevoke}`);
    expect(dead.status).toBe(410);

    // Yeniden gönderim → yeni token, is_revoked 0, /r 200.
    const resend = await request(app)
      .post(`/api/v1/admin/digests/${id}/send`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(resend.status).toBe(200);
    expect(resend.body.send_count).toBe(3);
    expect(resend.body.token).not.toBe(tokenBeforeRevoke);

    const row = db
      .prepare(`SELECT is_revoked FROM weekly_digests WHERE id = ?`)
      .get(id) as { is_revoked: number };
    expect(row.is_revoked).toBe(0);

    const live = await request(app).get(`/api/v1/public/digests/${resend.body.token}`);
    expect(live.status).toBe(200);
  });

  it('gönderilmemiş digest iptal edilemez (409)', async () => {
    const id = digestIdFor('ad-stu-rec-2');
    db.prepare(`UPDATE weekly_digests SET status = 'pending' WHERE id = ?`).run(id);
    const res = await request(app)
      .post(`/api/v1/admin/digests/${id}/revoke`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(409);
    expect(res.body.error.message).toBe('Yalnızca gönderilmiş raporlar iptal edilebilir.');
  });
});

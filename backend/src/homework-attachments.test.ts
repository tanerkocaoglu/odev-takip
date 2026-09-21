/**
 * Öğretmen ödev ekleri (PDF) entegrasyon testleri — migration #13.
 *
 * Kapsam:
 * - Ekleme/kaldırma + magic-byte PDF zorunluluğu + ödev başına 5 sınırı.
 * - **Rol matrisi** (`GET /api/v1/files/:key`): admin/öğretmen(sahibi)/
 *   öğrenci(aynı sınıf)/veli(çocuğu aynı sınıfta) izinli; diğer öğretmen,
 *   başka sınıfın öğrencisi/velisi 403; taslak raporda öğrenci/veli 403,
 *   rapor completed/sent olunca 200.
 * - **Public yapısal koruma:** gönderilen `weekly_digests.snapshot` hiçbir ek
 *   alanı/anahtarı taşımaz; admin önizlemesi taşır.
 * - Öğretmen rapor payload'ı bu haftanın eklerini, sonraki haftada ise
 *   "Verilmiş ödev" eklerini döner.
 *
 * Tarih deterministik: `Date` 2026-08-11 (Salı). Hafta 1 = 03–09 Ağu (başlamış),
 * hafta 2 = 10–16 Ağu (başlamış; "sonraki hafta" senaryosu için).
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import request from 'supertest';
import fs from 'node:fs';
import { createApp } from './app.js';
import { db } from './db/index.js';
import { resetDb, insertTestUsers, TEST_PASSWORD } from './test/helpers.js';
import { signToken } from './utils/token.js';
import { hashPasswordSync } from './utils/hash.js';
import { localPathFor } from './services/storage.js';
import type { Role } from './types.js';

const app = createApp();

const FAKE_NOW = new Date('2026-08-18T10:00:00');
const W1 = { id: 'att-week-1', start: '2026-08-03', end: '2026-08-09' };
const W2 = { id: 'att-week-2', start: '2026-08-10', end: '2026-08-16' };
// Yalnızca "sonraki dönem/hafta tanımlandı" senaryosunda eklenir (bkz. ilgili test).
const W3 = { id: 'att-week-3', start: '2026-08-17', end: '2026-08-23' };

const CC_OWN = 'att-cc-1';
const CC_OTHER_CLASS = 'att-cc-2';

const PDF_BUFFER = Buffer.from('%PDF-1.4 ogretmen odevi eki');
const PNG_BUFFER = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

let adminToken: string;
let teacherToken: string;
let teacher2Token: string;
let studentToken: string;
let student2Token: string;
let guardianToken: string;
let guardian2Token: string;

let reportId: string;
let digestId: string;
let publicToken: string;

function signTokenFor(
  userId: string,
  role: Role,
  student_id: string | null,
  guardian_id: string | null,
): string {
  return signToken(
    { id: userId, role, teacher_id: role === 'teacher' ? userId : null, student_id, guardian_id },
    1,
  );
}

async function login(identifier: string): Promise<string> {
  const res = await request(app)
    .post('/api/v1/auth/login')
    .send({ identifier, password: TEST_PASSWORD });
  return res.body.token as string;
}

function uploadPdfs(
  token: string,
  count = 1,
  buffer: Buffer = PDF_BUFFER,
  name = 'ek.pdf',
) {
  const req = request(app)
    .post(`/api/v1/teacher/reports/${reportId}/attachments`)
    .set('Authorization', `Bearer ${token}`);
  for (let i = 0; i < count; i += 1) req.attach('files', buffer, name);
  return req;
}

function attachmentKeys(): string[] {
  return (
    db
      .prepare(`SELECT key FROM homework_attachments WHERE report_id = ? ORDER BY rowid`)
      .all(reportId) as Array<{ key: string }>
  ).map((r) => r.key);
}

beforeAll(async () => {
  vi.useFakeTimers({ toFake: ['Date'], now: FAKE_NOW });
  resetDb();
  insertTestUsers();

  db.prepare(
    `INSERT INTO academic_years (id, name, start_date, end_date, is_active)
     VALUES ('att-year', '2026-2027', '2026-07-20', '2026-08-16', 1)`,
  ).run();
  const insertWeek = db.prepare(
    `INSERT INTO weeks (id, academic_year_id, week_no, start_date, end_date, label)
     VALUES (?, 'att-year', ?, ?, ?, ?)`,
  );
  insertWeek.run(W1.id, 1, W1.start, W1.end, 'Hafta 1');
  insertWeek.run(W2.id, 2, W2.start, W2.end, 'Hafta 2');

  db.prepare(
    `INSERT INTO classes (id, academic_year_id, name, name_normalized, deleted_at)
     VALUES ('att-class', 'att-year', 'Ek Sınıfı', 'ek sinifi', NULL),
            ('att-class-2', 'att-year', 'Diğer Sınıf', 'diger sinif', NULL)`,
  ).run();
  db.prepare(
    `INSERT INTO courses (id, name, name_normalized, deleted_at)
     VALUES ('att-course-1', 'Ders 1', 'ders 1', NULL),
            ('att-course-2', 'Ders 2', 'ders 2', NULL)`,
  ).run();

  const now = new Date().toISOString();
  const hash = hashPasswordSync(TEST_PASSWORD);
  // İkinci öğretmen (başka sınıfın sahibi) — ödev eki erişim matrisi için.
  // class_courses'tan ÖNCE eklenir (FK).
  db.prepare(
    `INSERT INTO users (id, full_name, full_name_normalized, username, email, password_hash,
       role, is_active, token_version, deleted_at, created_at)
     VALUES ('att-teacher-2', 'Ek Ogretmen 2', 'ek ogretmen 2', NULL, 'teacher2@test.local', ?,
       'teacher', 1, 1, NULL, ?)`,
  ).run(hash, now);

  db.prepare(
    `INSERT INTO class_courses (id, class_id, course_id, teacher_id, day_of_week, lesson_time, deleted_at)
     VALUES (?, 'att-class', 'att-course-1', 'test-teacher', 1, '09:00', NULL),
            (?, 'att-class-2', 'att-course-2', 'att-teacher-2', 1, '10:00', NULL)`,
  ).run(CC_OWN, CC_OTHER_CLASS);

  // İkinci öğrenci + veli (başka sınıfta) — 403 matrisi için.
  db.prepare(
    `INSERT INTO users (id, full_name, full_name_normalized, username, email, password_hash,
       role, is_active, token_version, deleted_at, created_at)
     VALUES ('att-g2-user', 'Ek Veli 2', 'ek veli 2', 'att-veli-2', NULL, 'x', 'guardian', 1, 1, NULL, ?),
            ('att-s2-user', 'Ek Ogrenci 2', 'ek ogrenci 2', 'att-ogrenci-2', NULL, 'x', 'student', 1, 1, NULL, ?)`,
  ).run(now, now);
  db.prepare(
    `INSERT INTO guardians (id, user_id, whatsapp_phone, phone_secondary, consent_at, deleted_at)
     VALUES ('att-g-rec-2', 'att-g2-user', '+905009990099', NULL, ?, NULL)`,
  ).run(now);
  db.prepare(
    `INSERT INTO students (id, user_id, guardian_id, deleted_at)
     VALUES ('att-stu-rec-2', 'att-s2-user', 'att-g-rec-2', NULL)`,
  ).run();
  db.prepare(
    `INSERT INTO enrollments (id, student_id, class_id, start_date, end_date)
     VALUES ('att-enr-2', 'att-stu-rec-2', 'att-class-2', '2026-07-20', NULL)`,
  ).run();

  // test-student-rec'i att-class'a kaydet (insertTestUsers guardian'lı öğrenciyi kurar).
  db.prepare(
    `INSERT INTO enrollments (id, student_id, class_id, start_date, end_date)
     VALUES ('att-enr-1', 'test-student-rec', 'att-class', '2026-07-20', NULL)`,
  ).run();

  adminToken = await login('admin@test.local');
  teacherToken = await login('teacher@test.local');
  teacher2Token = await login('teacher2@test.local');
  studentToken = signTokenFor('test-student', 'student', 'test-student-rec', null);
  student2Token = signTokenFor('att-s2-user', 'student', 'att-stu-rec-2', null);
  guardianToken = signTokenFor('test-guardian', 'guardian', null, 'test-guardian-rec');
  guardian2Token = signTokenFor('att-g2-user', 'guardian', null, 'att-g-rec-2');

  // Rapor (draft) + satırlar; tamamlanma ayrı testte.
  const created = await request(app)
    .post('/api/v1/teacher/reports')
    .set('Authorization', `Bearer ${teacherToken}`)
    .send({ class_course_id: CC_OWN, week_id: W1.id });
  expect([200, 201]).toContain(created.status);
  reportId = created.body.report.id as string;
  const entries = created.body.entries as Array<{ student_id: string }>;
  await request(app)
    .put(`/api/v1/teacher/reports/${reportId}`)
    .set('Authorization', `Bearer ${teacherToken}`)
    .send({
      topic_covered: 'Konu',
      homework_description: 'Ödev',
      entries: entries.map((e) => ({
        student_id: e.student_id,
        attendance: 'present',
        homework_score: 7,
        interest_score: 8,
        teacher_note: null,
      })),
    });
});

afterAll(() => {
  vi.useRealTimers();
});

describe('ekleme, doğrulama ve sınırlar', () => {
  it('öğretmen 2 PDF ekler (201); DB satırları + disk dosyaları oluşur', async () => {
    const res = await uploadPdfs(teacherToken, 2);
    expect(res.status).toBe(201);
    expect(res.body.attachments).toHaveLength(2);
    for (const a of res.body.attachments) {
      expect(a.mime).toBe('application/pdf');
      expect(a.ext).toBe('pdf');
      expect(fs.existsSync(localPathFor(a.key))).toBe(true);
    }
    expect(attachmentKeys()).toHaveLength(2);
  });

  it('magic-byte: .pdf adıyla gönderilen PNG → 400, kayıt oluşmaz', async () => {
    const before = attachmentKeys().length;
    const res = await uploadPdfs(teacherToken, 1, PNG_BUFFER, 'sahte.pdf');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(attachmentKeys()).toHaveLength(before);
  });

  it('PDF olmayan uzantı → multer 400', async () => {
    const res = await uploadPdfs(teacherToken, 1, PNG_BUFFER, 'resim.png');
    expect(res.status).toBe(400);
    expect(res.body.error.message).toBe('Yalnızca PDF dosyası ekleyebilirsiniz.');
  });

  it('ödev başına 5 sınırı: 3 ek daha olur, 6. → 400', async () => {
    expect((await uploadPdfs(teacherToken, 3)).status).toBe(201);
    expect(attachmentKeys()).toHaveLength(5);

    const over = await uploadPdfs(teacherToken, 1);
    expect(over.status).toBe(400);
    expect(over.body.error.message).toBe('Bir ödeve en fazla 5 PDF ekleyebilirsiniz.');
    expect(attachmentKeys()).toHaveLength(5);
  });

  it('öğrenci/veli ek yükleyemez (403); başka öğretmen 403', async () => {
    expect((await uploadPdfs(studentToken, 1)).status).toBe(403);
    expect((await uploadPdfs(guardianToken, 1)).status).toBe(403);
    expect((await uploadPdfs(teacher2Token, 1)).status).toBe(403);
  });
});

describe('rol matrisi — GET /api/v1/files/:key (ödev eki)', () => {
  it('taslak raporda: admin + sahibi öğretmen 200; öğrenci/veli 403', async () => {
    const key = attachmentKeys()[0];
    expect((await request(app).get(`/api/v1/files/${key}`).set('Authorization', `Bearer ${adminToken}`)).status).toBe(200);
    expect((await request(app).get(`/api/v1/files/${key}`).set('Authorization', `Bearer ${teacherToken}`)).status).toBe(200);
    expect((await request(app).get(`/api/v1/files/${key}`).set('Authorization', `Bearer ${studentToken}`)).status).toBe(403);
    expect((await request(app).get(`/api/v1/files/${key}`).set('Authorization', `Bearer ${guardianToken}`)).status).toBe(403);
  });

  it('başka öğretmen 403', async () => {
    const key = attachmentKeys()[0];
    expect((await request(app).get(`/api/v1/files/${key}`).set('Authorization', `Bearer ${teacher2Token}`)).status).toBe(403);
  });

  it('rapor completed olunca: aynı sınıfın öğrencisi/velisi 200', async () => {
    const done = await request(app)
      .post(`/api/v1/teacher/reports/${reportId}/complete`)
      .set('Authorization', `Bearer ${teacherToken}`);
    expect(done.status).toBe(200);

    const key = attachmentKeys()[0];
    expect((await request(app).get(`/api/v1/files/${key}`).set('Authorization', `Bearer ${studentToken}`)).status).toBe(200);
    expect((await request(app).get(`/api/v1/files/${key}`).set('Authorization', `Bearer ${guardianToken}`)).status).toBe(200);
  });

  it('başka sınıfın öğrencisi/velisi 403', async () => {
    const key = attachmentKeys()[0];
    expect((await request(app).get(`/api/v1/files/${key}`).set('Authorization', `Bearer ${student2Token}`)).status).toBe(403);
    expect((await request(app).get(`/api/v1/files/${key}`).set('Authorization', `Bearer ${guardian2Token}`)).status).toBe(403);
  });

  it('kimliksiz erişim 401', async () => {
    const key = attachmentKeys()[0];
    expect((await request(app).get(`/api/v1/files/${key}`)).status).toBe(401);
  });
});

describe('öğretmen payload + sonraki hafta "verilmiş ödev"', () => {
  it('bu haftanın ekleri report.homework_attachments içinde döner', async () => {
    const res = await request(app)
      .get(`/api/v1/teacher/reports/${reportId}`)
      .set('Authorization', `Bearer ${teacherToken}`);
    expect(res.status).toBe(200);
    expect(res.body.report.homework_attachments).toHaveLength(5);
    expect(res.body.report.homework_attachments[0]).toHaveProperty('key');
  });

  it('sonraki haftanın raporunda prev_homework_attachments dolar', async () => {
    const created = await request(app)
      .post('/api/v1/teacher/reports')
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({ class_course_id: CC_OWN, week_id: W2.id });
    expect([200, 201]).toContain(created.status);
    const nextId = created.body.report.id as string;
    expect(created.body.report.prev_homework_id).toBeTruthy();
    expect(created.body.report.prev_homework_attachments).toHaveLength(5);

    const got = await request(app)
      .get(`/api/v1/teacher/reports/${nextId}`)
      .set('Authorization', `Bearer ${teacherToken}`);
    expect(got.body.report.prev_homework_attachments).toHaveLength(5);
  });

  it('yılın son haftasında (homeworks satırı YOK) ek eklenir ve KAYBOLMAZ', async () => {
    // W2 yılın son haftasıdır → due_date hesaplanamaz → homeworks satırı yok.
    const created = await request(app)
      .post('/api/v1/teacher/reports')
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({ class_course_id: CC_OWN, week_id: W2.id });
    const lastId = created.body.report.id as string;
    expect(created.body.report.homework).toBeNull();

    const add = await request(app)
      .post(`/api/v1/teacher/reports/${lastId}/attachments`)
      .set('Authorization', `Bearer ${teacherToken}`)
      .attach('files', PDF_BUFFER, 'son-hafta.pdf');
    expect(add.status).toBe(201);
    expect(add.body.attachments).toHaveLength(1);
    const key = add.body.attachments[0].key as string;

    // (a) DB'de RAPORA bağlı kalıcı satır var (homeworks satırı olmasa da).
    const row = db
      .prepare(`SELECT report_id, filename FROM homework_attachments WHERE key = ?`)
      .get(key) as { report_id: string; filename: string };
    expect(row.report_id).toBe(lastId);
    expect(row.filename).toBe('son-hafta.pdf');

    // (b) Nesne diskte gerçekten var.
    expect(fs.existsSync(localPathFor(key))).toBe(true);

    // (c) Öğretmen (sahibi) ve admin korumalı rotadan erişebilir.
    expect(
      (
        await request(app)
          .get(`/api/v1/files/${key}`)
          .set('Authorization', `Bearer ${teacherToken}`)
      ).status,
    ).toBe(200);
    expect(
      (await request(app).get(`/api/v1/files/${key}`).set('Authorization', `Bearer ${adminToken}`))
        .status,
    ).toBe(200);

    // (d) Öğretmen rapor payload'ında `homework` null olsa da ek görünür.
    const got = await request(app)
      .get(`/api/v1/teacher/reports/${lastId}`)
      .set('Authorization', `Bearer ${teacherToken}`);
    expect(got.body.report.homework).toBeNull();
    expect(got.body.report.homework_attachments.map((a: { key: string }) => a.key)).toContain(key);
  });

  it('sonraki dönemde hafta tanımlanıp teslim tarihi girilince ek "Verilmiş ödev"e taşınır', async () => {
    // W2 raporu (önceki test) + ona bağlı ek hazır; W2 hâlâ son hafta.
    const lastReport = db
      .prepare(`SELECT id FROM reports WHERE class_course_id = ? AND week_id = ?`)
      .get(CC_OWN, W2.id) as { id: string };
    const key = (
      db
        .prepare(`SELECT key FROM homework_attachments WHERE report_id = ?`)
        .get(lastReport.id) as { key: string }
    ).key;

    // Yeni dönem/hafta tanımlanır (W3): artık W2 "son hafta" değil.
    db.prepare(
      `INSERT INTO weeks (id, academic_year_id, week_no, start_date, end_date, label)
       VALUES (?, 'att-year', 3, ?, ?, 'Hafta 3')`,
    ).run(W3.id, W3.start, W3.end);

    // Önce W2'nin teslim tarihi girilir → `homeworks` satırı oluşur (ek zaten rapora bağlı).
    const put = await request(app)
      .put(`/api/v1/teacher/reports/${lastReport.id}`)
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({ due_date: '2026-08-24' });
    expect(put.status).toBe(200);
    expect(put.body.report.homework).not.toBeNull();
    // Ek hâlâ aynı raporda, kaybolmadı.
    expect(put.body.report.homework_attachments.map((a: { key: string }) => a.key)).toContain(key);

    // Sonra yeni haftanın raporu oluşturulur → prev_homework_id W2 ödevine bağlanır
    // ve ek "Verilmiş ödev" olarak taşınır.
    const next = await request(app)
      .post('/api/v1/teacher/reports')
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({ class_course_id: CC_OWN, week_id: W3.id });
    expect([200, 201]).toContain(next.status);
    expect(next.body.report.prev_homework_id).toBeTruthy();
    expect(
      next.body.report.prev_homework_attachments.map((a: { key: string }) => a.key),
    ).toContain(key);
  });
});

describe('public snapshot yapısal koruma + admin önizleme', () => {
  it('gönderim sonrası snapshot hiçbir ek alanı/anahtarı taşımaz', async () => {
    const digest = db
      .prepare(`SELECT id FROM weekly_digests WHERE student_id = 'test-student-rec'`)
      .get() as { id: string };
    digestId = digest.id;

    const send = await request(app)
      .post(`/api/v1/admin/digests/${digestId}/send`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(send.status).toBe(200);
    publicToken = send.body.token as string;

    const keys = attachmentKeys();
    const publicRes = await request(app).get(`/api/v1/public/digests/${publicToken}`);
    expect(publicRes.status).toBe(200);

    // Snapshot JSON'unda hiçbir ek anahtarı/alanı YOK (boş değil — alan yok).
    const raw = JSON.stringify(publicRes.body.snapshot);
    for (const key of keys) expect(raw).not.toContain(key);
    expect(raw).not.toContain('homework_attachments');
    expect(raw).not.toContain('prev_homework_attachments');
    expect(raw).not.toContain('attachments');
    for (const course of publicRes.body.snapshot.courses) {
      expect('homework_attachments' in course).toBe(false);
      expect('prev_homework_attachments' in course).toBe(false);
    }

    // Saklanan snapshot da aynı şekilde temiz.
    const stored = db
      .prepare(`SELECT snapshot FROM weekly_digests WHERE id = ?`)
      .get(digestId) as { snapshot: string };
    expect(stored.snapshot).not.toContain(keys[0]);
    expect(stored.snapshot).not.toContain('attachments');
  });

  it('admin önizlemesi ekleri taşır (canlı, saklanan snapshot değil)', async () => {
    const res = await request(app)
      .get(`/api/v1/admin/digests/${digestId}/preview`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    const course = res.body.preview.courses[0];
    expect(course.homework_attachments).toHaveLength(5);
    expect(course.homework_attachments[0]).toHaveProperty('key');
  });
});

describe('gönderilmiş rapor (sent) — ek düzenleme durum kapısı', () => {
  it('öğretmen sent raporda ek ekleyemez/silemez (403)', async () => {
    expect((await uploadPdfs(teacherToken, 1)).status).toBe(403);
    const key = attachmentKeys()[0];
    const attId = (
      db.prepare(`SELECT id FROM homework_attachments WHERE key = ?`).get(key) as { id: string }
    ).id;
    const del = await request(app)
      .delete(`/api/v1/teacher/reports/${reportId}/attachments/${attId}`)
      .set('Authorization', `Bearer ${teacherToken}`);
    expect(del.status).toBe(403);
  });

  it('admin sent raporda ek siler (200) ve dosya diskten kalkar; yeni ek ekler', async () => {
    const key = attachmentKeys()[0];
    const attId = (
      db.prepare(`SELECT id FROM homework_attachments WHERE key = ?`).get(key) as { id: string }
    ).id;

    const del = await request(app)
      .delete(`/api/v1/teacher/reports/${reportId}/attachments/${attId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(del.status).toBe(200);
    expect(del.body.attachments).toHaveLength(4);
    expect(fs.existsSync(localPathFor(key))).toBe(false);

    const add = await uploadPdfs(adminToken, 1);
    expect(add.status).toBe(201);
    expect(add.body.attachments).toHaveLength(5);
  });
});

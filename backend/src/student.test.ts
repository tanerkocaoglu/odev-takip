/**
 * Öğrenci ödev + teslim entegrasyon testleri (supertest) — Aşama 4.
 *
 * Akış: öğrenci "Ödevlerim" listesini görür (yalnızca completed/sent; puan
 * ve öğretmen notu asla dönmez) → dosya yükler (görsel küçültülür) →
 * teslim eder → yetkisiz dosya erişimi 403 → öğretmen teslimi görür ve
 * "reviewed" işaretler.
 *
 * Tarih deterministik: `Date` 2026-08-04 fake'lenir. `is_late` kuralı:
 * submitted_at (Europe/Istanbul) günü > due_date → geç.
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

const FAKE_NOW = new Date('2026-08-04T10:00:00');
// Hafta 0 (geçmiş, geç teslim senaryosu), hafta 1 (tamamlanmış), hafta 2 (draft).
const W0 = { id: 's-week-0', start: '2026-07-20', end: '2026-07-26' };
const W1 = { id: 's-week-1', start: '2026-07-27', end: '2026-08-02' };
const W2 = { id: 's-week-2', start: '2026-08-03', end: '2026-08-09' };

const CC_OWN = 's-cc-1';      // test-teacher'ın, öğrencinin sınıfı
const CC_OTHER = 's-cc-2';    // başka öğretmenin / öğrencinin sınıfında değil

const PNG_BUFFER = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);
const PDF_BUFFER = Buffer.from('%PDF-1.4 ogrenci odevi');

let studentToken: string;
let secondStudentToken: string;
let teacherToken: string;
let adminToken: string;
let guardianToken: string;
let teacher2Token: string;

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

async function login(email: string): Promise<string> {
  const res = await request(app)
    .post('/api/v1/auth/login')
    .send({ email, password: TEST_PASSWORD });
  return res.body.token as string;
}

const createdKeys: string[] = [];
function trackKey(key: string): void {
  createdKeys.push(key);
}

function insertCompletedReport(
  reportId: string,
  homeworkId: string,
  ccId: string,
  weekId: string,
  description: string,
  dueDate: string,
  createdBy = 'test-teacher',
): void {
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO reports
       (id, class_course_id, week_id, topic_covered, prev_homework_id,
        prev_homework_text, status, completed_at, created_by, updated_at)
     VALUES (?, ?, ?, NULL, NULL, NULL, 'completed', ?, ?, ?)`,
  ).run(reportId, ccId, weekId, now, createdBy, now);
  db.prepare(
    `INSERT INTO homeworks (id, report_id, class_course_id, week_id, description, attachments, due_date)
     VALUES (?, ?, ?, ?, ?, NULL, ?)`,
  ).run(homeworkId, reportId, ccId, weekId, description, dueDate);
}

beforeAll(async () => {
  vi.useFakeTimers({ toFake: ['Date'], now: FAKE_NOW });
  resetDb();
  insertTestUsers();

  // --- Yıl + haftalar ---
  db.prepare(
    `INSERT INTO academic_years (id, name, start_date, end_date, is_active)
     VALUES (?, ?, ?, ?, 1)`,
  ).run('s-year', '2026-2027', '2026-07-20', '2026-08-09');
  const insertWeek = db.prepare(
    `INSERT INTO weeks (id, academic_year_id, week_no, start_date, end_date, label)
     VALUES (?, ?, ?, ?, ?, ?)`,
  );
  insertWeek.run(W0.id, 's-year', 0, W0.start, W0.end, 'Hafta 0');
  insertWeek.run(W1.id, 's-year', 1, W1.start, W1.end, 'Hafta 1');
  insertWeek.run(W2.id, 's-year', 2, W2.start, W2.end, 'Hafta 2');

  // --- İkinci öğretmen + ikinci öğrenci (yetki testleri) ---
  db.prepare(
    `INSERT INTO users
       (id, full_name, full_name_normalized, phone, email, password_hash, role,
        is_active, token_version, deleted_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, 'teacher', 1, 1, NULL, ?)`,
  ).run(
    's-teacher-2',
    'Second Teacher',
    'second teacher',
    '+905009991001',
    'teacher2b@test.local',
    hashPasswordSync(TEST_PASSWORD),
    new Date().toISOString(),
  );
  db.prepare(
    `INSERT INTO users
       (id, full_name, full_name_normalized, phone, email, password_hash, role,
        is_active, token_version, deleted_at, created_at)
     VALUES (?, ?, ?, ?, NULL, NULL, 'student', 1, 1, NULL, ?)`,
  ).run(
    's-student-2',
    'İkinci Öğrenci',
    'ikinci ogrenci',
    '+905009992011',
    new Date().toISOString(),
  );
  db.prepare(
    `INSERT INTO students (id, user_id, guardian_id, deleted_at)
     VALUES (?, ?, NULL, NULL)`,
  ).run('s-student-rec-2', 's-student-2');

  // --- Sınıflar + dersler + atamalar ---
  db.prepare(
    `INSERT INTO classes (id, academic_year_id, name, name_normalized, deleted_at)
     VALUES (?, ?, ?, ?, NULL)`,
  ).run('s-class', 's-year', 'Sınıf A', 'sinif a');
  db.prepare(
    `INSERT INTO classes (id, academic_year_id, name, name_normalized, deleted_at)
     VALUES (?, ?, ?, ?, NULL)`,
  ).run('s-class-2', 's-year', 'Sınıf B', 'sinif b');
  const insertCourse = db.prepare(
    `INSERT INTO courses (id, name, name_normalized, deleted_at) VALUES (?, ?, ?, NULL)`,
  );
  insertCourse.run('s-course-1', 'Matematik', 'matematik');
  insertCourse.run('s-course-2', 'Fizik', 'fizik');
  const insertCc = db.prepare(
    `INSERT INTO class_courses
       (id, class_id, course_id, teacher_id, day_of_week, lesson_time, deleted_at)
     VALUES (?, ?, ?, ?, ?, ?, NULL)`,
  );
  insertCc.run(CC_OWN, 's-class', 's-course-1', 'test-teacher', 1, '09:00');
  insertCc.run(CC_OTHER, 's-class-2', 's-course-2', 's-teacher-2', 2, '10:00');

  // --- Enrollment'lar: test-student ve s-student-2 Sınıf A'da ---
  const insertEnrollment = db.prepare(
    `INSERT INTO enrollments (id, student_id, class_id, start_date, end_date)
     VALUES (?, ?, ?, ?, ?)`,
  );
  insertEnrollment.run('s-enr-1', 'test-student-rec', 's-class', '2026-07-20', null);
  insertEnrollment.run('s-enr-2', 's-student-rec-2', 's-class', '2026-07-20', null);
  // s-student-2 ayrıca Sınıf B'de — başka öğretmenin ödevine yükleme yapabilir.
  insertEnrollment.run('s-enr-3', 's-student-rec-2', 's-class-2', '2026-07-20', null);

  // --- Hafta 0: geç teslim senaryosu (due geçmişte) ---
  insertCompletedReport('s-report-w0', 's-hw-w0', CC_OWN, W0.id, 'İlk ödev', '2026-07-26');
  // --- Hafta 1: tamamlanmış ödev (normal teslim; due gelecekte) ---
  insertCompletedReport('s-report-w1', 's-hw-w1', CC_OWN, W1.id, 'Hafta 1 ödevi', '2026-08-10');
  // --- Hafta 2: draft rapor — öğrenciye GÖRÜNMEMELİ ---
  db.prepare(
    `INSERT INTO reports
       (id, class_course_id, week_id, topic_covered, prev_homework_id,
        prev_homework_text, status, completed_at, created_by, updated_at)
     VALUES (?, ?, ?, NULL, NULL, NULL, 'draft', NULL, 'test-teacher', ?)`,
  ).run('s-report-w2', CC_OWN, W2.id, new Date().toISOString());
  db.prepare(
    `INSERT INTO homeworks (id, report_id, class_course_id, week_id, description, attachments, due_date)
     VALUES (?, ?, ?, ?, 'Taslak ödev', NULL, ?)`,
  ).run('s-hw-w2', 's-report-w2', CC_OWN, W2.id, '2026-08-10');
  // --- Başka sınıfın ödevi (öğrenci o sınıfta değil) — GÖRÜNMEMELİ ---
  insertCompletedReport('s-report-other', 's-hw-other', CC_OTHER, W1.id, 'Başka sınıf ödevi', '2026-08-03');

  studentToken = signTokenFor('test-student', 'student', 'test-student-rec', null);
  secondStudentToken = signTokenFor('s-student-2', 'student', 's-student-rec-2', null);
  guardianToken = signTokenFor('test-guardian', 'guardian', null, 'test-guardian-rec');
  teacherToken = await login('teacher@test.local');
  adminToken = await login('admin@test.local');
  teacher2Token = await login('teacher2b@test.local');
});

afterAll(() => {
  vi.useRealTimers();
  for (const key of createdKeys) {
    try {
      fs.unlinkSync(localPathFor(key));
    } catch {
      // zaten silinmiş olabilir
    }
  }
});

function auth(token: string): { Authorization: string } {
  return { Authorization: `Bearer ${token}` };
}

describe('GET /api/v1/student/homeworks', () => {
  it('yalnızca completed/sent ödevleri gösterir; draft ve başka sınıf gizlenir', async () => {
    const res = await request(app)
      .get('/api/v1/student/homeworks')
      .set(auth(studentToken));
    expect(res.status).toBe(200);
    const ids = res.body.items.map((i: { id: string }) => i.id);
    expect(ids).toContain('s-hw-w0');
    expect(ids).toContain('s-hw-w1');
    expect(ids).not.toContain('s-hw-w2');
    expect(ids).not.toContain('s-hw-other');

    // Puan/not hiçbir şekilde sızmaz.
    const json = JSON.stringify(res.body);
    expect(json).not.toContain('homework_score');
    expect(json).not.toContain('interest_score');
    expect(json).not.toContain('teacher_note');
    expect(json).not.toContain('topic_covered');
  });

  it('öğrenci olmayan rol 403 alır', async () => {
    const res = await request(app)
      .get('/api/v1/student/homeworks')
      .set(auth(teacherToken));
    expect(res.status).toBe(403);
  });
});

describe('POST /api/v1/student/homeworks/:id/submit', () => {
  it('görsel yükler, küçültülerek saklanır, submission oluşur', async () => {
    const res = await request(app)
      .post('/api/v1/student/homeworks/s-hw-w1/submit')
      .set(auth(studentToken))
      .field('note', 'Ödevim hazır')
      .attach('files', PNG_BUFFER, { filename: 'foto.png', contentType: 'image/png' });

    expect(res.status).toBe(200);
    const item = res.body.item;
    expect(item.submission).toBeTruthy();
    expect(item.submission.is_late).toBe(false);
    expect(item.submission.files).toHaveLength(1);
    const f = item.submission.files[0];
    expect(f.ext).toBe('jpg');
    expect(f.mime).toBe('image/jpeg');
    trackKey(f.key);
    expect(fs.existsSync(localPathFor(f.key))).toBe(true);

    // DB'de tek submission + tek submission_files satırı.
    const subRow = db
      .prepare('SELECT COUNT(*) AS n FROM submissions WHERE homework_id = ? AND student_id = ?')
      .get('s-hw-w1', 'test-student-rec') as { n: number };
    expect(subRow.n).toBe(1);
  });

  it('geçmiş due_date için is_late=true işaretlenir (Europe/Istanbul)', async () => {
    const res = await request(app)
      .post('/api/v1/student/homeworks/s-hw-w0/submit')
      .set(auth(studentToken))
      .attach('files', PDF_BUFFER, { filename: 'odev.pdf', contentType: 'application/pdf' });
    expect(res.status).toBe(200);
    const f = res.body.item.submission.files[0];
    trackKey(f.key);
    expect(res.body.item.submission.is_late).toBe(true);
  });

  it('yeniden yüklemede eski dosyalar değiştirilir', async () => {
    const first = await request(app)
      .post('/api/v1/student/homeworks/s-hw-w1/submit')
      .set(auth(studentToken))
      .attach('files', PNG_BUFFER, { filename: 'v2.png', contentType: 'image/png' });
    const newKey = first.body.item.submission.files[0].key;
    trackKey(newKey);

    const row = db
      .prepare(
        'SELECT COUNT(*) AS n FROM submission_files sf JOIN submissions s ON s.id = sf.submission_id WHERE s.homework_id = ? AND s.student_id = ?',
      )
      .get('s-hw-w1', 'test-student-rec') as { n: number };
    expect(row.n).toBe(1);
  });

  it('dosya yüklenmezse 400', async () => {
    const res = await request(app)
      .post('/api/v1/student/homeworks/s-hw-w1/submit')
      .set(auth(studentToken))
      .field('note', 'boş');
    expect(res.status).toBe(400);
    expect(res.body.error.message).toContain('En az bir dosya');
  });

  it('desteklenmeyen dosya tipi 400', async () => {
    const res = await request(app)
      .post('/api/v1/student/homeworks/s-hw-w1/submit')
      .set(auth(studentToken))
      .attach('files', Buffer.from('merhaba'), { filename: 'not.exe', contentType: 'application/x-msdownload' });
    expect(res.status).toBe(400);
  });

  it('10 MB üstü dosya 400 (LIMIT_FILE_SIZE)', async () => {
    const big = Buffer.alloc(11 * 1024 * 1024, 1);
    const res = await request(app)
      .post('/api/v1/student/homeworks/s-hw-w1/submit')
      .set(auth(studentToken))
      .attach('files', big, { filename: 'buyuk.jpg', contentType: 'image/jpeg' });
    expect(res.status).toBe(400);
    expect(res.body.error.message).toContain('10 MB');
  });

  it('öğrenciye ait olmayan ödeve yükleme 404', async () => {
    const res = await request(app)
      .post('/api/v1/student/homeworks/s-hw-other/submit')
      .set(auth(studentToken))
      .attach('files', PNG_BUFFER, { filename: 'x.png', contentType: 'image/png' });
    expect(res.status).toBe(404);
  });
});

describe('GET /api/v1/files/:key — yetki matrisi', () => {
  let key: string;
  beforeAll(async () => {
    const res = await request(app)
      .post('/api/v1/student/homeworks/s-hw-w1/submit')
      .set(auth(studentToken))
      .attach('files', PNG_BUFFER, { filename: 'rozet.png', contentType: 'image/png' });
    key = res.body.item.submission.files[0].key;
    trackKey(key);
  });

  it('sahip öğrenci dosyayı açar', async () => {
    const res = await request(app).get(`/api/v1/files/${key}`).set(auth(studentToken));
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('image/jpeg');
  });

  it('öğretmen (kendi ödevinin teslimi) dosyayı açar', async () => {
    const res = await request(app).get(`/api/v1/files/${key}`).set(auth(teacherToken));
    expect(res.status).toBe(200);
  });

  it('admin dosyayı açar', async () => {
    const res = await request(app).get(`/api/v1/files/${key}`).set(auth(adminToken));
    expect(res.status).toBe(200);
  });

  it('veli (çocuğunun teslimi) dosyayı açar', async () => {
    const res = await request(app).get(`/api/v1/files/${key}`).set(auth(guardianToken));
    expect(res.status).toBe(200);
  });

  it('başka öğrenciye 403 döner', async () => {
    const res = await request(app).get(`/api/v1/files/${key}`).set(auth(secondStudentToken));
    expect(res.status).toBe(403);
  });

  it('başka öğretmenin ödevinin dosyasına 403', async () => {
    const otherKey = await (async () => {
      const r = await request(app)
        .post('/api/v1/student/homeworks/s-hw-other/submit')
        .set(auth(secondStudentToken))
        .attach('files', PNG_BUFFER, { filename: 'diger.png', contentType: 'image/png' });
      return r.body.item.submission.files[0].key as string;
    })();
    trackKey(otherKey);
    const res = await request(app).get(`/api/v1/files/${otherKey}`).set(auth(teacherToken));
    expect(res.status).toBe(403);
  });

  it('tanımsız key 404', async () => {
    const res = await request(app)
      .get('/api/v1/files/9999999999-ffffffffffffffff.jpg')
      .set(auth(adminToken));
    expect(res.status).toBe(404);
  });
});

describe('Öğretmen teslim kontrolü', () => {
  it('GET /teacher/submissions?homework_id — teslim dosyalarıyla listeler', async () => {
    const res = await request(app)
      .get('/api/v1/teacher/submissions')
      .query({ homework_id: 's-hw-w1' })
      .set(auth(teacherToken));
    expect(res.status).toBe(200);
    expect(res.body.items.length).toBeGreaterThan(0);
    const item = res.body.items.find((i: { student_name: string }) => i.student_name === 'Test Student');
    expect(item).toBeTruthy();
    expect(item.files.length).toBeGreaterThan(0);
    expect(item.status).toBe('submitted');
  });

  it('GET /teacher/submissions (seçici) teslimi olan ödevleri döner', async () => {
    const res = await request(app)
      .get('/api/v1/teacher/submissions')
      .set(auth(teacherToken));
    expect(res.status).toBe(200);
    const ids = res.body.items.map((i: { id: string }) => i.id);
    expect(ids).toContain('s-hw-w0');
    expect(ids).toContain('s-hw-w1');
  });

  it('PATCH reviewed — sahip öğretmen işaretler (zincir yetki)', async () => {
    const sub = db
      .prepare('SELECT id FROM submissions WHERE homework_id = ? AND student_id = ?')
      .get('s-hw-w1', 'test-student-rec') as { id: string };
    const res = await request(app)
      .patch(`/api/v1/teacher/submissions/${sub.id}`)
      .set(auth(teacherToken))
      .send({ status: 'reviewed' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('reviewed');
    expect(res.body.reviewed_by).toBe('test-teacher');

    const row = db
      .prepare('SELECT status, reviewed_by FROM submissions WHERE id = ?')
      .get(sub.id) as { status: string; reviewed_by: string };
    expect(row.status).toBe('reviewed');
    expect(row.reviewed_by).toBe('test-teacher');
  });

  it('PATCH reviewed — başka öğretmen 403 (zincir: submission → homework → class_course)', async () => {
    const sub = db
      .prepare('SELECT id FROM submissions WHERE homework_id = ? AND student_id = ?')
      .get('s-hw-w1', 'test-student-rec') as { id: string };
    const res = await request(app)
      .patch(`/api/v1/teacher/submissions/${sub.id}`)
      .set(auth(teacher2Token))
      .send({ status: 'reviewed' });
    expect(res.status).toBe(403);
  });

  it('öğretmen olmayan rol teslim listesi 403', async () => {
    const res = await request(app)
      .get('/api/v1/teacher/submissions')
      .set(auth(studentToken));
    expect(res.status).toBe(403);
  });
});

/**
 * Admin "Tüm raporlar" araması — öğretmen adı genişlemesi (spec §5.5/§5.7).
 *
 * Karar: `q` öğretmen adını **yalnızca admin** aramasında kapsar. Paylaşılan
 * `/teacher/reports` ucu öğretmen "Geçmiş raporlarım"ı da beslediğinden,
 * öğretmen rolünde sınıf/ders semantiği birebir korunur (öğretmen adı aranmaz).
 *
 * İzole fixture — mevcut sayfalama/arama testlerinin toplamlarını etkilemez.
 * `fileParallelism: false` (tek test.db, sıralı).
 */

import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { createApp } from './app.js';
import { db } from './db/index.js';
import { resetDb, insertTestUsers, TEST_PASSWORD } from './test/helpers.js';
import { hashPasswordSync } from './utils/hash.js';
import { normalizeTurkish } from './utils/text.js';

const app = createApp();

const CLASS_A = 'rst-class-a'; // ÖKLİD — test-teacher
const CLASS_B = 'rst-class-b'; // PİSAGOR — Öğretmen 1
const CC_A = 'rst-cc-a';
const CC_B = 'rst-cc-b';

let adminToken: string;
let teacherToken: string;

function lines(text: string): string[] {
  const body = text.startsWith('\uFEFF') ? text.slice(1) : text;
  return body.split('\r\n').filter((l) => l.length > 0);
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
     VALUES ('rst-year', '2026-2027', '2026-09-01', '2027-06-30', 1)`,
  ).run();
  const insertWeek = db.prepare(
    `INSERT INTO weeks (id, academic_year_id, week_no, start_date, end_date, label)
     VALUES (?, 'rst-year', ?, ?, ?, ?)`,
  );
  insertWeek.run('rst-w1', 1, '2026-09-01', '2026-09-07', '1 - 7 Eylül');
  insertWeek.run('rst-w2', 2, '2026-09-08', '2026-09-14', '8 - 14 Eylül');

  db.prepare(
    `INSERT INTO classes (id, academic_year_id, name, name_normalized, deleted_at)
     VALUES (?, 'rst-year', ?, ?, NULL)`,
  ).run(CLASS_A, 'ÖKLİD', 'oklid');
  db.prepare(
    `INSERT INTO classes (id, academic_year_id, name, name_normalized, deleted_at)
     VALUES (?, 'rst-year', ?, ?, NULL)`,
  ).run(CLASS_B, 'PİSAGOR', 'pisagor');

  db.prepare(
    `INSERT INTO courses (id, name, name_normalized, deleted_at)
     VALUES ('rst-co-a', 'Cebir', 'cebir', NULL)`,
  ).run();
  db.prepare(
    `INSERT INTO courses (id, name, name_normalized, deleted_at)
     VALUES ('rst-co-b', 'Fizik', 'fizik', NULL)`,
  ).run();

  // Türkçe karakterli öğretmen — arama normalize edilerek eşleşmeli.
  const ogretmen1 = 'Öğretmen 1';
  db.prepare(
    `INSERT INTO users
       (id, full_name, full_name_normalized, username, email, password_hash, role,
        is_active, token_version, deleted_at, created_at)
     VALUES ('rst-teacher-2', ?, ?, NULL, 'ogretmen1@test.local', ?, 'teacher', 1, 1, NULL, ?)`,
  ).run(ogretmen1, normalizeTurkish(ogretmen1), hashPasswordSync(TEST_PASSWORD), new Date().toISOString());

  const insertCc = db.prepare(
    `INSERT INTO class_courses
       (id, class_id, course_id, teacher_id, day_of_week, lesson_time, deleted_at)
     VALUES (?, ?, ?, ?, 1, '09:00', NULL)`,
  );
  insertCc.run(CC_A, CLASS_A, 'rst-co-a', 'test-teacher');
  insertCc.run(CC_B, CLASS_B, 'rst-co-b', 'rst-teacher-2');

  const now = new Date().toISOString();
  const insertReport = db.prepare(
    `INSERT INTO reports (id, class_course_id, week_id, status, completed_at, created_by, updated_at)
     VALUES (?, ?, ?, 'completed', ?, ?, ?)`,
  );
  insertReport.run('rst-report-a', CC_A, 'rst-w1', now, 'test-teacher', now);
  insertReport.run('rst-report-b', CC_B, 'rst-w2', now, 'rst-teacher-2', now);

  adminToken = await login('admin@test.local');
  teacherToken = await login('teacher@test.local');
});

describe('GET /teacher/reports — admin öğretmen adıyla arar', () => {
  it('öğretmen adının tam hâli / kısmi / büyük harf / Türkçesiz hâli eşleşir', async () => {
    const all = await request(app)
      .get('/api/v1/teacher/reports')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(all.body.total).toBe(2);

    // "Öğretmen 1" → normalizeTurkish = "ogretmen 1" = users.full_name_normalized.
    for (const q of ['Öğretmen 1', 'ogretmen', 'ÖĞRETMEN 1', 'Öğretmen 1']) {
      const res = await request(app)
        .get(`/api/v1/teacher/reports?q=${encodeURIComponent(q)}`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.body.total, `q="${q}"`).toBe(1);
      expect(res.body.items[0].class_name).toBe('PİSAGOR');
      expect(res.body.items[0].course_name).toBe('Fizik');
    }
  });

  it('sınıf/ders araması regresyonsuz çalışır (öğretmen adı eklenmesi bozmadı)', async () => {
    const byClass = await request(app)
      .get('/api/v1/teacher/reports?q=%C3%96KL%C4%B0D')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(byClass.body.total).toBe(1);
    expect(byClass.body.items[0].class_name).toBe('ÖKLİD');

    const byCourse = await request(app)
      .get('/api/v1/teacher/reports?q=cebir')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(byCourse.body.total).toBe(1);
    expect(byCourse.body.items[0].course_name).toBe('Cebir');
  });
});

describe('GET /teacher/reports — öğretmen rolü DEĞİŞMEZ (öğretmen adı aranmaz)', () => {
  it('öğretmen kendi adını arasa bile sonuç değişmez (yalnız admin kısıtı backend\'de)', async () => {
    const ownReport = await request(app)
      .get('/api/v1/teacher/reports')
      .set('Authorization', `Bearer ${teacherToken}`);
    expect(ownReport.body.total).toBe(1);

    // Öğretmen adı aramaya dahil olsaydı "Test Teacher" kendi raporunu (1)
    // bulurdu. Backend yalnızca sınıf/ders aradığı için sonuç 0.
    const ownName = await request(app)
      .get('/api/v1/teacher/reports?q=Test+Teacher')
      .set('Authorization', `Bearer ${teacherToken}`);
    expect(ownName.body.total).toBe(0);

    const otherName = await request(app)
      .get(`/api/v1/teacher/reports?q=${encodeURIComponent('Öğretmen 1')}`)
      .set('Authorization', `Bearer ${teacherToken}`);
    expect(otherName.body.total).toBe(0);

    // Sınıf/ders araması öğretmende aynen çalışmaya devam eder.
    const byClass = await request(app)
      .get('/api/v1/teacher/reports?q=%C3%96KL%C4%B0D')
      .set('Authorization', `Bearer ${teacherToken}`);
    expect(byClass.body.total).toBe(1);
  });
});

describe('GET /admin/reports/export — q öğretmen adını da kapsar', () => {
  it('öğretmen adıyla CSV daralır; sınıf/ders araması korunur', async () => {
    const byTeacher = await request(app)
      .get(`/api/v1/admin/reports/export?q=${encodeURIComponent('Öğretmen 1')}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(lines(byTeacher.text)).toHaveLength(2); // başlık + 1 satır
    expect(byTeacher.text).toContain('Fizik');
    expect(byTeacher.text).not.toContain('Cebir');

    const byClass = await request(app)
      .get('/api/v1/admin/reports/export?q=%C3%96KL%C4%B0D')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(lines(byClass.text)).toHaveLength(2);
    expect(byClass.text).toContain('Cebir');
  });
});

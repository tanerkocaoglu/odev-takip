/**
 * Filtreli CSV dışa aktarma entegrasyon testleri — spec.md §5.7.
 */

import { beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from './app.js';
import { db } from './db/index.js';
import { resetDb, insertTestUsers, TEST_PASSWORD } from './test/helpers.js';

const app = createApp();
let adminToken: string;
let teacherToken: string;

function lines(text: string): string[] {
  const body = text.startsWith('\uFEFF') ? text.slice(1) : text;
  return body.split('\r\n').filter((l) => l.length > 0);
}

beforeAll(async () => {
  resetDb();
  insertTestUsers();
  const now = new Date().toISOString();

  db.prepare(
    `INSERT INTO academic_years (id, name, start_date, end_date, is_active)
     VALUES ('y1', '2026-2027', '2026-09-01', '2027-06-30', 1)`,
  ).run();
  db.prepare(
    `INSERT INTO classes (id, academic_year_id, name, name_normalized, deleted_at)
     VALUES ('c1', 'y1', 'ÖKLİD', 'oklid', NULL)`,
  ).run();
  db.prepare(
    `INSERT INTO courses (id, name, name_normalized, deleted_at)
     VALUES ('co1', 'Matematik', 'matematik', NULL)`,
  ).run();
  db.prepare(
    `INSERT INTO class_courses (id, class_id, course_id, teacher_id, day_of_week, lesson_time, deleted_at)
     VALUES ('cc1', 'c1', 'co1', 'test-teacher', 1, '10:00', NULL)`,
  ).run();
  db.prepare(
    `INSERT INTO weeks (id, academic_year_id, week_no, start_date, end_date, label)
     VALUES ('w1', 'y1', 1, '2026-09-01', '2026-09-07', '1 - 7 Eylül')`,
  ).run();
  db.prepare(
    `INSERT INTO enrollments (id, student_id, class_id, start_date, end_date)
     VALUES ('e1', 'test-student-rec', 'c1', '2026-09-01', NULL)`,
  ).run();
  db.prepare(
    `INSERT INTO reports (id, class_course_id, week_id, status, created_by, updated_at)
     VALUES ('r1', 'cc1', 'w1', 'completed', 'test-teacher', ?)`,
  ).run(now);
  db.prepare(
    `INSERT INTO report_entries (id, report_id, student_id, attendance)
     VALUES ('re1', 'r1', 'test-student-rec', 'present')`,
  ).run();

  const admin = await request(app)
    .post('/api/v1/auth/login')
    .send({ identifier: 'admin@test.local', password: TEST_PASSWORD });
  adminToken = admin.body.token as string;

  const teacher = await request(app)
    .post('/api/v1/auth/login')
    .send({ identifier: 'teacher@test.local', password: TEST_PASSWORD });
  teacherToken = teacher.body.token as string;
});

describe('Dışa aktarma — yetki', () => {
  it('öğretmen 403 döner', async () => {
    const res = await request(app)
      .get('/api/v1/admin/students/export')
      .set('Authorization', `Bearer ${teacherToken}`);
    expect(res.status).toBe(403);
  });
});

describe('Dışa aktarma — içerik ve filtre', () => {
  it('öğrenciler: BOM + başlık + tüm filtre sonucu', async () => {
    const res = await request(app)
      .get('/api/v1/admin/students/export')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.text.startsWith('\uFEFF')).toBe(true);
    const rows = lines(res.text);
    expect(rows[0]).toBe(
      'Ad Soyad,Veli,Dershane Sınıfı,Okul,Sınıf Seviyesi,Kullanıcı Adı',
    );
    expect(res.text).toContain('Test Student');
    expect(res.text).toContain('ÖKLİD');
  });

  it('öğrenciler: q filtresi sonucu daraltır', async () => {
    const res = await request(app)
      .get('/api/v1/admin/students/export?q=olmayan')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(lines(res.text)).toHaveLength(1);
  });

  it('veliler: KVKK onayı ve çocuk sayısı', async () => {
    const res = await request(app)
      .get('/api/v1/admin/guardians/export')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(lines(res.text)[0]).toBe(
      'Ad Soyad,Kullanıcı Adı,WhatsApp,Çocuk Sayısı,KVKK Onayı',
    );
    expect(res.text).toContain('Test Guardian');
    expect(res.text).toContain('Onaylı');
  });

  it('raporlar: durum etiketi ve filtre', async () => {
    const res = await request(app)
      .get('/api/v1/admin/reports/export')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.text).toContain('Matematik');
    expect(res.text).toContain('Tamamlandı');

    const filtered = await request(app)
      .get('/api/v1/admin/reports/export?status=sent')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(lines(filtered.text)).toHaveLength(1);
  });

  it('raporlar: q sınıf/ders adında Türkçe normalize ile eşleşir', async () => {
    // "ÖKLİD" → normalizeTurkish = "oklid" = classes.name_normalized.
    const byClass = await request(app)
      .get('/api/v1/admin/reports/export?q=%C3%96KL%C4%B0D')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(lines(byClass.text)).toHaveLength(2);

    // Ders adı da aranır ("Matematik").
    const byCourse = await request(app)
      .get('/api/v1/admin/reports/export?q=matematik')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(lines(byCourse.text)).toHaveLength(2);

    const none = await request(app)
      .get('/api/v1/admin/reports/export?q=olmayan')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(lines(none.text)).toHaveLength(1);
  });
});

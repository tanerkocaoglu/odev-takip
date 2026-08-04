/**
 * Öğretmen rapor entegrasyon testleri (supertest) — Aşama 3, adım 1:
 * dashboard ("bu hafta doldurulacaklar") + rapor get-or-create.
 * (PUT autosave + complete sonraki adımdadır.)
 *
 * Tarihler deterministik: `Date` 2026-08-04 Salı olarak fake'lenir.
 * Hafta 1 = 2026-07-27..08-02 (geçen hafta), hafta 2 = 2026-08-03..08-09
 * (bu hafta). `fileParallelism: false` — tek test.db, sıralı çalışır.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import request from 'supertest';
import { createApp } from './app.js';
import { db } from './db/index.js';
import { resetDb, insertTestUsers, TEST_PASSWORD } from './test/helpers.js';
import { signToken } from './utils/token.js';
import { hashPasswordSync } from './utils/hash.js';
import type { Role } from './types.js';

const app = createApp();

const FAKE_NOW = new Date('2026-08-04T10:00:00');
const WEEK1 = { id: 't-week-1', start: '2026-07-27', end: '2026-08-02' };
const WEEK2 = { id: 't-week-2', start: '2026-08-03', end: '2026-08-09' };
const WEEK3 = { id: 't-week-3', start: '2026-08-10', end: '2026-08-16' };

// Atamalar: CC_OWN Pazartesi (geçmiş → overdue), CC_OWN_FUTURE Cuma (geçmedi),
// CC_OTHER başka öğretmenin, CC_DONE bu hafta tamamlanmış (dashboard'dan düşer).
const CC_OWN = 't-cc-1';
const CC_OWN_FUTURE = 't-cc-2';
const CC_OTHER = 't-cc-3';
const CC_DONE = 't-cc-4';

let teacherToken: string;
let adminToken: string;

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
  vi.useFakeTimers({ toFake: ['Date'], now: FAKE_NOW });
  resetDb();
  insertTestUsers();

  // --- Yıl (aktif) + 2 hafta ---
  db.prepare(
    `INSERT INTO academic_years (id, name, start_date, end_date, is_active)
     VALUES (?, ?, ?, ?, 1)`,
  ).run('t-year', '2026-2027', '2026-07-20', '2026-08-16');
  const insertWeek = db.prepare(
    `INSERT INTO weeks (id, academic_year_id, week_no, start_date, end_date, label)
     VALUES (?, ?, ?, ?, ?, ?)`,
  );
  insertWeek.run(WEEK1.id, 't-year', 1, WEEK1.start, WEEK1.end, 'Hafta 1');
  insertWeek.run(WEEK2.id, 't-year', 2, WEEK2.start, WEEK2.end, 'Hafta 2');
  // Week 3: week 2'nin "sonraki haftası" — due_date hesabı için (spec §5.2).
  insertWeek.run(WEEK3.id, 't-year', 3, WEEK3.start, WEEK3.end, 'Hafta 3');

  // --- İkinci öğretmen (yetki testleri için) ---
  db.prepare(
    `INSERT INTO users
       (id, full_name, full_name_normalized, username, email, password_hash, role,
        is_active, token_version, deleted_at, created_at)
     VALUES (?, ?, ?, NULL, ?, ?, 'teacher', 1, 1, NULL, ?)`,
  ).run(
    'test-teacher-2',
    'Test Teacher 2',
    'test teacher 2',
    'teacher2@test.local',
    hashPasswordSync(TEST_PASSWORD),
    new Date().toISOString(),
  );

  // --- Sınıf + ders + atamalar ---
  db.prepare(
    `INSERT INTO classes (id, academic_year_id, name, name_normalized, deleted_at)
     VALUES (?, ?, ?, ?, NULL)`,
  ).run('t-class', 't-year', 'Test Sınıf', 'test sinif');
  // class_courses(class_id, course_id) UNIQUE — her atamaya ayrı ders.
  const insertCourse = db.prepare(
    `INSERT INTO courses (id, name, name_normalized, deleted_at)
     VALUES (?, ?, ?, NULL)`,
  );
  insertCourse.run('t-course-1', 'Ders 1', 'ders 1');
  insertCourse.run('t-course-2', 'Ders 2', 'ders 2');
  insertCourse.run('t-course-3', 'Ders 3', 'ders 3');
  insertCourse.run('t-course-4', 'Ders 4', 'ders 4');

  const insertCc = db.prepare(
    `INSERT INTO class_courses
       (id, class_id, course_id, teacher_id, day_of_week, lesson_time, deleted_at)
     VALUES (?, ?, ?, ?, ?, ?, NULL)`,
  );
  insertCc.run(CC_OWN, 't-class', 't-course-1', 'test-teacher', 1, '09:00');
  insertCc.run(CC_OWN_FUTURE, 't-class', 't-course-2', 'test-teacher', 5, '10:00');
  insertCc.run(CC_OTHER, 't-class', 't-course-3', 'test-teacher-2', 3, '11:00');
  insertCc.run(CC_DONE, 't-class', 't-course-4', 'test-teacher', 2, '13:00');

  // --- Öğrenciler: 3 aktif + 1 hafta 2'den önce ayrılmış ---
  const now = new Date().toISOString();
  const insertStudent = db.prepare(
    `INSERT INTO users
       (id, full_name, full_name_normalized, username, email, password_hash, role,
        is_active, token_version, deleted_at, created_at)
     VALUES (?, ?, ?, ?, NULL, NULL, 'student', 1, 1, NULL, ?)`,
  );
  const insertStudentRec = db.prepare(
    `INSERT INTO students (id, user_id, guardian_id, deleted_at)
     VALUES (?, ?, NULL, NULL)`,
  );
  const insertEnrollment = db.prepare(
    `INSERT INTO enrollments (id, student_id, class_id, start_date, end_date)
     VALUES (?, ?, ?, ?, ?)`,
  );
  const students: Array<[string, string, string]> = [
    ['t-stu-1', 't-stu-rec-1', 'ogrenci-t-1'],
    ['t-stu-2', 't-stu-rec-2', 'ogrenci-t-2'],
    ['t-stu-3', 't-stu-rec-3', 'ogrenci-t-3'],
    ['t-stu-4', 't-stu-rec-4', 'ogrenci-t-4'],
  ];
  students.forEach(([userId, recId, username], i) => {
    insertStudent.run(userId, `Öğrenci ${userId}`, `ogrenci ${userId}`, username, now);
    insertStudentRec.run(recId, userId);
    const end = i === 3 ? '2026-08-02' : null; // 4. öğrenci hafta 2'de yok
    insertEnrollment.run(`t-enr-${i + 1}`, recId, 't-class', '2026-07-20', end);
  });

  // --- Geçen hafta (hafta 1): CC_OWN completed rapor + ödev (prev_homework) ---
  db.prepare(
    `INSERT INTO reports
       (id, class_course_id, week_id, topic_covered, prev_homework_id,
        prev_homework_text, status, completed_at, created_by, updated_at)
     VALUES (?, ?, ?, ?, NULL, NULL, 'completed', ?, ?, ?)`,
  ).run('t-report-w1', CC_OWN, WEEK1.id, 'Konu 1', now, 'test-teacher', now);
  db.prepare(
    `INSERT INTO homeworks (id, report_id, class_course_id, week_id, description, attachments, due_date)
     VALUES (?, ?, ?, ?, ?, NULL, ?)`,
  ).run(
    't-homework-w1',
    't-report-w1',
    CC_OWN,
    WEEK1.id,
    'Geçen haftanın ödevi',
    '2026-08-03',
  );

  // --- Hafta 2: tamamlanmış rapor (dashboard'dan düşmeli) ---
  db.prepare(
    `INSERT INTO reports
       (id, class_course_id, week_id, topic_covered, prev_homework_id,
        prev_homework_text, status, completed_at, created_by, updated_at)
     VALUES (?, ?, ?, ?, NULL, NULL, 'completed', ?, ?, ?)`,
  ).run('t-report-done', CC_DONE, WEEK2.id, 'Bitti', now, 'test-teacher', now);

  // --- Adım 2: PUT/complete akışları için ek atamalar (t-year, hafta 2) ---
  insertCourse.run('t-course-5', 'Ders 5', 'ders 5');
  insertCourse.run('t-course-6', 'Ders 6', 'ders 6');
  insertCc.run('t-cc-5', 't-class', 't-course-5', 'test-teacher', 4, '14:00');
  insertCc.run('t-cc-6', 't-class', 't-course-6', 'test-teacher', 5, '15:00');

  // --- Son hafta senaryosu (spec §5.2): TEK haftalı ayrı eğitim yılı ---
  // Sonraki hafta olmadığından calculateDueDate null döner; homeworks satırı
  // öğretmen tarihi elle girene kadar oluşturulmaz.
  db.prepare(
    `INSERT INTO academic_years (id, name, start_date, end_date, is_active)
     VALUES (?, ?, ?, ?, 0)`,
  ).run('t-year-last', 'Son Hafta Yılı', '2026-08-10', '2026-08-16');
  insertWeek.run('t-week-last', 't-year-last', 1, '2026-08-10', '2026-08-16', 'Son Hafta');
  db.prepare(
    `INSERT INTO classes (id, academic_year_id, name, name_normalized, deleted_at)
     VALUES (?, ?, ?, ?, NULL)`,
  ).run('t-class-last', 't-year-last', 'Son Sınıf', 'son sinif');
  insertCourse.run('t-course-last', 'Son Ders', 'son ders');
  insertCc.run('t-cc-last', 't-class-last', 't-course-last', 'test-teacher', 3, '12:00');
  // Bu sınıfa tek aktif öğrenci.
  insertStudent.run('t-stu-5', 'Öğrenci t-stu-5', 'ogrenci t-stu-5', '+905009992005', now);
  insertStudentRec.run('t-stu-rec-5', 't-stu-5');
  insertEnrollment.run('t-enr-5', 't-stu-rec-5', 't-class-last', '2026-08-10', null);

  adminToken = await login('admin@test.local');
  teacherToken = await login('teacher@test.local');
});

afterAll(() => {
  vi.useRealTimers();
});

describe('GET /api/v1/teacher/dashboard', () => {
  it('token yokken 401 döner', async () => {
    const res = await request(app).get('/api/v1/teacher/dashboard');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it('veli/öğrenci tokenı ile 403 döner', async () => {
    for (const [id, role] of [
      ['test-guardian', 'guardian'],
      ['test-student', 'student'],
    ] as Array<[string, Role]>) {
      const res = await request(app)
        .get('/api/v1/teacher/dashboard')
        .set('Authorization', `Bearer ${signTokenFor(id, role)}`);
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    }
  });

  it('bu haftayı (week 2) ve doldurulacakları döner — sıralı, tamamlanan düşer, overdue vurgulu', async () => {
    const res = await request(app)
      .get('/api/v1/teacher/dashboard')
      .set('Authorization', `Bearer ${teacherToken}`);
    expect(res.status).toBe(200);

    expect(res.body.week).toMatchObject({ week_no: 2, id: WEEK2.id });

    const items = res.body.items as Array<{
      class_course_id: string;
      is_overdue: boolean;
      day_of_week: number;
      lesson_time: string | null;
      status: string | null;
      report_id: string | null;
    }>;

    // Yalnızca kendi atamaları; tamamlanan (CC_DONE) düşer; başkasınınki (CC_OTHER) yok.
    const ids = items.map((i) => i.class_course_id);
    expect(ids).toContain(CC_OWN);
    expect(ids).toContain(CC_OWN_FUTURE);
    expect(ids).not.toContain(CC_OTHER);
    expect(ids).not.toContain(CC_DONE);

    // Günü geçmiş (Pazartesi dersi) önce gelir ve vurgulanır.
    expect(items[0].class_course_id).toBe(CC_OWN);
    expect(items[0].is_overdue).toBe(true);
    const future = items.find((i) => i.class_course_id === CC_OWN_FUTURE)!;
    expect(future.is_overdue).toBe(false);

    // Sıralama: overdue üstte, sonra day_of_week + lesson_time.
    expect(items[0].day_of_week).toBeLessThanOrEqual(items[1]?.day_of_week ?? 8);
  });

  it('admin de dashboard\'ı görebilir', async () => {
    const res = await request(app)
      .get('/api/v1/teacher/dashboard')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    // Admin tüm atamaları görür (CC_OTHER dahil).
    const ids = (res.body.items as Array<{ class_course_id: string }>).map(
      (i) => i.class_course_id,
    );
    expect(ids).toContain(CC_OTHER);
  });
});

describe('POST /api/v1/teacher/reports (get-or-create)', () => {
  it('veli/öğrenci 403 döner', async () => {
    const res = await request(app)
      .post('/api/v1/teacher/reports')
      .set('Authorization', `Bearer ${signTokenFor('test-guardian', 'guardian')}`)
      .send({ class_course_id: CC_OWN, week_id: WEEK2.id });
    expect(res.status).toBe(403);
  });

  it('rapor + satırlar + draft homeworks oluşturur; prev ödev otomatik dolar', async () => {
    const res = await request(app)
      .post('/api/v1/teacher/reports')
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({ class_course_id: CC_OWN, week_id: WEEK2.id });
    expect(res.status).toBe(201);

    const { report, entries } = res.body;
    expect(report.status).toBe('draft');
    expect(report.topic_covered).toBeNull();
    // Verilmiş olan ödev, geçen haftanın homeworks.description'ından gelir.
    expect(report.prev_homework_text).toBe('Geçen haftanın ödevi');
    // Yapılacak ödev boş başlar; son tarih sunucuda hesaplanır:
    // ödev week 2'de verildi → week 3'teki aynı ders günü (Pazartesi) = 2026-08-10.
    expect(report.homework).toEqual({ description: '', due_date: '2026-08-10' });
    expect(report.class_name).toBe('Test Sınıf');
    expect(report.course_name).toBe('Ders 1');

    // Satırlar: hafta başında aktif enrollment'lar (ayrılan öğrenci hariç).
    expect(entries).toHaveLength(3);
    const studentIds = (entries as Array<{ student_id: string }>).map(
      (e) => e.student_id,
    );
    expect(studentIds).toEqual(['t-stu-rec-1', 't-stu-rec-2', 't-stu-rec-3']);
    for (const entry of entries as Array<{
      attendance: string;
      homework_score: number | null;
      interest_score: number | null;
      teacher_note: string | null;
    }>) {
      expect(entry.attendance).toBe('present');
      expect(entry.homework_score).toBeNull();
      expect(entry.interest_score).toBeNull();
      expect(entry.teacher_note).toBeNull();
    }

    // DB tarafı: rapor + 3 satır + homework kaydı gerçekten yazıldı.
    const reportRow = db
      .prepare(`SELECT status FROM reports WHERE id = ?`)
      .get(res.body.report.id) as { status: string };
    expect(reportRow.status).toBe('draft');
  });

  it('ikinci çağrı aynı raporu döner (idempotent, 200)', async () => {
    const first = await request(app)
      .post('/api/v1/teacher/reports')
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({ class_course_id: CC_OWN, week_id: WEEK2.id });
    const second = await request(app)
      .post('/api/v1/teacher/reports')
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({ class_course_id: CC_OWN, week_id: WEEK2.id });
    expect(second.status).toBe(200);
    expect(second.body.report.id).toBe(first.body.report.id);
  });

  it('geçen hafta raporu yoksa prev ödev alanı boş gelir; due_date Cuma gününe düşer', async () => {
    const res = await request(app)
      .post('/api/v1/teacher/reports')
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({ class_course_id: CC_OWN_FUTURE, week_id: WEEK2.id });
    expect(res.status).toBe(201);
    expect(res.body.report.prev_homework_text).toBeNull();
    // day_of_week = 5 (Cuma) → ödev week 2'de verildi, week 3'teki Cuma = 2026-08-14.
    expect(res.body.report.homework.due_date).toBe('2026-08-14');
  });

  it('başka öğretmenin atamasına rapor oluşturulamaz (403)', async () => {
    const res = await request(app)
      .post('/api/v1/teacher/reports')
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({ class_course_id: CC_OTHER, week_id: WEEK2.id });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('olmayan atama 404 döner', async () => {
    const res = await request(app)
      .post('/api/v1/teacher/reports')
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({ class_course_id: 'yok-cc', week_id: WEEK2.id });
    expect(res.status).toBe(404);
  });

  it('farklı eğitim yılından hafta 400 döner', async () => {
    db.prepare(
      `INSERT INTO academic_years (id, name, start_date, end_date, is_active)
       VALUES (?, ?, ?, ?, 0)`,
    ).run('t-year-2', '2027-2028', '2026-09-01', '2027-06-30');
    db.prepare(
      `INSERT INTO weeks (id, academic_year_id, week_no, start_date, end_date, label)
       VALUES (?, ?, 1, ?, ?, ?)`,
    ).run('t-week-x', 't-year-2', '2026-09-07', '2026-09-13', 'Başka yıl');

    const res = await request(app)
      .post('/api/v1/teacher/reports')
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({ class_course_id: CC_OWN, week_id: 't-week-x' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('admin başka öğretmenin atamasına da rapor oluşturabilir (spec §2)', async () => {
    const res = await request(app)
      .post('/api/v1/teacher/reports')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ class_course_id: CC_OTHER, week_id: WEEK2.id });
    expect(res.status).toBe(201);
    expect(res.body.report.status).toBe('draft');
  });
});

describe('PUT /api/v1/teacher/reports/:id (autosave)', () => {
  let reportId: string;
  let studentIds: string[];

  beforeAll(async () => {
    const created = await request(app)
      .post('/api/v1/teacher/reports')
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({ class_course_id: 't-cc-5', week_id: WEEK2.id });
    reportId = created.body.report.id as string;
    studentIds = (created.body.entries as Array<{ student_id: string }>).map(
      (e) => e.student_id,
    );
  });

  it('konu, yapılacak ödev ve satırları günceller', async () => {
    const res = await request(app)
      .put(`/api/v1/teacher/reports/${reportId}`)
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({
        topic_covered: 'İkinci dereceden denklemler',
        homework_description: 'Sayfa 42, alıştırmalar 1-10',
        entries: studentIds.map((sid) => ({
          student_id: sid,
          attendance: 'present',
          homework_score: 7,
          interest_score: 8,
          teacher_note: null,
        })),
      });
    expect(res.status).toBe(200);
    expect(res.body.report.topic_covered).toBe('İkinci dereceden denklemler');
    expect(res.body.report.homework.description).toBe('Sayfa 42, alıştırmalar 1-10');
    expect(
      (res.body.entries as Array<{ homework_score: number; interest_score: number }>).every(
        (e) => e.homework_score === 7 && e.interest_score === 8,
      ),
    ).toBe(true);
  });

  it('normal haftada due_date boşaltılamaz (null → 400)', async () => {
    const res = await request(app)
      .put(`/api/v1/teacher/reports/${reportId}`)
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({ due_date: null });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.fields.due_date).toBeDefined();
  });

  it('due_date değiştirilebilir', async () => {
    const res = await request(app)
      .put(`/api/v1/teacher/reports/${reportId}`)
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({ due_date: '2026-08-12' });
    expect(res.status).toBe(200);
    expect(res.body.report.homework.due_date).toBe('2026-08-12');
  });

  it('devamsız satırda puanlar null yapılır', async () => {
    const res = await request(app)
      .put(`/api/v1/teacher/reports/${reportId}`)
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({
        entries: [
          {
            student_id: studentIds[0],
            attendance: 'absent',
            homework_score: 5,
            interest_score: 6,
            teacher_note: null,
          },
        ],
      });
    expect(res.status).toBe(200);
    const row = (res.body.entries as Array<{ student_id: string; attendance: string; homework_score: number | null; interest_score: number | null }>).find(
      (e) => e.student_id === studentIds[0],
    );
    expect(row!.attendance).toBe('absent');
    expect(row!.homework_score).toBeNull();
    expect(row!.interest_score).toBeNull();
  });

  it('verilmiş ödev metni değişince serbest metin olarak saklanır', async () => {
    const res = await request(app)
      .put(`/api/v1/teacher/reports/${reportId}`)
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({ prev_homework_text: 'Elle yazılmış önceki ödev' });
    expect(res.status).toBe(200);
    expect(res.body.report.prev_homework_text).toBe('Elle yazılmış önceki ödev');
  });

  it('raporda olmayan öğrenci satırı 400 döner', async () => {
    const res = await request(app)
      .put(`/api/v1/teacher/reports/${reportId}`)
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({
        entries: [
          {
            student_id: 'yok-student',
            attendance: 'present',
            homework_score: 5,
            interest_score: 5,
            teacher_note: null,
          },
        ],
      });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});

describe('POST /api/v1/teacher/reports/:id/complete', () => {
  let reportId: string;
  let studentIds: string[];

  beforeAll(async () => {
    const created = await request(app)
      .post('/api/v1/teacher/reports')
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({ class_course_id: 't-cc-6', week_id: WEEK2.id });
    reportId = created.body.report.id as string;
    studentIds = (created.body.entries as Array<{ student_id: string }>).map(
      (e) => e.student_id,
    );
  });

  it('entegrasyon zinciri: eksik puanla tamamla 400, doldurunca 200 + completed', async () => {
    // 1) Hiç puan girilmeden tamamla → 400, fields öğrenci id'lerini içerir.
    const missing = await request(app)
      .post(`/api/v1/teacher/reports/${reportId}/complete`)
      .set('Authorization', `Bearer ${teacherToken}`);
    expect(missing.status).toBe(400);
    expect(missing.body.error.code).toBe('VALIDATION_ERROR');
    expect(missing.body.error.fields[studentIds[0]]).toBeDefined();

    // 2) İlk öğrenci hariç hepsini doldur.
    await request(app)
      .put(`/api/v1/teacher/reports/${reportId}`)
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({
        entries: studentIds.slice(1).map((sid) => ({
          student_id: sid,
          attendance: 'present',
          homework_score: 6,
          interest_score: 7,
          teacher_note: null,
        })),
      });

    // 3) Hâlâ eksik (yalnız ilk öğrenci) → 400.
    const still = await request(app)
      .post(`/api/v1/teacher/reports/${reportId}/complete`)
      .set('Authorization', `Bearer ${teacherToken}`);
    expect(still.status).toBe(400);
    expect(still.body.error.fields[studentIds[0]]).toBeDefined();
    expect(still.body.error.fields[studentIds[1]]).toBeUndefined();

    // 4) Son öğrenciyi de doldur → tamamla → 200 + completed.
    await request(app)
      .put(`/api/v1/teacher/reports/${reportId}`)
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({
        entries: [
          {
            student_id: studentIds[0],
            attendance: 'present',
            homework_score: 9,
            interest_score: 9,
            teacher_note: 'Gayretli.',
          },
        ],
      });

    const done = await request(app)
      .post(`/api/v1/teacher/reports/${reportId}/complete`)
      .set('Authorization', `Bearer ${teacherToken}`);
    expect(done.status).toBe(200);
    expect(done.body.report.status).toBe('completed');
    expect(done.body.report.completed_at).not.toBeNull();
  });

  it('tamamlanmış rapor düzenlenebilir ve audit_logs\'a yazılır', async () => {
    const res = await request(app)
      .put(`/api/v1/teacher/reports/${reportId}`)
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({ topic_covered: 'Düzeltilmiş konu' });
    expect(res.status).toBe(200);
    expect(res.body.report.status).toBe('completed');
    expect(res.body.report.topic_covered).toBe('Düzeltilmiş konu');

    const audit = db
      .prepare(
        `SELECT action FROM audit_logs
         WHERE entity_type = 'report' AND entity_id = ?
         ORDER BY created_at DESC LIMIT 1`,
      )
      .get(reportId) as { action: string } | undefined;
    expect(audit).toBeDefined();
    expect(audit!.action).toBe('report.update');
  });

  it('gönderilmiş (sent) rapor düzenlenemez ve tamamlanamaz (403)', async () => {
    db.prepare(`UPDATE reports SET status = 'sent' WHERE id = ?`).run(reportId);

    const put = await request(app)
      .put(`/api/v1/teacher/reports/${reportId}`)
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({ topic_covered: 'X' });
    expect(put.status).toBe(403);
    expect(put.body.error.code).toBe('FORBIDDEN');

    const complete = await request(app)
      .post(`/api/v1/teacher/reports/${reportId}/complete`)
      .set('Authorization', `Bearer ${teacherToken}`);
    expect(complete.status).toBe(403);
  });
});

describe('Yılın son haftası (spec §5.2 sınır durumu)', () => {
  it('tek haftalı yılda due_date null; tarih girilmeden tamamla 400, girilince 200', async () => {
    // 1) Rapor oluştur — sonraki hafta yok, due_date hesaplanamaz, homework yok.
    const created = await request(app)
      .post('/api/v1/teacher/reports')
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({ class_course_id: 't-cc-last', week_id: 't-week-last' });
    expect(created.status).toBe(201);
    expect(created.body.report.homework).toBeNull();
    const reportId = created.body.report.id as string;
    const sid = (created.body.entries as Array<{ student_id: string }>)[0].student_id;

    // 2) Teslim tarihi yokken tamamla → 400 (due_date zorunlu).
    const noDate = await request(app)
      .post(`/api/v1/teacher/reports/${reportId}/complete`)
      .set('Authorization', `Bearer ${teacherToken}`);
    expect(noDate.status).toBe(400);
    expect(noDate.body.error.code).toBe('VALIDATION_ERROR');
    expect(noDate.body.error.fields.due_date).toBeDefined();

    // 3) Öğretmen tarihi elle girer + puanları doldurur → homeworks satırı oluşur.
    const put = await request(app)
      .put(`/api/v1/teacher/reports/${reportId}`)
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({
        due_date: '2026-08-15',
        homework_description: 'Son hafta ödevi',
        entries: [
          {
            student_id: sid,
            attendance: 'present',
            homework_score: 8,
            interest_score: 8,
            teacher_note: null,
          },
        ],
      });
    expect(put.status).toBe(200);
    expect(put.body.report.homework).toEqual({
      description: 'Son hafta ödevi',
      due_date: '2026-08-15',
    });

    // 4) Tarih girilince tamamlanabilir.
    const done = await request(app)
      .post(`/api/v1/teacher/reports/${reportId}/complete`)
      .set('Authorization', `Bearer ${teacherToken}`);
    expect(done.status).toBe(200);
    expect(done.body.report.status).toBe('completed');
  });
});

/**
 * Ders sıralaması — haftanın **gerçek başlangıcına göre göreli** gün sırası.
 *
 * Senaryo: Cumartesi başlangıçlı hafta (26.09.2026 Cmt .. 02.10.2026 Cum).
 * `class_courses.day_of_week` ISO saklanır (1=Pazartesi .. 7=Pazar), bu yüzden
 * ham sayıya göre sıralama Salı'yı (2) Pazar'dan (7) önce koyardı. Gerçek
 * kronolojik sıra ise Pazar, Salı'dır (Pazar → göreli 2, Salı → göreli 4).
 *
 * Ayrıca "ders günü geçti mi" (`isOverdue`) de aynı göreli güne dayanır.
 *
 * `fileParallelism: false` — tek test.db, sıralı çalışır.
 */

import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import request from 'supertest';
import { createApp } from './app.js';
import { db } from './db/index.js';
import { resetDb, insertTestUsers, TEST_PASSWORD } from './test/helpers.js';
import { relativeWeekday } from './utils/weeks.js';

const app = createApp();

const BASE_NOW = new Date('2026-09-26T10:00:00'); // Cumartesi (hafta başı)
const WEEK_SAT = { id: 'ord-week-sat', start: '2026-09-26', end: '2026-10-02' };

// Dashboard senaryosu (rapor yok → listede kalır).
const CC_PAZAR = 'ord-cc-pazar'; // day_of_week = 7 (Pazar) → göreli 2
const CC_SALI = 'ord-cc-sali'; //   day_of_week = 2 (Salı)  → göreli 4
// Ödev özeti senaryosu (tamamlanmış rapor + ödev).
const CC_PAZAR2 = 'ord-cc-pazar2';
const CC_SALI2 = 'ord-cc-sali2';

let adminToken: string;
let teacherToken: string;

async function login(identifier: string): Promise<string> {
  const res = await request(app)
    .post('/api/v1/auth/login')
    .send({ identifier, password: TEST_PASSWORD });
  return res.body.token as string;
}

beforeAll(async () => {
  vi.useFakeTimers({ toFake: ['Date'], now: BASE_NOW });
  resetDb();
  insertTestUsers();

  db.prepare(
    `INSERT INTO academic_years (id, name, start_date, end_date, is_active)
     VALUES (?, ?, ?, ?, 1)`,
  ).run('ord-year', '2026-2027', '2026-09-01', '2027-06-30');
  db.prepare(
    `INSERT INTO weeks (id, academic_year_id, week_no, start_date, end_date, label)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(WEEK_SAT.id, 'ord-year', 1, WEEK_SAT.start, WEEK_SAT.end, '26.09 - 02.10.2026');

  const insertClass = db.prepare(
    `INSERT INTO classes (id, academic_year_id, name, name_normalized, deleted_at)
     VALUES (?, 'ord-year', ?, ?, NULL)`,
  );
  insertClass.run('ord-class-dash', 'Sıra Sınıfı', 'sira sinifi');
  insertClass.run('ord-class-sum', 'Özet Sınıfı', 'ozet sinifi');

  const insertCourse = db.prepare(
    `INSERT INTO courses (id, name, name_normalized, deleted_at) VALUES (?, ?, ?, NULL)`,
  );
  insertCourse.run('ord-c-pazar', 'Pazar Dersi', 'pazar dersi');
  insertCourse.run('ord-c-sali', 'Salı Dersi', 'sali dersi');
  insertCourse.run('ord-c-pazar2', 'Pazar Dersi 2', 'pazar dersi 2');
  insertCourse.run('ord-c-sali2', 'Salı Dersi 2', 'sali dersi 2');

  const insertCc = db.prepare(
    `INSERT INTO class_courses
       (id, class_id, course_id, teacher_id, day_of_week, lesson_time, deleted_at)
     VALUES (?, ?, ?, 'test-teacher', ?, ?, NULL)`,
  );
  insertCc.run(CC_PAZAR, 'ord-class-dash', 'ord-c-pazar', 7, '11:00');
  insertCc.run(CC_SALI, 'ord-class-dash', 'ord-c-sali', 2, '09:00');
  insertCc.run(CC_PAZAR2, 'ord-class-sum', 'ord-c-pazar2', 7, '15:00');
  insertCc.run(CC_SALI2, 'ord-class-sum', 'ord-c-sali2', 2, '13:00');

  // Özet sınıfı: iki ders de completed + ödevli (aksi halde "Rapor girilmedi").
  const insertReport = db.prepare(
    `INSERT INTO reports
       (id, class_course_id, week_id, topic_covered, prev_homework_id,
        prev_homework_text, status, completed_at, created_by, updated_at)
     VALUES (?, ?, ?, ?, NULL, NULL, 'completed', ?, 'test-teacher', ?)`,
  );
  const insertHomework = db.prepare(
    `INSERT INTO homeworks (id, report_id, class_course_id, week_id, description, attachments, due_date)
     VALUES (?, ?, ?, ?, ?, NULL, ?)`,
  );
  const now = BASE_NOW.toISOString();
  insertReport.run('ord-rep-pazar2', CC_PAZAR2, WEEK_SAT.id, 'Pazar konusu', now, now);
  insertHomework.run(
    'ord-hw-pazar2',
    'ord-rep-pazar2',
    CC_PAZAR2,
    WEEK_SAT.id,
    'Pazar ödevi',
    WEEK_SAT.end,
  );
  insertReport.run('ord-rep-sali2', CC_SALI2, WEEK_SAT.id, 'Salı konusu', now, now);
  insertHomework.run(
    'ord-hw-sali2',
    'ord-rep-sali2',
    CC_SALI2,
    WEEK_SAT.id,
    'Salı ödevi',
    WEEK_SAT.end,
  );

  teacherToken = await login('teacher@test.local');
  adminToken = await login('admin@test.local');
});

afterEach(() => {
  vi.setSystemTime(BASE_NOW);
});

afterAll(() => {
  vi.useRealTimers();
});

describe('öğretmen dashboard — hafta başına göre göreli ders sırası', () => {
  it('Cumartesi başlangıçlı haftada Pazar, Salı’dan ÖNCE gelir', async () => {
    const res = await request(app)
      .get('/api/v1/teacher/dashboard')
      .set('Authorization', `Bearer ${teacherToken}`);
    expect(res.status).toBe(200);
    expect(res.body.week).toMatchObject({ id: WEEK_SAT.id, start_date: WEEK_SAT.start });

    const items = res.body.items as Array<{ class_course_id: string; day_of_week: number }>;
    // Ham ISO: Pazar=7, Salı=2 (standart sıralama Salı'yı öne koyardı).
    expect(items.map((i) => i.day_of_week)).toEqual([7, 2]);
    expect(items.map((i) => i.class_course_id)).toEqual([CC_PAZAR, CC_SALI]);
  });

  it('isOverdue hafta başına göre: Pazartesi, Pazar dersini geçmiş sayar', async () => {
    vi.setSystemTime(new Date('2026-09-28T10:00:00')); // Pazartesi 28.09
    const res = await request(app)
      .get('/api/v1/teacher/dashboard')
      .set('Authorization', `Bearer ${teacherToken}`);
    expect(res.status).toBe(200);

    const items = res.body.items as Array<{
      class_course_id: string;
      is_overdue: boolean;
    }>;
    const pazar = items.find((i) => i.class_course_id === CC_PAZAR)!;
    const sali = items.find((i) => i.class_course_id === CC_SALI)!;
    // Pazar 27.09 < 28.09 → geçmiş; Salı 29.09 > 28.09 → değil.
    expect(pazar.is_overdue).toBe(true);
    expect(sali.is_overdue).toBe(false);
  });
});

describe('admin haftalık ödev özeti — hafta başına göre göreli ders sırası', () => {
  it('Cumartesi başlangıçlı haftada Pazar satırı, Salı’dan ÖNCE gelir', async () => {
    const res = await request(app)
      .get('/api/v1/admin/homework-summary')
      .query({ class_id: 'ord-class-sum', week_id: WEEK_SAT.id })
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);

    const rows = res.body.rows as Array<{ class_course_id: string; homework_description: string }>;
    expect(rows.map((r) => r.class_course_id)).toEqual([CC_PAZAR2, CC_SALI2]);
    expect(rows[0].homework_description).toBe('Pazar ödevi');
    expect(rows[1].homework_description).toBe('Salı ödevi');
  });
});

describe('regresyon — Pazartesi başlangıçlı hafta sırası değişmedi', () => {
  it('relativeWeekday Pazartesi başlangıçta ISO ile birebir kimliktir', () => {
    const monday = '2026-09-21';
    for (let d = 1; d <= 7; d++) {
      expect(relativeWeekday(d, monday)).toBe(d);
    }
  });
});

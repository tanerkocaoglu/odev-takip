/**
 * Admin panel + salt-okunur rapor testleri — Aşama 5 (spec.md §5.5).
 * - `GET /teacher/reports/:id` — salt-okunur: öğretmen kendi, admin tümü;
 *   başka öğretmen / veli / öğrenci 403.
 * - `GET /admin/dashboard` — özet ("N rapordan M'si tamamlandı"), eksik rapor
 *   listesi (draft / hiç açılmamış, günü geçen üstte), tam matris, digest
 *   sayaçları.
 *
 * Tarihler deterministik: `Date` 2026-08-04 Salı. Hafta 2 = bu hafta.
 * `fileParallelism: false` — sıralı koşulur.
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
const WEEK2 = { id: 'ds-week-2', start: '2026-08-03', end: '2026-08-09' };
const WEEK3 = { id: 'ds-week-3', start: '2026-08-10', end: '2026-08-16' };

const CC_1 = 'ds-cc-1'; // Ders 1, Pazartesi — tamamlanacak
const CC_2 = 'ds-cc-2'; // Ders 2, Pazartesi — hiç açılmamış, günü geçmiş
const CC_3 = 'ds-cc-3'; // diğer sınıf, Cuma — hiç açılmamış

let adminToken: string;
let teacherToken: string;
let teacher2Token: string;
let doneReportId: string;

function signTokenFor(userId: string, role: Role): string {
  return signToken(
    { id: userId, role, teacher_id: null, student_id: null, guardian_id: null },
    1,
  );
}

async function login(identifier: string): Promise<string> {
  const res = await request(app)
    .post('/api/v1/auth/login')
    .send({ identifier, password: TEST_PASSWORD });
  return res.body.token as string;
}

/** Rapor oluştur → doldur → tamamla; rapor id'sini döner. */
async function completeReport(ccId: string, weekId: string): Promise<string> {
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
  const done = await request(app)
    .post(`/api/v1/teacher/reports/${id}/complete`)
    .set('Authorization', `Bearer ${teacherToken}`);
  expect(done.status).toBe(200);
  return id;
}

beforeAll(async () => {
  vi.useFakeTimers({ toFake: ['Date'], now: FAKE_NOW });
  resetDb();
  insertTestUsers();

  db.prepare(
    `INSERT INTO academic_years (id, name, start_date, end_date, is_active)
     VALUES (?, ?, ?, ?, 1)`,
  ).run('ds-year', '2026-2027', '2026-07-20', '2026-08-16');
  const insertWeek = db.prepare(
    `INSERT INTO weeks (id, academic_year_id, week_no, start_date, end_date, label)
     VALUES (?, ?, ?, ?, ?, ?)`,
  );
  insertWeek.run('ds-week-1', 'ds-year', 1, '2026-07-27', '2026-08-02', 'Hafta 1');
  insertWeek.run(WEEK2.id, 'ds-year', 2, WEEK2.start, WEEK2.end, 'Hafta 2');
  insertWeek.run(WEEK3.id, 'ds-year', 3, WEEK3.start, WEEK3.end, 'Hafta 3');

  const insertClass = db.prepare(
    `INSERT INTO classes (id, academic_year_id, name, name_normalized, deleted_at)
     VALUES (?, ?, ?, ?, NULL)`,
  );
  insertClass.run('ds-class', 'ds-year', 'Panel Sınıfı', 'panel sinifi');
  insertClass.run('ds-class-2', 'ds-year', 'Diğer Sınıf', 'diger sinif');

  // İkinci öğretmen (yetki + matris için).
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

  const insertCourse = db.prepare(
    `INSERT INTO courses (id, name, name_normalized, deleted_at) VALUES (?, ?, ?, NULL)`,
  );
  insertCourse.run('ds-course-1', 'Ders 1', 'ders 1');
  insertCourse.run('ds-course-2', 'Ders 2', 'ders 2');
  insertCourse.run('ds-course-3', 'Ders 3', 'ders 3');

  const insertCc = db.prepare(
    `INSERT INTO class_courses
       (id, class_id, course_id, teacher_id, day_of_week, lesson_time, deleted_at)
     VALUES (?, ?, ?, ?, ?, ?, NULL)`,
  );
  insertCc.run(CC_1, 'ds-class', 'ds-course-1', 'test-teacher', 1, '09:00');
  insertCc.run(CC_2, 'ds-class', 'ds-course-2', 'test-teacher', 1, '10:00'); // Pazartesi — günü geçmiş
  insertCc.run(CC_3, 'ds-class-2', 'ds-course-3', 'test-teacher-2', 5, '11:00');

  const now = new Date().toISOString();
  const insertStudent = db.prepare(
    `INSERT INTO users
       (id, full_name, full_name_normalized, username, email, password_hash, role,
        is_active, token_version, deleted_at, created_at)
     VALUES (?, ?, ?, ?, NULL, 'x', 'student', 1, 1, NULL, ?)`,
  );
  const insertStudentRec = db.prepare(
    `INSERT INTO students (id, user_id, guardian_id, deleted_at) VALUES (?, ?, ?, NULL)`,
  );
  const insertEnrollment = db.prepare(
    `INSERT INTO enrollments (id, student_id, class_id, start_date, end_date)
     VALUES (?, ?, ?, ?, NULL)`,
  );
  insertStudent.run('ds-stu-1', 'Panel Öğrenci', 'panel ogrenci', 'ds-stu-1', now);
  insertStudentRec.run('ds-stu-rec-1', 'ds-stu-1', 'test-guardian-rec');
  insertEnrollment.run('ds-enr-1', 'ds-stu-rec-1', 'ds-class', '2026-07-20');

  adminToken = await login('admin@test.local');
  teacherToken = await login('teacher@test.local');
  teacher2Token = await login('teacher2@test.local');

  doneReportId = await completeReport(CC_1, WEEK2.id);
});

afterAll(() => {
  vi.useRealTimers();
});

describe('GET /api/v1/teacher/reports/:id (salt-okunur)', () => {
  it('sahip öğretmen raporu alır (completed içerik + satırlar)', async () => {
    const res = await request(app)
      .get(`/api/v1/teacher/reports/${doneReportId}`)
      .set('Authorization', `Bearer ${teacherToken}`);
    expect(res.status).toBe(200);
    expect(res.body.report.status).toBe('completed');
    expect(res.body.report.course_name).toBe('Ders 1');
    expect(res.body.entries).toHaveLength(1);
    expect(res.body.entries[0].homework_score).toBe(7);
  });

  it('admin her raporu alır', async () => {
    const res = await request(app)
      .get(`/api/v1/teacher/reports/${doneReportId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.report.status).toBe('completed');
  });

  it('başka öğretmen 403 döner', async () => {
    const res = await request(app)
      .get(`/api/v1/teacher/reports/${doneReportId}`)
      .set('Authorization', `Bearer ${teacher2Token}`);
    expect(res.status).toBe(403);
  });

  it('veli ve öğrenci 403 döner', async () => {
    for (const [id, role] of [
      ['test-guardian', 'guardian'],
      ['test-student', 'student'],
    ] as Array<[string, Role]>) {
      const res = await request(app)
        .get(`/api/v1/teacher/reports/${doneReportId}`)
        .set('Authorization', `Bearer ${signTokenFor(id, role)}`);
      expect(res.status).toBe(403);
    }
  });

  it('olmayan rapor 404 döner', async () => {
    const res = await request(app)
      .get('/api/v1/teacher/reports/yok-rapor')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(404);
  });
});

describe('GET /api/v1/admin/dashboard (spec §5.5)', () => {
  it('özet + eksik listesi + matris + digest sayaçları döner', async () => {
    const res = await request(app)
      .get(`/api/v1/admin/dashboard?week_id=${WEEK2.id}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);

    // Başlamış hafta: eksik sayımı normal çalışır.
    expect(res.body.week_not_started).toBe(false);
    // Özet: 3 atamadan 1'i tamamlandı.
    expect(res.body.summary).toEqual({ total: 3, completed: 1 });

    // Eksikler: CC_2 (hiç açılmamış) + CC_3 (hiç açılmamış). CC_1 düşer.
    const missing = res.body.missing as Array<{
      class_course_id: string;
      status: string;
      is_overdue: boolean;
    }>;
    expect(missing).toHaveLength(2);
    expect(missing.map((m) => m.class_course_id).sort()).toEqual([CC_2, CC_3].sort());
    expect(missing.every((m) => m.status === 'not_started')).toBe(true);
    // CC_2 Pazartesi (bugün 08-04'te geçti) → overdue; CC_3 Cuma → değil.
    const cc2 = missing.find((m) => m.class_course_id === CC_2)!;
    const cc3 = missing.find((m) => m.class_course_id === CC_3)!;
    expect(cc2.is_overdue).toBe(true);
    expect(cc3.is_overdue).toBe(false);
    // Günü geçenler üstte.
    expect(missing[0].is_overdue).toBe(true);

    // Matris: 2 sınıf; Panel Sınıfı'nda 2 ders, Diğer'de 1.
    const matrix = res.body.matrix as Array<{ class_id: string; courses: unknown[] }>;
    expect(matrix).toHaveLength(2);
    const panel = matrix.find((m) => m.class_id === 'ds-class')!;
    expect(panel.courses).toHaveLength(2);

    // Digest: CC_1 tamamlandı → 1 pending.
    expect(res.body.digests).toEqual({ pending: 1, ready: 0, sent: 0 });
  });

  it('veli/öğrenci dashboard erişemez (adminOnly router)', async () => {
    const res = await request(app)
      .get(`/api/v1/admin/dashboard?week_id=${WEEK2.id}`)
      .set('Authorization', `Bearer ${signTokenFor('test-student', 'student')}`);
    expect(res.status).toBe(403);
  });

  it('henüz başlamamış hafta istendiğinde eksik saymaz (week_not_started)', async () => {
    // WEEK3 (2026-08-10) bugünden (2026-08-04) sonra başlar.
    const res = await request(app)
      .get(`/api/v1/admin/dashboard?week_id=${WEEK3.id}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.week.id).toBe(WEEK3.id);
    expect(res.body.week_not_started).toBe(true);
    expect(res.body.summary).toEqual({ total: 0, completed: 0 });
    expect(res.body.missing).toEqual([]);
  });

  it('başlamamış hafta için missing ucu boş döner', async () => {
    const res = await request(app)
      .get(`/api/v1/admin/dashboard/missing?week_id=${WEEK3.id}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(0);
    expect(res.body.items).toEqual([]);
  });
});

describe('GET /api/v1/teacher/reports (sayfalama)', () => {
  it('pageSize/page ile sayfalar; total + sayfa meta döner', async () => {
    const res = await request(app)
      .get('/api/v1/teacher/reports?pageSize=1&page=1')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.total).toBe(1);
    expect(res.body.page).toBe(1);
    expect(res.body.pageSize).toBe(1);

    // Sayfa sınırı dışında boş liste ama total korunur.
    const beyond = await request(app)
      .get('/api/v1/teacher/reports?pageSize=1&page=2')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(beyond.body.items).toHaveLength(0);
    expect(beyond.body.total).toBe(1);
  });

  it('öğretmen yalnızca kendi raporlarını sayar', async () => {
    const res = await request(app)
      .get('/api/v1/teacher/reports?pageSize=20')
      .set('Authorization', `Bearer ${teacherToken}`);
    expect(res.body.total).toBe(1);

    // Başka öğretmenin raporu yok (test-teacher-2).
    const other = await request(app)
      .get('/api/v1/teacher/reports?pageSize=20')
      .set('Authorization', `Bearer ${teacher2Token}`);
    expect(other.body.total).toBe(0);
  });

  it('durum filtresi sayımı ve sayfalamayı etkiler', async () => {
    const completed = await request(app)
      .get('/api/v1/teacher/reports?pageSize=20&status=completed')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(completed.body.total).toBe(1);

    const draft = await request(app)
      .get('/api/v1/teacher/reports?pageSize=20&status=draft')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(draft.body.total).toBe(0);
    expect(draft.body.items).toHaveLength(0);
  });
});

describe('GET /api/v1/admin/dashboard/missing (sayfalı eksik rapor listesi)', () => {
  it('pageSize/page ile sayfalar; total doğru; günü geçen üstte', async () => {
    const res = await request(app)
      .get(`/api/v1/admin/dashboard/missing?week_id=${WEEK2.id}&pageSize=1&page=1`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.total).toBe(2);
    expect(res.body.page).toBe(1);
    expect(res.body.pageSize).toBe(1);
    // Günü geçen (CC_2, Pazartesi) ilk sayfada.
    expect(res.body.items[0].class_course_id).toBe(CC_2);
    expect(res.body.items[0].is_overdue).toBe(true);

    const page2 = await request(app)
      .get(`/api/v1/admin/dashboard/missing?week_id=${WEEK2.id}&pageSize=1&page=2`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(page2.body.items).toHaveLength(1);
    expect(page2.body.items[0].class_course_id).toBe(CC_3);
    expect(page2.body.total).toBe(2);
  });

  it('veli/öğrenci erişemez (adminOnly router)', async () => {
    const res = await request(app)
      .get(`/api/v1/admin/dashboard/missing?week_id=${WEEK2.id}`)
      .set('Authorization', `Bearer ${signTokenFor('test-student', 'student')}`);
    expect(res.status).toBe(403);
  });
});

describe('GET /api/v1/admin/dashboard/risk (riskli öğrenci listesi)', () => {
  // Kontrollü fixture: risk-class + 4 öğrenci, week 2 ve 3'te completed raporlar.
  // - r-stu-1: düşük ortalama (3/3)          → low_score
  // - r-stu-2: teslim etmeme (2 ödev de yok)  → missing_submission
  // - r-stu-3: ardışık absent (week 2 + 3)    → consecutive_absence
  // - r-stu-4: temiz (8/9 + teslimler)        → listede YOK
  beforeAll(() => {
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO classes (id, academic_year_id, name, name_normalized, deleted_at)
       VALUES (?, ?, ?, ?, NULL)`,
    ).run('risk-class', 'ds-year', 'Risk Sinif', 'risk sinif');
    db.prepare(
      `INSERT INTO courses (id, name, name_normalized, deleted_at) VALUES (?, ?, ?, NULL)`,
    ).run('risk-course', 'Risk Ders', 'risk ders');
    db.prepare(
      `INSERT INTO class_courses (id, class_id, course_id, teacher_id, day_of_week, lesson_time, deleted_at)
       VALUES (?, ?, ?, ?, ?, ?, NULL)`,
    ).run('risk-cc', 'risk-class', 'risk-course', 'test-teacher', 1, '09:00');

    const insU = db.prepare(
      `INSERT INTO users
         (id, full_name, full_name_normalized, username, email, password_hash, role,
          is_active, token_version, deleted_at, created_at)
       VALUES (?, ?, ?, ?, NULL, 'x', 'student', 1, 1, NULL, ?)`,
    );
    const insS = db.prepare(
      `INSERT INTO students (id, user_id, guardian_id, deleted_at) VALUES (?, ?, NULL, NULL)`,
    );
    const insE = db.prepare(
      `INSERT INTO enrollments (id, student_id, class_id, start_date, end_date)
       VALUES (?, ?, ?, ?, NULL)`,
    );
    const names = ['r-stu-1', 'r-stu-2', 'r-stu-3', 'r-stu-4'];
    names.forEach((s, i) => {
      insU.run(s, `Risk Ogrenci ${i + 1}`, `risk ogrenci ${i + 1}`, `r-ogrenci-${i + 1}`, now);
      insS.run(`${s}-rec`, s);
      insE.run(`${s}-enr`, `${s}-rec`, 'risk-class', '2026-07-20');
    });

    const insRep = db.prepare(
      `INSERT INTO reports
         (id, class_course_id, week_id, topic_covered, prev_homework_id,
          prev_homework_text, status, completed_at, created_by, updated_at)
       VALUES (?, ?, ?, NULL, NULL, NULL, 'completed', ?, ?, ?)`,
    );
    const insHw = db.prepare(
      `INSERT INTO homeworks (id, report_id, class_course_id, week_id, description, attachments, due_date)
       VALUES (?, ?, ?, ?, ?, NULL, ?)`,
    );
    const insEntry = db.prepare(
      `INSERT INTO report_entries
         (id, report_id, student_id, attendance, homework_score, interest_score, teacher_note)
       VALUES (?, ?, ?, ?, ?, ?, NULL)`,
    );
    for (const wnum of [2, 3]) {
      const weekId = `ds-week-${wnum}`;
      const repId = `risk-rep-${wnum}`;
      insRep.run(repId, 'risk-cc', weekId, now, 'test-teacher', now);
      insHw.run(`risk-hw-${wnum}`, repId, 'risk-cc', weekId, `Odev ${wnum}`, `2026-08-1${wnum}`);
      insEntry.run(`risk-e1-${wnum}`, repId, 'r-stu-1-rec', 'present', 3, 3);
      insEntry.run(`risk-e2-${wnum}`, repId, 'r-stu-2-rec', 'present', 7, 8);
      insEntry.run(`risk-e3-${wnum}`, repId, 'r-stu-3-rec', 'absent', null, null);
      insEntry.run(`risk-e4-${wnum}`, repId, 'r-stu-4-rec', 'present', 8, 9);
    }

    const insSub = db.prepare(
      `INSERT INTO submissions
         (id, homework_id, student_id, note, submitted_at, is_late, status, reviewed_by, reviewed_at, files_purged_at)
       VALUES (?, ?, ?, NULL, ?, 0, 'submitted', NULL, NULL, NULL)`,
    );
    for (const wnum of [2, 3]) {
      for (const s of ['r-stu-1-rec', 'r-stu-3-rec', 'r-stu-4-rec']) {
        insSub.run(`risk-sub-${wnum}-${s}`, `risk-hw-${wnum}`, s, '2026-08-12T10:00:00.000Z');
      }
    }
  });

  it('üç kriteri OR olarak değerlendirir; risk_flags ayrı ayrı; temiz öğrenci listede yok', async () => {
    const res = await request(app)
      .get('/api/v1/admin/dashboard/risk')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.weeks).toHaveLength(3);

    const items = res.body.items as Array<{
      student_id: string;
      risk_flags: string[];
      missing_submission_count: number;
      avg_score: number | null;
    }>;
    const byId = Object.fromEntries(items.map((i) => [i.student_id, i]));

    expect(byId['r-stu-4-rec']).toBeUndefined();
    expect(byId['r-stu-1-rec'].risk_flags).toEqual(['low_score']);
    expect(byId['r-stu-1-rec'].avg_score).toBe(3);
    expect(byId['r-stu-2-rec'].risk_flags).toEqual(['missing_submission']);
    expect(byId['r-stu-2-rec'].missing_submission_count).toBe(2);
    expect(byId['r-stu-3-rec'].risk_flags).toEqual(['consecutive_absence']);
  });

  it('öğretmen rolü 403 döner', async () => {
    const res = await request(app)
      .get('/api/v1/admin/dashboard/risk')
      .set('Authorization', `Bearer ${teacherToken}`);
    expect(res.status).toBe(403);
  });
});

describe('GET /api/v1/admin/dashboard — aktif yılda başlamış hafta yok (fallback)', () => {
  // `currentDigestWeek()` başlamış hafta bulamazsa en erken (gelecek) haftaya
  // düşer. Bu haftanın tüm atamaları doldurulmamış olsa da "eksik" sayılmamalı
  // (spec §5.1/§5.5). Aktif yılı geçici olarak tamamen gelecekte olan bir yıla
  // çevirip gerçek fallback yolunu test ediyoruz; sonra geri alıyoruz.
  const FUTURE_YEAR_ID = 'ds-year-future';
  const FUTURE_WEEK_ID = 'ds-week-future';

  beforeAll(() => {
    db.prepare(
      `INSERT INTO academic_years (id, name, start_date, end_date, is_active)
       VALUES (?, '2027-2028', '2027-09-01', '2028-06-30', 0)`,
    ).run(FUTURE_YEAR_ID);
    db.prepare(
      `INSERT INTO weeks (id, academic_year_id, week_no, start_date, end_date, label)
       VALUES (?, ?, 1, '2027-09-06', '2027-09-12', 'Gelecek Hafta 1')`,
    ).run(FUTURE_WEEK_ID, FUTURE_YEAR_ID);
    db.prepare(`UPDATE academic_years SET is_active = 0 WHERE id = 'ds-year'`).run();
    db.prepare(`UPDATE academic_years SET is_active = 1 WHERE id = ?`).run(FUTURE_YEAR_ID);
  });

  afterAll(() => {
    db.prepare(`UPDATE academic_years SET is_active = 0 WHERE id = ?`).run(FUTURE_YEAR_ID);
    db.prepare(`UPDATE academic_years SET is_active = 1 WHERE id = 'ds-year'`).run();
  });

  it('gelecek haftaya düşer ama eksik listesi boş + summary 0/0 olur', async () => {
    const res = await request(app)
      .get('/api/v1/admin/dashboard')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.week.id).toBe(FUTURE_WEEK_ID);
    expect(res.body.week_not_started).toBe(true);
    expect(res.body.summary).toEqual({ total: 0, completed: 0 });
    expect(res.body.missing).toEqual([]);
  });

  it('dashboard/missing de boş döner (savunma katmanı)', async () => {
    const res = await request(app)
      .get('/api/v1/admin/dashboard/missing')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(0);
    expect(res.body.items).toEqual([]);
  });
});

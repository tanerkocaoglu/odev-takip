/**
 * Enrollment başlangıç haftası — tekil öğrenci oluşturma + CSV toplu içe
 * aktarma (spec.md §3.1 / §5.6).
 *
 * Öğrenci "bugün"den değil, admin'in seçtiği haftanın `start_date`'inden
 * başlar; seçim yoksa aktif haftanın başlangıcı; bitmiş hafta **seçilemez**.
 * Bugün 2026-10-05 (Pazartesi) sabitlenir; aktif hafta 03–09 Ekim'dir.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { createApp } from './app.js';
import { db } from './db/index.js';
import { normalizeTurkish } from './utils/text.js';
import { resetDb, insertTestUsers, TEST_PASSWORD } from './test/helpers.js';
import { clearRateLimits } from './middleware/rateLimit.js';

const app = createApp();

const FAKE_NOW = new Date('2026-10-05T10:00:00');
const ACTIVE_WEEK_START = '2026-10-03'; // aktif hafta (bugünü kapsar)
const FUTURE_WEEK_START = '2026-10-10';

let adminToken: string;
let guardianId: string;
let classId: string;

function studentStartDate(userId: string): string {
  const row = db
    .prepare(`SELECT start_date FROM enrollments WHERE student_id = ?`)
    .get(
      (db.prepare(`SELECT id FROM students WHERE user_id = ?`).get(userId) as {
        id: string;
      }).id,
    ) as { start_date: string };
  return row.start_date;
}

function importReq(csvText: string, weekId: string | undefined, dryRun = false) {
  const req = request(app)
    .post(`/api/v1/admin/students/import?dry_run=${dryRun}`)
    .set('Authorization', `Bearer ${adminToken}`)
    .field('password', TEST_PASSWORD);
  if (weekId) req.field('week_id', weekId);
  return req.attach('file', Buffer.from(csvText, 'utf8'), {
    filename: 'ogrenciler.csv',
    contentType: 'text/csv',
  });
}

const CSV_HEADER =
  'ogrenci_adi,dershane_sinifi,veli_adi,veli_whatsapp,okul_adi,sinif_seviyesi';

beforeAll(async () => {
  vi.useFakeTimers({ toFake: ['Date'], now: FAKE_NOW });
  resetDb();
  insertTestUsers();

  db.prepare(
    `INSERT INTO academic_years (id, name, start_date, end_date, is_active)
     VALUES ('y1', '2026-2027', '2026-09-01', '2027-06-30', 1)`,
  ).run();
  db.prepare(
    `INSERT INTO academic_years (id, name, start_date, end_date, is_active)
     VALUES ('y2', '2027-2028', '2027-09-01', '2028-06-30', 0)`,
  ).run();

  const insertWeek = db.prepare(
    `INSERT INTO weeks (id, academic_year_id, week_no, start_date, end_date, label)
     VALUES (?, ?, ?, ?, ?, ?)`,
  );
  insertWeek.run('w-past', 'y1', 1, '2026-09-19', '2026-09-25', '19.09 - 25.09.2026');
  insertWeek.run('w-current', 'y1', 2, '2026-10-03', '2026-10-09', '03.10 - 09.10.2026');
  insertWeek.run('w-future', 'y1', 3, '2026-10-10', '2026-10-16', '10.10 - 16.10.2026');
  insertWeek.run('w-other-year', 'y2', 1, '2027-09-04', '2027-09-10', '04.09 - 10.09.2027');

  db.prepare(
    `INSERT INTO classes (id, academic_year_id, name, name_normalized, deleted_at)
     VALUES ('c-1', 'y1', 'ÖKLİD', ?, NULL)`,
  ).run(normalizeTurkish('ÖKLİD'));
  db.prepare(
    `INSERT INTO classes (id, academic_year_id, name, name_normalized, deleted_at)
     VALUES ('c-other', 'y2', 'PİSAGOR', ?, NULL)`,
  ).run(normalizeTurkish('PİSAGOR'));

  const login = await request(app)
    .post('/api/v1/auth/login')
    .send({ identifier: 'admin@test.local', password: TEST_PASSWORD });
  adminToken = login.body.token as string;

  const g = await request(app)
    .post('/api/v1/admin/guardians')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ full_name: 'Veli Bir', whatsapp_phone: '+905550000001', password: TEST_PASSWORD });
  guardianId = g.body.id as string;

  classId = 'c-1';
});

afterAll(() => {
  vi.useRealTimers();
});

beforeEach(() => {
  clearRateLimits();
});

describe('Tekil öğrenci — başlangıç haftası', () => {
  it('seçilen gelecek haftanın start_date’ini yazar', async () => {
    const res = await request(app)
      .post('/api/v1/admin/students')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        full_name: 'Gelecek Hafta Öğrenci',
        guardian_id: guardianId,
        class_id: classId,
        password: TEST_PASSWORD,
        week_id: 'w-future',
      });
    expect(res.status).toBe(201);
    expect(studentStartDate(res.body.id as string)).toBe(FUTURE_WEEK_START);
  });

  it('hafta verilmezse aktif haftanın başlangıcını (bugün değil) yazar', async () => {
    const res = await request(app)
      .post('/api/v1/admin/students')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        full_name: 'Varsayılan Hafta Öğrenci',
        guardian_id: guardianId,
        class_id: classId,
        password: TEST_PASSWORD,
      });
    expect(res.status).toBe(201);
    const start = studentStartDate(res.body.id as string);
    expect(start).toBe(ACTIVE_WEEK_START);
    expect(start).not.toBe('2026-10-05'); // bugün değil
  });

  it('bitmiş hafta seçilirse 400; kayıt oluşmaz', async () => {
    const before = (
      db.prepare(`SELECT COUNT(*) AS c FROM students`).get() as { c: number }
    ).c;
    const res = await request(app)
      .post('/api/v1/admin/students')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        full_name: 'Geçmiş Hafta Öğrenci',
        guardian_id: guardianId,
        class_id: classId,
        password: TEST_PASSWORD,
        week_id: 'w-past',
      });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.fields.week_id).toBeDefined();
    const after = (
      db.prepare(`SELECT COUNT(*) AS c FROM students`).get() as { c: number }
    ).c;
    expect(after).toBe(before);
  });

  it('başka eğitim yılına ait hafta seçilirse 400', async () => {
    const res = await request(app)
      .post('/api/v1/admin/students')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        full_name: 'Yanlış Yıl Öğrenci',
        guardian_id: guardianId,
        class_id: classId,
        password: TEST_PASSWORD,
        week_id: 'w-other-year',
      });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});

describe('CSV toplu içe aktarma — başlangıç haftası', () => {
  it('tüm grup seçilen gelecek haftadan başlar', async () => {
    const csv = [
      CSV_HEADER,
      'CSV Öğrenci A,ÖKLİD,Veli Bir,+90 555 000 00 01,,',
      'CSV Öğrenci B,ÖKLİD,Veli Bir,+90 555 000 00 01,,',
    ].join('\r\n');
    const res = await importReq(csv, 'w-future');
    expect(res.status).toBe(201);
    expect(res.body.committed).toBe(true);

    const starts = db
      .prepare(
        `SELECT e.start_date FROM enrollments e
         JOIN students s ON s.id = e.student_id
         JOIN users u ON u.id = s.user_id
         WHERE u.full_name LIKE 'CSV Öğrenci%'`,
      )
      .all() as Array<{ start_date: string }>;
    expect(starts).toHaveLength(2);
    expect(starts.every((r) => r.start_date === FUTURE_WEEK_START)).toBe(true);
  });

  it('hafta verilmezse aktif haftanın başlangıcından başlar', async () => {
    const csv = [CSV_HEADER, 'CSV Varsayılan,ÖKLİD,Veli Bir,+90 555 000 00 01,,'].join('\r\n');
    const res = await importReq(csv, undefined);
    expect(res.status).toBe(201);
    const row = db
      .prepare(
        `SELECT e.start_date FROM enrollments e
         JOIN students s ON s.id = e.student_id
         JOIN users u ON u.id = s.user_id
         WHERE u.full_name = 'CSV Varsayılan'`,
      )
      .get() as { start_date: string };
    expect(row.start_date).toBe(ACTIVE_WEEK_START);
  });

  it('bitmiş hafta ile commit 400 döner, hiçbir kayıt yazılmaz', async () => {
    const before = (
      db.prepare(`SELECT COUNT(*) AS c FROM users`).get() as { c: number }
    ).c;
    const csv = [CSV_HEADER, 'CSV Geçmiş,ÖKLİD,Veli Bir,+90 555 000 00 01,,'].join('\r\n');
    const res = await importReq(csv, 'w-past');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    const after = (
      db.prepare(`SELECT COUNT(*) AS c FROM users`).get() as { c: number }
    ).c;
    expect(after).toBe(before);
  });

  it('bitmiş hafta önizlemede (dry_run) de reddedilir', async () => {
    const csv = [CSV_HEADER, 'CSV Önizleme,ÖKLİD,Veli Bir,+90 555 000 00 01,,'].join('\r\n');
    const res = await importReq(csv, 'w-past', true);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});

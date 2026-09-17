/**
 * `GET /api/v1/files/:key` — R2 sürücüsü davranışı.
 *
 * `submission_files.storage = 'r2'` olan nesnede rota 302 ile imzalı URL'e
 * yönlendirmeli (proxy/stream değil); yetki kontrolü yine uygulanır.
 * `presignedGetUrl` mock'lanır (ağ yok); yerel sürücü davranışı ayrı testlerde.
 */

import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import request from 'supertest';

const mocks = vi.hoisted(() => ({
  presignedGetUrl: vi.fn(
    async (_key: string, _mime?: string) => 'https://r2.example/signed?X-Amz-Signature=abc',
  ),
}));

vi.mock('./services/storage.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./services/storage.js')>();
  return { ...actual, presignedGetUrl: mocks.presignedGetUrl };
});

import { createApp } from './app.js';
import { db } from './db/index.js';
import { resetDb, insertTestUsers } from './test/helpers.js';
import { signToken } from './utils/token.js';

const app = createApp();

const R2_KEY = '1700000000000-aaaaaaaaaaaaaaaa.jpg';
const R2_THUMB = '1700000000002-cccccccccccccccc.jpg';
const LOCAL_KEY = '1700000000001-bbbbbbbbbbbbbbbb.jpg';

function studentAuth(): { Authorization: string } {
  const token = signToken(
    {
      id: 'test-student',
      role: 'student',
      teacher_id: null,
      student_id: 'test-student-rec',
      guardian_id: null,
    },
    1,
  );
  return { Authorization: `Bearer ${token}` };
}

beforeAll(() => {
  resetDb();
  insertTestUsers();

  db.prepare(
    `INSERT INTO academic_years (id, name, start_date, end_date, is_active)
     VALUES ('fr-year', '2026-2027', '2026-09-01', '2027-06-30', 1)`,
  ).run();
  db.prepare(
    `INSERT INTO weeks (id, academic_year_id, week_no, start_date, end_date, label)
     VALUES ('fr-week', 'fr-year', 1, '2026-09-07', '2026-09-13', '07.09 - 13.09.2026')`,
  ).run();
  db.prepare(
    `INSERT INTO classes (id, academic_year_id, name, name_normalized, deleted_at)
     VALUES ('fr-class', 'fr-year', 'FR Sınıf', 'fr sinif', NULL)`,
  ).run();
  db.prepare(
    `INSERT INTO courses (id, name, name_normalized, deleted_at)
     VALUES ('fr-course', 'FR Ders', 'fr ders', NULL)`,
  ).run();
  db.prepare(
    `INSERT INTO class_courses (id, class_id, course_id, teacher_id, day_of_week, lesson_time, deleted_at)
     VALUES ('fr-cc', 'fr-class', 'fr-course', 'test-teacher', 1, '09:00', NULL)`,
  ).run();
  db.prepare(
    `INSERT INTO reports (id, class_course_id, week_id, topic_covered, status, completed_at, created_by, updated_at)
     VALUES ('fr-report', 'fr-cc', 'fr-week', 'Konu', 'completed', '2026-09-13T10:00:00.000Z', 'test-teacher', '2026-09-13T10:00:00.000Z')`,
  ).run();
  db.prepare(
    `INSERT INTO homeworks (id, report_id, class_course_id, week_id, description, due_date)
     VALUES ('fr-hw', 'fr-report', 'fr-cc', 'fr-week', 'Ödev', '2026-09-14')`,
  ).run();
  db.prepare(
    `INSERT INTO submissions (id, homework_id, student_id, note, submitted_at, is_late, status)
     VALUES ('fr-sub', 'fr-hw', 'test-student-rec', NULL, '2026-09-13T10:00:00.000Z', 0, 'submitted')`,
  ).run();

  const ins = db.prepare(
    `INSERT INTO submission_files
       (id, submission_id, key, filename, size, mime, ext, thumb_key, storage)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  ins.run('fr-sf-r2', 'fr-sub', R2_KEY, 'foto.jpg', 100, 'image/jpeg', 'jpg', R2_THUMB, 'r2');
  ins.run('fr-sf-local', 'fr-sub', LOCAL_KEY, 'ozet.jpg', 50, 'image/jpeg', 'jpg', null, 'local');
});

beforeEach(() => {
  mocks.presignedGetUrl.mockClear();
});

describe('GET /api/v1/files/:key — R2 sürücüsü', () => {
  it('r2 nesnesinde 302 ile imzalı URL\'e yönlendirir', async () => {
    const res = await request(app).get(`/api/v1/files/${R2_KEY}`).set(studentAuth());
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('https://r2.example/signed?X-Amz-Signature=abc');
    expect(mocks.presignedGetUrl).toHaveBeenCalledWith(R2_KEY, 'image/jpeg');
  });

  it('thumb isteğinde thumb_key için imzalı URL üretir', async () => {
    const res = await request(app).get(`/api/v1/files/${R2_KEY}/thumb`).set(studentAuth());
    expect(res.status).toBe(302);
    expect(mocks.presignedGetUrl).toHaveBeenCalledWith(R2_THUMB, 'image/jpeg');
  });

  it('yerel nesnede disk yolunu kullanır (302 değil); dosya yoksa 404', async () => {
    const res = await request(app).get(`/api/v1/files/${LOCAL_KEY}`).set(studentAuth());
    expect(res.status).toBe(404);
    expect(mocks.presignedGetUrl).not.toHaveBeenCalled();
  });
});

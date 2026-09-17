/**
 * R2 uçtan uca duman testi — `npm run r2-smoke`.
 *
 * GERÇEK Cloudflare R2 kimlik bilgileriyle çalışır (ağ erişimi gerekir).
 * `STORAGE_DRIVER=r2` + `R2_*` env'leri set edilmiş olmalıdır. Üretim
 * veritabanına **dokunmaz**: geçici bir DB kopyası kullanır.
 *
 * Kanıtladığı zincir:
 *  1) `saveUpload` nesneyi gerçekten R2'ye yazar (`storage='r2'`).
 *  2) `GET /api/v1/files/:key` yetkili istekte **302** ile imzalı URL'e
 *     yönlendirir; imzalı URL nesneyi **200** döner.
 *  3) `/thumb` da 302 verir.
 *  4) `DeleteObject` sonrası imzalı URL erişilemez (403/404).
 *
 * Kullanım (Render Shell / yerel):
 *   cd backend
 *   npm run r2-smoke
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadEnv } from '../src/utils/env.js';

loadEnv();

const results: boolean[] = [];
function check(name: string, cond: boolean, detail?: string): void {
  results.push(cond);
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? '  → ' + detail : ''}`);
}

async function main(): Promise<void> {
  const driver = (process.env.STORAGE_DRIVER ?? 'local').toLowerCase();
  if (driver !== 'r2') {
    throw new Error(
      `STORAGE_DRIVER=r2 olmalı (şu an: ${driver}). R2_* env'lerini set edin.`,
    );
  }

  // İzole geçici DB — üretim verisine dokunulmaz.
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'r2-smoke-'));
  process.env.DB_PATH = path.join(tmp, 'app.db');

  const sharp = (await import('sharp')).default;
  const { resetDb, insertTestUsers } = await import('../src/test/helpers.js');
  const { db } = await import('../src/db/index.js');
  const { saveUpload, presignedGetUrl, deleteStored, storageDriver } = await import(
    '../src/services/storage.js'
  );
  const { createApp } = await import('../src/app.js');
  const { signToken } = await import('../src/utils/token.js');
  const request = (await import('supertest')).default;

  check('sürücü r2 olarak çözüldü', storageDriver === 'r2');

  // --- İzole DB + en küçük teslim zinciri ---
  resetDb();
  insertTestUsers();
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO academic_years (id, name, start_date, end_date, is_active)
     VALUES ('smoke-year', '2026-2027', '2026-09-01', '2027-06-30', 1)`,
  ).run();
  db.prepare(
    `INSERT INTO weeks (id, academic_year_id, week_no, start_date, end_date, label)
     VALUES ('smoke-week', 'smoke-year', 1, '2026-09-07', '2026-09-13', '07.09 - 13.09.2026')`,
  ).run();
  db.prepare(
    `INSERT INTO classes (id, academic_year_id, name, name_normalized, deleted_at)
     VALUES ('smoke-class', 'smoke-year', 'Smoke Sınıf', 'smoke sinif', NULL)`,
  ).run();
  db.prepare(
    `INSERT INTO courses (id, name, name_normalized, deleted_at)
     VALUES ('smoke-course', 'Smoke Ders', 'smoke ders', NULL)`,
  ).run();
  db.prepare(
    `INSERT INTO class_courses (id, class_id, course_id, teacher_id, day_of_week, lesson_time, deleted_at)
     VALUES ('smoke-cc', 'smoke-class', 'smoke-course', 'test-teacher', 1, '09:00', NULL)`,
  ).run();
  db.prepare(
    `INSERT INTO reports (id, class_course_id, week_id, topic_covered, status, completed_at, created_by, updated_at)
     VALUES ('smoke-report', 'smoke-cc', 'smoke-week', 'Konu', 'completed', ?, 'test-teacher', ?)`,
  ).run(now, now);
  db.prepare(
    `INSERT INTO homeworks (id, report_id, class_course_id, week_id, description, due_date)
     VALUES ('smoke-hw', 'smoke-report', 'smoke-cc', 'smoke-week', 'Ödev', '2026-09-14')`,
  ).run();
  db.prepare(
    `INSERT INTO submissions (id, homework_id, student_id, note, submitted_at, is_late, status)
     VALUES ('smoke-sub', 'smoke-hw', 'test-student-rec', NULL, ?, 0, 'submitted')`,
  ).run(now);

  // --- 1) Gerçek R2'ye yaz ---
  const jpeg = await sharp({
    create: { width: 40, height: 30, channels: 3, background: { r: 10, g: 100, b: 60 } },
  })
    .jpeg({ quality: 80 })
    .toBuffer();
  const stored = await saveUpload({
    originalname: 'smoke.jpg',
    mimetype: 'image/jpeg',
    size: jpeg.length,
    buffer: jpeg,
  });
  check('saveUpload R2 sürücüsünü raporladı', stored.storage === 'r2', `storage=${stored.storage}`);
  check('thumbnail üretildi', stored.thumbKey !== null);
  db.prepare(
    `INSERT INTO submission_files (id, submission_id, key, filename, size, mime, ext, thumb_key, storage)
     VALUES ('smoke-sf', 'smoke-sub', ?, 'smoke.jpg', ?, 'image/jpeg', 'jpg', ?, ?)`,
  ).run(stored.key, stored.size, stored.thumbKey, stored.storage);

  // İmzalı URL nesneyi gerçekten veriyor mu? (doğrudan R2 kanıtı)
  const url = await presignedGetUrl(stored.key, 'image/jpeg');
  const direct = await fetch(url);
  check('imzalı URL doğrudan 200 dönüyor', direct.status === 200, `status=${direct.status}`);
  const bytes = Buffer.from(await direct.arrayBuffer());
  check('imzalı URL doğru nesneyi döndürüyor', bytes.length === stored.size, `${bytes.length}/${stored.size} bayt`);

  // --- 2) GET /files/:key → 302 + imzalı URL ---
  const app = createApp();
  const token = signToken(
    { id: 'test-student', role: 'student', teacher_id: null, student_id: 'test-student-rec', guardian_id: null },
    1,
  );
  const res = await request(app)
    .get(`/api/v1/files/${stored.key}`)
    .set('Authorization', `Bearer ${token}`);
  check('GET /files/:key → 302', res.status === 302, `status=${res.status}`);
  const loc = res.headers.location as string | undefined;
  check('302 location imzalı R2 URL\'i', !!loc && /^https:\/\/.+[?&]X-Amz-Signature=/.test(loc), loc ? loc.slice(0, 60) + '…' : 'yok');
  if (loc) {
    const viaRedirect = await fetch(loc);
    check('imzalı URL üzerinden nesne 200', viaRedirect.status === 200, `status=${viaRedirect.status}`);
  }
  check('X-Content-Type-Options: nosniff', res.headers['x-content-type-options'] === 'nosniff');

  // --- 3) /thumb → 302 ---
  if (stored.thumbKey) {
    const th = await request(app)
      .get(`/api/v1/files/${stored.key}/thumb`)
      .set('Authorization', `Bearer ${token}`);
    check('GET /files/:key/thumb → 302', th.status === 302, `status=${th.status}`);
  }

  // --- 4) Silme ---
  await deleteStored('r2', stored.key);
  if (stored.thumbKey) await deleteStored('r2', stored.thumbKey);
  const afterDelete = await fetch(url);
  check('silme sonrası imzalı URL artık erişilemez (403/404)', [403, 404].includes(afterDelete.status), `status=${afterDelete.status}`);

  try {
    fs.rmSync(tmp, { recursive: true, force: true });
  } catch {
    // Açık DB bağlantısı nedeniyle kilitli olabilir; sorun değil.
  }

  const failed = results.filter((r) => !r).length;
  console.log(`\nÖZET: ${results.length - failed}/${results.length} PASS`);
  process.exitCode = failed === 0 ? 0 : 1;
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});

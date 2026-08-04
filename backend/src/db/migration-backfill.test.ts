/**
 * Migration #3 backfill testi (Aşama 2b).
 *
 * Amaç: `name_normalized` kolonlarının, kolon EKLENMEDEN ÖNCE var olan
 * (eski şema) kayıtlarda da doğru doldurulduğunu kanıtlamak — "seed verisinde
 * çalışıp gerçek veride çalışmayan" senaryoyu simüle eder.
 *
 * Yöntem: #1-5 koştuktan sonra şemayı #2 durumuna geri sarar (migration
 * #3/#4/#5'in eklediği her şeyi tersine çevirir, user_version = 2), eski
 * şemayla Türkçe karakterli sınıf/ders kayıtları ekler, sonra
 * runMigrations'ı yeniden çalıştırır — #3 backfill'i bu kez GERÇEK eski veri
 * üzerinde koşar; #5 (username_login) da eski telefon şemasına uygulanır.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { db } from './index.js';
import { runMigrations } from './migrations.js';
import { resetDb } from '../test/helpers.js';

beforeAll(() => {
  resetDb();

  // ---- Şemayı #2 durumuna geri sar ----
  // Migration #3 (name_normalized) geri alınır.
  db.exec(`DROP INDEX idx_classes_name`);
  db.exec(`DROP INDEX idx_courses_name`);
  db.exec(`ALTER TABLE classes DROP COLUMN name_normalized`);
  db.exec(`ALTER TABLE courses DROP COLUMN name_normalized`);
  db.exec(
    `CREATE UNIQUE INDEX idx_classes_name
       ON classes(academic_year_id, name) WHERE deleted_at IS NULL`,
  );
  db.exec(
    `CREATE UNIQUE INDEX idx_courses_name ON courses(name) WHERE deleted_at IS NULL`,
  );
  // Migration #4 (submission_files) geri alınır — #2 çağında submissions.files
  // vardı (migration #1) ve submission_files tablosu YOKTU.
  db.exec(`DROP TABLE submission_files`);
  db.exec(`ALTER TABLE submissions ADD COLUMN files TEXT NOT NULL DEFAULT ''`);
  // Migration #5 (username_login) geri alınır — #2 çağında users.phone + idx_users_phone
  // ve otp_codes vardı; username/idx_users_username/idx_users_email YOKTU.
  db.exec(`DROP INDEX idx_users_username`);
  db.exec(`DROP INDEX idx_users_email`);
  db.exec(`ALTER TABLE users DROP COLUMN username`);
  db.exec(`ALTER TABLE users ADD COLUMN phone TEXT NOT NULL DEFAULT ''`);
  db.exec(
    `CREATE UNIQUE INDEX idx_users_phone ON users(phone) WHERE deleted_at IS NULL`,
  );
  db.exec(`
    CREATE TABLE otp_codes (
      id            TEXT PRIMARY KEY,
      user_id       TEXT NOT NULL REFERENCES users(id),
      code          TEXT NOT NULL,
      is_valid      INTEGER NOT NULL DEFAULT 1 CHECK (is_valid IN (0,1)),
      attempts      INTEGER NOT NULL DEFAULT 0,
      expires_at    TEXT NOT NULL,
      last_sent_at  TEXT NOT NULL,
      used_at       TEXT,
      created_at    TEXT NOT NULL
    ) STRICT;

    CREATE INDEX idx_otp_codes_user ON otp_codes(user_id, created_at);
  `);
  db.exec(`PRAGMA user_version = 2`);

  // ---- Eski şemayla (kolonsuz) veri ekle ----
  db.prepare(
    `INSERT INTO academic_years (id, name, start_date, end_date, is_active)
     VALUES ('backfill-year', '2026-2027', '2026-09-01', '2027-06-30', 1)`,
  ).run();
  const insertClass = db.prepare(
    `INSERT INTO classes (id, academic_year_id, name, deleted_at) VALUES (?, ?, ?, NULL)`,
  );
  insertClass.run('backfill-class-1', 'backfill-year', 'ÖKLİD');
  insertClass.run('backfill-class-2', 'backfill-year', 'PİSAGOR');
  const insertCourse = db.prepare(
    `INSERT INTO courses (id, name, deleted_at) VALUES (?, ?, NULL)`,
  );
  insertCourse.run('backfill-course-1', 'Matematik');
  insertCourse.run('backfill-course-2', 'Türkçe');
});

describe('migration #3 backfill', () => {
  it('eski kayıtların name_normalized alanını Türkçe normalizasyonla doldurur', () => {
    // #3'ü bu kez "eski veri üzerinde" koşturur.
    runMigrations();

    const classes = db
      .prepare(`SELECT name, name_normalized FROM classes WHERE id LIKE 'backfill-%' ORDER BY id`)
      .all() as Array<{ name: string; name_normalized: string }>;
    expect(classes).toEqual([
      { name: 'ÖKLİD', name_normalized: 'oklid' },
      { name: 'PİSAGOR', name_normalized: 'pisagor' },
    ]);

    const courses = db
      .prepare(`SELECT name, name_normalized FROM courses WHERE id LIKE 'backfill-%' ORDER BY id`)
      .all() as Array<{ name: string; name_normalized: string }>;
    expect(courses).toEqual([
      { name: 'Matematik', name_normalized: 'matematik' },
      { name: 'Türkçe', name_normalized: 'turkce' },
    ]);

    const version = db
      .prepare(`SELECT user_version FROM pragma_user_version`)
      .get() as { user_version: number };
    // #3 backfill + #4 (submission_files) + #5 (username_login) de koşar.
    expect(version.user_version).toBe(5);
  });

  it('yeni indeksler normalized ad üzerinde çakışmayı yakalar', () => {
    // Aynı adın farklı harf biçimi (İ vs i) artık UNIQUE ihlali üretmeli.
    expect(() =>
      db
        .prepare(
          `INSERT INTO classes (id, academic_year_id, name, name_normalized, deleted_at)
           VALUES ('backfill-class-3', 'backfill-year', 'Öklİd', 'oklid', NULL)`,
        )
        .run(),
    ).toThrow();
  });
});

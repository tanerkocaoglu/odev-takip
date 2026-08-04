/**
 * Migration #3 backfill testi (Aşama 2b).
 *
 * Amaç: `name_normalized` kolonlarının, kolon EKLENMEDEN ÖNCE var olan
 * (eski şema) kayıtlarda da doğru doldurulduğunu kanıtlamak — "seed verisinde
 * çalışıp gerçek veride çalışmayan" senaryoyu simüle eder.
 *
 * Yöntem: #1-3 koştuktan sonra şemayı #2 durumuna geri sarar (kolonları
 * düşürür, eski indeksleri kurar, user_version = 2), eski şemayla Türkçe
 * karakterli sınıf/ders kayıtları ekler, sonra runMigrations'ı yeniden
 * çalıştırır — #3 backfill'i bu kez GERÇEK eski veri üzerinde koşar.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { db } from './index.js';
import { runMigrations } from './migrations.js';
import { resetDb } from '../test/helpers.js';

beforeAll(() => {
  resetDb();

  // ---- Şemayı #2 durumuna geri sar ----
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
    expect(version.user_version).toBe(3);
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

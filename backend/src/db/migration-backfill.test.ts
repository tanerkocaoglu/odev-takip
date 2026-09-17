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

import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { db } from './index.js';
import { runMigrations } from './migrations.js';
import { resetDb, insertTestUsers } from '../test/helpers.js';

beforeAll(() => {
  // Önceki koşudan yarıda kalmış bir v8 + NULL/boş kalıntısı varsa #9'un ön
  // kontrolünü geçmesi için temizle (FK sırası: önce guardians).
  const version = (
    db.prepare('SELECT user_version FROM pragma_user_version').get() as { user_version: number }
  ).user_version;
  if (version === 8) {
    db.exec(
      `DELETE FROM guardians
        WHERE whatsapp_phone IS NULL OR whatsapp_phone = ''
           OR user_id IN (SELECT id FROM users WHERE password_hash IS NULL OR password_hash = '')`,
    );
    db.exec(`DELETE FROM users WHERE password_hash IS NULL OR password_hash = ''`);
  }

  resetDb();

  // ---- Şemayı #2 durumuna geri sar ----
  // #11 (digest class_id) geri alınır (aksi halde runMigrations yeniden
  // ADD COLUMN class_id dener ve "duplicate column" ile patlar).
  rebuildDigestsWithoutClassId();
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
  // Migration #6 (schools_grade_view) geri alınır — #2 çağında schools YOKTU,
  // students.school_id/grade_level ve weekly_digests görüntüleme kolonları da.
  db.exec(`DROP INDEX idx_schools_name`);
  db.exec(`DROP TABLE schools`);
  db.exec(`ALTER TABLE students DROP COLUMN school_id`);
  db.exec(`ALTER TABLE students DROP COLUMN grade_level`);
  db.exec(`ALTER TABLE weekly_digests DROP COLUMN first_viewed_at`);
  db.exec(`ALTER TABLE weekly_digests DROP COLUMN last_viewed_at`);
  // Migration #7 (must_change_password) geri alınır — #2 çağında kolon YOKTU.
  db.exec(`ALTER TABLE users DROP COLUMN must_change_password`);
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
    // #3 backfill + #4..#12 (submission_files, username_login, schools_grade_view,
    // must_change_password, submission_file_thumb, not_null_password_phone,
    // entry_score_check, digest_class_id, submission_file_storage) koşar.
    expect(version.user_version).toBe(12);
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

describe('migration #7 — must_change_password rewind (7↔6)', () => {
  it('kolon yokken user_version 6; yeniden koşunca default 0 ile ekler', () => {
    // Şema #8'e kadar kurulur, tablolar temizlenir.
    resetDb();

    // #7'yi geri sar: kolon YOK, sürüm 6 (eski migration turlarındaki desen).
    // #8 (thumb_key) de #7'den sonra geldiği için burada geri alınır; böylece
    // runMigrations #7 ve #8'i birlikte koşar. #11 (class_id) de geri alınır —
    // sonraki runMigrations yeniden ADD COLUMN denemesin.
    db.exec(`ALTER TABLE submission_files DROP COLUMN thumb_key`);
    db.exec(`ALTER TABLE users DROP COLUMN must_change_password`);
    rebuildDigestsWithoutClassId();
    rebuildSubmissionFilesWithoutStorage();
    db.exec(`PRAGMA user_version = 6`);

    const before = db
      .prepare(`SELECT user_version FROM pragma_user_version`)
      .get() as { user_version: number };
    expect(before.user_version).toBe(6);
    const colsBefore = (
      db.prepare(`SELECT name FROM pragma_table_info('users')`).all() as Array<{ name: string }>
    ).map((c) => c.name);
    expect(colsBefore).not.toContain('must_change_password');

    // Eski şemayla (kolonsuz) bir kullanıcı ekle.
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO users
         (id, full_name, full_name_normalized, username, email, password_hash, role,
          is_active, token_version, deleted_at, created_at)
       VALUES ('m7-user', 'Eski Ogrenci', 'eski ogrenci', 'eskiogrenci1', NULL, 'x',
               'student', 1, 1, NULL, ?)`,
    ).run(now);

    // #7 + #8 yeniden koşar → kolonlar eklenir, mevcut satır 0 alır.
    runMigrations();

    const after = db
      .prepare(`SELECT user_version FROM pragma_user_version`)
      .get() as { user_version: number };
    expect(after.user_version).toBe(12);

    const row = db
      .prepare(`SELECT must_change_password FROM users WHERE id = 'm7-user'`)
      .get() as { must_change_password: number };
    expect(row.must_change_password).toBe(0);

    const sfCols = (
      db.prepare(`SELECT name FROM pragma_table_info('submission_files')`).all() as Array<{
        name: string;
      }>
    ).map((c) => c.name);
    expect(sfCols).toContain('thumb_key');
  });
});

// ===========================================================================
// Migration #9 — `password_hash` / `whatsapp_phone` NOT NULL rewind (9↔8)
// ===========================================================================

/**
 * Şemayı #9 öncesine (iki alan nullable) geri sarar; veri korunur. Runner'daki
 * `foreignKeysOff` ile aynı desen: pragma BEGIN'den önce kapatılır.
 */
function revertNotnullToV8(): void {
  const fk = db.prepare('PRAGMA foreign_keys').get() as { foreign_keys: number };
  const wasOn = fk.foreign_keys === 1;
  if (wasOn) db.exec('PRAGMA foreign_keys = OFF');
  db.exec('BEGIN');
  try {
    db.exec(`
      CREATE TABLE users_old (
        id                   TEXT PRIMARY KEY,
        full_name            TEXT NOT NULL,
        full_name_normalized TEXT NOT NULL,
        email                TEXT,
        password_hash        TEXT,
        role                 TEXT NOT NULL CHECK (role IN ('admin','teacher','guardian','student')),
        is_active            INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
        token_version        INTEGER NOT NULL DEFAULT 1,
        deleted_at           TEXT,
        created_at           TEXT NOT NULL,
        username             TEXT,
        must_change_password INTEGER NOT NULL DEFAULT 0 CHECK (must_change_password IN (0,1))
      ) STRICT;
    `);
    db.exec(`INSERT INTO users_old SELECT * FROM users`);
    db.exec(`DROP TABLE users`);
    db.exec(`ALTER TABLE users_old RENAME TO users`);
    db.exec(`CREATE UNIQUE INDEX idx_users_username ON users(username) WHERE deleted_at IS NULL`);
    db.exec(
      `CREATE UNIQUE INDEX idx_users_email ON users(email) WHERE deleted_at IS NULL AND email IS NOT NULL`,
    );
    db.exec(`CREATE INDEX idx_users_normalized ON users(full_name_normalized)`);

    db.exec(`
      CREATE TABLE guardians_old (
        id              TEXT PRIMARY KEY,
        user_id         TEXT NOT NULL REFERENCES users(id),
        whatsapp_phone  TEXT,
        phone_secondary TEXT,
        consent_at      TEXT,
        deleted_at      TEXT
      ) STRICT;
    `);
    db.exec(`INSERT INTO guardians_old SELECT * FROM guardians`);
    db.exec(`DROP TABLE guardians`);
    db.exec(`ALTER TABLE guardians_old RENAME TO guardians`);
    db.exec(`CREATE UNIQUE INDEX idx_guardians_user ON guardians(user_id) WHERE deleted_at IS NULL`);
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  } finally {
    if (wasOn) db.exec('PRAGMA foreign_keys = ON');
  }
  rebuildDigestsWithoutClassId();
  rebuildSubmissionFilesWithoutStorage();
  db.exec('PRAGMA user_version = 8');
}

/** `PRAGMA table_info` içinden tek kolonu döner. */
function columnInfo(table: string, name: string): { name: string; notnull: number } {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{
    name: string;
    notnull: number;
  }>;
  const col = cols.find((c) => c.name === name);
  if (!col) throw new Error(`kolon bulunamadi: ${table}.${name}`);
  return col;
}

function userVersion(): number {
  return (db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version;
}

const INSERT_USER = `INSERT INTO users
  (id, full_name, full_name_normalized, username, email, password_hash, role,
   is_active, token_version, deleted_at, created_at)
  VALUES (?, ?, ?, ?, NULL, ?, ?, 1, 1, NULL, ?)`;

describe('migration #9 — password_hash / whatsapp_phone NOT NULL rewind (9↔8)', () => {
  // Test 2/3 bilerek v8 + NULL/boş bırakır; sonraki testin `resetDb()`'i #9'u
  // koşabilmesi için bu veriyi temizleyip şemayı ileri sarar.
  afterEach(() => {
    db.exec(`DELETE FROM guardians WHERE id LIKE 'm9-%'`);
    db.exec(`DELETE FROM users WHERE id LIKE 'm9-%'`);
    if (userVersion() === 8) runMigrations();
  });

  it('nullable #8 şemasından koşunca veriyi korur, NOT NULL + boş string CHECK uygular', () => {
    resetDb();
    revertNotnullToV8();
    const now = new Date().toISOString();
    db.prepare(INSERT_USER).run('m9-student', 'M9 Ogrenci', 'm9 ogrenci', 'm9ogrenci1', 'hash-m9', 'student', now);
    db.prepare(INSERT_USER).run('m9-guardian', 'M9 Veli', 'm9 veli', 'm9veli1', 'hash-g9', 'guardian', now);
    db.prepare(
      `INSERT INTO guardians (id, user_id, whatsapp_phone, phone_secondary, consent_at, deleted_at)
       VALUES ('m9-grec', 'm9-guardian', '+905550000009', NULL, NULL, NULL)`,
    ).run();

    expect(userVersion()).toBe(8);
    expect(columnInfo('users', 'password_hash').notnull).toBe(0);
    expect(columnInfo('guardians', 'whatsapp_phone').notnull).toBe(0);

    runMigrations();

    expect(userVersion()).toBe(12);
    expect(columnInfo('users', 'password_hash').notnull).toBe(1);
    expect(columnInfo('guardians', 'whatsapp_phone').notnull).toBe(1);
    expect(db.prepare(`SELECT password_hash FROM users WHERE id = 'm9-student'`).get()).toEqual({
      password_hash: 'hash-m9',
    });
    expect(
      db.prepare(`SELECT whatsapp_phone FROM guardians WHERE id = 'm9-grec'`).get(),
    ).toEqual({ whatsapp_phone: '+905550000009' });

    const indexes = (
      db
        .prepare(
          `SELECT name FROM sqlite_master WHERE type='index'
             AND tbl_name IN ('users','guardians') AND sql IS NOT NULL`,
        )
        .all() as Array<{ name: string }>
    )
      .map((r) => r.name)
      .sort();
    expect(indexes).toEqual([
      'idx_guardians_user',
      'idx_users_email',
      'idx_users_normalized',
      'idx_users_username',
    ]);
    expect((db.prepare('PRAGMA foreign_key_check').all() as unknown[]).length).toBe(0);

    // DB seviyesinde zorlama: NULL ve boş string reddedilir.
    expect(() =>
      db
        .prepare(INSERT_USER)
        .run('m9-null', 'N', 'n', 'n1', null, 'student', now),
    ).toThrow();
    expect(() =>
      db.prepare(INSERT_USER).run('m9-empty', 'E', 'e', 'e1', '', 'student', now),
    ).toThrow();
    expect(() =>
      db
        .prepare(
          `INSERT INTO guardians (id, user_id, whatsapp_phone) VALUES ('m9-emptyg','m9-guardian','')`,
        )
        .run(),
    ).toThrow();
  });

  it('NULL varsa fail-fast: hiçbir şey yazılmaz, sürüm 8 kalır', () => {
    resetDb();
    revertNotnullToV8();
    const now = new Date().toISOString();
    db.prepare(INSERT_USER).run('m9-nulluser', 'Null User', 'null user', 'nulluser1', null, 'student', now);

    expect(() => runMigrations()).toThrow();
    expect(userVersion()).toBe(8);
    expect(columnInfo('users', 'password_hash').notnull).toBe(0);
    expect(
      db.prepare(`SELECT password_hash FROM users WHERE id = 'm9-nulluser'`).get(),
    ).toEqual({ password_hash: null });
  });

  it('sonraki adımda hata olursa TÜM migration rollback olur (users rebuild dahil)', () => {
    resetDb();
    revertNotnullToV8();
    const now = new Date().toISOString();
    db.prepare(INSERT_USER).run('m9-u', 'U', 'u', 'u1', 'hash', 'guardian', now);
    // Boş string NULL değildir → ön kontrolü geçer; guardians CHECK'inde patlar.
    // users rebuild'i (drop + rename) çoktan tamamlanmış olur; rollback onu da
    // geri almalıdır.
    db.prepare(
      `INSERT INTO guardians (id, user_id, whatsapp_phone, phone_secondary, consent_at, deleted_at)
       VALUES ('m9-ge', 'm9-u', '', NULL, NULL, NULL)`,
    ).run();

    expect(() => runMigrations()).toThrow();
    expect(userVersion()).toBe(8);
    expect(columnInfo('users', 'password_hash').notnull).toBe(0);
    expect(
      db.prepare(`SELECT whatsapp_phone FROM guardians WHERE id = 'm9-ge'`).get(),
    ).toEqual({ whatsapp_phone: '' });
    const leftovers = db
      .prepare(
        `SELECT name FROM sqlite_master WHERE type='table'
           AND name IN ('users_new','guardians_new','users_old','guardians_old')`,
      )
      .all();
    expect(leftovers).toEqual([]);
  });
});

// ===========================================================================
// Migration #10 — `report_entries` puan CHECK rewind (10↔9)
// ===========================================================================

/**
 * Şemayı #10 öncesine geri sarar (eski puan CHECK'i). `withCheck = false` ile
 * tablo düzeyi kısıt hiç konmaz — yalnızca "beklenmedik eski veri" senaryosunu
 * (devamsız + `interest_score` dolu) simüle etmek için fail-fast testinde
 * kullanılır.
 */
function revertEntryCheckToV9(withCheck = true): void {
  const fk = db.prepare('PRAGMA foreign_keys').get() as { foreign_keys: number };
  const wasOn = fk.foreign_keys === 1;
  if (wasOn) db.exec('PRAGMA foreign_keys = OFF');
  db.exec('BEGIN');
  try {
    const checkClause = withCheck
      ? `,
        CHECK (
          attendance IN ('absent','excused')
            AND homework_score IS NULL AND interest_score IS NULL
          OR attendance IN ('present','late')
        )`
      : '';
    db.exec(`
      CREATE TABLE report_entries_old (
        id             TEXT PRIMARY KEY,
        report_id      TEXT NOT NULL REFERENCES reports(id),
        student_id     TEXT NOT NULL REFERENCES students(id),
        attendance     TEXT NOT NULL DEFAULT 'present'
                         CHECK (attendance IN ('present','absent','late','excused')),
        homework_score INTEGER CHECK (homework_score BETWEEN 1 AND 10),
        interest_score INTEGER CHECK (interest_score BETWEEN 1 AND 10),
        teacher_note   TEXT,
        UNIQUE (report_id, student_id)${checkClause}
      ) STRICT;
    `);
    db.exec(`INSERT INTO report_entries_old SELECT * FROM report_entries`);
    db.exec(`DROP TABLE report_entries`);
    db.exec(`ALTER TABLE report_entries_old RENAME TO report_entries`);
    db.exec(`CREATE INDEX idx_report_entries_student ON report_entries(student_id)`);
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  } finally {
    if (wasOn) db.exec('PRAGMA foreign_keys = ON');
  }
  rebuildDigestsWithoutClassId();
  rebuildSubmissionFilesWithoutStorage();
  db.exec('PRAGMA user_version = 9');
}

/** #10 testi için en küçük rapor zinciri (yıl → hafta → sınıf/ders → atama → rapor). */
function insertM10FixtureChain(): void {
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO academic_years (id, name, start_date, end_date, is_active)
     VALUES ('m10-year', '2026-2027', '2026-09-01', '2027-06-30', 1)`,
  ).run();
  db.prepare(
    `INSERT INTO weeks (id, academic_year_id, week_no, start_date, end_date, label)
     VALUES ('m10-week', 'm10-year', 1, '2026-09-07', '2026-09-13', '07.09 - 13.09.2026')`,
  ).run();
  db.prepare(
    `INSERT INTO classes (id, academic_year_id, name, name_normalized, deleted_at)
     VALUES ('m10-class', 'm10-year', 'M10 Sınıf', 'm10 sinif', NULL)`,
  ).run();
  db.prepare(
    `INSERT INTO courses (id, name, name_normalized, deleted_at)
     VALUES ('m10-course', 'M10 Ders', 'm10 ders', NULL)`,
  ).run();
  db.prepare(
    `INSERT INTO class_courses
       (id, class_id, course_id, teacher_id, day_of_week, lesson_time, deleted_at)
     VALUES ('m10-cc', 'm10-class', 'm10-course', 'test-teacher', 1, '09:00', NULL)`,
  ).run();
  db.prepare(
    `INSERT INTO reports
       (id, class_course_id, week_id, topic_covered, prev_homework_id, prev_homework_text,
        status, completed_at, created_by, updated_at)
     VALUES ('m10-report', 'm10-cc', 'm10-week', 'Konu', NULL, NULL, 'draft', NULL, 'test-admin', ?)`,
  ).run(now);
}

describe('migration #10 — report_entries puan CHECK rewind (10↔9)', () => {
  afterEach(() => {
    db.exec(`DELETE FROM report_entries WHERE id LIKE 'm10-%'`);
    // Fail-fast testinden kalan v9 varsa, anomali temizlendikten sonra ileri sar.
    if (userVersion() === 9) runMigrations();
  });

  it('v9 şemasından koşunca veriyi korur; yeni CHECK (homework serbest / interest yasak) uygular', () => {
    resetDb();
    revertEntryCheckToV9();
    insertTestUsers();
    insertM10FixtureChain();
    db.prepare(
      `INSERT INTO report_entries
         (id, report_id, student_id, attendance, homework_score, interest_score, teacher_note)
       VALUES ('m10-entry', 'm10-report', 'test-student-rec', 'present', 7, 8, NULL)`,
    ).run();

    expect(userVersion()).toBe(9);
    runMigrations();
    expect(userVersion()).toBe(12);

    // Veri korundu.
    expect(
      db
        .prepare(
          `SELECT attendance, homework_score, interest_score
             FROM report_entries WHERE id = 'm10-entry'`,
        )
        .get(),
    ).toEqual({ attendance: 'present', homework_score: 7, interest_score: 8 });

    const upd = db.prepare(
      `UPDATE report_entries SET attendance = ?, homework_score = ?, interest_score = ?
       WHERE id = 'm10-entry'`,
    );
    // Devamsız + ödev puanı → kabul; devamsız + performans puanı → red.
    upd.run('absent', 5, null);
    expect(() => upd.run('absent', 5, 6)).toThrow();
    expect((db.prepare('PRAGMA foreign_key_check').all() as unknown[]).length).toBe(0);
  });

  it('devamsız + interest_score varsa fail-fast: hiçbir şey yazılmaz, sürüm 9 kalır', () => {
    resetDb();
    revertEntryCheckToV9(false);
    insertTestUsers();
    insertM10FixtureChain();
    db.prepare(
      `INSERT INTO report_entries
         (id, report_id, student_id, attendance, homework_score, interest_score, teacher_note)
       VALUES ('m10-bad', 'm10-report', 'test-student-rec', 'excused', 4, 9, NULL)`,
    ).run();

    expect(() => runMigrations()).toThrow();
    expect(userVersion()).toBe(9);
    // Rollback hiçbir şeyi silmedi — anomali verisi yerinde.
    expect(
      db.prepare(`SELECT interest_score FROM report_entries WHERE id = 'm10-bad'`).get(),
    ).toEqual({ interest_score: 9 });
  });
});

// ===========================================================================
// Migration #11 — `weekly_digests.class_id` backfill + rewind (11↔10)
// ===========================================================================

/**
 * `weekly_digests`'ten `class_id` kolonunu (ve #11 indeksini) düşürür; diğer
 * kolonları ve veriyi korur. Tablo düzeyinde yeniden kurulur çünkü kolon
 * düşürme FK/indeks kısıtlarına takılır. #10'daki 12 adımlı desenin birebiridir.
 * `class_id` yoksa no-op. `user_version`'a dokunmaz (çağıran ayarlar).
 */
function rebuildDigestsWithoutClassId(): void {
  const cols = (
    db.prepare(`PRAGMA table_info('weekly_digests')`).all() as Array<{ name: string }>
  ).map((c) => c.name);
  if (!cols.includes('class_id')) return;

  const fk = db.prepare('PRAGMA foreign_keys').get() as { foreign_keys: number };
  const wasOn = fk.foreign_keys === 1;
  if (wasOn) db.exec('PRAGMA foreign_keys = OFF');
  db.exec('BEGIN');
  try {
    db.exec(`
      CREATE TABLE weekly_digests_old (
        id              TEXT PRIMARY KEY,
        student_id      TEXT NOT NULL REFERENCES students(id),
        week_id         TEXT NOT NULL REFERENCES weeks(id),
        guardian_id     TEXT NOT NULL REFERENCES guardians(id),
        token           TEXT NOT NULL,
        status          TEXT NOT NULL DEFAULT 'pending'
                          CHECK (status IN ('pending','ready','sent')),
        send_count      INTEGER NOT NULL DEFAULT 0,
        sent_at         TEXT,
        sent_by         TEXT REFERENCES users(id),
        snapshot        TEXT,
        is_revoked      INTEGER NOT NULL DEFAULT 0 CHECK (is_revoked IN (0,1)),
        first_viewed_at TEXT,
        last_viewed_at  TEXT,
        UNIQUE (student_id, week_id)
      ) STRICT;
    `);
    db.exec(`
      INSERT INTO weekly_digests_old
        (id, student_id, week_id, guardian_id, token, status, send_count, sent_at,
         sent_by, snapshot, is_revoked, first_viewed_at, last_viewed_at)
      SELECT id, student_id, week_id, guardian_id, token, status, send_count, sent_at,
             sent_by, snapshot, is_revoked, first_viewed_at, last_viewed_at
      FROM weekly_digests;
    `);
    db.exec(`DROP TABLE weekly_digests`);
    db.exec(`ALTER TABLE weekly_digests_old RENAME TO weekly_digests`);
    db.exec(`CREATE UNIQUE INDEX idx_digests_token ON weekly_digests(token)`);
    db.exec(`CREATE INDEX idx_digests_week ON weekly_digests(week_id, status)`);
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  } finally {
    if (wasOn) db.exec('PRAGMA foreign_keys = ON');
  }
}

/** Şemayı #11 öncesine geri sarar (class_id yok, sürüm 10). */
function revertDigestClassIdToV10(): void {
  rebuildDigestsWithoutClassId();
  rebuildSubmissionFilesWithoutStorage();
  db.exec('PRAGMA user_version = 10');
}

/**
 * `submission_files`'ten `storage` kolonunu (#12) düşürür; diğer kolonları ve
 * veriyi korur. `thumb_key` var/yok durumuna göre DDL kurulur. `user_version`'a
 * dokunmaz. `storage` yoksa no-op. (DROP COLUMN CHECK kısıtına takıldığı için
 * tablo yeniden kurulur.)
 */
function rebuildSubmissionFilesWithoutStorage(): void {
  const cols = (
    db.prepare(`PRAGMA table_info('submission_files')`).all() as Array<{ name: string }>
  ).map((c) => c.name);
  if (!cols.includes('storage')) return;

  const keep = cols.filter((c) => c !== 'storage');
  const ddl = [
    'id            TEXT PRIMARY KEY',
    'submission_id TEXT NOT NULL REFERENCES submissions(id)',
    'key           TEXT NOT NULL',
    'filename      TEXT NOT NULL',
    'size          INTEGER NOT NULL',
    'mime          TEXT NOT NULL',
    'ext           TEXT NOT NULL',
    ...(cols.includes('thumb_key') ? ['thumb_key     TEXT'] : []),
    'UNIQUE (key)',
  ].join(',\n        ');

  const fk = db.prepare('PRAGMA foreign_keys').get() as { foreign_keys: number };
  const wasOn = fk.foreign_keys === 1;
  if (wasOn) db.exec('PRAGMA foreign_keys = OFF');
  db.exec('BEGIN');
  try {
    db.exec(`CREATE TABLE submission_files_old (\n        ${ddl}\n      ) STRICT;`);
    db.exec(
      `INSERT INTO submission_files_old (${keep.join(', ')})
       SELECT ${keep.join(', ')} FROM submission_files`,
    );
    db.exec(`DROP TABLE submission_files`);
    db.exec(`ALTER TABLE submission_files_old RENAME TO submission_files`);
    db.exec(`CREATE INDEX idx_submission_files_sub ON submission_files(submission_id)`);
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  } finally {
    if (wasOn) db.exec('PRAGMA foreign_keys = ON');
  }
}

/** #11 testi için: yıl → hafta → sınıf, normal + "geç başlayan" iki öğrenci. */
function insertM11Fixture(): void {
  db.prepare(
    `INSERT INTO academic_years (id, name, start_date, end_date, is_active)
     VALUES ('m11-year', '2026-2027', '2026-09-01', '2027-06-30', 1)`,
  ).run();
  db.prepare(
    `INSERT INTO weeks (id, academic_year_id, week_no, start_date, end_date, label)
     VALUES ('m11-week', 'm11-year', 1, '2026-09-07', '2026-09-13', '07.09 - 13.09.2026')`,
  ).run();
  db.prepare(
    `INSERT INTO classes (id, academic_year_id, name, name_normalized, deleted_at)
     VALUES ('m11-class', 'm11-year', 'M11 Sınıf', 'm11 sinif', NULL)`,
  ).run();

  // Normal öğrenci: enrollment hafta başından ÖNCE → class_id çözülür.
  db.prepare(
    `INSERT INTO enrollments (id, student_id, class_id, start_date, end_date)
     VALUES ('m11-enr-1', 'test-student-rec', 'm11-class', '2026-09-01', NULL)`,
  ).run();

  // Geç başlayan öğrenci: start_date hafta başından SONRA → çözülemez (NULL).
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO users (id, full_name, full_name_normalized, username, email, password_hash,
       role, is_active, token_version, deleted_at, created_at)
     VALUES ('m11-student2', 'M11 Student2', 'm11 student2', 'm11-student2', NULL, 'x',
       'student', 1, 1, NULL, ?)`,
  ).run(now);
  db.prepare(
    `INSERT INTO students (id, user_id, guardian_id, deleted_at)
     VALUES ('m11-student-rec2', 'm11-student2', 'test-guardian-rec', NULL)`,
  ).run();
  db.prepare(
    `INSERT INTO enrollments (id, student_id, class_id, start_date, end_date)
     VALUES ('m11-enr-2', 'm11-student-rec2', 'm11-class', '2026-09-10', NULL)`,
  ).run();

  const insertDigest = db.prepare(
    `INSERT INTO weekly_digests (id, student_id, week_id, guardian_id, token, status)
     VALUES (?, ?, 'm11-week', 'test-guardian-rec', ?, 'ready')`,
  );
  insertDigest.run('m11-digest-1', 'test-student-rec', 'm11-token-normal');
  insertDigest.run('m11-digest-2', 'm11-student-rec2', 'm11-token-late');
}

describe('migration #11 — weekly_digests.class_id backfill + rewind (11↔10)', () => {
  afterEach(() => {
    db.exec(`DELETE FROM weekly_digests WHERE id LIKE 'm11-%'`);
    db.exec(`DELETE FROM enrollments WHERE id LIKE 'm11-%'`);
    db.exec(`DELETE FROM students WHERE id = 'm11-student-rec2'`);
    db.exec(`DELETE FROM users WHERE id = 'm11-student2'`);
    if (userVersion() === 10) runMigrations();
  });

  it('v10 şemasından koşunca normal satırların class_id\'sini doldurur; veriyi korur', () => {
    resetDb();
    revertDigestClassIdToV10();
    insertTestUsers();
    insertM11Fixture();

    expect(userVersion()).toBe(10);
    runMigrations();
    expect(userVersion()).toBe(12);

    const normal = db
      .prepare(`SELECT class_id, token, status FROM weekly_digests WHERE id = 'm11-digest-1'`)
      .get() as { class_id: string | null; token: string; status: string };
    expect(normal.class_id).toBe('m11-class');
    expect(normal.token).toBe('m11-token-normal');
    expect(normal.status).toBe('ready');

    // Geç başlayan öğrenci: migration bloke olmaz, NULL kalır (okuma yolu fallback).
    const late = db
      .prepare(`SELECT class_id FROM weekly_digests WHERE id = 'm11-digest-2'`)
      .get() as { class_id: string | null };
    expect(late.class_id).toBeNull();

    // FK bütünlüğü korunur.
    expect((db.prepare('PRAGMA foreign_key_check').all() as unknown[]).length).toBe(0);
  });
});

// ===========================================================================
// Migration #12 — `submission_files.storage` backfill + rewind (12↔11)
// ===========================================================================

/** #12 testi için en küçük teslim zinciri (…→ rapor → ödev → teslim → dosya). */
function insertM12Fixture(): void {
  const now = '2026-09-13T10:00:00.000Z';
  db.prepare(
    `INSERT INTO academic_years (id, name, start_date, end_date, is_active)
     VALUES ('m12-year', '2026-2027', '2026-09-01', '2027-06-30', 1)`,
  ).run();
  db.prepare(
    `INSERT INTO weeks (id, academic_year_id, week_no, start_date, end_date, label)
     VALUES ('m12-week', 'm12-year', 1, '2026-09-07', '2026-09-13', '07.09 - 13.09.2026')`,
  ).run();
  db.prepare(
    `INSERT INTO classes (id, academic_year_id, name, name_normalized, deleted_at)
     VALUES ('m12-class', 'm12-year', 'M12 Sınıf', 'm12 sinif', NULL)`,
  ).run();
  db.prepare(
    `INSERT INTO courses (id, name, name_normalized, deleted_at)
     VALUES ('m12-course', 'M12 Ders', 'm12 ders', NULL)`,
  ).run();
  db.prepare(
    `INSERT INTO class_courses (id, class_id, course_id, teacher_id, day_of_week, lesson_time, deleted_at)
     VALUES ('m12-cc', 'm12-class', 'm12-course', 'test-teacher', 1, '09:00', NULL)`,
  ).run();
  db.prepare(
    `INSERT INTO reports (id, class_course_id, week_id, topic_covered, status, completed_at, created_by, updated_at)
     VALUES ('m12-report', 'm12-cc', 'm12-week', 'Konu', 'completed', ?, 'test-teacher', ?)`,
  ).run(now, now);
  db.prepare(
    `INSERT INTO homeworks (id, report_id, class_course_id, week_id, description, due_date)
     VALUES ('m12-hw', 'm12-report', 'm12-cc', 'm12-week', 'Ödev', '2026-09-14')`,
  ).run();
  db.prepare(
    `INSERT INTO submissions (id, homework_id, student_id, note, submitted_at, is_late, status)
     VALUES ('m12-sub', 'm12-hw', 'test-student-rec', NULL, ?, 0, 'submitted')`,
  ).run(now);
  db.prepare(
    `INSERT INTO submission_files (id, submission_id, key, filename, size, mime, ext, thumb_key)
     VALUES ('m12-sf', 'm12-sub', '1234-aaaaaaaaaaaaaaaa.jpg', 'odev.jpg', 1234, 'image/jpeg', 'jpg', NULL)`,
  ).run();
}

describe('migration #12 — submission_files.storage backfill + rewind (12↔11)', () => {
  afterEach(() => {
    if (userVersion() < 12) runMigrations();
  });

  it('v11 şemasından koşunca mevcut satırlara storage=local uygular; CHECK korur', () => {
    resetDb();
    insertTestUsers();
    insertM12Fixture();

    // v11'e geri sar: storage kolonu yok, veri kalır.
    rebuildSubmissionFilesWithoutStorage();
    db.exec('PRAGMA user_version = 11');
    expect(userVersion()).toBe(11);
    const colsBefore = (
      db.prepare(`PRAGMA table_info('submission_files')`).all() as Array<{ name: string }>
    ).map((c) => c.name);
    expect(colsBefore).not.toContain('storage');

    runMigrations();
    expect(userVersion()).toBe(12);

    const row = db
      .prepare(`SELECT key, storage FROM submission_files WHERE id = 'm12-sf'`)
      .get() as { key: string; storage: string };
    expect(row.storage).toBe('local'); // DEFAULT eski satırlara uygulandı
    expect(row.key).toBe('1234-aaaaaaaaaaaaaaaa.jpg');

    // CHECK: geçersiz sürücü değeri reddedilir.
    expect(() =>
      db.prepare(`UPDATE submission_files SET storage = 'x' WHERE id = 'm12-sf'`).run(),
    ).toThrow();

    expect((db.prepare('PRAGMA foreign_key_check').all() as unknown[]).length).toBe(0);
  });
});

import { db } from './index.js';
import { normalizeTurkish } from '../utils/text.js';

/**
 * Migration listesi — PRAGMA user_version tabanlı sıralı runner.
 * Her migration bir fonksiyondur; BEGIN/COMMIT/ROLLBACK ile sarılır.
 * Hata olursa uygulama açılmaz (hata yutulmaz).
 *
 * Dondurma kuralı: Aşama 1 bitmeden #1 düzenlenebilir; sonrası yeni numara.
 */
const migrations: Array<{ version: number; name: string; up: () => void }> = [];

export function registerMigration(
  version: number,
  name: string,
  up: () => void,
): void {
  migrations.push({ version, name, up });
}

/**
 * Migration #1 — Şema (yalnızca şema; seed verisi migration'a konmaz).
 * spec.md §3'teki DDL birebir uygulanır.
 * Aşama 1 commit'lendiğinde bu migration dondurulur; sonraki
 * değişiklikler yeni numaralı migration olarak eklenir.
 */
registerMigration(1, 'schema', () => {
  // ---------- 3.1 Temel tablolar ----------

  db.exec(`
    CREATE TABLE users (
      id                   TEXT PRIMARY KEY,
      full_name            TEXT NOT NULL,
      full_name_normalized TEXT NOT NULL,
      phone                TEXT NOT NULL,
      email                TEXT,
      password_hash        TEXT,
      role                 TEXT NOT NULL CHECK (role IN ('admin','teacher','guardian','student')),
      is_active            INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
      token_version        INTEGER NOT NULL DEFAULT 1,
      deleted_at           TEXT,
      created_at           TEXT NOT NULL
    ) STRICT;

    CREATE UNIQUE INDEX idx_users_phone ON users(phone) WHERE deleted_at IS NULL;
    CREATE INDEX idx_users_normalized ON users(full_name_normalized);
  `);

  db.exec(`
    CREATE TABLE guardians (
      id              TEXT PRIMARY KEY,
      user_id         TEXT NOT NULL REFERENCES users(id),
      whatsapp_phone  TEXT,
      phone_secondary TEXT,
      consent_at      TEXT,
      deleted_at      TEXT
    ) STRICT;

    CREATE UNIQUE INDEX idx_guardians_user ON guardians(user_id) WHERE deleted_at IS NULL;
  `);

  db.exec(`
    CREATE TABLE students (
      id          TEXT PRIMARY KEY,
      user_id     TEXT NOT NULL REFERENCES users(id),
      guardian_id TEXT REFERENCES guardians(id),
      deleted_at  TEXT
    ) STRICT;

    CREATE UNIQUE INDEX idx_students_user ON students(user_id) WHERE deleted_at IS NULL;
    CREATE INDEX idx_students_guardian ON students(guardian_id);
  `);

  db.exec(`
    CREATE TABLE academic_years (
      id         TEXT PRIMARY KEY,
      name       TEXT NOT NULL,
      start_date TEXT NOT NULL,
      end_date   TEXT NOT NULL,
      is_active  INTEGER NOT NULL DEFAULT 0 CHECK (is_active IN (0,1))
    ) STRICT;
  `);

  db.exec(`
    CREATE TABLE weeks (
      id               TEXT PRIMARY KEY,
      academic_year_id TEXT NOT NULL REFERENCES academic_years(id),
      week_no          INTEGER NOT NULL,
      start_date       TEXT NOT NULL,
      end_date         TEXT NOT NULL,
      label            TEXT NOT NULL,
      UNIQUE (academic_year_id, week_no)
    ) STRICT;

    CREATE INDEX idx_weeks_dates ON weeks(academic_year_id, start_date);
  `);

  db.exec(`
    CREATE TABLE classes (
      id               TEXT PRIMARY KEY,
      academic_year_id TEXT NOT NULL REFERENCES academic_years(id),
      name             TEXT NOT NULL,
      deleted_at       TEXT
    ) STRICT;

    CREATE UNIQUE INDEX idx_classes_name
      ON classes(academic_year_id, name) WHERE deleted_at IS NULL;
  `);

  db.exec(`
    CREATE TABLE courses (
      id         TEXT PRIMARY KEY,
      name       TEXT NOT NULL,
      deleted_at TEXT
    ) STRICT;

    CREATE UNIQUE INDEX idx_courses_name ON courses(name) WHERE deleted_at IS NULL;
  `);

  db.exec(`
    CREATE TABLE class_courses (
      id          TEXT PRIMARY KEY,
      class_id    TEXT NOT NULL REFERENCES classes(id),
      course_id   TEXT NOT NULL REFERENCES courses(id),
      teacher_id  TEXT NOT NULL REFERENCES users(id),
      day_of_week INTEGER NOT NULL CHECK (day_of_week BETWEEN 1 AND 7),
      lesson_time TEXT,
      deleted_at  TEXT
    ) STRICT;

    CREATE UNIQUE INDEX idx_class_courses_pair
      ON class_courses(class_id, course_id) WHERE deleted_at IS NULL;
    CREATE INDEX idx_class_courses_teacher ON class_courses(teacher_id);
  `);

  db.exec(`
    CREATE TABLE enrollments (
      id         TEXT PRIMARY KEY,
      student_id TEXT NOT NULL REFERENCES students(id),
      class_id   TEXT NOT NULL REFERENCES classes(id),
      start_date TEXT NOT NULL,
      end_date   TEXT
    ) STRICT;

    CREATE INDEX idx_enrollments_student ON enrollments(student_id);
    CREATE INDEX idx_enrollments_class ON enrollments(class_id, end_date);
  `);

  // ---------- 3.2 Rapor tabloları ----------

  // reports ve homeworks birbirine karşılıklı referans verir:
  // homeworks tablosu reports'tan sonra oluşturulur (SQLite ileriye
  // dönük FK referansına izin verir, kısıt yazma anında kontrol edilir).

  db.exec(`
    CREATE TABLE reports (
      id                 TEXT PRIMARY KEY,
      class_course_id    TEXT NOT NULL REFERENCES class_courses(id),
      week_id            TEXT NOT NULL REFERENCES weeks(id),
      topic_covered      TEXT,
      prev_homework_id   TEXT REFERENCES homeworks(id),
      prev_homework_text TEXT,
      status             TEXT NOT NULL DEFAULT 'draft'
                           CHECK (status IN ('draft','completed','sent')),
      completed_at       TEXT,
      created_by         TEXT NOT NULL REFERENCES users(id),
      updated_at         TEXT NOT NULL,
      UNIQUE (class_course_id, week_id),
      CHECK (prev_homework_id IS NULL OR prev_homework_text IS NULL)
    ) STRICT;

    CREATE INDEX idx_reports_week ON reports(week_id, status);
  `);

  db.exec(`
    CREATE TABLE homeworks (
      id              TEXT PRIMARY KEY,
      report_id       TEXT NOT NULL REFERENCES reports(id),
      class_course_id TEXT NOT NULL REFERENCES class_courses(id),
      week_id         TEXT NOT NULL REFERENCES weeks(id),
      description     TEXT NOT NULL,
      attachments     TEXT,
      due_date        TEXT NOT NULL
    ) STRICT;

    CREATE UNIQUE INDEX idx_homeworks_report ON homeworks(report_id);
    CREATE INDEX idx_homeworks_lookup ON homeworks(class_course_id, week_id);
  `);

  db.exec(`
    CREATE TABLE report_entries (
      id             TEXT PRIMARY KEY,
      report_id      TEXT NOT NULL REFERENCES reports(id),
      student_id     TEXT NOT NULL REFERENCES students(id),
      attendance     TEXT NOT NULL DEFAULT 'present'
                       CHECK (attendance IN ('present','absent','late','excused')),
      homework_score INTEGER CHECK (homework_score BETWEEN 1 AND 10),
      interest_score INTEGER CHECK (interest_score BETWEEN 1 AND 10),
      teacher_note   TEXT,
      UNIQUE (report_id, student_id),
      CHECK (
        attendance IN ('absent','excused')
          AND homework_score IS NULL AND interest_score IS NULL
        OR attendance IN ('present','late')
      )
    ) STRICT;

    CREATE INDEX idx_report_entries_student ON report_entries(student_id);
  `);

  db.exec(`
    CREATE TABLE submissions (
      id              TEXT PRIMARY KEY,
      homework_id     TEXT NOT NULL REFERENCES homeworks(id),
      student_id      TEXT NOT NULL REFERENCES students(id),
      files           TEXT NOT NULL,
      note            TEXT,
      submitted_at    TEXT NOT NULL,
      is_late         INTEGER NOT NULL DEFAULT 0 CHECK (is_late IN (0,1)),
      status          TEXT NOT NULL DEFAULT 'submitted'
                        CHECK (status IN ('submitted','reviewed')),
      reviewed_by     TEXT REFERENCES users(id),
      reviewed_at     TEXT,
      files_purged_at TEXT,
      UNIQUE (homework_id, student_id)
    ) STRICT;

    CREATE INDEX idx_submissions_student ON submissions(student_id);
  `);

  // ---------- 3.3 Bildirim ve denetim ----------

  db.exec(`
    CREATE TABLE weekly_digests (
      id          TEXT PRIMARY KEY,
      student_id  TEXT NOT NULL REFERENCES students(id),
      week_id     TEXT NOT NULL REFERENCES weeks(id),
      guardian_id TEXT NOT NULL REFERENCES guardians(id),
      token       TEXT NOT NULL,
      status      TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','ready','sent')),
      send_count  INTEGER NOT NULL DEFAULT 0,
      sent_at     TEXT,
      sent_by     TEXT REFERENCES users(id),
      snapshot    TEXT,
      is_revoked  INTEGER NOT NULL DEFAULT 0 CHECK (is_revoked IN (0,1)),
      UNIQUE (student_id, week_id)
    ) STRICT;

    CREATE UNIQUE INDEX idx_digests_token ON weekly_digests(token);
    CREATE INDEX idx_digests_week ON weekly_digests(week_id, status);
  `);

  db.exec(`
    CREATE TABLE audit_logs (
      id          TEXT PRIMARY KEY,
      actor_id    TEXT REFERENCES users(id),
      action      TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id   TEXT NOT NULL,
      diff        TEXT,
      created_at  TEXT NOT NULL
    ) STRICT;

    CREATE INDEX idx_audit_entity ON audit_logs(entity_type, entity_id, created_at);
  `);
});

/**
 * Migration #2 — OTP doğrulama kayıtları (Aşama 2a).
 * spec.md §3.1 `otp_codes`; §2.1 OTP kuralları + JWT ömrü.
 */
registerMigration(2, 'otp_codes', () => {
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
});

/**
 * Migration #3 — classes/courses `name_normalized` (Aşama 2b).
 * İsim aramaları ve çakışma kontrolleri ASCII'ye indirgenmiş ad üzerinden
 * yapılır (SQLite LIKE Türkçe harflerde duyarsız değildir). Backfill JS ile
 * yapılır — normalizeTurkish yalnızca sunucuda üretilir.
 */
registerMigration(3, 'name_normalized', () => {
  db.exec(`ALTER TABLE classes ADD COLUMN name_normalized TEXT NOT NULL DEFAULT ''`);
  db.exec(`ALTER TABLE courses ADD COLUMN name_normalized TEXT NOT NULL DEFAULT ''`);

  const backfillClasses = db.prepare(`SELECT id, name FROM classes`);
  const updateClass = db.prepare(`UPDATE classes SET name_normalized = ? WHERE id = ?`);
  for (const row of backfillClasses.all() as Array<{ id: string; name: string }>) {
    updateClass.run(normalizeTurkish(row.name), row.id);
  }

  const backfillCourses = db.prepare(`SELECT id, name FROM courses`);
  const updateCourse = db.prepare(`UPDATE courses SET name_normalized = ? WHERE id = ?`);
  for (const row of backfillCourses.all() as Array<{ id: string; name: string }>) {
    updateCourse.run(normalizeTurkish(row.name), row.id);
  }

  db.exec(`DROP INDEX idx_classes_name`);
  db.exec(`DROP INDEX idx_courses_name`);
  db.exec(
    `CREATE UNIQUE INDEX idx_classes_name
       ON classes(academic_year_id, name_normalized) WHERE deleted_at IS NULL`,
  );
  db.exec(
    `CREATE UNIQUE INDEX idx_courses_name ON courses(name_normalized) WHERE deleted_at IS NULL`,
  );
});

/**
 * Migration #4 — teslim dosyaları (Aşama 4).
 * `submissions.files` JSON alanı kaldırılır; `submission_files` tek doğru
 * kaynaktır (spec.md §3.2). `key` küresel benzersiz; dosya erişim rotası
 * key → submission_files → submissions → homeworks zinciriyle sahiplik doğrular.
 */
registerMigration(4, 'submission_files', () => {
  // STRICT tabloda DROP COLUMN: `files` NOT NULL + indekssiz/CHECK'siz olduğu
  // için SQLite'ın DROP COLUMN kısıtlarına takılmaz.
  db.exec(`ALTER TABLE submissions DROP COLUMN files`);

  db.exec(`
    CREATE TABLE submission_files (
      id            TEXT PRIMARY KEY,
      submission_id TEXT NOT NULL REFERENCES submissions(id),
      key           TEXT NOT NULL,
      filename      TEXT NOT NULL,
      size          INTEGER NOT NULL,
      mime          TEXT NOT NULL,
      ext           TEXT NOT NULL,
      UNIQUE (key)
    ) STRICT;

    CREATE INDEX idx_submission_files_sub ON submission_files(submission_id);
  `);
});

export function runMigrations(): void {
  const row = db.prepare('SELECT user_version FROM pragma_user_version').get() as
    | { user_version: number }
    | undefined;
  const currentVersion = row?.user_version ?? 0;

  const pending = migrations
    .filter((m) => m.version > currentVersion)
    .sort((a, b) => a.version - b.version);

  let nextVersion = currentVersion;

  for (const migration of pending) {
    // Migration #1 Aşama 1'de eklenecek; Aşama 0'da runner hazırdır.
    // Migration mutlaka 1'den başlamalıdır.
    if (migration.version !== nextVersion + 1) {
      throw new Error(
        `Migration sırası bozuk: beklenen ${nextVersion + 1}, alınan ${migration.version} (${migration.name})`,
      );
    }

    db.exec('BEGIN');
    try {
      migration.up();
      db.exec(`PRAGMA user_version = ${migration.version}`);
      db.exec('COMMIT');
      nextVersion = migration.version;
    } catch (err) {
      db.exec('ROLLBACK');
      throw new Error(
        `Migration #${migration.version} (${migration.name}) başarısız: ${
          err instanceof Error ? err.message : String(err)
        }`,
        { cause: err },
      );
    }
  }
}
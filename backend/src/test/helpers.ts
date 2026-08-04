/**
 * Test yardımcıları — ayrı test.db üzerinde şema + 4 rol hesabı kurar.
 * (vitest.config.ts `DB_PATH` ile gerçek app.db'ye dokunmaz.)
 *
 * Aşama 2a retrofit sonrası (migration #5): `users.phone` yok; veli/öğrenci
 * `username` + şifre ile giriş yapar; `otp_codes` tablosu kaldırıldı.
 */

import { db } from '../db/index.js';
import { runMigrations } from '../db/migrations.js';
import { hashPasswordSync } from '../utils/hash.js';
import { normalizeTurkish } from '../utils/text.js';

export const TEST_PASSWORD = 'Password123!';

// FK sırasına göre silinir.
const CLEAN_TABLES = [
  'audit_logs',
  'weekly_digests',
  'submission_files',
  'submissions',
  'report_entries',
  'homeworks',
  'reports',
  'enrollments',
  'class_courses',
  'courses',
  'classes',
  'weeks',
  'academic_years',
  'students',
  'guardians',
  'users',
];

export function resetDb(): void {
  runMigrations();
  // reports ↔ homeworks döngüsel FK (spec §3.2): homeworks, reports'tan önce
  // silindiğinden, önce reports.prev_homework_id null'lanır — yoksa DELETE
  // homeworks, reports hâlâ referans verdiği için FK ihlali fırlatır.
  db.exec('UPDATE reports SET prev_homework_id = NULL');
  for (const table of CLEAN_TABLES) {
    db.exec(`DELETE FROM ${table}`);
  }
}

/**
 * 4 rolün test hesabını kurar (tümü şifreli — spec.md §2.1):
 * admin/öğretmen `email`+şifre, veli/öğrenci `username`+şifre.
 */
export function insertTestUsers(): void {
  const now = new Date().toISOString();
  const hash = hashPasswordSync(TEST_PASSWORD);

  const users: Array<{
    id: string;
    full_name: string;
    username: string | null;
    email: string | null;
    role: string;
  }> = [
    { id: 'test-admin', full_name: 'Test Admin', username: null, email: 'admin@test.local', role: 'admin' },
    { id: 'test-teacher', full_name: 'Test Teacher', username: null, email: 'teacher@test.local', role: 'teacher' },
    { id: 'test-guardian', full_name: 'Test Guardian', username: 'test-guardian', email: null, role: 'guardian' },
    { id: 'test-student', full_name: 'Test Student', username: 'test-student', email: null, role: 'student' },
  ];

  const insertUser = db.prepare(
    `INSERT INTO users
       (id, full_name, full_name_normalized, username, email, password_hash, role,
        is_active, token_version, deleted_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 1, 1, NULL, ?)`,
  );
  for (const u of users) {
    insertUser.run(
      u.id,
      u.full_name,
      normalizeTurkish(u.full_name),
      u.username,
      u.email,
      hash,
      u.role,
      now,
    );
  }

  db.prepare(
    `INSERT INTO guardians (id, user_id, whatsapp_phone, phone_secondary, consent_at, deleted_at)
     VALUES ('test-guardian-rec', 'test-guardian', '+905009990003', NULL, ?, NULL)`,
  ).run(now);
  db.prepare(
    `INSERT INTO students (id, user_id, guardian_id, deleted_at)
     VALUES ('test-student-rec', 'test-student', 'test-guardian-rec', NULL)`,
  ).run();
}

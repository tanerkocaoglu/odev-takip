/**
 * Test yardımcıları — ayrı test.db üzerinde şema + 4 rol hesabı kurar.
 * (vitest.config.ts `DB_PATH` ile gerçek app.db'ye dokunmaz.)
 */

import { db } from '../db/index.js';
import { runMigrations } from '../db/migrations.js';
import { hashPasswordSync } from '../utils/hash.js';
import { normalizeTurkish } from '../utils/text.js';

export const TEST_PASSWORD = 'Password123!';

// FK sırasına göre silinir (otp_codes, users'a referans verir).
const CLEAN_TABLES = [
  'otp_codes',
  'audit_logs',
  'weekly_digests',
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
  for (const table of CLEAN_TABLES) {
    db.exec(`DELETE FROM ${table}`);
  }
}

/** 4 rolün test hesabını kurar (admin + öğretmen şifreli, veli + öğrenci OTP'li). */
export function insertTestUsers(): void {
  const now = new Date().toISOString();
  const hash = hashPasswordSync(TEST_PASSWORD);

  const users: Array<{
    id: string;
    full_name: string;
    phone: string;
    email: string | null;
    role: string;
  }> = [
    { id: 'test-admin', full_name: 'Test Admin', phone: '+905009990001', email: 'admin@test.local', role: 'admin' },
    { id: 'test-teacher', full_name: 'Test Teacher', phone: '+905009990002', email: 'teacher@test.local', role: 'teacher' },
    { id: 'test-guardian', full_name: 'Test Guardian', phone: '+905009990003', email: null, role: 'guardian' },
    { id: 'test-student', full_name: 'Test Student', phone: '+905009990004', email: null, role: 'student' },
  ];

  const insertUser = db.prepare(
    `INSERT INTO users
       (id, full_name, full_name_normalized, phone, email, password_hash, role,
        is_active, token_version, deleted_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 1, 1, NULL, ?)`,
  );
  for (const u of users) {
    insertUser.run(
      u.id,
      u.full_name,
      normalizeTurkish(u.full_name),
      u.phone,
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

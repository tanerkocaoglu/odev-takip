import { describe, it, expect, beforeAll } from 'vitest';
import { db } from './index.js';
import { runMigrations } from './migrations.js';
import { seedDatabase } from './seed.js';

/**
 * Şema + seed testleri.
 * vitest.config.ts `DB_PATH` ile ayrı test.db kullanır — gerçek app.db'ye
 * dokunulmaz.
 */

function count(table: string): number {
  const row = db.prepare(`SELECT COUNT(*) AS c FROM ${table}`).get() as {
    c: number;
  };
  return row.c;
}

beforeAll(() => {
  // Şema önce kurulur, sonra tablolar temizlenir.
  runMigrations();

  const tables = [
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
  for (const t of tables) {
    db.exec(`DELETE FROM ${t}`);
  }
});

describe('foreign key ihlali', () => {
  it('olmayan class_id ile class_courses eklenemez', () => {
    expect(() =>
      db
        .prepare(
          `INSERT INTO class_courses (id, class_id, course_id, teacher_id, day_of_week)
           VALUES ('fk-test', 'yok-class', 'yok-course', 'yok-teacher', 1)`,
        )
        .run(),
    ).toThrow();
  });

  it('olmayan student_id ile report_entries eklenemez', () => {
    expect(() =>
      db
        .prepare(
          `INSERT INTO report_entries (id, report_id, student_id)
           VALUES ('fk-test-entry', 'yok-report', 'yok-student')`,
        )
        .run(),
    ).toThrow();
  });

  it('olmayan guardian_id ile students eklenemez', () => {
    expect(() =>
      db
        .prepare(
          `INSERT INTO students (id, user_id, guardian_id)
           VALUES ('fk-test-student', 'yok-user', 'yok-guardian')`,
        )
        .run(),
    ).toThrow();
  });
});

describe('seed', () => {
  it('seed kayıtları beklenen hacimde üretir', () => {
    seedDatabase('test-admin-password');

    expect(count('users')).toBe(411); // 1 admin + 10 öğretmen + 200 öğrenci + 200 veli
    expect(count('students')).toBe(200);
    expect(count('guardians')).toBe(200);
    expect(count('classes')).toBe(25);
    expect(count('courses')).toBe(5);
    expect(count('class_courses')).toBe(100);
    expect(count('enrollments')).toBe(200);
    expect(count('weeks')).toBe(20);
    expect(count('reports')).toBe(100);
    expect(count('report_entries')).toBe(800);
    expect(count('homeworks')).toBe(100);
  });

  it('seed idempotenttir — ikinci çalıştırmada kayıt çoğalmaz', () => {
    const before = {
      users: count('users'),
      students: count('students'),
      guardians: count('guardians'),
      classes: count('classes'),
      class_courses: count('class_courses'),
      enrollments: count('enrollments'),
      weeks: count('weeks'),
      reports: count('reports'),
      report_entries: count('report_entries'),
      homeworks: count('homeworks'),
    };

    seedDatabase('test-admin-password');

    expect(count('users')).toBe(before.users);
    expect(count('students')).toBe(before.students);
    expect(count('guardians')).toBe(before.guardians);
    expect(count('classes')).toBe(before.classes);
    expect(count('class_courses')).toBe(before.class_courses);
    expect(count('enrollments')).toBe(before.enrollments);
    expect(count('weeks')).toBe(before.weeks);
    expect(count('reports')).toBe(before.reports);
    expect(count('report_entries')).toBe(before.report_entries);
    expect(count('homeworks')).toBe(before.homeworks);
  });

  it('geçen hafta raporları completed durumundadır', () => {
    const row = db
      .prepare(
        `SELECT status, COUNT(*) AS c FROM reports
         WHERE week_id = (SELECT id FROM weeks WHERE week_no = 19)
         GROUP BY status`,
      )
      .all() as { status: string; c: number }[];
    expect(row).toHaveLength(1);
    expect(row[0].status).toBe('completed');
    expect(row[0].c).toBe(100);
  });

  it('ilk admin rolü admin ve şifresi hash\'lidir', () => {
    const admin = db
      .prepare(
        `SELECT id, role, password_hash FROM users WHERE id = 'seed-user-admin-001'`,
      )
      .get() as { id: string; role: string; password_hash: string } | undefined;
    expect(admin).toBeDefined();
    expect(admin!.role).toBe('admin');
    expect(admin!.password_hash).toMatch(/^scrypt\$/);
  });
});
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

  // reports ↔ homeworks döngüsel FK (spec §3.2): homeworks silinmeden önce
  // reports.prev_homework_id null'lanır (helpers.resetDb ile aynı kural).
  db.exec('UPDATE reports SET prev_homework_id = NULL');

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
    'otp_codes',
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

    // 1 admin + 10 öğretmen + 205 öğrenci (200 + 5 kardeş) + 200 veli = 416
    expect(count('users')).toBe(416);
    expect(count('students')).toBe(205);
    expect(count('guardians')).toBe(200);
    expect(count('classes')).toBe(25);
    expect(count('courses')).toBe(5);
    expect(count('class_courses')).toBe(100);
    // 200 temel + 2 taşınan (yeni) + 5 kardeş = 207
    expect(count('enrollments')).toBe(207);
    expect(count('weeks')).toBe(21);
    // 100 (week 19) + 8 (week 8 geçmiş bloğu: 2 sınıf × 4 ders)
    expect(count('reports')).toBe(108);
    // week 19: 820 (sınıf 1=6, 2=8, 6=10, 7=10, 8..10=9×3, kalan 18=8)
    // week 8 bloğu: 64 (sınıf 1 ve 2, 8'er öğrenci × 4 ders × 2 sınıf)
    expect(count('report_entries')).toBe(884);
    expect(count('homeworks')).toBe(108);
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

  it('seed haftaları bugünü kapsar — week 20 bu haftadır ve week 21 sonrakidir', () => {
    // Aşama 3 kuralı: doldurulacak haftanın (week 20) her zaman bir sonraki
    // haftası vardır — aksi halde homeworks.due_date hesaplanamaz.
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(
      now.getDate(),
    ).padStart(2, '0')}`;

    const week20 = db
      .prepare(`SELECT start_date, end_date FROM weeks WHERE week_no = 20`)
      .get() as { start_date: string; end_date: string } | undefined;
    const week21 = db
      .prepare(`SELECT start_date, end_date FROM weeks WHERE week_no = 21`)
      .get() as { start_date: string; end_date: string } | undefined;

    expect(week20).toBeDefined();
    expect(week21).toBeDefined();
    // Bugün week 20 aralığında (veya week 20 henüz bitmedi — hafta sonu kayması).
    expect(today >= week20!.start_date && today <= week20!.end_date).toBe(true);
    // Week 21, week 20'den sonra başlar (due_date hesabı için).
    expect(week21!.start_date > week20!.end_date).toBe(true);
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

  it('5 velinin 2\'şer çocuğu vardır (kardeş senaryosu)', () => {
    const rows = db
      .prepare(
        `SELECT g.id AS guardian_id,
                COUNT(s.id) AS child_count
         FROM guardians g
         LEFT JOIN students s ON s.guardian_id = g.id
         WHERE g.id IN ('seed-guardian-001','seed-guardian-002','seed-guardian-003',
                        'seed-guardian-004','seed-guardian-005')
         GROUP BY g.id
         ORDER BY g.id`,
      )
      .all() as { guardian_id: string; child_count: number }[];
    expect(rows).toHaveLength(5);
    for (const row of rows) {
      expect(row.child_count).toBe(2);
    }
  });

  it('sınıf değiştiren öğrenciler 2 enrollment kaydına sahiptir (biri kapalı)', () => {
    const rows = db
      .prepare(
        `SELECT student_id, COUNT(*) AS total,
                SUM(CASE WHEN end_date IS NULL THEN 1 ELSE 0 END) AS active_count,
                SUM(CASE WHEN end_date IS NOT NULL THEN 1 ELSE 0 END) AS closed_count
         FROM enrollments
         WHERE student_id IN ('seed-student-003','seed-student-004')
         GROUP BY student_id`,
      )
      .all() as {
      student_id: string;
      total: number;
      active_count: number;
      closed_count: number;
    }[];
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(row.total).toBe(2);
      expect(row.active_count).toBe(1);
      expect(row.closed_count).toBe(1);
    }
  });

  it('öğrenci 3 week 19\'da yeni sınıfta (sınıf 6), week 8\'de eski sınıfta (sınıf 1) görünür', () => {
    // Öğrenci 3'ün week 19 raporlarında yer aldığı class_course'ların sınıflarını bul.
    const week19ClassIds = db
      .prepare(
        `SELECT DISTINCT cc.class_id AS class_id
         FROM report_entries re
         JOIN reports r ON r.id = re.report_id
         JOIN class_courses cc ON cc.id = r.class_course_id
         JOIN weeks w ON w.id = r.week_id
         WHERE re.student_id = 'seed-student-003' AND w.week_no = 19`,
      )
      .all() as { class_id: string }[];
    // Sınıf 6 = seed-class-006
    expect(week19ClassIds.map((c) => c.class_id)).toContain('seed-class-006');
    expect(week19ClassIds.map((c) => c.class_id)).not.toContain('seed-class-001');

    const week8ClassIds = db
      .prepare(
        `SELECT DISTINCT cc.class_id AS class_id
         FROM report_entries re
         JOIN reports r ON r.id = re.report_id
         JOIN class_courses cc ON cc.id = r.class_course_id
         JOIN weeks w ON w.id = r.week_id
         WHERE re.student_id = 'seed-student-003' AND w.week_no = 8`,
      )
      .all() as { class_id: string }[];
    expect(week8ClassIds.map((c) => c.class_id)).toContain('seed-class-001');
    expect(week8ClassIds.map((c) => c.class_id)).not.toContain('seed-class-006');
  });
});

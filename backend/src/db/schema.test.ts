import { describe, it, expect, beforeAll } from 'vitest';
import { db } from './index.js';
import { runMigrations } from './migrations.js';
import { seedDatabase } from './seed.js';
import { usernamePrefix } from '../utils/username.js';
import { formatWeekLabel } from '../utils/weeks.js';

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
    'schools',
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
  // ~88 kullanıcı için scrypt hash — varsayılan 5 sn timeout yetmez.
  it('seed kayıtları beklenen hacimde üretir', { timeout: 60_000 }, async () => {
    await seedDatabase('test-admin-password', 'test-user-password');

    // 1 admin + 4 öğretmen + 12 öğrenci + 12 veli = 29
    expect(count('users')).toBe(29);
    expect(count('students')).toBe(12);
    expect(count('guardians')).toBe(12);
    expect(count('classes')).toBe(3);
    expect(count('courses')).toBe(4);
    // 3 sınıf × 4 ders
    expect(count('class_courses')).toBe(12);
    // Her öğrenci kendi sınıfında tek aktif kayıt → 12
    expect(count('enrollments')).toBe(12);
    expect(count('weeks')).toBe(21);
    // Hafta 17, 18, 19 × 12 class_course = 36 tamamlanmış rapor
    expect(count('reports')).toBe(36);
    // 36 rapor × sınıf başına 4 öğrenci = 144 satır
    expect(count('report_entries')).toBe(144);
    expect(count('homeworks')).toBe(36);
    // 4 okul; 12 öğrencinin tamamı okul + sınıf seviyesi atanmış
    expect(count('schools')).toBe(4);
    // Seed teslim üretmez (öğrenci yükleyecek); hafta 19 için 4 sent digest.
    expect(count('submissions')).toBe(0);
    expect(count('weekly_digests')).toBe(4);
  });

  it('seed hafta etiketleri hedef biçimdedir (gg.aa - gg.aa.yyyy, sıfır dolgulu)', () => {
    const rows = db
      .prepare(`SELECT start_date, end_date, label FROM weeks ORDER BY week_no`)
      .all() as Array<{ start_date: string; end_date: string; label: string }>;
    expect(rows).toHaveLength(21);
    const pattern = /^\d{2}\.\d{2} - \d{2}\.\d{2}\.\d{4}$/;
    for (const r of rows) {
      expect(r.label).toMatch(pattern);
      // Tek doğru kaynak: label, tarihten üretilen fonksiyonun çıktısıdır.
      expect(r.label).toBe(formatWeekLabel(r.start_date, r.end_date));
    }
  });

  it('seed idempotenttir — ikinci çalıştırmada kayıt çoğalmaz', async () => {
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
      schools: count('schools'),
      submissions: count('submissions'),
      weekly_digests: count('weekly_digests'),
    };

    await seedDatabase('test-admin-password', 'test-user-password');

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
    expect(count('schools')).toBe(before.schools);
    expect(count('submissions')).toBe(before.submissions);
    expect(count('weekly_digests')).toBe(before.weekly_digests);
  });

  it('geçmiş haftaların (17/18/19) raporları completed durumundadır', () => {
    const row = db
      .prepare(
        `SELECT w.week_no, r.status, COUNT(*) AS c FROM reports r
         JOIN weeks w ON w.id = r.week_id
         WHERE w.week_no IN (17, 18, 19)
         GROUP BY w.week_no, r.status
         ORDER BY w.week_no`,
      )
      .all() as { week_no: number; status: string; c: number }[];
    // Her geçmiş hafta için 12 class_course raporu completed.
    expect(row).toEqual([
      { week_no: 17, status: 'completed', c: 12 },
      { week_no: 18, status: 'completed', c: 12 },
      { week_no: 19, status: 'completed', c: 12 },
    ]);
  });

  it('seed: tüm öğrencilere okul + sınıf seviyesi atanır, teslim yok, digest görüntüleme karışık', () => {
    // 1) Okul + sınıf seviyesi: 12 öğrencinin tamamına döngüsel atanır.
    const assigned = db
      .prepare(
        `SELECT COUNT(*) AS c FROM students
         WHERE school_id IS NOT NULL AND grade_level IS NOT NULL`,
      )
      .get() as { c: number };
    const unassigned = db
      .prepare(
        `SELECT COUNT(*) AS c FROM students
         WHERE school_id IS NULL AND grade_level IS NULL`,
      )
      .get() as { c: number };
    expect(assigned.c).toBe(12);
    expect(unassigned.c).toBe(0);
    // Örnek: öğrenci 1 Örnek Okul 1 + 6. sınıf seviyesi.
    const s1 = db
      .prepare(
        `SELECT s.school_id, s.grade_level FROM students s WHERE s.id = 'seed-student-001'`,
      )
      .get() as { school_id: string; grade_level: string };
    expect(s1.school_id).toBe('seed-school-001');
    expect(s1.grade_level).toBe('6');

    // 2) Bu seed teslim (submission) üretmez — öğrenci yükleyecek.
    expect(count('submissions')).toBe(0);
    // Tüm rapor satırları "geldi" ve puanlıdır (risk senaryosu yok).
    const present = db
      .prepare(
        `SELECT COUNT(*) AS c FROM report_entries
         WHERE attendance = 'present' AND homework_score IS NOT NULL
           AND interest_score IS NOT NULL`,
      )
      .get() as { c: number };
    expect(present.c).toBe(144);

    // 3) Digest'ler: 4 sent, 2 görüntülenmiş + 2 görüntülenmemiş.
    const digests = db
      .prepare(
        `SELECT
           SUM(CASE WHEN first_viewed_at IS NOT NULL AND last_viewed_at IS NOT NULL
                    THEN 1 ELSE 0 END) AS viewed,
           SUM(CASE WHEN first_viewed_at IS NULL THEN 1 ELSE 0 END) AS not_viewed
         FROM weekly_digests WHERE status = 'sent'`,
      )
      .get() as { viewed: number; not_viewed: number };
    expect(digests.viewed).toBe(2);
    expect(digests.not_viewed).toBe(2);
  });

  it('gerçek dershane yapısı: 4 öğretmen tek dersini 3 sınıfta verir; ders günü sabittir', () => {
    // Her öğretmen yalnızca bir derse bağlıdır ve o dersi 3 sınıfta verir.
    const byTeacher = db
      .prepare(
        `SELECT cc.teacher_id, cc.course_id, cc.day_of_week, COUNT(*) AS c
         FROM class_courses cc
         GROUP BY cc.teacher_id, cc.course_id, cc.day_of_week
         ORDER BY cc.teacher_id`,
      )
      .all() as Array<{ teacher_id: string; course_id: string; day_of_week: number; c: number }>;
    expect(byTeacher).toHaveLength(4); // 4 öğretmen × tek ders × tek gün
    for (const r of byTeacher) {
      expect(r.c).toBe(3); // her ders 3 sınıfta
    }
    // Sabit gün: Matematik=Pazartesi(1) … İngilizce=Perşembe(4), öğretmen sırasıyla.
    expect(byTeacher.map((r) => r.day_of_week)).toEqual([1, 2, 3, 4]);
    // Ders eşlemesi: öğretmen i, COURSE_NAMES[i-1]'i verir.
    expect(byTeacher[0].course_id).toBe('seed-course-matematik');
    expect(byTeacher[1].course_id).toBe('seed-course-fizik');
    // normalizeTurkish('Türkçe') → 'turkce'.
    expect(byTeacher[2].course_id).toBe('seed-course-turkce');
    expect(byTeacher[3].course_id).toBe('seed-course-ingilizce');

    // Her sınıfta 4 ders.
    const perClass = db
      .prepare(`SELECT class_id, COUNT(*) AS c FROM class_courses GROUP BY class_id`)
      .all() as Array<{ class_id: string; c: number }>;
    expect(perClass).toHaveLength(3);
    expect(perClass.every((r) => r.c === 4)).toBe(true);
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

  it('öğrenci/veli username\'leri unique, şifre hash\'leri doludur (migration #5 retrofit)', () => {
    const duplicates = db
      .prepare(
        `SELECT username, COUNT(*) AS c FROM users
         WHERE role IN ('student','guardian') AND username IS NOT NULL
         GROUP BY username HAVING c > 1`,
      )
      .all();
    expect(duplicates).toHaveLength(0);

    const missing = db
      .prepare(
        `SELECT COUNT(*) AS c FROM users
         WHERE role IN ('student','guardian')
           AND (username IS NULL OR username = '' OR password_hash IS NULL)`,
      )
      .get() as { c: number };
    expect(missing.c).toBe(0);

    // İsim tabanlı üretim: username = normalizeTurkish(full_name) temizlenmiş
    // önek + sayaç (spec §2.1).
    const rows = db
      .prepare(
        `SELECT u.username, u.full_name FROM users u
         WHERE u.role IN ('student','guardian')`,
      )
      .all() as Array<{ username: string; full_name: string }>;
    const bad = rows.filter(
      (r) => !new RegExp(`^${usernamePrefix(r.full_name)}\\d+$`).test(r.username),
    );
    expect(bad).toHaveLength(0);
  });

  it('her velinin tek çocuğu vardır (küçük ölçekli seed)', () => {
    const rows = db
      .prepare(
        `SELECT g.id AS guardian_id, COUNT(s.id) AS child_count
         FROM guardians g
         LEFT JOIN students s ON s.guardian_id = g.id
         GROUP BY g.id
         ORDER BY g.id`,
      )
      .all() as { guardian_id: string; child_count: number }[];
    expect(rows).toHaveLength(12);
    expect(rows.every((r) => r.child_count === 1)).toBe(true);
  });

  it('her öğrencinin tek aktif enrollment kaydı vardır', () => {
    const rows = db
      .prepare(
        `SELECT student_id, COUNT(*) AS total,
                SUM(CASE WHEN end_date IS NULL THEN 1 ELSE 0 END) AS active_count
         FROM enrollments
         GROUP BY student_id`,
      )
      .all() as { student_id: string; total: number; active_count: number }[];
    expect(rows).toHaveLength(12);
    expect(rows.every((r) => r.total === 1 && r.active_count === 1)).toBe(true);
  });

  it('öğrenci 3 tüm haftalarda aynı sınıfta (sınıf 1) görünür', () => {
    const classIdsForWeek = (weekNo: number): string[] =>
      (
        db
          .prepare(
            `SELECT DISTINCT cc.class_id AS class_id
             FROM report_entries re
             JOIN reports r ON r.id = re.report_id
             JOIN class_courses cc ON cc.id = r.class_course_id
             JOIN weeks w ON w.id = r.week_id
             WHERE re.student_id = 'seed-student-003' AND w.week_no = ?`,
          )
          .all(weekNo) as { class_id: string }[]
      ).map((c) => c.class_id);

    // Sınıf 1 = seed-class-001 (A Şubesi) — sınıf değişikliği senaryosu yok.
    expect(classIdsForWeek(19)).toEqual(['seed-class-001']);
    expect(classIdsForWeek(17)).toEqual(['seed-class-001']);
  });

  it('report_entries CHECK (#10): devamsızda homework_score serbest, interest_score yasak', () => {
    const entry = db
      .prepare(`SELECT id FROM report_entries LIMIT 1`)
      .get() as { id: string } | undefined;
    expect(entry).toBeDefined();

    // Gerçek şema üzerinde dene, sonra geri al — seed verisi değişmez.
    db.exec('BEGIN');
    try {
      const upd = db.prepare(
        `UPDATE report_entries SET attendance = ?, homework_score = ?, interest_score = ?
         WHERE id = ?`,
      );
      // Devamsız + ödev puanı dolu + performans null → KABUL (migration #10).
      upd.run('absent', 5, null, entry!.id);
      // Devamsız + performans puanı dolu → tablo CHECK reddeder.
      expect(() => upd.run('absent', 5, 6, entry!.id)).toThrow();
      // Geldi + iki puan dolu → KABUL.
      upd.run('present', 7, 8, entry!.id);
    } finally {
      db.exec('ROLLBACK');
    }
  });
});

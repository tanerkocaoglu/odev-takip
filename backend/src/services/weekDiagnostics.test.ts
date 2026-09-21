/**
 * `diagnoseWeeks` — 7 gün olmayan haftaları ve aralık dışı dersleri bulur
 * (salt-okunur). Spec §3.1 savunma katmanının teşhis aracı.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { db } from '../db/index.js';
import { resetDb, insertTestUsers } from '../test/helpers.js';
import { diagnoseWeeks } from './weekDiagnostics.js';
import { hashPasswordSync } from '../utils/hash.js';

beforeAll(() => {
  resetDb();
  insertTestUsers();

  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO academic_years (id, name, start_date, end_date, is_active)
     VALUES ('wd-year', '2026-2027', '2026-09-01', '2027-06-30', 1)`,
  ).run();

  const insertWeek = db.prepare(
    `INSERT INTO weeks (id, academic_year_id, week_no, start_date, end_date, label)
     VALUES (?, 'wd-year', ?, ?, ?, ?)`,
  );
  // Normal 7 günlük hafta (temiz).
  insertWeek.run('wd-week-ok', 1, '2026-09-14', '2026-09-20', 'Diğer');
  // Bozuk: 6 gün (21..26 Eylül) → Pazar dersi 27.09 dışarıda.
  insertWeek.run('wd-week-bad', 2, '2026-09-21', '2026-09-26', 'Bozuk');

  db.prepare(
    `INSERT INTO classes (id, academic_year_id, name, name_normalized, deleted_at)
     VALUES ('wd-class', 'wd-year', 'WD Sınıfı', 'wd sinifi', NULL)`,
  ).run();
  db.prepare(
    `INSERT INTO courses (id, name, name_normalized, deleted_at) VALUES
     ('wd-course-sun', 'Pazar Dersi', 'pazar dersi', NULL),
     ('wd-course-mon', 'Pazartesi Dersi', 'pazartesi dersi', NULL)`,
  ).run();

  db.prepare(
    `INSERT INTO users
       (id, full_name, full_name_normalized, username, email, password_hash, role,
        is_active, token_version, must_change_password, deleted_at, created_at)
     VALUES ('wd-teacher', 'WD Teacher', 'wd teacher', NULL, 'wd@test.local', ?, 'teacher',
             1, 1, 0, NULL, ?)`,
  ).run(hashPasswordSync('Password123!'), now);

  const insertCc = db.prepare(
    `INSERT INTO class_courses
       (id, class_id, course_id, teacher_id, day_of_week, lesson_time, deleted_at)
     VALUES (?, 'wd-class', ?, 'wd-teacher', ?, '09:00', NULL)`,
  );
  insertCc.run('wd-cc-sun', 'wd-course-sun', 7); // Pazar → 27.09 dışarıda
  insertCc.run('wd-cc-mon', 'wd-course-mon', 1); // Pazartesi → 21.09 içeride

  // Bozuk haftaya bağlı bir rapor → diagnostics etkisini sayar.
  db.prepare(
    `INSERT INTO reports
       (id, class_course_id, week_id, topic_covered, prev_homework_id,
        prev_homework_text, status, completed_at, created_by, updated_at)
     VALUES ('wd-report', 'wd-cc-sun', 'wd-week-bad', 'Konu', NULL, NULL, 'draft', NULL, 'wd-teacher', ?)`,
  ).run(now);
});

describe('diagnoseWeeks', () => {
  it('yalnızca 7 gün olmayan haftayı döner; aralık dışı dersi işaretler', () => {
    const result = diagnoseWeeks();
    expect(result.total_weeks).toBe(2);
    expect(result.malformed).toHaveLength(1);

    const bad = result.malformed[0];
    expect(bad.week_id).toBe('wd-week-bad');
    expect(bad.days).toBe(6);
    expect(bad.course_count).toBe(2); // sınıftaki tüm atamalar
    expect(bad.out_of_range).toHaveLength(1);
    expect(bad.out_of_range[0].class_course_id).toBe('wd-cc-sun');
    expect(bad.out_of_range[0].class_date).toBe('2026-09-27');
    expect(bad.report_count).toBe(1);
  });

  it('bozuk hafta yokken malformed boştur', () => {
    db.prepare(`DELETE FROM reports WHERE id = 'wd-report'`).run();
    db.prepare(`DELETE FROM weeks WHERE id = 'wd-week-bad'`).run();
    const result = diagnoseWeeks();
    expect(result.malformed).toHaveLength(0);
    expect(result.total_weeks).toBe(1);
  });
});

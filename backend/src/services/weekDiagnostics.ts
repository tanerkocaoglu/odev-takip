/**
 * Hafta tanımı teşhisi — **SALT-OKUNUR** (`npm run diagnose-weeks`).
 *
 * Amaç: bir haftanın `[start_date, end_date]` aralığı tam 7 gün değilse
 * (ör. 21–26 Eylül = 6 gün), `class_courses.day_of_week` ile hesaplanan gerçek
 * ders tarihi haftanın dışına düşebilir (ör. Pazar dersi → 27 Eylül). Bu modül
 * bu tür bozuk haftaları ve etkilenen dersleri listeler; **hiçbir yazma yapmaz**
 * (yalnızca SELECT). Kalıcı ürün akışının parçası değildir.
 */

import { db } from '../db/index.js';
import { classDateForWeek, weekLengthDays, type WeekRecord } from '../utils/weeks.js';

export interface OutOfRangeCourse {
  class_course_id: string;
  class_name: string;
  course_name: string;
  day_of_week: number;
  /** `day_of_week`'ten türeyen gerçek gün (hafta aralığının dışında). */
  class_date: string;
}

export interface MalformedWeek {
  week_id: string;
  week_no: number;
  start_date: string;
  end_date: string;
  label: string;
  /** Başlangıç + bitiş dahil gün sayısı (7 olmalı). */
  days: number;
  course_count: number;
  /** Gerçek ders günü hafta aralığının dışına düşen atamalar. */
  out_of_range: OutOfRangeCourse[];
  /** Bu haftaya bağlı rapor sayısı (düzeltmenin etkilediği kayıtlar). */
  report_count: number;
}

export interface WeekDiagnostics {
  total_weeks: number;
  malformed: MalformedWeek[];
}

/**
 * Tüm haftaları tarar; `days !== 7` olanları (ve varsa aralık dışı dersleri)
 * döner. Hatalı hafta yoksa `malformed` boştur.
 */
export function diagnoseWeeks(): WeekDiagnostics {
  const weeks = db
    .prepare(`SELECT * FROM weeks ORDER BY start_date`)
    .all() as unknown as WeekRecord[];

  const malformed: MalformedWeek[] = [];

  const ccStmt = db.prepare(
    `SELECT cc.id, cc.day_of_week, c.name AS class_name, co.name AS course_name
     FROM class_courses cc
     JOIN classes c ON c.id = cc.class_id AND c.deleted_at IS NULL
     JOIN courses co ON co.id = cc.course_id AND co.deleted_at IS NULL
     WHERE cc.deleted_at IS NULL AND c.academic_year_id = ?
     ORDER BY c.name, cc.day_of_week`,
  );
  const reportStmt = db.prepare(`SELECT COUNT(*) AS n FROM reports WHERE week_id = ?`);

  for (const week of weeks) {
    const days = weekLengthDays(week.start_date, week.end_date);
    if (days === 7) continue;

    const courses = ccStmt.all(week.academic_year_id) as Array<{
      id: string;
      day_of_week: number;
      class_name: string;
      course_name: string;
    }>;
    const outOfRange: OutOfRangeCourse[] = [];
    for (const cc of courses) {
      const classDate = classDateForWeek(week.start_date, cc.day_of_week);
      if (classDate > week.end_date) {
        outOfRange.push({
          class_course_id: cc.id,
          class_name: cc.class_name,
          course_name: cc.course_name,
          day_of_week: cc.day_of_week,
          class_date: classDate,
        });
      }
    }

    malformed.push({
      week_id: week.id,
      week_no: week.week_no,
      start_date: week.start_date,
      end_date: week.end_date,
      label: week.label,
      days,
      course_count: courses.length,
      out_of_range: outOfRange,
      report_count: (reportStmt.get(week.id) as { n: number }).n,
    });
  }

  return { total_weeks: weeks.length, malformed };
}

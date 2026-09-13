/**
 * Haftalık ödev özeti iş mantığı — admin "Haftalık Ödev Özeti" ekranı.
 *
 * Bir sınıf + hafta için o sınıfın **tüm** `class_courses` atamalarını listeler;
 * raporu `completed`/`sent` olan ve ödevi bulunan dersin "yapılacak ödev"ini
 * (`homeworks.description`), geri kalanı `missing` ("Rapor girilmedi") olarak
 * döner. Satır atlanmaz.
 *
 * Yeni şema/migration gerekmez — veri `class_courses` + `reports` + `homeworks`
 * tablolarından gelir. "Tüm raporlar tamam mı" sinyali burada bir **kısıt
 * değildir**: hazır olmayan sınıf da eksik dersleri işaretlenerek gösterilir
 * (digest gönderimindeki "hepsi tamam olmadan gönderme" kısıtı yalnızca
 * gönderim içindir).
 */

import { db } from '../db/index.js';
import { AppError } from '../errors.js';
import type { WeekRecord } from '../utils/weeks.js';
import { currentDigestWeek, firstActiveWeekNoForClass } from './digests.js';

export type HomeworkSummaryStatus = 'completed' | 'sent' | 'missing';

export interface HomeworkSummaryRow {
  class_course_id: string;
  course_name: string;
  teacher_name: string;
  day_of_week: number;
  lesson_time: string | null;
  status: HomeworkSummaryStatus;
  /** Yapılacak ödev metni; `missing` satırda `null`. */
  homework_description: string | null;
}

export interface HomeworkSummary {
  week: {
    id: string;
    week_no: number;
    label: string;
    start_date: string;
    end_date: string;
  };
  class: { id: string; name: string };
  /** Sınıfın ilk aktif haftasına göre "N. hafta" gösterim etiketi. */
  relative_week_no: number;
  rows: HomeworkSummaryRow[];
}

/** `week_id` verilmezse aktif yılın "şu anki" haftasına düşer. */
export function resolveHomeworkSummaryWeekId(weekId?: string): string | null {
  return weekId ?? currentDigestWeek()?.id ?? null;
}

export function buildHomeworkSummary(classId: string, weekId: string): HomeworkSummary {
  const week = db.prepare(`SELECT * FROM weeks WHERE id = ?`).get(weekId) as
    | WeekRecord
    | undefined;
  if (!week) {
    throw new AppError('NOT_FOUND', 404, 'Hafta bulunamadı.');
  }

  const cls = db
    .prepare(`SELECT id, name FROM classes WHERE id = ? AND deleted_at IS NULL`)
    .get(classId) as { id: string; name: string } | undefined;
  if (!cls) {
    throw new AppError('NOT_FOUND', 404, 'Sınıf bulunamadı.');
  }

  const rows = db
    .prepare(
      `SELECT cc.id AS class_course_id, cc.day_of_week, cc.lesson_time,
              co.name AS course_name, t.full_name AS teacher_name,
              r.status AS report_status, hw.description AS homework_description
       FROM class_courses cc
       JOIN courses co ON co.id = cc.course_id AND co.deleted_at IS NULL
       JOIN users t ON t.id = cc.teacher_id
       LEFT JOIN reports r ON r.class_course_id = cc.id AND r.week_id = ?
       LEFT JOIN homeworks hw ON hw.report_id = r.id
       WHERE cc.class_id = ? AND cc.deleted_at IS NULL
       ORDER BY cc.day_of_week, cc.lesson_time`,
    )
    .all(weekId, classId) as Array<{
    class_course_id: string;
    day_of_week: number;
    lesson_time: string | null;
    course_name: string;
    teacher_name: string;
    report_status: string | null;
    homework_description: string | null;
  }>;

  const firstActiveWeek = firstActiveWeekNoForClass(classId);
  const relative =
    firstActiveWeek === null
      ? week.week_no
      : Math.max(week.week_no - firstActiveWeek + 1, 1);

  return {
    week: {
      id: week.id,
      week_no: week.week_no,
      label: week.label,
      start_date: week.start_date,
      end_date: week.end_date,
    },
    class: { id: cls.id, name: cls.name },
    relative_week_no: relative,
    rows: rows.map((row) => {
      const filled = row.report_status === 'completed' || row.report_status === 'sent';
      return {
        class_course_id: row.class_course_id,
        course_name: row.course_name,
        teacher_name: row.teacher_name,
        day_of_week: row.day_of_week,
        lesson_time: row.lesson_time,
        status: filled ? (row.report_status as 'completed' | 'sent') : 'missing',
        homework_description: filled ? row.homework_description : null,
      };
    }),
  };
}

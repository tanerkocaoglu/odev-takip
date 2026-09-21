/**
 * Filtreli CSV dışa aktarma — spec.md §5.7.
 *
 * Üç ekranın ("Raporlar", "Öğrenciler", "Veliler") mevcut filtre/arama sonucu,
 * ekranda görünen sütunlarla CSV olarak üretilir. Biçim UTF-8 BOM'lu CSV'dir.
 * Sorgular filtreleri SQL seviyesinde uygular (CLAUDE.md: "önce hepsini çek
 * sonra filtrele" yapılmaz); sayfalama uygulanmaz, tüm eşleşenler iner.
 */

import { db } from '../db/index.js';
import { normalizeTurkish } from '../utils/text.js';
import { toCsv } from '../utils/csv.js';
import { relativeDayOrderSql } from '../utils/weeks.js';

const GRADE_LEVEL_LABELS: Record<string, string> = {
  '1': '1. sınıf',
  '2': '2. sınıf',
  '3': '3. sınıf',
  '4': '4. sınıf',
  '5': '5. sınıf',
  '6': '6. sınıf',
  '7': '7. sınıf',
  '8': '8. sınıf',
  '9': '9. sınıf',
  '10': '10. sınıf',
  '11': '11. sınıf',
  '12': '12. sınıf',
  Hazırlık: 'Hazırlık',
  Mezun: 'Mezun',
};

const DAY_LABELS = [
  '', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi', 'Pazar',
] as const;

const STATUS_LABELS: Record<string, string> = {
  draft: 'Taslak',
  completed: 'Tamamlandı',
  sent: 'Gönderildi',
};

const EXPORT_LIMIT = 5000;

/** Öğrenciler — GET /admin/students ile aynı filtreler (q + classId). */
export function studentsExportCsv(params: { q?: string; classId?: string }): string {
  const q = params.q ? normalizeTurkish(params.q.trim()) : '';
  const where = [`u.role = 'student'`, `u.deleted_at IS NULL`, `s.deleted_at IS NULL`];
  const values: Array<string | number> = [];
  if (q) {
    where.push(`(u.full_name_normalized LIKE ? OR gu.full_name_normalized LIKE ?)`);
    values.push(`%${q}%`, `%${q}%`);
  }
  if (params.classId) {
    where.push(`e.class_id = ?`);
    values.push(params.classId);
  }

  const rows = db
    .prepare(
      `SELECT u.full_name, gu.full_name AS guardian_name, c.name AS class_name,
              sch.name AS school_name, s.grade_level, u.username
       FROM users u
       JOIN students s ON s.user_id = u.id AND s.deleted_at IS NULL
       JOIN enrollments e ON e.student_id = s.id AND e.end_date IS NULL
       LEFT JOIN guardians g ON g.id = s.guardian_id AND g.deleted_at IS NULL
       LEFT JOIN users gu ON gu.id = g.user_id
       LEFT JOIN schools sch ON sch.id = s.school_id AND sch.deleted_at IS NULL
       JOIN classes c ON c.id = e.class_id
       WHERE ${where.join(' AND ')}
       ORDER BY u.full_name
       LIMIT ${EXPORT_LIMIT}`,
    )
    .all(...values) as Array<{
    full_name: string;
    guardian_name: string | null;
    class_name: string;
    school_name: string | null;
    grade_level: string | null;
    username: string;
  }>;

  return toCsv(rows, [
    { header: 'Ad Soyad', value: (r) => r.full_name },
    { header: 'Veli', value: (r) => r.guardian_name ?? '' },
    { header: 'Dershane Sınıfı', value: (r) => r.class_name },
    { header: 'Okul', value: (r) => r.school_name ?? '' },
    {
      header: 'Sınıf Seviyesi',
      value: (r) =>
        r.grade_level ? GRADE_LEVEL_LABELS[r.grade_level] ?? r.grade_level : '',
    },
    { header: 'Kullanıcı Adı', value: (r) => r.username },
  ], { bom: true });
}

/** Veliler — GET /admin/guardians ile aynı filtre (q). */
export function guardiansExportCsv(params: { q?: string }): string {
  const q = params.q ? normalizeTurkish(params.q.trim()) : '';
  const where = [`u.role = 'guardian'`, `u.deleted_at IS NULL`];
  const values: Array<string | number> = [];
  if (q) {
    where.push(`u.full_name_normalized LIKE ?`);
    values.push(`%${q}%`);
  }

  const rows = db
    .prepare(
      `SELECT u.full_name, u.username, g.whatsapp_phone, g.consent_at,
              (SELECT COUNT(*) FROM students s
                WHERE s.guardian_id = g.id AND s.deleted_at IS NULL) AS child_count
       FROM users u
       JOIN guardians g ON g.user_id = u.id AND g.deleted_at IS NULL
       WHERE ${where.join(' AND ')}
       ORDER BY u.full_name
       LIMIT ${EXPORT_LIMIT}`,
    )
    .all(...values) as Array<{
    full_name: string;
    username: string;
    whatsapp_phone: string;
    consent_at: string | null;
    child_count: number;
  }>;

  return toCsv(rows, [
    { header: 'Ad Soyad', value: (r) => r.full_name },
    { header: 'Kullanıcı Adı', value: (r) => r.username },
    { header: 'WhatsApp', value: (r) => r.whatsapp_phone },
    { header: 'Çocuk Sayısı', value: (r) => r.child_count },
    { header: 'KVKK Onayı', value: (r) => (r.consent_at ? 'Onaylı' : 'Onaysız') },
  ], { bom: true });
}

/** Raporlar — GET /teacher/reports (admin kapsamı) ile aynı filtreler. */
export function reportsExportCsv(params: {
  status?: string;
  classId?: string;
  weekId?: string;
  q?: string;
}): string {
  const where = ['cc.deleted_at IS NULL'];
  const values: Array<string | number> = [];
  if (params.status && ['draft', 'completed', 'sent'].includes(params.status)) {
    where.push('r.status = ?');
    values.push(params.status);
  }
  if (params.classId) {
    where.push('cc.class_id = ?');
    values.push(params.classId);
  }
  if (params.weekId) {
    where.push('r.week_id = ?');
    values.push(params.weekId);
  }
  // Arama: sınıf veya ders adı (normalize) — /teacher/reports ile aynı mantık.
  const q = params.q ? normalizeTurkish(params.q.trim()) : '';
  if (q) {
    where.push('(c.name_normalized LIKE ? OR co.name_normalized LIKE ?)');
    values.push(`%${q}%`, `%${q}%`);
  }

  const rows = db
    .prepare(
      `SELECT r.status, r.completed_at, cc.day_of_week, cc.lesson_time,
              c.name AS class_name, co.name AS course_name,
              w.week_no, w.label AS week_label,
              (SELECT COUNT(*) FROM report_entries re WHERE re.report_id = r.id) AS student_count
       FROM reports r
       JOIN class_courses cc ON cc.id = r.class_course_id
       JOIN classes c ON c.id = cc.class_id
       JOIN courses co ON co.id = cc.course_id
       JOIN weeks w ON w.id = r.week_id
       WHERE ${where.join(' AND ')}
       ORDER BY w.start_date DESC,
                ${relativeDayOrderSql('cc.day_of_week', 'w.start_date')},
                cc.lesson_time
       LIMIT ${EXPORT_LIMIT}`,
    )
    .all(...values) as Array<{
    status: string;
    completed_at: string | null;
    day_of_week: number;
    lesson_time: string | null;
    class_name: string;
    course_name: string;
    week_no: number;
    week_label: string;
    student_count: number;
  }>;

  return toCsv(rows, [
    { header: 'Hafta', value: (r) => `${r.week_no} · ${r.week_label}` },
    { header: 'Sınıf', value: (r) => r.class_name },
    { header: 'Ders', value: (r) => r.course_name },
    {
      header: 'Ders Günü',
      value: (r) =>
        `${DAY_LABELS[r.day_of_week] ?? r.day_of_week}${r.lesson_time ? ` · ${r.lesson_time}` : ''}`,
    },
    { header: 'Öğrenci Sayısı', value: (r) => r.student_count },
    { header: 'Durum', value: (r) => STATUS_LABELS[r.status] ?? r.status },
    { header: 'Tamamlanma', value: (r) => (r.completed_at ? r.completed_at.slice(0, 10) : '') },
  ], { bom: true });
}

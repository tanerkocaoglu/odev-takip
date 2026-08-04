/**
 * Seed — ayrı CLI script (npm run db:seed).
 *
 * Kurallar (CLAUDE.md · spec.md):
 * - Sunucu başlangıcında çalışmaz; yalnızca CLI'dan çağrılır.
 * - İdempotent: tüm eklemeler `INSERT OR IGNORE` — deterministik id'ler ile.
 *   İkinci çalıştırmada kayıt çoğalmaz (enrollments'ta UNIQUE yoktur;
 *   bu yüzden id'ler `seed-enrollment-...` sabittir).
 * - İlk admin: `ADMIN_PASSWORD` env değeri hash'lenerek eklenir; var olan
 *   admin güncellenmez.
 * - Migration #1'in varlığından emin olur (runMigrations idempotenttir).
 */

import { db } from './index.js';
import { runMigrations } from './migrations.js';
import { loadEnv } from '../utils/env.js';
import { normalizeTurkish } from '../utils/text.js';
import { hashPasswordSync } from '../utils/hash.js';
import { calculateDueDate, type WeekRecord } from '../utils/weeks.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// ---------- Yardımcılar ----------

type Row = Record<string, string | number | null>;

function insert(table: string, row: Row): void {
  const keys = Object.keys(row);
  const placeholders = keys.map(() => '?').join(', ');
  const values = keys.map((k) => row[k]);
  db.prepare(
    `INSERT OR IGNORE INTO ${table} (${keys.join(', ')}) VALUES (${placeholders})`,
  ).run(...values);
}

function now(): string {
  return new Date().toISOString();
}

function pad(n: number): string {
  return String(n).padStart(3, '0');
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/** +90500xxxxxx biçiminde deterministik, benzersiz telefon. */
function phone(seedNum: number): string {
  return `+90500${pad(seedNum)}0000`;
}

// ---------- Sabit veri ----------

const TEACHER_NAMES = [
  'Örnek Kişi 5',
  'Örnek Kişi 4',
  'Zeynep Kaya',
  'Ali Çelik',
  'Fatma Şahin',
  'Mustafa Aydın',
  'Elif Öğüt',
  'Hüseyin Arslan',
  'Örnek Kişi 7',
  'Örnek Kişi 6',
];

const CLASS_NAMES = [
  'EURİST',
  'PİSAGOR',
  'ARŞİMET',
  'SEVA',
  'OMEGA',
  'SİGMA',
  'DELTA',
  'ALFA',
  'BETA',
  'GAMMA',
  'EPSİLON',
  'ZETA',
  'ETA',
  'THETA',
  'İOTA',
  'KAPPA',
  'LAMBDA',
  'MÜ',
  'NÜ',
  'KSİ',
  'OMİKRON',
  'RHO',
  'SİGMA2',
  'TAU',
  'Fİ',
];

const COURSE_NAMES = ['Matematik', 'Fizik', 'Kimya', 'Türkçe', 'İngilizce'];

/**
 * Her sınıfa 4 ders seç (5 dersten dönüşümlü kombinasyon).
 * Farklı sınıflar farklı ders kümesi alır (offset kaydırma).
 */
function coursesForClass(classIndex: number): number[] {
  const offset = classIndex % COURSE_NAMES.length;
  return [0, 1, 2, 3].map((i) => (offset + i) % COURSE_NAMES.length);
}

/** 2025-09-01 (Pazartesi) başlayan 20 hafta üretir; tarihler yerel (İstanbul). */
function buildWeeks(): WeekRecord[] {
  const weeks: WeekRecord[] = [];
  const start = new Date(2025, 8, 1);
  for (let i = 1; i <= 20; i++) {
    const y = start.getFullYear();
    const m = pad2(start.getMonth() + 1);
    const d = pad2(start.getDate());
    const startIso = `${y}-${m}-${d}`;
    const end = new Date(start);
    end.setDate(end.getDate() + 6);
    const ey = end.getFullYear();
    const em = pad2(end.getMonth() + 1);
    const ed = pad2(end.getDate());
    weeks.push({
      id: `seed-week-2025-${pad2(i)}`,
      academic_year_id: 'seed-academic-year-2025-2026',
      week_no: i,
      start_date: startIso,
      end_date: `${ey}-${em}-${ed}`,
      label: `${startIso} - ${ey}-${em}-${ed}`,
    });
    start.setDate(start.getDate() + 7);
  }
  return weeks;
}

/** 2025-09-01 itibarıyla sınıfın hangi öğrenci numaralarını kapsadığını döner. */
function classIndexOf(classId: string, classIds: string[]): number {
  return classIds.indexOf(classId);
}

// Geçen hafta = week_no 19; ödev, week 20'deki ders gününe düşer.
const LAST_WEEK_NO = 19;

interface ClassCourse {
  id: string;
  classId: string;
  courseIdx: number;
  teacherId: string;
  dayOfWeek: number;
  lessonTime: string;
}

// ---------- Seed ana fonksiyonu ----------

export function seedDatabase(adminPassword: string): void {
  runMigrations();

  const yearId = 'seed-academic-year-2025-2026';
  const createdAt = now();

  // --- Eğitim yılı ---
  insert('academic_years', {
    id: yearId,
    name: '2025-2026',
    start_date: '2025-09-01',
    end_date: '2026-06-30',
    is_active: 1,
  });

  // --- Haftalar (20) ---
  const weeks = buildWeeks();
  for (const w of weeks) {
    insert('weeks', {
      id: w.id,
      academic_year_id: yearId,
      week_no: w.week_no,
      start_date: w.start_date,
      end_date: w.end_date,
      label: w.label,
    });
  }

  // --- Admin ---
  insert('users', {
    id: 'seed-user-admin-001',
    full_name: 'Sistem Yöneticisi',
    full_name_normalized: normalizeTurkish('Sistem Yöneticisi'),
    phone: '+905000000001',
    email: 'admin@dershane.local',
    password_hash: hashPasswordSync(adminPassword),
    role: 'admin',
    is_active: 1,
    token_version: 1,
    deleted_at: null,
    created_at: createdAt,
  });

  // --- Öğretmenler (10) ---
  const teacherIds: string[] = [];
  TEACHER_NAMES.forEach((name, i) => {
    const id = `seed-user-teacher-${pad(i + 1)}`;
    teacherIds.push(id);
    insert('users', {
      id,
      full_name: name,
      full_name_normalized: normalizeTurkish(name),
      phone: phone(2 + i),
      email: `ogretmen${i + 1}@dershane.local`,
      password_hash: hashPasswordSync(adminPassword),
      role: 'teacher',
      is_active: 1,
      token_version: 1,
      deleted_at: null,
      created_at: createdAt,
    });
  });

  // --- Dersler (5) ---
  const courseIds: string[] = [];
  COURSE_NAMES.forEach((name) => {
    const id = `seed-course-${normalizeTurkish(name)}`;
    courseIds.push(id);
    insert('courses', {
      id,
      name,
      deleted_at: null,
    });
  });

  // --- Sınıflar (25) ---
  const classIds: string[] = [];
  CLASS_NAMES.forEach((name, i) => {
    const id = `seed-class-${pad(i + 1)}`;
    classIds.push(id);
    insert('classes', {
      id,
      academic_year_id: yearId,
      name,
      deleted_at: null,
    });
  });

  // --- Veliler (200) ve Öğrenciler (200) ---
  // Her öğrenciye 1 veli; sınıf başına 8 öğrenci (25 × 8 = 200).
  for (let s = 1; s <= 200; s++) {
    const studentUserId = `seed-user-student-${pad(s)}`;
    const guardianUserId = `seed-user-guardian-${pad(s)}`;

    const studentName = `Öğrenci ${s}`;
    const guardianName = `Veli ${s}`;
    insert('users', {
      id: studentUserId,
      full_name: studentName,
      full_name_normalized: normalizeTurkish(studentName),
      phone: phone(200 + s),
      email: null,
      password_hash: null,
      role: 'student',
      is_active: 1,
      token_version: 1,
      deleted_at: null,
      created_at: createdAt,
    });
    insert('users', {
      id: guardianUserId,
      full_name: guardianName,
      full_name_normalized: normalizeTurkish(guardianName),
      phone: phone(400 + s),
      email: null,
      password_hash: null,
      role: 'guardian',
      is_active: 1,
      token_version: 1,
      deleted_at: null,
      created_at: createdAt,
    });

    const studentRecId = `seed-student-${pad(s)}`;
    const guardianRecId = `seed-guardian-${pad(s)}`;
    // Sıra önemli: students.guardian_id → guardians(id) FK'sı var;
    // önce guardian kaydı eklenir, sonra student.
    insert('guardians', {
      id: guardianRecId,
      user_id: guardianUserId,
      whatsapp_phone: phone(400 + s),
      phone_secondary: null,
      consent_at: createdAt,
      deleted_at: null,
    });
    insert('students', {
      id: studentRecId,
      user_id: studentUserId,
      guardian_id: guardianRecId,
      deleted_at: null,
    });
  }

  // --- Enrollments (200, aktif) ---
  for (let s = 1; s <= 200; s++) {
    const classIndex = Math.floor((s - 1) / 8); // her sınıfa 8
    insert('enrollments', {
      id: `seed-enrollment-${pad(s)}`,
      student_id: `seed-student-${pad(s)}`,
      class_id: classIds[classIndex],
      start_date: '2025-09-01',
      end_date: null,
    });
  }

  // --- class_courses (~100) ---
  // Her sınıfa 4 ders; ders günü hafta içi (1..5), öğretmen ders bazında atanır.
  const classCourses: ClassCourse[] = [];
  for (let c = 0; c < classIds.length; c++) {
    const courseIndices = coursesForClass(c);
    courseIndices.forEach((courseIdx, k) => {
      const teacherIdx = (c + k) % TEACHER_NAMES.length;
      const day = ((c + k) % 5) + 1; // 1..5 (hafta içi)
      const hour = 9 + (k % 8); // 09:00-16:00 arası
      const cc = {
        id: `seed-class-course-${pad(c + 1)}-${courseIdx + 1}`,
        classId: classIds[c],
        courseIdx,
        teacherId: teacherIds[teacherIdx],
        dayOfWeek: day,
        lessonTime: `${pad2(hour)}:00`,
      };
      classCourses.push(cc);
      insert('class_courses', {
        id: cc.id,
        class_id: cc.classId,
        course_id: courseIds[courseIdx],
        teacher_id: cc.teacherId,
        day_of_week: cc.dayOfWeek,
        lesson_time: cc.lessonTime,
        deleted_at: null,
      });
    });
  }

  // --- Geçen hafta (week 19) raporları: completed ---
  // Her class_course için 1 rapor + satır başına report_entry + homeworks.
  const lastWeek = weeks.find((w) => w.week_no === LAST_WEEK_NO)!;
  const lastWeekId = lastWeek.id;

  for (const cc of classCourses) {
    const reportId = `seed-report-${cc.id}-w${LAST_WEEK_NO}`;
    const homeworkId = `seed-homework-${cc.id}-w${LAST_WEEK_NO}`;
    const updatedAt = now();

    // Rapor (completed) — prev_homework boş (week 18'de rapor yok).
    insert('reports', {
      id: reportId,
      class_course_id: cc.id,
      week_id: lastWeekId,
      topic_covered: `Hafta ${lastWeek.week_no} konu anlatımı ${cc.courseIdx + 1}`,
      prev_homework_id: null,
      prev_homework_text: null,
      status: 'completed',
      completed_at: updatedAt,
      created_by: cc.teacherId,
      updated_at: updatedAt,
    });

    // Homework: due_date ödev verildikten sonraki ilk aynı ders günüdür.
    const dueDate = calculateDueDate(lastWeek, cc.dayOfWeek, weeks);
    if (!dueDate) {
      // Yılın son haftası senaryosu seed'de geçerli değil — w20 mevcut.
      throw new Error(`Seed: ${cc.id} için due_date hesaplanamadı`);
    }
    insert('homeworks', {
      id: homeworkId,
      report_id: reportId,
      class_course_id: cc.id,
      week_id: lastWeekId,
      description: `Hafta ${lastWeek.week_no} ödevi — ders ${cc.courseIdx + 1}`,
      attachments: null,
      due_date: dueDate,
    });

    // report_entries: sınıftaki öğrenciler (8 öğrenci/sınıf)
    const classIdx = classIndexOf(cc.classId, classIds);
    for (let k = 0; k < 8; k++) {
      const studentNum = classIdx * 8 + k + 1;
      const studentId = `seed-student-${pad(studentNum)}`;

      // Devamsızlık: her sınıfta 1 absent + 1 excused; diğerleri present/late.
      let attendance: string;
      let hw: number | null;
      let interest: number | null;
      if (k === 0) {
        attendance = 'absent';
        hw = null;
        interest = null;
      } else if (k === 1) {
        attendance = 'excused';
        hw = null;
        interest = null;
      } else if (k === 2) {
        attendance = 'late';
        hw = ((cc.courseIdx + k) % 10) + 1;
        interest = ((k + cc.dayOfWeek) % 10) + 1;
      } else {
        attendance = 'present';
        hw = ((cc.courseIdx * 2 + k) % 10) + 1;
        interest = ((cc.dayOfWeek + k * 3) % 10) + 1;
      }

      insert('report_entries', {
        id: `seed-report-entry-${cc.id}-w${LAST_WEEK_NO}-${pad(studentNum)}`,
        report_id: reportId,
        student_id: studentId,
        attendance,
        homework_score: hw,
        interest_score: interest,
        teacher_note:
          attendance === 'absent' || attendance === 'excused'
            ? null
            : 'Düzenli çalışıyor.',
      });
    }
  }
}

// ---------- CLI girişi ----------
// Yalnızca doğrudan `tsx src/db/seed.ts` çalıştırıldığında çalışır;
// testlerden `seedDatabase` import edildiğinde bu blok atlanır.

const isDirectRun =
  process.argv[1] !== undefined &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isDirectRun) {
  loadEnv();
  const adminPassword = process.env.ADMIN_PASSWORD?.trim();
  if (!adminPassword) {
    console.error(
      'ADMIN_PASSWORD ortam değişkeni boş. backend/.env dosyasını kontrol edin.',
    );
    process.exit(1);
  }

  seedDatabase(adminPassword);
  console.log('Seed tamam.');
}

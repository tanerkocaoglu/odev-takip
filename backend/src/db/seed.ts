/**
 * Seed — ayrı CLI script (npm run db:seed).
 *
 * Kurallar (CLAUDE.md · spec.md):
 * - Sunucu başlangıcında çalışmaz; yalnızca CLI'dan çağrılır.
 * - İdempotent: tüm eklemeler `INSERT OR IGNORE` — deterministik id'ler ile.
 * - İlk admin: `ADMIN_PASSWORD` env değeri hash'lenerek eklenir.
 * - Öğrenci/veli kullanıcıları `SEED_USER_PASSWORD` env değeriyle şifrelenir.
 *
 * Demo yapısı (dershane yöneticisi tanıtımı için):
 * - 3 sınıf: A Şubesi, B Şubesi, C Şubesi
 * - 4 ders: Matematik, Fizik, Türkçe, İngilizce
 * - 4 öğretmen (her biri tek derse sabit)
 * - Sınıf başına 4 öğrenci = 12 öğrenci + 12 veli
 * - 3 tamamlanmış geçmiş hafta (17, 18, 19) + bu hafta (20) doldurulacak
 * - week 20 = içinde bulunulan gerçek hafta
 */

import { db } from './index.js';
import { runMigrations } from './migrations.js';
import { loadEnv } from '../utils/env.js';
import { normalizeTurkish } from '../utils/text.js';
import { hashPassword } from '../utils/hash.js';
import { nextUsername } from '../utils/username.js';
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

function fillUsername(userId: string, username: string): void {
  db.prepare(
    `UPDATE users SET username = ? WHERE id = ? AND (username IS NULL OR username = '')`,
  ).run(username, userId);
}

function fillPasswordHash(userId: string, passwordHash: string): void {
  db.prepare(
    `UPDATE users SET password_hash = ? WHERE id = ? AND password_hash IS NULL`,
  ).run(passwordHash, userId);
}

function nowTs(): string {
  return new Date().toISOString();
}

function pad(n: number): string {
  return String(n).padStart(3, '0');
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/** +90530xxxxxx biçiminde deterministik, benzersiz telefon. */
function phone(seedNum: number): string {
  return `+90530${pad(seedNum)}0000`;
}

// ---------- Sabit veri ----------

const TEACHER_NAMES = [
  'Öğretmen 1',
  'Öğretmen 2',
  'Öğretmen 3',
  'Öğretmen 4',
];

const CLASS_NAMES = ['A Şubesi', 'B Şubesi', 'C Şubesi'];

const COURSE_NAMES = ['Matematik', 'Fizik', 'Türkçe', 'İngilizce'];

const SCHOOL_NAMES = [
  'Örnek Okul 1',
  'Örnek Okul 2',
  'Örnek Okul 3',
  'Örnek Okul 4',
];

const SEED_GRADE_LEVELS = ['6', '7', '8', '9', '10', '11', '12'];

/** Geçmiş tamamlanmış haftalar (seed'lenir). Bu hafta (20) boş bırakılır. */
const PAST_WEEK_NOS = [17, 18, 19];

const STUDENTS_PER_CLASS = 4;
const CLASS_COUNT = CLASS_NAMES.length;

// ---------- Öğrenci isimleri (gerçekçi) ----------

const STUDENT_NAMES = [
  // A Şubesi
  'Emre Çetin', 'Elif Demir', 'Örnek Kişi 8', 'Zeynep Kurt',
  // B Şubesi
  'Mehmet Kaya', 'Ayşe Şahin', 'Can Aydın', 'Selin Gürel',
  // C Şubesi
  'Arda Koç', 'Merve Polat', 'Barış Doğan', 'Deniz Aksoy',
];

const GUARDIAN_NAMES = [
  // A Şubesi velileri
  'Ali Çetin', 'Fatma Demir', 'Mustafa Yılmaz', 'Hatice Kurt',
  // B Şubesi velileri
  'Hüseyin Kaya', 'Emine Şahin', 'Ömer Aydın', 'Leyla Gürel',
  // C Şubesi velileri
  'Yusuf Koç', 'Zübeyde Polat', 'Kadir Doğan', 'Nalan Aksoy',
];

// ---------- Tarih yardımcıları ----------

function toIsoLocal(date: Date): string {
  const y = date.getFullYear();
  const m = pad2(date.getMonth() + 1);
  const d = pad2(date.getDate());
  return `${y}-${m}-${d}`;
}

/** İçinde bulunulan haftanın Pazartesi günü (yerel). */
function mondayOfCurrentWeek(): Date {
  const now = new Date();
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  monday.setDate(monday.getDate() - ((now.getDay() + 6) % 7));
  return monday;
}

/**
 * 21 hafta üretir; week 20 = bu gerçek hafta, week 21 = sonraki hafta.
 */
function buildWeeks(): WeekRecord[] {
  const weeks: WeekRecord[] = [];
  const yearStart = mondayOfCurrentWeek();
  yearStart.setDate(yearStart.getDate() - 19 * 7);
  const start = new Date(yearStart);
  for (let i = 1; i <= 21; i++) {
    const startIso = toIsoLocal(start);
    const end = new Date(start);
    end.setDate(end.getDate() + 6);
    weeks.push({
      id: `seed-week-${pad2(i)}`,
      academic_year_id: 'seed-academic-year',
      week_no: i,
      start_date: startIso,
      end_date: toIsoLocal(end),
      label: `${startIso} - ${toIsoLocal(end)}`,
    });
    start.setDate(start.getDate() + 7);
  }
  return weeks;
}

interface ClassCourse {
  id: string;
  classId: string;
  classIndex: number;
  courseIdx: number;
  teacherId: string;
  dayOfWeek: number;
  lessonTime: string;
}

// ---------- Seed ana fonksiyonu ----------

export async function seedDatabase(
  adminPassword: string,
  userPassword: string,
): Promise<void> {
  runMigrations();

  const yearId = 'seed-academic-year';
  const createdAt = nowTs();

  const adminHash = await hashPassword(adminPassword);
  const userHash = await hashPassword(userPassword);

  // --- Haftalar (21) ---
  const weeks = buildWeeks();
  const yearStart = weeks[0].start_date;
  const yearEnd = weeks[weeks.length - 1].end_date;
  const yearName = `${yearStart.slice(0, 4)}-${Number(yearStart.slice(0, 4)) + 1}`;

  insert('academic_years', {
    id: yearId,
    name: yearName,
    start_date: yearStart,
    end_date: yearEnd,
    is_active: 1,
  });

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
    username: null,
    email: 'admin@dershane.local',
    password_hash: adminHash,
    role: 'admin',
    is_active: 1,
    token_version: 1,
    deleted_at: null,
    created_at: createdAt,
  });

  // --- Öğretmenler (4) — her biri tek derse sabitlenir ---
  const teacherIds: string[] = [];
  TEACHER_NAMES.forEach((name, i) => {
    const id = `seed-user-teacher-${pad(i + 1)}`;
    teacherIds.push(id);
    insert('users', {
      id,
      full_name: name,
      full_name_normalized: normalizeTurkish(name),
      username: null,
      email: `ogretmen${i + 1}@dershane.local`,
      password_hash: adminHash,
      role: 'teacher',
      is_active: 1,
      token_version: 1,
      deleted_at: null,
      created_at: createdAt,
    });
  });

  // --- Dersler (4) ---
  const courseIds: string[] = [];
  COURSE_NAMES.forEach((name) => {
    const id = `seed-course-${normalizeTurkish(name)}`;
    courseIds.push(id);
    insert('courses', {
      id,
      name,
      name_normalized: normalizeTurkish(name),
      deleted_at: null,
    });
  });

  // --- Sınıflar (3) ---
  const classIds: string[] = [];
  CLASS_NAMES.forEach((name, i) => {
    const id = `seed-class-${pad(i + 1)}`;
    classIds.push(id);
    insert('classes', {
      id,
      academic_year_id: yearId,
      name,
      name_normalized: normalizeTurkish(name),
      deleted_at: null,
    });
  });

  // --- Okullar (4) --- sınıflardan önce eklenmeli (öğrenci FK'sı schools'a bakıyor)
  SCHOOL_NAMES.forEach((name, i) => {
    insert('schools', {
      id: `seed-school-${String(i + 1).padStart(3, '0')}`,
      name,
      name_normalized: normalizeTurkish(name),
      deleted_at: null,
    });
  });

  // --- Veliler + Öğrenciler (12'şer) ---
  for (let s = 1; s <= CLASS_COUNT * STUDENTS_PER_CLASS; s++) {
    const studentUserId = `seed-user-student-${pad(s)}`;
    const guardianUserId = `seed-user-guardian-${pad(s)}`;

    const studentName = STUDENT_NAMES[s - 1] ?? `Öğrenci ${s}`;
    const guardianName = GUARDIAN_NAMES[s - 1] ?? `Veli ${s}`;

    const studentUsername = nextUsername('student');
    insert('users', {
      id: studentUserId,
      full_name: studentName,
      full_name_normalized: normalizeTurkish(studentName),
      username: studentUsername,
      email: null,
      password_hash: userHash,
      role: 'student',
      is_active: 1,
      token_version: 1,
      deleted_at: null,
      created_at: createdAt,
    });
    fillUsername(studentUserId, studentUsername);
    fillPasswordHash(studentUserId, userHash);

    const guardianUsername = nextUsername('guardian');
    insert('users', {
      id: guardianUserId,
      full_name: guardianName,
      full_name_normalized: normalizeTurkish(guardianName),
      username: guardianUsername,
      email: null,
      password_hash: userHash,
      role: 'guardian',
      is_active: 1,
      token_version: 1,
      deleted_at: null,
      created_at: createdAt,
    });
    fillUsername(guardianUserId, guardianUsername);
    fillPasswordHash(guardianUserId, userHash);

    const studentRecId = `seed-student-${pad(s)}`;
    const guardianRecId = `seed-guardian-${pad(s)}`;

    insert('guardians', {
      id: guardianRecId,
      user_id: guardianUserId,
      whatsapp_phone: phone(s),
      phone_secondary: null,
      consent_at: createdAt, // KVKK onayı verilmiş — raporlar gönderilebilir
      deleted_at: null,
    });

    // Okul + sınıf seviyesi döngüsel atama (gerçekçi demo verisi)
    const schoolIdx = ((s - 1) % SCHOOL_NAMES.length) + 1;
    const gradeLevel = SEED_GRADE_LEVELS[(s - 1) % SEED_GRADE_LEVELS.length];

    insert('students', {
      id: studentRecId,
      user_id: studentUserId,
      guardian_id: guardianRecId,
      school_id: `seed-school-${String(schoolIdx).padStart(3, '0')}`,
      grade_level: gradeLevel,
      deleted_at: null,
    });
  }

  // --- Enrollments: her öğrenci kendi sınıfına ---
  for (let s = 1; s <= CLASS_COUNT * STUDENTS_PER_CLASS; s++) {
    insert('enrollments', {
      id: `seed-enrollment-${pad(s)}`,
      student_id: `seed-student-${pad(s)}`,
      class_id: classIds[Math.floor((s - 1) / STUDENTS_PER_CLASS)],
      start_date: yearStart,
      end_date: null,
    });
  }

  // --- class_courses (3 sınıf × 4 ders = 12) ---
  // Her öğretmen tek derse sabit; ders günü: Mat=Pazartesi, Fiz=Salı, Türk=Çarşamba, İng=Perşembe
  const classCourses: ClassCourse[] = [];
  for (let c = 0; c < classIds.length; c++) {
    COURSE_NAMES.forEach((_, courseIdx) => {
      const cc: ClassCourse = {
        id: `seed-class-course-${pad(c + 1)}-${courseIdx + 1}`,
        classId: classIds[c],
        classIndex: c,
        courseIdx,
        teacherId: teacherIds[courseIdx],
        dayOfWeek: courseIdx + 1,
        lessonTime: `${pad2(9 + courseIdx)}:00`,
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

  // --- Geçmiş tamamlanmış raporlar (hafta 17, 18, 19) ---
  for (const weekNo of PAST_WEEK_NOS) {
    const week = weeks.find((w) => w.week_no === weekNo)!;
    buildReportBlockForWeek(week, classCourses, weeks);
  }

  // Hafta 20 (bu hafta) kasıtlı boş bırakılır — öğretmenler dolduracak.

  // --- Gönderilmiş digest (hafta 19, tüm öğrenciler) ---
  // Demo'da admin "Haftalık Gönderim" ekranında gönderilmiş örnekler görsün.
  // Yalnızca A Şubesi öğrencilerine (4 kişi) digest gönderilmiş; diğerleri pending.
  const { buildSnapshot } = await import('../services/digests.js');
  for (let s = 1; s <= STUDENTS_PER_CLASS; s++) {
    const studentId = `seed-student-${pad(s)}`;
    const guardianId = `seed-guardian-${pad(s)}`;
    const snapshot = buildSnapshot(studentId, 'seed-week-19', classIds[0]);
    insert('weekly_digests', {
      id: `seed-digest-w19-${pad(s)}`,
      student_id: studentId,
      week_id: 'seed-week-19',
      guardian_id: guardianId,
      token: `seed-token-w19-${pad(s)}`,
      status: 'sent',
      send_count: 1,
      sent_at: createdAt,
      sent_by: 'seed-user-admin-001',
      snapshot: JSON.stringify(snapshot),
      is_revoked: 0,
      first_viewed_at: s <= 2 ? createdAt : null, // 2 tanesi görüntülenmiş
      last_viewed_at: s <= 2 ? createdAt : null,
    });
  }
}

/**
 * Verilen hafta için tüm class_course'lara completed rapor + homework +
 * report_entries üretir. Tüm öğrenciler "present", puan 7/8.
 */
function buildReportBlockForWeek(
  week: WeekRecord,
  classCourses: ClassCourse[],
  allWeeks: WeekRecord[],
): void {
  const updatedAt = nowTs();

  for (const cc of classCourses) {
    const reportId = `seed-report-${cc.id}-w${week.week_no}`;
    const homeworkId = `seed-homework-${cc.id}-w${week.week_no}`;

    insert('reports', {
      id: reportId,
      class_course_id: cc.id,
      week_id: week.id,
      topic_covered: `Hafta ${week.week_no} — ${['Fonksiyon kavramı', 'Kuvvet ve hareket', 'Sözcük türleri', 'Present tense'][cc.courseIdx]} (${week.week_no}. hafta)`,
      prev_homework_id: null,
      prev_homework_text: null,
      status: 'completed',
      completed_at: updatedAt,
      created_by: cc.teacherId,
      updated_at: updatedAt,
    });

    const dueDate = calculateDueDate(week, cc.dayOfWeek, allWeeks) ?? week.end_date;
    insert('homeworks', {
      id: homeworkId,
      report_id: reportId,
      class_course_id: cc.id,
      week_id: week.id,
      description: `${['Alıştırma', 'Deney raporu', 'Yazı ödevi', 'Kelime listesi'][cc.courseIdx]} — hafta ${week.week_no}`,
      attachments: null,
      due_date: dueDate,
    });

    // Sınıftaki tüm öğrenciler için entry
    const classIdx = cc.classIndex;
    const baseStart = classIdx * 4 + 1;
    for (let i = 0; i < 4; i++) {
      const studentNum = baseStart + i;
      insert('report_entries', {
        id: `seed-entry-${cc.id}-w${week.week_no}-${String(studentNum).padStart(3, '0')}`,
        report_id: reportId,
        student_id: `seed-student-${String(studentNum).padStart(3, '0')}`,
        attendance: 'present',
        homework_score: 7 + (studentNum % 3), // 7, 8 veya 9 — biraz çeşitlilik
        interest_score: 8,
        teacher_note: null,
      });
    }
  }
}

// ---------- CLI girişi ----------

const isDirectRun =
  process.argv[1] !== undefined &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isDirectRun) {
  loadEnv();
  const adminPassword = process.env.ADMIN_PASSWORD?.trim();
  if (!adminPassword) {
    console.error('ADMIN_PASSWORD ortam değişkeni boş. backend/.env dosyasını kontrol edin.');
    process.exit(1);
  }
  const userPassword = process.env.SEED_USER_PASSWORD?.trim();
  if (!userPassword) {
    console.error('SEED_USER_PASSWORD ortam değişkeni boş. backend/.env dosyasını kontrol edin.');
    process.exit(1);
  }

  await seedDatabase(adminPassword, userPassword);
  console.log('Seed tamam.');
}

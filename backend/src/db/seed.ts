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
 * - Öğrenci/veli kullanıcıları `SEED_USER_PASSWORD` env değeriyle şifrelenir;
 *   `username`'leri otomatik üretilir (ogrenci<n> / veli<n> — spec.md §2.1).
 * - Migration #1'in varlığından emin olur (runMigrations idempotenttir).
 *
 * Aşama 2a retrofit: seedDatabase artık async'tir (`hashPassword` asenkron);
 * eski DB'de kalan seed satırlarına fillUsername/fillPasswordHash ile geriye
 * dönük username + şifre atanır (INSERT OR IGNORE güncellemez).
 *
 * Senaryo verileri:
 * - 5 velinin 2'şer çocuğu (kardeş öğrenciler 201-205, sınıf 6-10'a dağıtılır)
 *   → veli paneli "öğrenci seçimi" Aşama 5'te test edilebilir.
 * - 2 öğrenci (3 ve 4) dönem ortasında sınıf değiştirir (sınıf 1 → 6/7);
 *   kapanan enrollment + yeni enrollment. Week 8'de eski sınıfta, week 19'da
 *   yeni sınıfta raporları vardır — "geçmiş raporlar eski sınıfta kalır".
 * - Haftalar gerçek takvime göre üretilir (21 hafta): **week 20 = içinde
 *   bulunulan hafta, week 21 = sonraki hafta** — doldurulacak haftanın her
 *   zaman bir sonraki haftası vardır, `due_date` otomatik hesaplanır.
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

function update(table: string, set: Row, where: Row): void {
  const setKeys = Object.keys(set);
  const whereKeys = Object.keys(where);
  const setSql = setKeys.map((k) => `${k} = ?`).join(', ');
  const whereSql = whereKeys.map((k) => `${k} = ?`).join(' AND ');
  const values = [
    ...setKeys.map((k) => set[k]),
    ...whereKeys.map((k) => where[k]),
  ];
  db.prepare(`UPDATE ${table} SET ${setSql} WHERE ${whereSql}`).run(...values);
}

/**
 * Boşluk doldurma (Aşama 2a retrofit) — eski DB'de (migration #5 öncesi seed)
 * var olan öğrenci/veli satırları `username`/`password_hash` içermez; `INSERT
 * OR IGNORE` mevcut satırı güncellemediği için bu geçiş eksik alanları doldurur.
 * Yalnızca NULL/'BOŞ' olanları yazar → idempotent; admin/öğretmen şifrelerine
 * dokunmaz (onların hash'i asla NULL değildir).
 */
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

/** Her sınıfa 4 ders seç (5 dersten dönüşümlü kombinasyon). */
function coursesForClass(classIndex: number): number[] {
  const offset = classIndex % COURSE_NAMES.length;
  return [0, 1, 2, 3].map((i) => (offset + i) % COURSE_NAMES.length);
}

/** Yerel saatte YYYY-MM-DD (UTC çıkarımı yapılmaz — CLAUDE.md). */
function toIsoLocal(date: Date): string {
  const y = date.getFullYear();
  const m = pad2(date.getMonth() + 1);
  const d = pad2(date.getDate());
  return `${y}-${m}-${d}`;
}

/** İçinde bulunulan haftanın Pazartesi günü (yerel). day_of_week 1 = Pazartesi. */
function mondayOfCurrentWeek(): Date {
  const now = new Date();
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  // JS: 0=Pazar..6=Cumartesi → (getDay()+6)%7: 0=Pazartesi..6=Pazar
  monday.setDate(monday.getDate() - ((now.getDay() + 6) % 7));
  return monday;
}

/**
 * 21 hafta üretir; **week 20 içinde bulunulan gerçek haftadır**, week 21 bir
 * sonraki ders haftasıdır. Kural (CLAUDE.md Aşama 3): seed'de doldurulacak
 * haftanın (week 20) her zaman bir sonraki haftası vardır — böylece
 * `homeworks.due_date` her zaman otomatik hesaplanır; yılın son haftası sınır
 * durumu yalnızca test fixture'ıyla (sahte tek hafta) kapsanır.
 */
function buildWeeks(): WeekRecord[] {
  const weeks: WeekRecord[] = [];
  const yearStart = mondayOfCurrentWeek();
  yearStart.setDate(yearStart.getDate() - 19 * 7); // week 20 = bu hafta
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

// Senaryo sabitleri
const LAST_WEEK_NO = 19;
const SIBLING_COUNT = 5; // kardeş öğrenci adedi (201-205)
const MOVED_STUDENTS: Record<number, number> = {
  3: 6, // öğrenci 3 → sınıf 6
  4: 7, // öğrenci 4 → sınıf 7
};
const SIBLING_CLASSES = [6, 7, 8, 9, 10]; // kardeş 201..205 → sınıf 6..10

/**
 * Bir sınıfın week 19'da (mevcut) aktif öğrenci numaralarını döner.
 * - Sınıf indeksi 0 (sınıf 1): 3 ve 4 ayrıldı → [1,2,5,6,7,8]
 * - Kardeşler ve değişenler o sınıfa eklendiği gibi döner.
 */
function week19StudentNumbers(
  classIdx: number,
  siblingStudentNumbers: number[],
): number[] {
  const baseStart = classIdx * 8 + 1;
  const base = Array.from({ length: 8 }, (_, i) => baseStart + i);

  // Ayrılanlar: yalnızca sınıf 1'den (3 ve 4)
  const removed = classIdx === 0 ? [3, 4] : [];

  // Eklenenler: taşınan öğrenciler
  const movedIn: number[] = [];
  for (const [studentNum, targetClass] of Object.entries(MOVED_STUDENTS)) {
    if (targetClass - 1 === classIdx) movedIn.push(Number(studentNum));
  }
  // Eklenenler: kardeşler (siblingStudentNumbers[i] sınıf = SIBLING_CLASSES[i])
  const siblingIn: number[] = [];
  siblingStudentNumbers.forEach((num, i) => {
    if (SIBLING_CLASSES[i] - 1 === classIdx) siblingIn.push(num);
  });

  const result = base.filter((n) => !removed.includes(n));
  result.push(...movedIn, ...siblingIn);
  // Sınıf 1'de öğrenci 3'ün kaldığı sınıfta iki kez eklenmemesi için unique
  return [...new Set(result)];
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
  const createdAt = now();

  // Tek sefer hash — her satır için scrypt çalıştırılmaz. Aynı değer tüm
  // seed kullanıcılarına yazılır; fill-password yalnızca NULL'ken çalışır.
  const adminHash = await hashPassword(adminPassword);
  const userHash = await hashPassword(userPassword);

  // --- Haftalar (21) — week 20 = bu hafta, week 21 = sonraki hafta ---
  const weeks = buildWeeks();
  const yearStart = weeks[0].start_date;
  const yearEnd = weeks[weeks.length - 1].end_date;
  const yearName = `${yearStart.slice(0, 4)}-${Number(yearStart.slice(0, 4)) + 1}`;

  // --- Eğitim yılı (tarihler haftalardan türetilir) ---
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

  // --- Öğretmenler (10) ---
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

  // --- Dersler (5) ---
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

  // --- Sınıflar (25) ---
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

  // --- Veliler (200) + Öğrenciler (200) ---
  for (let s = 1; s <= 200; s++) {
    const studentUserId = `seed-user-student-${pad(s)}`;
    const guardianUserId = `seed-user-guardian-${pad(s)}`;

    const studentName = `Öğrenci ${s}`;
    const guardianName = `Veli ${s}`;

    // Username otomatik üretilir (spec.md §2.1): ogrenci<n> / veli<n>.
    // Deterministik döngü sırası + fill-gaps sayesinde hem taze hem eski DB'de
    // aynı sonuç — INSERT OR IGNORE deterministik id'lerle idempotent kalır.
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
    // Sıra: students.guardian_id → guardians(id) FK olduğundan önce guardian.
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

  // --- Kardeş öğrenciler (201-205) → ilk 5 veliye ---
  const siblingStudentNumbers: number[] = [];
  for (let k = 1; k <= SIBLING_COUNT; k++) {
    const studentNum = 200 + k;
    siblingStudentNumbers.push(studentNum);
    const studentUserId = `seed-user-student-${pad(studentNum)}`;
    const guardianRecId = `seed-guardian-${pad(k)}`; // veli 1..5
    const studentName = `Öğrenci ${studentNum}`;

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

    insert('students', {
      id: `seed-student-${pad(studentNum)}`,
      user_id: studentUserId,
      guardian_id: guardianRecId,
      deleted_at: null,
    });
  }

  // --- Enrollments (ayrılanlar kapanır, yeni kayıtlar açılır) ---
  // Aktif (temel) üyeler: öğrenci 1..200, sınıf = (s-1)//8
  for (let s = 1; s <= 200; s++) {
    insert('enrollments', {
      id: `seed-enrollment-${pad(s)}`,
      student_id: `seed-student-${pad(s)}`,
      class_id: classIds[Math.floor((s - 1) / 8)],
      start_date: yearStart,
      end_date: null,
    });
  }

  // Sınıf değişikliği: öğrenci 3 ve 4 — eski kayıt, week 9'un sonunda kapanır
  // (9. hafta = weeks[8]; bir sonraki ders haftası sınırı), yeni sınıflara
  // week 10 başında yeni aktif kayıt açılır.
  // NOT: `WHERE end_date = ?` ile NULL eşleşmez (SQL: NULL = NULL → false),
  // bu yüzden deterministik temel id (`seed-enrollment-003`) ile güncellenir.
  for (const [studentNum, targetClass] of Object.entries(MOVED_STUDENTS)) {
    const num = Number(studentNum);
    update(
      'enrollments',
      { end_date: weeks[8].end_date },
      { id: `seed-enrollment-${pad(num)}` },
    );
    insert('enrollments', {
      id: `seed-enrollment-moved-${pad(num)}`,
      student_id: `seed-student-${pad(num)}`,
      class_id: classIds[targetClass - 1],
      start_date: weeks[9].start_date,
      end_date: null,
    });
  }

  // Kardeş öğrenciler → sınıf 6-10'a aktif kayıt
  siblingStudentNumbers.forEach((num, i) => {
    insert('enrollments', {
      id: `seed-enrollment-sibling-${pad(num)}`,
      student_id: `seed-student-${pad(num)}`,
      class_id: classIds[SIBLING_CLASSES[i] - 1],
      start_date: yearStart,
      end_date: null,
    });
  });

  // --- class_courses (~100) ---
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
        classIndex: c,
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
  const lastWeek = weeks.find((w) => w.week_no === LAST_WEEK_NO)!;
  buildReportBlockForWeek(lastWeek, classCourses, weeks, (cc) =>
    week19StudentNumbers(cc.classIndex, siblingStudentNumbers),
  );

  // --- Geçmiş blok: week 8 — sınıf 1 ve 2 (değişimden önce) ---
  // "Geçmiş raporlar eski sınıfta kalır" kuralının kanıtı: öğrenci 3 ve 4
  // week 8 raporlarında ESKİ sınıflarında (sınıf 1) görünür.
  const pastWeek = weeks.find((w) => w.week_no === 8)!;
  const pastClassCourses = classCourses.filter(
    (cc) => cc.classIndex === 0 || cc.classIndex === 1,
  );
  buildReportBlockForWeek(pastWeek, pastClassCourses, weeks, (cc) => {
    const baseStart = cc.classIndex * 8 + 1;
    return Array.from({ length: 8 }, (_, i) => baseStart + i);
  });
}

/**
 * Bir hafta için her class_course'a bir completed rapor + homework +
 * report_entries üretir (öğrenci listesi verilen fonksiyondan gelir).
 * due_date, ödevin verildiği tarihten sonraki bir sonraki aynı ders günüdür.
 */
function buildReportBlockForWeek(
  week: WeekRecord,
  classCourses: ClassCourse[],
  allWeeks: WeekRecord[],
  studentNumbersFor: (cc: ClassCourse) => number[],
): void {
  const weekId = week.id;

  for (const cc of classCourses) {
    const reportId = `seed-report-${cc.id}-w${week.week_no}`;
    const homeworkId = `seed-homework-${cc.id}-w${week.week_no}`;
    const updatedAt = now();

    insert('reports', {
      id: reportId,
      class_course_id: cc.id,
      week_id: weekId,
      topic_covered: `Hafta ${week.week_no} konu anlatımı ${cc.courseIdx + 1}`,
      prev_homework_id: null,
      prev_homework_text: null,
      status: 'completed',
      completed_at: updatedAt,
      created_by: cc.teacherId,
      updated_at: updatedAt,
    });

    // Week 20 yoksa (son hafta) due_date = week.end_date düşer.
    const dueDate =
      calculateDueDate(week, cc.dayOfWeek, allWeeks) ?? week.end_date;
    insert('homeworks', {
      id: homeworkId,
      report_id: reportId,
      class_course_id: cc.id,
      week_id: weekId,
      description: `Hafta ${week.week_no} ödevi — ders ${cc.courseIdx + 1}`,
      attachments: null,
      due_date: dueDate,
    });

    for (const studentNum of studentNumbersFor(cc)) {
      insert('report_entries', {
        id: `seed-report-entry-${cc.id}-w${week.week_no}-${pad(studentNum)}`,
        report_id: reportId,
        student_id: `seed-student-${pad(studentNum)}`,
        attendance: 'present',
        homework_score: ((cc.courseIdx + studentNum) % 10) + 1,
        interest_score: ((cc.dayOfWeek + studentNum) % 10) + 1,
        teacher_note: 'Düzenli çalışıyor.',
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
  const userPassword = process.env.SEED_USER_PASSWORD?.trim();
  if (!userPassword) {
    console.error(
      'SEED_USER_PASSWORD ortam değişkeni boş. backend/.env dosyasını kontrol edin.',
    );
    process.exit(1);
  }

  await seedDatabase(adminPassword, userPassword);
  console.log('Seed tamam.');
}
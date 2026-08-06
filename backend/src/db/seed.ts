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
 * Gerçek dershane yapısı (Aşama 5 küçültme — 8 sınıf × 5 ders × 5 öğrenci):
 * - 8 sınıf: ÖKLİD, PİSAGOR, SEVA, FERMAT, AZİZ SANCAR, ALİ KUŞÇU, CAHİT ARF,
 *   BİRUNİ.
 * - 5 ders (sabit): Cebir, Geometri, Problem Çözme, Fonksiyonlar, Sayılar.
 * - 5 öğretmen: her biri tek derse sabitlenir, o dersi 8 sınıfın hepsinde
 *   verir → class_courses = 8×5 = 40.
 * - Ders günü sabittir: Cebir=Pazartesi, Geometri=Salı, Problem Çözme=Çarşamba,
 *   Fonksiyonlar=Perşembe, Sayılar=Cuma — tüm sınıflarda aynı ders aynı gün.
 * - 40 öğrenci (sınıf başına 5) + 40 veli. Senaryolar küçük ölçekte korunur:
 *   * Kardeş: veli 1 ve 2'nin 2'şer çocuğu (öğrenci 1&41, 2&42) → veli paneli
 *     "öğrenci seçimi" test edilebilir.
 *   * Sınıf değişikliği: öğrenci 3, week 10 başında sınıf 1 → sınıf 4 (FERMAT)
 *     geçer; week 8 raporlarında ESKİ sınıfında (sınıf 1) görünür — "geçmiş
 *     raporlar eski sınıfta kalır".
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
import { buildSnapshot } from '../services/digests.js';
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

// ---------- Sabit veri (gerçek dershane yapısı) ----------

const TEACHER_NAMES = [
  'Örnek Kişi 5',
  'Örnek Kişi 4',
  'Zeynep Kaya',
  'Ali Çelik',
  'Fatma Şahin',
];

const CLASS_NAMES = [
  'ÖKLİD',
  'PİSAGOR',
  'SEVA',
  'FERMAT',
  'AZİZ SANCAR',
  'ALİ KUŞÇU',
  'CAHİT ARF',
  'BİRUNİ',
];

const COURSE_NAMES = ['Cebir', 'Geometri', 'Problem Çözme', 'Fonksiyonlar', 'Sayılar'];

/** Okullar (migration #6) — arayüzde "Okul"; öğrencilerin bir kısmına atanır. */
const SCHOOL_NAMES = ['Örnek Okul 1', 'Örnek Okul 5', 'Örnek Okul 4', 'Örnek Okul 6'];
/** Okul atanan öğrencilerin sınıf seviyeleri (deterministik dönüşümlü). */
const SEED_GRADE_LEVELS = ['6', '7', '8', '9', '10'];
/** Okul + sınıf seviyesi atanacak öğrenci üst sınırı (1..20 dolu, 21..42 null). */
const SCHOOL_ASSIGN_UP_TO = 20;

/**
 * Risk senaryosu satırları (Aşama 6 — kasıtlı, rastgele değil). Sınıf 1 (ÖKLİD)
 * öğrencilerine week 19 + week 20 raporlarında uygulanır:
 * - 001 → düşük ortalama (puan 2)
 * - 002 → teslim etmeme (puan iyi ama hiç teslim yok)
 * - 004 → ardışık devamsızlık (iki hafta da absent)
 * - 005 → birden çok: düşük ortalama + teslim etmeme
 */
const RISK_ENTRY_OVERRIDES: Record<
  string,
  { attendance: string; homework_score: number | null; interest_score: number | null }
> = {
  '001': { attendance: 'present', homework_score: 2, interest_score: 2 },
  '002': { attendance: 'present', homework_score: 7, interest_score: 8 },
  '004': { attendance: 'absent', homework_score: null, interest_score: null },
  '005': { attendance: 'present', homework_score: 3, interest_score: 3 },
};

/** Teslim etmeyen risk öğrencileri (pad'li numara) — diğer herkes teslim eder. */
const MISSING_SUBMISSION_STUDENTS = new Set(['002', '005']);

const STUDENTS_PER_CLASS = 5;
const CLASS_COUNT = CLASS_NAMES.length;

// Senaryo sabitleri
const LAST_WEEK_NO = 19;
/** Kardeş öğrenciler — veli 1 ve 2'ye ikinci çocuk olarak bağlanır. */
const SIBLING_STUDENTS = [41, 42];
const SIBLING_GUARDIANS = [1, 2];
const SIBLING_CLASSES = [2, 3]; // 41 → sınıf 2 (PİSAGOR), 42 → sınıf 3 (SEVA)
/** Sınıf değişikliği: öğrenci 3, week 10 başında sınıf 1 → sınıf 4 (FERMAT). */
const MOVED_STUDENT = 3;
const MOVED_TO_CLASS = 4;

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

/**
 * Bir sınıfın week 19'da (mevcut) aktif öğrenci numaralarını döner.
 * - Sınıf 1 (idx 0): öğrenci 3 ayrıldı → kalan temel öğrenciler.
 * - Sınıf 4 (idx 3): taşınan öğrenci 3 eklendi.
 * - Sınıf 2/3 (idx 1/2): kardeş öğrenci 41/42 eklendi.
 * - Diğer sınıflar: yalnızca temel 5 öğrenci.
 */
function currentWeekStudentNumbers(classIdx: number): number[] {
  const baseStart = classIdx * STUDENTS_PER_CLASS + 1;
  const base = Array.from({ length: STUDENTS_PER_CLASS }, (_, i) => baseStart + i);

  const removed = classIdx === 0 ? [MOVED_STUDENT] : [];
  const movedIn = MOVED_TO_CLASS - 1 === classIdx ? [MOVED_STUDENT] : [];
  const siblingIn = SIBLING_STUDENTS.filter((_, i) => SIBLING_CLASSES[i] - 1 === classIdx);

  return [...new Set([...base.filter((n) => !removed.includes(n)), ...movedIn, ...siblingIn])];
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

  // --- Öğretmenler (5) — her biri tek derse sabitlenir ---
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

  // --- Dersler (5, sabit) ---
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

  // --- Sınıflar (8) ---
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

  // --- Okullar (4) — `classes`/`courses` deseni; öğrencilerin bir kısmına atanır ---
  SCHOOL_NAMES.forEach((name, i) => {
    insert('schools', {
      id: `seed-school-${pad(i + 1)}`,
      name,
      name_normalized: normalizeTurkish(name),
      deleted_at: null,
    });
  });

  // --- Veliler (40) + Öğrenciler (40) — sınıf başına 5 ---
  for (let s = 1; s <= CLASS_COUNT * STUDENTS_PER_CLASS; s++) {
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

  // --- Kardeş öğrenciler (41, 42) → veli 1 ve 2'ye ikinci çocuk ---
  const siblingStudentNumbers: number[] = [];
  SIBLING_STUDENTS.forEach((studentNum, i) => {
    siblingStudentNumbers.push(studentNum);
    const studentUserId = `seed-user-student-${pad(studentNum)}`;
    const guardianRecId = `seed-guardian-${pad(SIBLING_GUARDIANS[i])}`;
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
  });

  // --- Okul + sınıf seviyesi ataması (kademeli — 1..20 dolu, 21..42 null) ---
  // Gerçek dünyada bu alan zamanla doldurulur; null kalanlar da doğaldır.
  // Fill-gaps deseni (`AND school_id IS NULL`): re-run'da üzerine yazılmaz.
  const assignSchool = db.prepare(
    `UPDATE students SET school_id = ?, grade_level = ?
     WHERE id = ? AND school_id IS NULL`,
  );
  for (let s = 1; s <= SCHOOL_ASSIGN_UP_TO; s++) {
    assignSchool.run(
      `seed-school-${pad(((s - 1) % SCHOOL_NAMES.length) + 1)}`,
      SEED_GRADE_LEVELS[(s - 1) % SEED_GRADE_LEVELS.length],
      `seed-student-${pad(s)}`,
    );
  }

  // --- Enrollments (ayrılanlar kapanır, yeni kayıtlar açılır) ---
  // Temel üyeler: öğrenci 1..40, sınıf = (s-1)//5
  for (let s = 1; s <= CLASS_COUNT * STUDENTS_PER_CLASS; s++) {
    insert('enrollments', {
      id: `seed-enrollment-${pad(s)}`,
      student_id: `seed-student-${pad(s)}`,
      class_id: classIds[Math.floor((s - 1) / STUDENTS_PER_CLASS)],
      start_date: yearStart,
      end_date: null,
    });
  }

  // Sınıf değişikliği: öğrenci 3 — eski kayıt, week 9'un sonunda kapanır
  // (9. hafta = weeks[8]; bir sonraki ders haftası sınırı), yeni sınıfa
  // week 10 başında yeni aktif kayıt açılır.
  // NOT: `WHERE end_date = ?` ile NULL eşleşmez (SQL: NULL = NULL → false),
  // bu yüzden deterministik temel id (`seed-enrollment-003`) ile güncellenir.
  update(
    'enrollments',
    { end_date: weeks[8].end_date },
    { id: `seed-enrollment-${pad(MOVED_STUDENT)}` },
  );
  insert('enrollments', {
    id: `seed-enrollment-moved-${pad(MOVED_STUDENT)}`,
    student_id: `seed-student-${pad(MOVED_STUDENT)}`,
    class_id: classIds[MOVED_TO_CLASS - 1],
    start_date: weeks[9].start_date,
    end_date: null,
  });

  // Kardeş öğrenciler → SIBLING_CLASSES'e aktif kayıt
  siblingStudentNumbers.forEach((num, i) => {
    insert('enrollments', {
      id: `seed-enrollment-sibling-${pad(num)}`,
      student_id: `seed-student-${pad(num)}`,
      class_id: classIds[SIBLING_CLASSES[i] - 1],
      start_date: yearStart,
      end_date: null,
    });
  });

  // --- class_courses (8 × 5 = 40) ---
  // Her öğretmen tek derse sabittir (teacherIdx = courseIdx) ve o dersi 8
  // sınıfın hepsinde verir. Ders günü sabittir: Cebir=Pazartesi (1) …
  // Sayılar=Cuma (5) → tüm sınıflarda aynı ders aynı gün işlenir.
  const classCourses: ClassCourse[] = [];
  for (let c = 0; c < classIds.length; c++) {
    COURSE_NAMES.forEach((_, courseIdx) => {
      const cc = {
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

  // --- Risk penceresi: week 19 + week 20 (son 3 hafta = 19/20/21) ---
  // Sınıf 1 (ÖKLİD) raporları iki haftaya bölünür: 3 ders week 19, 2 ders week 20.
  // Toplam rapor/entry/homework sayısı DEĞİŞMEZ (sınıf 1'in 5 dersi iki haftaya
  // dağılır; 38 + 2 + 5 (week 8) = 45). Böylece:
  // - Risk penceresinde sınıf 1'de İKİ komşu hafta (19, 20) completed veri olur →
  //   ardışık devamsızlık senaryosu tetiklenebilir (tek hafta yeterli olmazdı).
  // - week 20'deki 2 ders completed olduğu için "Bu hafta N raporunuz gecikti"
  //   banner'ı yine görünür (diğer 38 week-20 ataması boş).
  const lastWeek = weeks.find((w) => w.week_no === LAST_WEEK_NO)!;
  const currentWeek = weeks.find((w) => w.week_no === 20)!;
  const riskClassCourses = classCourses.filter(
    (cc) => cc.classIndex === 0 && cc.courseIdx >= 3, // ÖKLİD · Fonksiyonlar + Sayılar
  );

  // Week 19: sınıf 1 hariç tümü + sınıf 1'in ilk 3 dersi (toplam 38 rapor).
  buildReportBlockForWeek(
    lastWeek,
    classCourses.filter((cc) => !(cc.classIndex === 0 && cc.courseIdx >= 3)),
    weeks,
    (cc) => currentWeekStudentNumbers(cc.classIndex),
    RISK_ENTRY_OVERRIDES,
  );

  // Week 20: yalnızca sınıf 1'in son 2 dersi (2 rapor) — risk satırları burada.
  buildReportBlockForWeek(
    currentWeek,
    riskClassCourses,
    weeks,
    () => currentWeekStudentNumbers(0),
    RISK_ENTRY_OVERRIDES,
  );

  // --- Geçmiş blok: week 8 — yalnızca sınıf 1 (değişimden önceki sınıf) ---
  // "Geçmiş raporlar eski sınıfta kalır" kuralının kanıtı: öğrenci 3, week 8
  // raporlarında ESKİ sınıfında (sınıf 1) görünür; week 19'da yeni sınıfında.
  const pastWeek = weeks.find((w) => w.week_no === 8)!;
  const pastClassCourses = classCourses.filter((cc) => cc.classIndex === 0);
  buildReportBlockForWeek(pastWeek, pastClassCourses, weeks, () => {
    const baseStart = 1;
    return Array.from({ length: STUDENTS_PER_CLASS }, (_, i) => baseStart + i);
  });

  // --- Teslim verileri (risk penceresi: week 19 + 20) ---
  // Öğrencinin sınıfındaki window ödevlerine teslim eklenir; yalnızca
  // MISSING_SUBMISSION_STUDENTS (002, 005) teslim etmez → "teslim etmeme"
  // senaryosu tetiklenir. Diğer herkes teslim eder → risk listesi yalnızca
  // hedeflenen öğrencileri gösterir.
  const windowHomeworks = db
    .prepare(
      `SELECT h.id, h.week_id, cc.class_id, w.start_date AS week_start
       FROM homeworks h
       JOIN class_courses cc ON cc.id = h.class_course_id
       JOIN weeks w ON w.id = h.week_id
       WHERE h.week_id IN ('seed-week-19','seed-week-20')`,
    )
    .all() as Array<{ id: string; week_id: string; class_id: string; week_start: string }>;
  const enrollStmt = db.prepare(
    `SELECT s.id AS student_id FROM enrollments e
     JOIN students s ON s.id = e.student_id AND s.deleted_at IS NULL
     JOIN users u ON u.id = s.user_id AND u.deleted_at IS NULL
     WHERE e.class_id = ? AND e.start_date <= ?
       AND (e.end_date IS NULL OR e.end_date >= ?)`,
  );
  const insertSubmission = db.prepare(
    `INSERT OR IGNORE INTO submissions
       (id, homework_id, student_id, note, submitted_at, is_late, status,
        reviewed_by, reviewed_at, files_purged_at)
     VALUES (?, ?, ?, NULL, ?, 0, 'submitted', NULL, NULL, NULL)`,
  );
  for (const hw of windowHomeworks) {
    const students = enrollStmt.all(hw.class_id, hw.week_start, hw.week_start) as Array<{
      student_id: string;
    }>;
    for (const st of students) {
      const num = st.student_id.replace('seed-student-', '');
      if (MISSING_SUBMISSION_STUDENTS.has(num)) continue;
      insertSubmission.run(`seed-submission-${hw.id}-${num}`, hw.id, st.student_id, createdAt);
    }
  }

  // --- Gönderilmiş digest'ler: görüntülenmiş + görüntülenmemiş (migration #6) ---
  // Admin "Görüntülenme" sütununun iki durumu da taze seed'de görünsün.
  // 006, 011 → first/last_viewed dolu; 007, 012 → null.
  const digestStudents: Array<{ num: string; viewed: boolean }> = [
    { num: '006', viewed: true },
    { num: '007', viewed: false },
    { num: '011', viewed: true },
    { num: '012', viewed: false },
  ];
  for (const ds of digestStudents) {
    const studentId = `seed-student-${ds.num}`;
    const classNum = ds.num <= '010' ? '002' : '003'; // 6-10 → PİSAGOR, 11-15 → SEVA
    const snapshot = buildSnapshot(studentId, 'seed-week-19', `seed-class-${classNum}`);
    insert('weekly_digests', {
      id: `seed-digest-${ds.num}`,
      student_id: studentId,
      week_id: 'seed-week-19',
      guardian_id: `seed-guardian-${ds.num}`,
      token: `seed-token-${ds.num}`,
      status: 'sent',
      send_count: 1,
      sent_at: createdAt,
      sent_by: 'seed-user-admin-001',
      snapshot: JSON.stringify(snapshot),
      is_revoked: 0,
      first_viewed_at: ds.viewed ? createdAt : null,
      last_viewed_at: ds.viewed ? createdAt : null,
    });
  }
}

/**
 * Bir hafta için her class_course'a bir completed rapor + homework +
 * report_entries üretir (öğrenci listesi verilen fonksiyondan gelir).
 * due_date, ödevin verildiği tarihten sonraki bir sonraki aynı ders günüdür.
 *
 * Varsayılan satır: `present` + güvenli puanlar (7/8) — risk hesabında yanlış
 * eşik tetiklenmesin. `entryOverrides` (pad'li öğrenci numarasına göre) verilirse
 * o öğrencinin satırı için attendance/puanlar belirtildiği gibi yazılır (risk
 * senaryoları — Aşama 6).
 */
function buildReportBlockForWeek(
  week: WeekRecord,
  classCourses: ClassCourse[],
  allWeeks: WeekRecord[],
  studentNumbersFor: (cc: ClassCourse) => number[],
  entryOverrides?: Record<
    string,
    { attendance: string; homework_score: number | null; interest_score: number | null }
  >,
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
      const override = entryOverrides?.[pad(studentNum)];
      insert('report_entries', {
        id: `seed-report-entry-${cc.id}-w${week.week_no}-${pad(studentNum)}`,
        report_id: reportId,
        student_id: `seed-student-${pad(studentNum)}`,
        attendance: override?.attendance ?? 'present',
        homework_score: override ? override.homework_score : 7,
        interest_score: override ? override.interest_score : 8,
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

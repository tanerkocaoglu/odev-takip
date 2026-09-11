/**
 * Toplu öğrenci içe aktarma (CSV) — spec.md §5.6.
 *
 * İki fazlı çalışır:
 * 1. `prepareImport(text)` — dosyayı ayrıştırır, doğrular, eşleştirir ve
 *    yazılacak planı üretir; **hiçbir şey yazmaz**. Aynı fonksiyon hem önizleme
 *    (`dry_run`) hem de kaydetme öncesi yeniden doğrulama için kullanılır.
 * 2. `commitImport(plan, passwordHash)` — planı **tek transaction'da** yazar
 *    (hepsi ya da hiçbiri). Hata olursa `ROLLBACK` + fırlatır.
 *
 * Kurallar (CLAUDE.md + spec §5.6):
 * - Şifre tektir (ortak başlangıç şifresi); hash dışarıda bir kez hesaplanır.
 * - Dershane sınıfı önceden var olmalı (yoksa satır hatası); okul isimle
 *   eşleşir, yoksa oluşturulur; veli normalize telefonla eşleşir (kardeş).
 * - Soft delete'li kayıtlar eşleştirmeye girmez.
 * - `username` her zaman sunucuda isim tabanlı otomatik üretilir
 *   (`nextUsername`); normalize telefon da sunucuda üretilir, istemci değerine
 *   güvenilmez.
 */

import { randomUUID } from 'node:crypto';
import { db } from '../db/index.js';
import { AppError } from '../errors.js';
import { csvToRecords, toCsv } from '../utils/csv.js';
import { normalizeTurkish } from '../utils/text.js';
import { normalizePhone } from '../utils/phone.js';
import { nextUsername } from '../utils/username.js';

export const STUDENT_IMPORT_HEADERS = [
  'ogrenci_adi',
  'dershane_sinifi',
  'veli_adi',
  'veli_whatsapp',
  'okul_adi',
  'sinif_seviyesi',
] as const;

const REQUIRED_HEADERS = [
  'ogrenci_adi',
  'dershane_sinifi',
  'veli_adi',
  'veli_whatsapp',
] as const;

const GRADE_LEVELS = [
  '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12', 'Hazırlık', 'Mezun',
] as const;

const MAX_ROWS = 500;
const MAX_CSV_BYTES = 2 * 1024 * 1024;

export { MAX_CSV_BYTES };

export interface ImportError {
  row: number;
  field: string;
  message: string;
}

export interface ImportWarning {
  row: number;
  field: string;
  message: string;
}

export interface ImportSummary {
  new_students: number;
  new_guardians: number;
  new_schools: number;
  matched_guardians: number;
  matched_schools: number;
}

interface SchoolPlan {
  key: string;
  name: string;
  id: string | null;
}

interface GuardianPlan {
  phone: string;
  fullName: string;
  id: string | null;
  row: number;
}

interface StudentPlan {
  row: number;
  fullName: string;
  classId: string;
  gradeLevel: string | null;
  guardian: GuardianPlan;
  school: SchoolPlan | null;
}

export interface ImportPlan {
  students: StudentPlan[];
  newGuardians: GuardianPlan[];
  newSchools: SchoolPlan[];
}

export interface ImportPreview {
  ok: boolean;
  summary: ImportSummary;
  errors: ImportError[];
  warnings: ImportWarning[];
}

/** Boş şablon (yalnızca başlık satırı, UTF-8 BOM'lu). */
export function studentImportTemplateCsv(): string {
  return toCsv(
    [],
    STUDENT_IMPORT_HEADERS.map((header) => ({ header, value: () => '' })),
    { bom: true },
  );
}

interface ExistingGuardian {
  id: string;
  full_name: string;
  full_name_normalized: string;
}

/**
 * Dosyayı doğrular ve yazma planını üretir. Dönüş: önizleme özeti + plan.
 * Başlık/satır sayısı gibi dosya düzeyi hatalar `AppError` fırlatır; satır
 * düzeyi hatalar `preview.errors`'a toplanır (hepsi ya da hiçbiri kuralı).
 */
export function prepareImport(text: string): {
  preview: ImportPreview;
  plan: ImportPlan;
} {
  const { headers, records } = csvToRecords(text);

  const missing = REQUIRED_HEADERS.filter((h) => !headers.includes(h));
  if (missing.length > 0) {
    throw new AppError(
      'VALIDATION_ERROR',
      400,
      `CSV başlıkları eksik: ${missing.join(', ')}. Lütfen şablonu indirip kullanın.`,
    );
  }
  if (records.length > MAX_ROWS) {
    throw new AppError(
      'VALIDATION_ERROR',
      400,
      `Bir dosyada en fazla ${MAX_ROWS} öğrenci içe aktarılabilir.`,
    );
  }

  const errors: ImportError[] = [];
  const warnings: ImportWarning[] = [];
  const plan: ImportPlan = { students: [], newGuardians: [], newSchools: [] };

  if (records.length === 0) {
    return {
      preview: {
        ok: true,
        summary: {
          new_students: 0,
          new_guardians: 0,
          new_schools: 0,
          matched_guardians: 0,
          matched_schools: 0,
        },
        errors,
        warnings,
      },
      plan,
    };
  }

  const activeYear = db
    .prepare(`SELECT id FROM academic_years WHERE is_active = 1 LIMIT 1`)
    .get() as { id: string } | undefined;
  if (!activeYear) {
    throw new AppError('VALIDATION_ERROR', 400, 'Aktif eğitim yılı bulunamadı.');
  }

  const classRows = db
    .prepare(
      `SELECT id, name_normalized FROM classes
       WHERE academic_year_id = ? AND deleted_at IS NULL`,
    )
    .all(activeYear.id) as Array<{ id: string; name_normalized: string }>;
  const classByNormalized = new Map<string, string>();
  for (const c of classRows) classByNormalized.set(c.name_normalized, c.id);

  const schoolRows = db
    .prepare(`SELECT id, name_normalized FROM schools WHERE deleted_at IS NULL`)
    .all() as Array<{ id: string; name_normalized: string }>;
  const schoolByNormalized = new Map<string, string>();
  for (const s of schoolRows) schoolByNormalized.set(s.name_normalized, s.id);

  const guardiansByPhone = new Map<string, GuardianPlan>();
  const schoolsByKey = new Map<string, SchoolPlan>();
  const matchedGuardianIds = new Set<string>();
  const matchedSchoolIds = new Set<string>();

  records.forEach((rec, index) => {
    const row = index + 2; // başlık 1. satır
    const studentName = rec['ogrenci_adi'] ?? '';
    const className = rec['dershane_sinifi'] ?? '';
    const guardianName = rec['veli_adi'] ?? '';
    const whatsappRaw = rec['veli_whatsapp'] ?? '';
    const schoolName = rec['okul_adi'] ?? '';
    const gradeLevel = rec['sinif_seviyesi'] ?? '';

    let rowHasError = false;
    const addError = (field: string, message: string) => {
      errors.push({ row, field, message });
      rowHasError = true;
    };

    // --- Öğrenci adı ---
    if (!studentName) addError('ogrenci_adi', 'Öğrenci adı boş olamaz.');

    // --- Dershane sınıfı (önceden var olmalı) ---
    let classId: string | null = null;
    if (!className) {
      addError('dershane_sinifi', 'Dershane sınıfı boş olamaz.');
    } else {
      const normalized = normalizeTurkish(className);
      const found = classByNormalized.get(normalized);
      if (!found) {
        addError('dershane_sinifi', `Sınıf bulunamadı: '${className}'.`);
      } else {
        classId = found;
      }
    }

    // --- Sınıf seviyesi (opsiyonel) ---
    let parsedGrade: string | null = null;
    if (gradeLevel) {
      if (!(GRADE_LEVELS as readonly string[]).includes(gradeLevel)) {
        addError(
          'sinif_seviyesi',
          `Geçersiz sınıf seviyesi: '${gradeLevel}'.`,
        );
      } else {
        parsedGrade = gradeLevel;
      }
    }

    // --- Veli (normalize telefonla eşleştirme) ---
    let guardian: GuardianPlan | null = null;
    if (!guardianName) addError('veli_adi', 'Veli adı boş olamaz.');
    if (!whatsappRaw) {
      addError('veli_whatsapp', 'Veli WhatsApp numarası boş olamaz.');
    } else {
      const phone = normalizePhone(whatsappRaw);
      if (phone.replace(/\D/g, '').length < 10) {
        addError('veli_whatsapp', 'Geçerli bir WhatsApp numarası girin.');
      } else if (guardianName) {
        const existingPlan = guardiansByPhone.get(phone);
        if (existingPlan) {
          guardian = existingPlan;
          if (
            existingPlan.id !== null &&
            normalizeTurkish(existingPlan.fullName) !== normalizeTurkish(guardianName)
          ) {
            warnings.push({
              row,
              field: 'veli_adi',
              message: `Telefon mevcut veliyle eşleşti; kayıtlı ad korunuyor: '${existingPlan.fullName}'.`,
            });
          } else if (
            existingPlan.id === null &&
            normalizeTurkish(existingPlan.fullName) !== normalizeTurkish(guardianName)
          ) {
            warnings.push({
              row,
              field: 'veli_adi',
              message: `Aynı telefon dosyada farklı adla geçti; ilk ad kullanılıyor: '${existingPlan.fullName}'.`,
            });
          }
        } else {
          const existing = db
            .prepare(
              `SELECT g.id, u.full_name, u.full_name_normalized
               FROM guardians g JOIN users u ON u.id = g.user_id
               WHERE g.whatsapp_phone = ? AND g.deleted_at IS NULL
                 AND u.deleted_at IS NULL
               LIMIT 1`,
            )
            .get(phone) as ExistingGuardian | undefined;
          if (existing) {
            matchedGuardianIds.add(existing.id);
            guardian = {
              phone,
              fullName: existing.full_name,
              id: existing.id,
              row,
            };
            if (normalizeTurkish(existing.full_name) !== normalizeTurkish(guardianName)) {
              warnings.push({
                row,
                field: 'veli_adi',
                message: `Telefon mevcut veliyle eşleşti; kayıtlı ad korunuyor: '${existing.full_name}'.`,
              });
            }
          } else {
            guardian = {
              phone,
              fullName: guardianName,
              id: null,
              row,
            };
            plan.newGuardians.push(guardian);
          }
          guardiansByPhone.set(phone, guardian);
        }
      }
    }

    // --- Okul (isimle eşleşir, yoksa oluşturulur) ---
    let school: SchoolPlan | null = null;
    if (schoolName) {
      const key = normalizeTurkish(schoolName);
      const existingId = schoolByNormalized.get(key);
      const existingPlan = schoolsByKey.get(key);
      if (existingId) {
        matchedSchoolIds.add(existingId);
        school = { key, name: schoolName, id: existingId };
      } else if (existingPlan) {
        school = existingPlan;
      } else {
        school = { key, name: schoolName, id: null };
        schoolsByKey.set(key, school);
        plan.newSchools.push(school);
      }
    }

    if (!rowHasError && guardian && classId) {
      plan.students.push({
        row,
        fullName: studentName,
        classId,
        gradeLevel: parsedGrade,
        guardian,
        school,
      });
    }
  });

  return {
    preview: {
      ok: errors.length === 0,
      summary: {
        new_students: plan.students.length,
        new_guardians: plan.newGuardians.length,
        new_schools: plan.newSchools.length,
        matched_guardians: matchedGuardianIds.size,
        matched_schools: matchedSchoolIds.size,
      },
      errors,
      warnings,
    },
    plan,
  };
}

/**
 * Planı tek transaction'da yazar (hepsi ya da hiçbiri). Ortak şifrenin hash'i
 * dışarıda bir kez hesaplanıp verilir. Hata olursa `ROLLBACK` + fırlatır.
 */
export function commitImport(
  plan: ImportPlan,
  passwordHash: string,
): { created_students: number; created_guardians: number; created_schools: number } {
  const now = new Date().toISOString();
  const today = now.slice(0, 10);

  db.exec('BEGIN');
  try {
    for (const school of plan.newSchools) {
      const id = randomUUID();
      db.prepare(
        `INSERT INTO schools (id, name, name_normalized, deleted_at)
         VALUES (?, ?, ?, NULL)`,
      ).run(id, school.name, normalizeTurkish(school.name));
      school.id = id;
    }

    for (const guardian of plan.newGuardians) {
      const userId = randomUUID();
      const guardianId = randomUUID();
      const username = nextUsername(guardian.fullName);
      db.prepare(
        `INSERT INTO users
           (id, full_name, full_name_normalized, username, email, password_hash, role,
            is_active, token_version, deleted_at, created_at)
         VALUES (?, ?, ?, ?, NULL, ?, 'guardian', 1, 1, NULL, ?)`,
      ).run(
        userId,
        guardian.fullName,
        normalizeTurkish(guardian.fullName),
        username,
        passwordHash,
        now,
      );
      db.prepare(
        `INSERT INTO guardians (id, user_id, whatsapp_phone, phone_secondary, consent_at, deleted_at)
         VALUES (?, ?, ?, NULL, NULL, NULL)`,
      ).run(guardianId, userId, guardian.phone);
      guardian.id = guardianId;
    }

    for (const student of plan.students) {
      const guardianId = student.guardian.id;
      if (!guardianId) {
        throw new Error('Veli planı çözümlenemedi.');
      }
      const userId = randomUUID();
      const studentId = randomUUID();
      const enrollmentId = randomUUID();
      const username = nextUsername(student.fullName);
      const schoolId = student.school?.id ?? null;

      db.prepare(
        `INSERT INTO users
           (id, full_name, full_name_normalized, username, email, password_hash, role,
            is_active, token_version, deleted_at, created_at)
         VALUES (?, ?, ?, ?, NULL, ?, 'student', 1, 1, NULL, ?)`,
      ).run(
        userId,
        student.fullName,
        normalizeTurkish(student.fullName),
        username,
        passwordHash,
        now,
      );
      db.prepare(
        `INSERT INTO students (id, user_id, guardian_id, school_id, grade_level, deleted_at)
         VALUES (?, ?, ?, ?, ?, NULL)`,
      ).run(studentId, userId, guardianId, schoolId, student.gradeLevel);
      db.prepare(
        `INSERT INTO enrollments (id, student_id, class_id, start_date, end_date)
         VALUES (?, ?, ?, ?, NULL)`,
      ).run(enrollmentId, studentId, student.classId, today);
    }

    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }

  return {
    created_students: plan.students.length,
    created_guardians: plan.newGuardians.length,
    created_schools: plan.newSchools.length,
  };
}

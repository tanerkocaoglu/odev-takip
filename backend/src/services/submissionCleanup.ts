/**
 * Ödev teslim dosyaları bakım temizliği — manuel CLI (`npm run cleanup-submissions`).
 *
 * ÖNEMLİ: spec.md §8'deki **1 yıllık otomatik** saklama/temizlik politikası
 * bilinçli olarak Aşama 6'ya bırakılmıştır ve henüz uygulanmamıştır. Bu araç o
 * politikanın yerine geçmez; Render Shell'den admin tarafından **elle** çalıştırılan
 * ara dönem bakım komutudur. Amaç: deneme/test amaçlı yüklenip diskte biriken
 * dosyaları, veritabanı kayıtlarıyla **tutarlı** biçimde seçici olarak temizlemek.
 *
 * Kurallar:
 * - Filtre zorunludur; tümünü hedeflemek için açık `all: true` (CLI `--all`) gerekir.
 * - Varsayılan **dry-run**; gerçek silme `execute: true` (CLI `--execute`) ile.
 * - Execute'da önce `createBackup()` ile tam yedek alınır; yedek başarısızsa
 *   silme hiç başlamaz (güvenlik ağı).
 * - DB silme tek transaction'da yapılır; COMMIT **sonrası** disk dosyaları
 *   silinir. Böylece olası bir kesintide kırık referans (DB'de var, diskte yok)
 *   değil, en fazla öksüz dosya (diskte var, DB'de yok) kalır.
 * - `submissions` / `homeworks` / `reports` yapısına dokunulmaz (spec §7.2).
 *   Yalnızca `submission_files` satırları kaldırılır; dosyası tamamen boşalan
 *   teslimlere `files_purged_at` yazılır (spec §8 saklama işareti) — böylece
 *   `GET /api/v1/files/:key` 404 döner ve teslim kaydı geçmişi korunur.
 */

import fs from 'node:fs';
import { db } from '../db/index.js';
import { normalizeTurkish } from '../utils/text.js';
import { localPathFor } from './storage.js';
import { createBackup } from './backup.js';

/** Temizlik hedefini daraltan filtreler (en az biri ya da `all` zorunlu). */
export interface CleanupFilters {
  /** `submitted_at` bu tarihten (YYYY-MM-DD) **önce** olanlar (hariç). */
  before?: string;
  /** `submitted_at` bu tarih (YYYY-MM-DD) **ve sonrası** olanlar (dahil). */
  after?: string;
  /** Öğrenci kullanıcı adı veya `students.id`. */
  student?: string;
  /** Sınıf adı (normalize) veya `classes.id`. */
  className?: string;
  /** `weeks.week_no`. */
  weekNo?: number;
  /** `homeworks.id`. */
  homeworkId?: string;
  /** Tek dosya anahtarı (`submission_files.key`). */
  key?: string;
  /** Tüm teslim dosyalarını hedefle (diğer filtrelerle birlikte kullanılmaz). */
  all?: boolean;
}

export interface CleanupOptions {
  /** `true` ise gerçekten siler; varsayılan `false` (dry-run). */
  execute?: boolean;
  /** Yedeğin yazılacağı dizin (test/özel ortamlar için; varsayılan `backups/`). */
  backupOutDir?: string;
  /** `files_purged_at` için zaman damgası üreteci (test edilebilirlik). */
  now?: () => string;
}

/** Dry-run/plan çıktısındaki tek dosya satırı. */
export interface CleanupPlanFile {
  fileId: string;
  key: string;
  thumbKey: string | null;
  size: number;
  filename: string;
  submissionId: string;
  submittedAt: string;
  studentName: string;
  studentUsername: string | null;
  className: string;
  courseName: string;
  weekNo: number;
}

/** Silme öncesi hesaplanan plan (hiçbir yazma yapılmaz). */
export interface CleanupPlan {
  filters: CleanupFilters;
  files: CleanupPlanFile[];
  fileCount: number;
  totalBytes: number;
  /** Etkilenen farklı teslim (submission) sayısı. */
  submissionCount: number;
  /** Tüm dosyaları seçilen, bu yüzden `files_purged_at` işaretlenecek teslimler. */
  fullyPurgedSubmissions: string[];
  existingOnDisk: number;
  missingOnDisk: number;
  /** Geçersiz/parça key'ler (diske erişilemez; sessizce atlanır). */
  invalidKeys: number;
}

/** Execute sonucu — plan + gerçekleşen işlem özeti. */
export interface CleanupResult extends CleanupPlan {
  executed: boolean;
  backupPath: string | null;
  deletedFileRows: number;
  purgedSubmissions: number;
  deletedDiskFiles: number;
  diskDeleteErrors: Array<{ key: string; message: string }>;
}

interface CleanupFileRow {
  file_id: string;
  key: string;
  thumb_key: string | null;
  size: number;
  filename: string;
  submission_id: string;
  submitted_at: string;
  student_name: string;
  student_username: string | null;
  class_name: string;
  course_name: string;
  week_no: number;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const BASE_SELECT = `
  SELECT sf.id AS file_id, sf.key AS key, sf.thumb_key AS thumb_key,
         sf.size AS size, sf.filename AS filename,
         sf.submission_id AS submission_id, s.submitted_at AS submitted_at,
         u.full_name AS student_name, u.username AS student_username,
         c.name AS class_name, co.name AS course_name, w.week_no AS week_no
    FROM submission_files sf
    JOIN submissions   s  ON s.id  = sf.submission_id
    JOIN students      st ON st.id = s.student_id
    JOIN users         u  ON u.id  = st.user_id
    JOIN homeworks     h  ON h.id  = s.homework_id
    JOIN class_courses cc ON cc.id = h.class_course_id
    JOIN classes       c  ON c.id  = cc.class_id
    JOIN courses       co ON co.id = cc.course_id
    JOIN weeks         w  ON w.id  = h.week_id`;

/** Filtreleri doğrular; en az bir filtre (ya da `all`) yoksa fırlatır. */
function assertFilters(filters: CleanupFilters): void {
  const hasFilter =
    filters.before !== undefined ||
    filters.after !== undefined ||
    filters.student !== undefined ||
    filters.className !== undefined ||
    filters.weekNo !== undefined ||
    filters.homeworkId !== undefined ||
    filters.key !== undefined;

  if (!filters.all && !hasFilter) {
    throw new Error(
      'En az bir filtre gerekli (--before/--after/--student/--class/--week/--homework/--key) ' +
        'ya da tüm teslimler için açıkça --all verin.',
    );
  }
  if (filters.before !== undefined && !DATE_RE.test(filters.before)) {
    throw new Error('--before geçerli bir tarih olmalı (YYYY-MM-DD).');
  }
  if (filters.after !== undefined && !DATE_RE.test(filters.after)) {
    throw new Error('--after geçerli bir tarih olmalı (YYYY-MM-DD).');
  }
  if (filters.weekNo !== undefined && (!Number.isInteger(filters.weekNo) || filters.weekNo < 1)) {
    throw new Error('--week pozitif bir tam sayı olmalı.');
  }
}

/** WHERE cümlesini parametreli olarak kurar. */
function buildWhere(
  filters: CleanupFilters,
  normalizedClass: string | undefined,
): { where: string; params: Array<string | number> } {
  const clauses: string[] = [];
  const params: Array<string | number> = [];

  if (filters.before !== undefined) {
    clauses.push('substr(s.submitted_at, 1, 10) < ?');
    params.push(filters.before);
  }
  if (filters.after !== undefined) {
    clauses.push('substr(s.submitted_at, 1, 10) >= ?');
    params.push(filters.after);
  }
  if (filters.student !== undefined) {
    clauses.push('(u.username = ? OR st.id = ?)');
    params.push(filters.student, filters.student);
  }
  if (filters.className !== undefined) {
    clauses.push('(c.id = ? OR c.name_normalized = ?)');
    params.push(filters.className, normalizedClass ?? normalizeTurkish(filters.className));
  }
  if (filters.weekNo !== undefined) {
    clauses.push('w.week_no = ?');
    params.push(filters.weekNo);
  }
  if (filters.homeworkId !== undefined) {
    clauses.push('h.id = ?');
    params.push(filters.homeworkId);
  }
  if (filters.key !== undefined) {
    clauses.push('sf.key = ?');
    params.push(filters.key);
  }

  return { where: clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '', params };
}

/** `localPathFor` sıkı doğrulamasını bozmadan güvenli yol döner (geçersizse null). */
function tryLocalPath(key: string): string | null {
  try {
    return localPathFor(key);
  } catch {
    return null;
  }
}

/**
 * Filtrelere uyan dosyaları seçer ve ne silineceğini hesaplar. Hiçbir şey
 * yazmaz, hiçbir dosyayı silmez.
 */
export function planCleanup(filters: CleanupFilters): CleanupPlan {
  assertFilters(filters);
  const normalizedClass =
    filters.className !== undefined ? normalizeTurkish(filters.className) : undefined;
  const { where, params } = buildWhere(filters, normalizedClass);

  const rows = db
    .prepare(`${BASE_SELECT} ${where} ORDER BY s.submitted_at, sf.key`)
    .all(...params) as unknown as CleanupFileRow[];

  // Teslim başına toplam dosya sayısı — "tamamı seçildi mi?" ayrımı için.
  const submissionIds = [...new Set(rows.map((r) => r.submission_id))];
  const totalBySubmission = new Map<string, number>();
  if (submissionIds.length > 0) {
    const placeholders = submissionIds.map(() => '?').join(',');
    const counts = db
      .prepare(
        `SELECT submission_id, COUNT(*) AS n FROM submission_files
          WHERE submission_id IN (${placeholders}) GROUP BY submission_id`,
      )
      .all(...submissionIds) as unknown as Array<{ submission_id: string; n: number }>;
    for (const c of counts) totalBySubmission.set(c.submission_id, c.n);
  }

  const selectedBySubmission = new Map<string, number>();
  for (const r of rows) {
    selectedBySubmission.set(r.submission_id, (selectedBySubmission.get(r.submission_id) ?? 0) + 1);
  }

  const fullyPurgedSubmissions = submissionIds.filter(
    (id) => selectedBySubmission.get(id) === totalBySubmission.get(id),
  );

  let totalBytes = 0;
  let existingOnDisk = 0;
  let missingOnDisk = 0;
  let invalidKeys = 0;
  for (const r of rows) {
    totalBytes += r.size;
    for (const key of [r.key, ...(r.thumb_key ? [r.thumb_key] : [])]) {
      const p = tryLocalPath(key);
      if (p === null) {
        invalidKeys += 1;
        continue;
      }
      if (fs.existsSync(p)) existingOnDisk += 1;
      else missingOnDisk += 1;
    }
  }

  return {
    filters,
    files: rows.map((r) => ({
      fileId: r.file_id,
      key: r.key,
      thumbKey: r.thumb_key,
      size: r.size,
      filename: r.filename,
      submissionId: r.submission_id,
      submittedAt: r.submitted_at,
      studentName: r.student_name,
      studentUsername: r.student_username,
      className: r.class_name,
      courseName: r.course_name,
      weekNo: r.week_no,
    })),
    fileCount: rows.length,
    totalBytes,
    submissionCount: submissionIds.length,
    fullyPurgedSubmissions,
    existingOnDisk,
    missingOnDisk,
    invalidKeys,
  };
}

/**
 * Temizliği çalıştırır. `execute` false ise yalnızca planı döner (dry-run).
 * `execute` true ise: tam yedek → tek transaction'da DB silme → COMMIT sonrası
 * disk silme.
 */
export function runCleanup(filters: CleanupFilters, options: CleanupOptions = {}): CleanupResult {
  const plan = planCleanup(filters);
  const execute = options.execute === true;

  const emptyResult = (): CleanupResult => ({
    ...plan,
    executed: false,
    backupPath: null,
    deletedFileRows: 0,
    purgedSubmissions: 0,
    deletedDiskFiles: 0,
    diskDeleteErrors: [],
  });

  if (!execute) {
    return emptyResult();
  }
  if (plan.fileCount === 0) {
    return { ...emptyResult(), executed: true };
  }

  // 1) Güvenlik ağı: tam yedek. Başarısız olursa istisna yukarı çıkar; silme başlamaz.
  const backupPath = createBackup(
    options.backupOutDir !== undefined ? { outDir: options.backupOutDir } : {},
  );
  const purgedAt = (options.now ?? (() => new Date().toISOString()))();

  // 2) DB silme — tek transaction (hepsi ya da hiçbiri).
  db.exec('BEGIN');
  try {
    const deleteFile = db.prepare('DELETE FROM submission_files WHERE id = ?');
    for (const file of plan.files) deleteFile.run(file.fileId);

    const markPurged = db.prepare('UPDATE submissions SET files_purged_at = ? WHERE id = ?');
    for (const submissionId of plan.fullyPurgedSubmissions) markPurged.run(purgedAt, submissionId);

    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }

  // 3) Disk — COMMIT sonrası. Kırık referans oluşmaz; hata olsa bile öksüz dosya
  //    kalır (zararsız) ve raporda bildirilir.
  const diskDeleteErrors: Array<{ key: string; message: string }> = [];
  let deletedDiskFiles = 0;
  for (const file of plan.files) {
    for (const key of [file.key, ...(file.thumbKey ? [file.thumbKey] : [])]) {
      const p = tryLocalPath(key);
      if (p === null) continue;
      try {
        if (fs.existsSync(p)) {
          fs.unlinkSync(p);
          deletedDiskFiles += 1;
        }
      } catch (err) {
        diskDeleteErrors.push({
          key,
          message: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  return {
    ...plan,
    executed: true,
    backupPath,
    deletedFileRows: plan.files.length,
    purgedSubmissions: plan.fullyPurgedSubmissions.length,
    deletedDiskFiles,
    diskDeleteErrors,
  };
}

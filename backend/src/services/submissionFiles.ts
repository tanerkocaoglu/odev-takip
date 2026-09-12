/**
 * Teslim dosyalarını `submission_id`'ye göre gruplayan ortak yardımcı.
 *
 * Öğretmen (teslim kontrol), öğrenci (ödev listesi) ve veli (rapor detayı)
 * rotaları aynı sorguyu/grulamayı tekrar etmesin diye tek yerde toplandı.
 */

import { db } from '../db/index.js';

/** Bir teslim dosyasının API'ye dönen meta bilgisi. */
export interface SubmissionFileMeta {
  key: string;
  filename: string;
  size: number;
  mime: string;
  ext: string;
}

export interface SubmissionFileRow {
  submission_id: string;
  key: string;
  filename: string;
  size: number;
  mime: string;
  ext: string;
}

/** Ham `submission_files` satırlarını `submission_id` → dosya listesi yapar (saf). */
export function groupSubmissionFiles(
  rows: readonly SubmissionFileRow[],
): Map<string, SubmissionFileMeta[]> {
  const map = new Map<string, SubmissionFileMeta[]>();
  for (const row of rows) {
    const list = map.get(row.submission_id) ?? [];
    list.push({
      key: row.key,
      filename: row.filename,
      size: row.size,
      mime: row.mime,
      ext: row.ext,
    });
    map.set(row.submission_id, list);
  }
  return map;
}

/** Verilen teslim ID'leri için dosyaları `submission_id`'ye göre gruplar. */
export function loadSubmissionFiles(
  submissionIds: string[],
): Map<string, SubmissionFileMeta[]> {
  if (submissionIds.length === 0) return new Map();
  const placeholders = submissionIds.map(() => '?').join(',');
  const rows = db
    .prepare(
      `SELECT submission_id, key, filename, size, mime, ext
       FROM submission_files WHERE submission_id IN (${placeholders})`,
    )
    .all(...submissionIds) as unknown as SubmissionFileRow[];
  return groupSubmissionFiles(rows);
}

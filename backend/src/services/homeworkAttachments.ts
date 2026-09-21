/**
 * Öğretmen ödev ekleri (PDF) — `homework_attachments` (migration #13).
 *
 * Öğretmenin "Yapılacak ödev"e eklediği birden fazla PDF burada tutulur;
 * meta okuma yardımcıları tektir. Dosya içeriği `GET /api/v1/files/:key`
 * üzerinden (auth + yetki) servis edilir; bu modül yalnızca meta döner.
 *
 * Sahiplik **`reports.id`** üzerindendir (homeworks değil): `homeworks` satırı
 * yalnızca sonraki ders haftası varsa açılır (yılın son haftasında yoktur),
 * rapor ise her zaman vardır. `homeworks` raporla 1:1'dir.
 *
 * Ekler ödevin göründüğü her yerde bu meta üzerinden görünür (bu hafta
 * "Yapılacak ödev", sonraki hafta "Verilmiş ödev"). Public `/r/{token}`
 * snapshot'ına **hiç yazılmaz**.
 */

import { db } from '../db/index.js';

/** İstemciye dönen ek meta bilgisi (dosya içeriği değil). */
export interface AttachmentMeta {
  id: string;
  key: string;
  filename: string;
  size: number;
  mime: string;
  ext: string;
}

/**
 * Verilen **rapor** kimliklerinin eklerini tek sorguda yükler; `report_id` →
 * ek listesi (eklenme sırası korunur).
 */
export function loadAttachmentsByReportIds(
  reportIds: Array<string | null | undefined>,
): Map<string, AttachmentMeta[]> {
  const map = new Map<string, AttachmentMeta[]>();
  const unique = [...new Set(reportIds.filter((id): id is string => !!id))];
  if (unique.length === 0) return map;

  const placeholders = unique.map(() => '?').join(',');
  const rows = db
    .prepare(
      `SELECT id, report_id, key, filename, size, mime, ext
         FROM homework_attachments
        WHERE report_id IN (${placeholders})
        ORDER BY rowid`,
    )
    .all(...unique) as unknown as Array<AttachmentMeta & { report_id: string }>;

  for (const r of rows) {
    const list = map.get(r.report_id) ?? [];
    list.push({
      id: r.id,
      key: r.key,
      filename: r.filename,
      size: r.size,
      mime: r.mime,
      ext: r.ext,
    });
    map.set(r.report_id, list);
  }
  return map;
}

/** Tek raporun ekleri (yoksa boş dizi). */
export function loadAttachmentsByReportId(
  reportId: string | null | undefined,
): AttachmentMeta[] {
  if (!reportId) return [];
  return loadAttachmentsByReportIds([reportId]).get(reportId) ?? [];
}

/**
 * Ödev kimliklerinden ekleri yükler (`homework_id` → ek listesi). Ödev,
 * raporuna `homeworks.report_id` ile bağlanır; ödev satırı yoksa (son hafta)
 * çağıran zaten ekleri rapor üzerinden okumalıdır.
 */
export function loadAttachmentsForHomeworkIds(
  homeworkIds: Array<string | null | undefined>,
): Map<string, AttachmentMeta[]> {
  const map = new Map<string, AttachmentMeta[]>();
  const unique = [...new Set(homeworkIds.filter((id): id is string => !!id))];
  if (unique.length === 0) return map;

  const placeholders = unique.map(() => '?').join(',');
  const links = db
    .prepare(`SELECT id, report_id FROM homeworks WHERE id IN (${placeholders})`)
    .all(...unique) as unknown as Array<{ id: string; report_id: string }>;
  const byReport = loadAttachmentsByReportIds(links.map((l) => l.report_id));

  for (const id of unique) {
    const link = links.find((l) => l.id === id);
    map.set(id, link ? (byReport.get(link.report_id) ?? []) : []);
  }
  return map;
}

/** Bir raporun mevcut ek sayısı (kota kontrolü için). */
export function countAttachmentsByReport(reportId: string): number {
  return (
    db
      .prepare('SELECT COUNT(*) AS n FROM homework_attachments WHERE report_id = ?')
      .get(reportId) as { n: number }
  ).n;
}

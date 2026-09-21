/**
 * Yedekleme servisi — `npm run db:backup` CLI'ının çekirdeği (madde 3).
 *
 * Kural (CLAUDE.md): `DatabaseSync` senkrondur; yedek toplu bir işlem olduğu
 * için **sunucu isteği içinde değil, ayrı process'te** çalışır. Bu modül ayrı
 * script'ten (`scripts/backup.ts`) çağrılır; admin "Yedek indir" butonu CLI'ı
 * `child_process` ile spawn eder ve üretilen .zip'i indirir.
 *
 * Adımlar:
 * 1. `VACUUM INTO` ile tutarlı bir SQLite kopyası (WAL güvenli — çalışan
 *    sunucunun bağlantısına dokunmadan, ayrı bağlantıdan okur).
 * 2. `uploads/` içindeki dosyalar, DB ilişkisiyle (submission_files →
 *    submissions → homeworks → class_courses → courses/weeks → students/users)
 *    anlamlı bir hiyerarşiye kopyalanır:
 *      `Ad_Soyad_kullaniciadi/Ders_Adi/Hafta_N/orijinal_dosya_adi`
 *    Hiyerarşi **yalnızca gerçekten yüklenmiş (orijinal) dosyaları** içerir.
 *    Üretilen thumbnail'lar ve DB'de karşılığı olmayan (sahipsiz) dosyalar
 *    `_depo/<key>` altına konur — hiçbir dosya kaybolmaz.
 * 3. DB kopyası (`veritabani/app.db`) + hiyerarşi + `_depo/` tek .zip'te
 *    birleştirilir.
 *
 * Sınıf değiştiren öğrenci (retrofit): klasörleme `homeworks.class_course_id`
 * üzerinden yapılır — bu alan ödevin verildiği andaki atamanın denormalize
 * kopyasıdır (spec.md §3.2). Yani "o haftaki gerçek atama" kullanılır; güncel
 * `enrollments`'a bakılmaz. Tarihsel doğruluk korunur.
 *
 * Canlı `uploads/` klasörüne, `storage.ts`'e, dosya key'lerine ve R2 geçiş
 * planına **dokunulmaz**; yedek yalnızca okur + geçici klasöre kopyalar.
 */

import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import AdmZip from 'adm-zip';
import { downloadToFile } from './storage.js';

/** Zip hiyerarşisinde türev/artık dosyaların toplandığı klasör. */
const DEPO_DIR = '_depo';

/** Yedek zip adı deseni — prune yalnızca kendi ürettiği dosyalara dokunur. */
const BACKUP_FILE_RE = /^dershane-yedek-\d{8}-\d{6}\.zip$/;

/** Varsayılan yedek saklama sayısı (üzerine yazılabilecek `BACKUP_KEEP`). */
const DEFAULT_BACKUP_KEEP = 10;

/** Geçerliyse `BACKUP_KEEP`, değilse varsayılan. */
function backupKeep(): number {
  const raw = Number(process.env.BACKUP_KEEP);
  return Number.isInteger(raw) && raw > 0 ? raw : DEFAULT_BACKUP_KEEP;
}

/** İlişkiden gelen tek dosya satırı (JOIN sonucu). */
interface BackupFileRow {
  key: string;
  thumb_key: string | null;
  filename: string;
  storage: 'local' | 'r2';
  size: number;
  full_name: string;
  username: string | null;
  course_name: string;
  week_no: number;
}

const TR_ASCII: Record<string, string> = {
  ı: 'i',
  İ: 'I',
  ğ: 'g',
  Ğ: 'G',
  ü: 'u',
  Ü: 'U',
  ş: 's',
  Ş: 'S',
  ö: 'o',
  Ö: 'O',
  ç: 'c',
  Ç: 'C',
};

/**
 * Türkçe karakterleri ASCII karşılıklarına indirger; **harf durumunu korur**
 * (`İstanbul` → `Istanbul`). `normalizeTurkish` küçük harfe çevirdiği için
 * burada kullanılamaz. Yalnızca yedek klasör adları için; uygulama verisi
 * değişmez.
 */
export function asciiFoldTr(input: string): string {
  let out = '';
  for (const ch of input.normalize('NFC')) out += TR_ASCII[ch] ?? ch;
  return out;
}

const RESERVED_NAMES = new Set([
  'CON',
  'PRN',
  'AUX',
  'NUL',
  ...Array.from({ length: 9 }, (_, i) => `COM${i + 1}`),
  ...Array.from({ length: 9 }, (_, i) => `LPT${i + 1}`),
]);

/**
 * Tek bir klasör segmentini dosya sistemi/zip uyumlu hale getirir:
 * ASCII'ye indirger, geçersiz karakter + boşlukları `_` yapar, tekrarları
 * sadeleştirir, baş/son `_`-`.` temizler, Windows ayrılmış adlarını ve aşırı
 * uzunluğu güvenceye alır. Boş sonuç `_` olur (hiçbir segment boş kalmaz).
 */
export function sanitizeSegment(raw: string): string {
  let s = asciiFoldTr(raw).replace(/[^A-Za-z0-9._-]+/g, '_');
  s = s.replace(/_+/g, '_').replace(/^[_.]+|[_.]+$/g, '');
  if (s.length === 0) s = '_';
  if (s.length > 100) s = s.slice(0, 100).replace(/[_.]+$/g, '') || '_';

  const dot = s.indexOf('.');
  const stem = (dot === -1 ? s : s.slice(0, dot)).toUpperCase();
  if (RESERVED_NAMES.has(stem)) s += '_';
  return s;
}

/**
 * Dosya adını, uzantıyı koruyarak temizler. Orijinal ad boşsa `dosya`ya,
 * uzantı geçersizse uzantısız ada düşer.
 */
export function sanitizeFilename(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return 'dosya';
  const idx = trimmed.lastIndexOf('.');
  if (idx <= 0 || idx === trimmed.length - 1) return sanitizeSegment(trimmed);
  const base = sanitizeSegment(trimmed.slice(0, idx)) || 'dosya';
  const ext = asciiFoldTr(trimmed.slice(idx + 1))
    .replace(/[^A-Za-z0-9]+/g, '')
    .slice(0, 10);
  return ext ? `${base}.${ext}` : base;
}

/**
 * Klasör içinde ad çakışmasını çözer: dolu ise `govde_2`, `govde_3`… dener
 * (uzantıdan önce). Karşılaştırma büyük/küçük harf duyarsızdır (Windows
 * dosya sistemi davranışı). Sessiz üzerine yazma asla olmaz.
 */
function uniqueEntryName(used: Set<string>, name: string): string {
  const stampName = name.toLowerCase();
  if (!used.has(stampName)) {
    used.add(stampName);
    return name;
  }
  const idx = name.lastIndexOf('.');
  const base = idx > 0 ? name.slice(0, idx) : name;
  const ext = idx > 0 ? name.slice(idx) : '';
  let n = 2;
  let candidate = `${base}_${n}${ext}`;
  while (used.has(candidate.toLowerCase())) {
    n += 1;
    candidate = `${base}_${n}${ext}`;
  }
  used.add(candidate.toLowerCase());
  return candidate;
}

/** Görselin `filename`ı eksik/bozuksa anahtarın uzantısından türetilir. */
function fallbackFilename(key: string): string {
  const ext = key.includes('.') ? key.slice(key.lastIndexOf('.')) : '';
  return `teslim_dosyasi${ext}`;
}

/** Key path traversal içeriyor mu (güvenlik — key DB'den gelse de doğrulanır). */
function isSafeKey(key: string): boolean {
  return (
    key.length > 0 &&
    key.length <= 200 &&
    /^[0-9A-Za-z._-]+$/.test(key) &&
    !key.includes('..') &&
    !key.startsWith('.') &&
    !key.endsWith('.')
  );
}

/**
 * Tek nesneyi hedefe kopyalar. `local` ise diskten; `r2` ise **akış olarak**
 * indirir (`downloadToFile` — tüm içerik belleğe alınmaz). Kaynak yoksa/
 * erişilemezse sessizce atlar (bozuk/eksik dosya yedeği çökertmez).
 * Kopyalanan key'ler `accounted`e işlenir.
 */
async function copyStored(
  uploadsDir: string,
  storage: 'local' | 'r2',
  key: string,
  destPath: string,
  accounted: Set<string>,
): Promise<void> {
  if (!isSafeKey(key)) return;
  try {
    if (storage === 'r2') {
      await downloadToFile('r2', key, destPath);
    } else {
      const src = path.join(uploadsDir, key);
      if (!fs.existsSync(src)) return;
      fs.copyFileSync(src, destPath);
    }
    accounted.add(key);
  } catch {
    // Eksik/erişilemeyen nesne yedeği çökertmez; sessizce atlanır.
  }
}

/**
 * VACUUM kopyasındaki ilişkiyi okur. Metadata sorgusu başarısız olursa (şema
 * yok vb.) yedek yine üretilir: boş döner ve tüm yerel dosyalar `_depo/`ya
 * alınır — ham veri asla kaybolmaz.
 */
function readBackupRows(dbCopyPath: string): BackupFileRow[] {
  try {
    const copy = new DatabaseSync(dbCopyPath, { readOnly: true });
    try {
      return copy
        .prepare(
          `SELECT sf.key AS key, sf.thumb_key AS thumb_key, sf.filename AS filename,
                  sf.storage AS storage, sf.size AS size,
                  u.full_name AS full_name, u.username AS username,
                  co.name AS course_name, w.week_no AS week_no
             FROM submission_files sf
             JOIN submissions  sub ON sub.id = sf.submission_id
             JOIN homeworks    h   ON h.id  = sub.homework_id
             JOIN class_courses cc ON cc.id = h.class_course_id
             JOIN courses      co  ON co.id = cc.course_id
             JOIN weeks        w   ON w.id  = h.week_id
             JOIN students     st  ON st.id = sub.student_id
             JOIN users        u   ON u.id  = st.user_id`,
        )
        .all() as unknown as BackupFileRow[];
    } finally {
      copy.close();
    }
  } catch {
    return [];
  }
}

/** Öğretmen ödev eki satırı (migration #13) — yedek hiyerarşisi için. */
interface BackupAttachmentRow {
  key: string;
  filename: string;
  storage: 'local' | 'r2';
  size: number;
  course_name: string;
  week_no: number;
}

/**
 * VACUUM kopyasındaki ödev eklerini okur. Metadata sorgusu başarısız olursa
 * (şema yok vb.) boş döner — yedek yine üretilir.
 */
function readAttachmentRows(dbCopyPath: string): BackupAttachmentRow[] {
  try {
    const copy = new DatabaseSync(dbCopyPath, { readOnly: true });
    try {
      return copy
        .prepare(
          `SELECT ha.key AS key, ha.filename AS filename, ha.storage AS storage,
                  ha.size AS size, co.name AS course_name, w.week_no AS week_no
             FROM homework_attachments ha
             JOIN reports      r  ON r.id  = ha.report_id
             JOIN class_courses cc ON cc.id = r.class_course_id
             JOIN courses      co ON co.id = cc.course_id
             JOIN weeks        w  ON w.id  = r.week_id`,
        )
        .all() as unknown as BackupAttachmentRow[];
    } finally {
      copy.close();
    }
  } catch {
    return [];
  }
}

/**
 * Satırları anlamlı hiyerarşiye (orijinaller) + `_depo/`ya (thumbnail +
 * sahipsiz yerel) dağıtır. R2 nesneleri **akış ile** indirilir; sıralıdır
 * (paralellik yok) → bellek/disk baskısı tek nesneyle sınırlı kalır.
 * Yerel `uploads/` içindeki sahipsiz dosyalar da `_depo/`ya alınır.
 * Ödev ekleri `Odev_Ekleri/Ders/Hafta_N/` altına yerleştirilir (öğrenciye bağlı
 * olmadıkları için ayrı ağaç).
 */
async function buildStructuredTree(
  rows: BackupFileRow[],
  attachmentRows: BackupAttachmentRow[],
  uploadsDir: string,
  stagingDir: string,
): Promise<void> {
  const treeRoot = stagingDir;
  const depoRoot = path.join(treeRoot, DEPO_DIR);

  const uploadsExists = fs.existsSync(uploadsDir);
  const accounted = new Set<string>();
  const usedByDir = new Map<string, Set<string>>();

  if (uploadsExists) fs.mkdirSync(depoRoot, { recursive: true });

  for (const row of rows) {
    const username = row.username ?? 'kullanici';
    const studentFolder = `${sanitizeSegment(row.full_name)}_${sanitizeSegment(username)}`;
    const relDir = path.join(
      studentFolder,
      sanitizeSegment(row.course_name),
      `Hafta_${row.week_no}`,
    );
    const absDir = path.join(treeRoot, relDir);
    fs.mkdirSync(absDir, { recursive: true });

    let used = usedByDir.get(relDir);
    if (!used) {
      used = new Set<string>();
      usedByDir.set(relDir, used);
    }

    const name = uniqueEntryName(
      used,
      sanitizeFilename(row.filename || fallbackFilename(row.key)),
    );
    await copyStored(uploadsDir, row.storage, row.key, path.join(absDir, name), accounted);

    if (row.thumb_key && isSafeKey(row.thumb_key)) {
      await copyStored(
        uploadsDir,
        row.storage,
        row.thumb_key,
        path.join(depoRoot, row.thumb_key),
        accounted,
      );
    }
  }

  // Ödev ekleri (öğretmen PDF) — öğrenciye bağlı değil, ders/hafta ağacına.
  for (const row of attachmentRows) {
    const relDir = path.join(
      'Odev_Ekleri',
      sanitizeSegment(row.course_name),
      `Hafta_${row.week_no}`,
    );
    const absDir = path.join(treeRoot, relDir);
    fs.mkdirSync(absDir, { recursive: true });

    let used = usedByDir.get(relDir);
    if (!used) {
      used = new Set<string>();
      usedByDir.set(relDir, used);
    }

    const name = uniqueEntryName(
      used,
      sanitizeFilename(row.filename || fallbackFilename(row.key)),
    );
    await copyStored(uploadsDir, row.storage, row.key, path.join(absDir, name), accounted);
  }

  if (uploadsExists) {
    for (const entry of fs.readdirSync(uploadsDir, { withFileTypes: true })) {
      if (!entry.isFile() || accounted.has(entry.name)) continue;
      // Sahipsiz/artık YEREL dosya: key adıyla `_depo/`ya (hiçbir dosya kaybolmaz).
      if (isSafeKey(entry.name)) {
        await copyStored(
          uploadsDir,
          'local',
          entry.name,
          path.join(depoRoot, entry.name),
          accounted,
        );
      }
    }
  }
}

export interface BackupOptions {
  dbPath?: string;
  uploadsDir?: string;
  outDir?: string;
  /** Bu dizinde tutulacak en yeni yedek sayısı (varsayılan `BACKUP_KEEP`/10). */
  keep?: number;
  /** Zip içeriği için üst sınır (MB). Varsayılan `BACKUP_MAX_STAGING_MB`/750. */
  maxStagingMb?: number;
  /** `true` ise boyut sınırı uygulanmaz (bilinçli büyük yedek). */
  allowLarge?: boolean;
}

/** Yedek zip içeriği için varsayılan üst sınır (MB) — disk güvenliği. */
const DEFAULT_BACKUP_MAX_MB = 750;

/**
 * Zip'e girecek toplam içerik (yaklaşık) için üst sınır. `allowLarge` veya
 * `BACKUP_ALLOW_LARGE=1` ile devre dışı bırakılabilir; sınır `options` →
 * `BACKUP_MAX_STAGING_MB` → varsayılan sırasıyla belirlenir.
 */
function backupMaxBytes(options: BackupOptions): number | null {
  if (options.allowLarge || process.env.BACKUP_ALLOW_LARGE === '1') return null;
  const envMb = Number(process.env.BACKUP_MAX_STAGING_MB);
  const mb =
    options.maxStagingMb ??
    (Number.isFinite(envMb) && envMb > 0 ? envMb : DEFAULT_BACKUP_MAX_MB);
  return mb * 1024 * 1024;
}

/** DB kopyasının yolunu SQL string literal'ine güvenli şekilde gömer (tek tırnak iki katına alınır). */
function sqlLiteral(p: string): string {
  return `'${p.replace(/'/g, "''")}'`;
}

function stamp(): string {
  const d = new Date();
  const p = (n: number): string => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(
    d.getMinutes(),
  )}${p(d.getSeconds())}`;
}

/**
 * Yedek dizinindeki en yeni `keep` zip'i tutar, eskileri siler.
 *
 * Dosya adı sıfır dolgulu zaman damgası taşıdığı için sözlük sırası = kronolojik
 * sıra. Yalnızca kendi ürettiği `dershane-yedek-*.zip` desenine dokunur; başka
 * dosyalar asla silinmez. Silinenlerin adlarını döner. Dizin yoksa/okunamazsa
 * sessizce boş döner (yedek üretimini çökertmez).
 */
export function pruneBackups(dir: string, keep: number): string[] {
  if (!Number.isInteger(keep) || keep < 0) return [];
  let names: string[];
  try {
    names = fs.readdirSync(dir).filter((n) => BACKUP_FILE_RE.test(n));
  } catch {
    return [];
  }
  names.sort();
  const removed: string[] = [];
  for (const name of names.slice(0, Math.max(0, names.length - keep))) {
    try {
      fs.rmSync(path.join(dir, name), { force: true });
      removed.push(name);
    } catch {
      // Silinemeyen eski yedek yedek üretimini başarısız yapmaz.
    }
  }
  return removed;
}

/**
 * Tutarlı yedek üretir: `{outDir}/dershane-yedek-{zaman}.zip` döner.
 * Zip içeriği: `veritabani/app.db` + `Ad_Soyad_kullaniciadi/Ders_Adi/Hafta_N/...`
 * (orijinaller) + `_depo/` (thumbnail + sahipsiz yerel).
 *
 * `local` ve `r2` nesneleri birlikte yedeklenir; R2 nesneleri sıralı olarak
 * akışla indirilir. Toplam içerik güvenli sınırı aşarsa (disk koruması) hata
 * fırlatır — `allowLarge`/`BACKUP_ALLOW_LARGE=1` ile geçersiz kılınabilir.
 */
export async function createBackup(options: BackupOptions = {}): Promise<string> {
  const dbPath = options.dbPath ?? process.env.DB_PATH ?? path.join('db', 'app.db');
  const uploadsDir =
    options.uploadsDir ?? process.env.UPLOADS_DIR ?? path.join('uploads');
  const outDir = options.outDir ?? process.env.BACKUPS_DIR ?? path.join('backups');

  fs.mkdirSync(outDir, { recursive: true });
  // `mkdtempSync` tekil klasör açar: aynı pid'li eski kalıntıyla karışmaz.
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dershane-backup-'));
  const dbCopy = path.join(tmpDir, 'app.db');
  const stagingDir = path.join(tmpDir, 'staging');
  const zipPath = path.join(outDir, `dershane-yedek-${stamp()}.zip`);
  let zipWritten = false;

  try {
    // 1) Tutarlı SQLite kopyası — VACUUM INTO (ayrı bağlantı, WAL içeriğini kapsar).
    const db = new DatabaseSync(dbPath);
    try {
      db.exec(`VACUUM INTO ${sqlLiteral(dbCopy)}`);
    } finally {
      db.close();
    }

    // 2) Disk güvenliği: zip'e girecek toplam içeriği kontrol et.
    const rows = readBackupRows(dbCopy);
    const attachmentRows = readAttachmentRows(dbCopy);
    const estimated =
      rows.reduce((sum, r) => sum + (r.size ?? 0), 0) +
      attachmentRows.reduce((sum, r) => sum + (r.size ?? 0), 0);
    const limit = backupMaxBytes(options);
    const estimatedWithThumbs = Math.ceil(estimated * 1.05);
    if (limit !== null && estimatedWithThumbs > limit) {
      throw new Error(
        `Yedek içeriği ~${Math.ceil(estimatedWithThumbs / (1024 * 1024))} MB; ` +
          `güvenli sınır ${Math.round(limit / (1024 * 1024))} MB. Disk güvenliği için ` +
          `iptal edildi. Sınırı BACKUP_MAX_STAGING_MB ile artırın ya da BACKUP_ALLOW_LARGE=1 verin.`,
      );
    }

    // 3) DB ilişkisiyle anlamlı hiyerarşiyi geçici klasöre kur.
    fs.mkdirSync(stagingDir, { recursive: true });
    await buildStructuredTree(rows, attachmentRows, uploadsDir, stagingDir);

    // 4) DB kopyası + geçici ağacı tek .zip'te birleştir.
    const zip = new AdmZip();
    zip.addFile('veritabani/app.db', fs.readFileSync(dbCopy));
    zip.addLocalFolder(stagingDir);
    zip.writeZip(zipPath);
    zipWritten = true;
  } finally {
    // 5) Hata dahil her durumda geçici klasör silinir; yarım zip bırakılmaz.
    fs.rmSync(tmpDir, { recursive: true, force: true });
    if (!zipWritten) fs.rmSync(zipPath, { force: true });
  }

  // Yaşlandırma: disk sınırlı olduğu için yalnızca en yeni N yedek tutulur.
  if (zipWritten) {
    pruneBackups(outDir, options.keep ?? backupKeep());
  }

  return zipPath;
}

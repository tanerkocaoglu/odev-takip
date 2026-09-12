/**
 * Dosya içerik imzası (magic-byte) doğrulaması — Bulgu #9.
 *
 * İstemcinin bildirdiği `mimetype`/uzantıya güvenmek yerine dosyanın gerçek
 * baytlarına bakılır. Bağımlılık yoktur; yalnızca sabit imzalar kontrol edilir.
 * Görseller için `sharp` decode'u ayrıca ikinci bir katman olarak çalışır
 * (storage.ts) — burada amaç hızlı ve net bir "beyan ↔ içerik" tutarlılığı.
 */

export type FileFormat = 'jpeg' | 'png' | 'heic' | 'pdf';

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const PDF_MAGIC = Buffer.from('%PDF-', 'latin1');
const PDF_SCAN_BYTES = 1024; // PDF başlığı ilk 1024 baytta aranır (BOM/ön söz toleransı)

/**
 * ISO-BMFF (HEIF/HEIC/AVIF) marka kümesi. Markalar `ftyp` kutusunda major
 * brand (offset 8) ve compatible brands (offset 16+) olarak 4'er bayttır.
 * Geniş tutulur — bazı telefon üreticileri sıra dışı markalar kullanır.
 */
const HEIF_BRANDS = new Set([
  'heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'hevm', 'hevs',
  'mif1', 'msf1', 'mif2', 'avif', 'avis',
]);

function isHeif(buf: Buffer): boolean {
  if (buf.length < 12 || buf.toString('latin1', 4, 8) !== 'ftyp') return false;
  const end = Math.min(buf.length, 64);
  for (let i = 8; i + 4 <= end; i += 4) {
    if (HEIF_BRANDS.has(buf.toString('latin1', i, i + 4))) return true;
  }
  return false;
}

/** Gerçek baytlardan formatı tespit eder; tanınamazsa `'unknown'`. */
export function detectFileFormat(buf: Buffer): FileFormat | 'unknown' {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return 'jpeg';
  }
  if (buf.length >= 8 && buf.subarray(0, 8).equals(PNG_SIGNATURE)) {
    return 'png';
  }
  if (buf.subarray(0, Math.min(buf.length, PDF_SCAN_BYTES)).indexOf(PDF_MAGIC) !== -1) {
    return 'pdf';
  }
  if (isHeif(buf)) {
    return 'heic';
  }
  return 'unknown';
}

/**
 * Beyan edilen uzantı/mime'a karşılık gelen beklenen format. Uzantı önceliklidir,
 * tanınmazsa mime'a düşer; ikisi de tanınmıyorsa `null`.
 */
export function declaredFormat(originalname: string, mimetype: string): FileFormat | null {
  const ext = originalname.toLowerCase().split('.').pop() ?? '';
  switch (ext) {
    case 'jpg':
    case 'jpeg':
      return 'jpeg';
    case 'png':
      return 'png';
    case 'heic':
    case 'heif':
      return 'heic';
    case 'pdf':
      return 'pdf';
    default:
      break;
  }
  switch (mimetype.toLowerCase()) {
    case 'image/jpeg':
      return 'jpeg';
    case 'image/png':
      return 'png';
    case 'image/heic':
    case 'image/heif':
      return 'heic';
    case 'application/pdf':
      return 'pdf';
    default:
      return null;
  }
}

/**
 * Bayt dizisinin makul bir UTF-8 metin (ör. CSV) olup olmadığını kaba biçimde
 * kontrol eder: NUL baytı içeriyorsa ya da katı UTF-8 çözümü başarısızsa
 * metin sayılmaz. İkili (binary) içeriğin CSV diye işlenmesini engeller.
 */
export function looksLikeUtf8Text(buf: Buffer): boolean {
  if (buf.includes(0)) return false;
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(buf);
    return true;
  } catch {
    return false;
  }
}

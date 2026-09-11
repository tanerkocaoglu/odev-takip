/**
 * CSV yardımcıları — harici paket yok (CLAUDE.md: ek kütüphane eklenmez).
 *
 * - `toCsv`: RFC 4180 uyumlu üretim; alanlar gerekirse tırnaklanır, satırlar
 *   CRLF ile ayrılır; isteğe bağlı UTF-8 BOM (Excel Türkçe karakterler için).
 * - `parseCsv` / `csvToRecords`: tırnaklı alan, alan içi virgül/tırnak/satır
 *   sonu, CRLF/LF ve BOM destekli ayrıştırma.
 *
 * Tüm CSV karakter kodlaması UTF-8'dir. Dışa aktarmada BOM yazılır; içe
 * aktarmada baştaki BOM otomatik atılır.
 */

export const UTF8_BOM = '\uFEFF';

export interface CsvColumn<T> {
  header: string;
  value: (row: T) => string | number | null | undefined;
}

/** Tek bir alanı RFC 4180 gereği gerekliyse tırnaklar ve iç tırnağı ikizler. */
function escapeField(raw: string): string {
  if (raw === '') return '';
  const mustQuote = /[",\r\n]/.test(raw);
  if (!mustQuote) return raw;
  return `"${raw.replace(/"/g, '""')}"`;
}

export interface ToCsvOptions {
  /** Başa UTF-8 BOM ekle (varsayılan: false). */
  bom?: boolean;
}

/** Satırları, verilen sütun başlıklarıyla CSV metnine çevirir. */
export function toCsv<T>(
  rows: T[],
  columns: CsvColumn<T>[],
  options: ToCsvOptions = {},
): string {
  const lines: string[] = [];
  lines.push(columns.map((c) => escapeField(c.header)).join(','));
  for (const row of rows) {
    lines.push(
      columns
        .map((c) => {
          const value = c.value(row);
          return escapeField(value === null || value === undefined ? '' : String(value));
        })
        .join(','),
    );
  }
  const body = lines.join('\r\n') + '\r\n';
  return options.bom ? UTF8_BOM + body : body;
}

/**
 * CSV metnini satır × alan dizisine ayrıştırır. Baştaki BOM atılır.
 * Tırnaklı alanlar, `""` kaçışı ve CRLF/LF karışık satır sonları desteklenir.
 * Son satır sonundan sonra boş satır üretilmez.
 */
export function parseCsv(text: string): string[][] {
  let input = text;
  if (input.startsWith(UTF8_BOM)) {
    input = input.slice(1);
  }

  const records: string[][] = [];
  let field = '';
  let record: string[] = [];
  let inQuotes = false;
  let hasContent = false;

  for (let i = 0; i < input.length; i++) {
    const ch = input[i];

    if (inQuotes) {
      if (ch === '"') {
        if (input[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
      hasContent = true;
    } else if (ch === ',') {
      record.push(field);
      field = '';
      hasContent = true;
    } else if (ch === '\r') {
      // CRLF veya tek CR — satırı kapat.
      if (input[i + 1] === '\n') i++;
      record.push(field);
      records.push(record);
      field = '';
      record = [];
      hasContent = false;
    } else if (ch === '\n') {
      record.push(field);
      records.push(record);
      field = '';
      record = [];
      hasContent = false;
    } else {
      field += ch;
      hasContent = true;
    }
  }

  // Kapanmamış son alan/satır (dosya satır sonuyla bitmiyorsa).
  if (hasContent || field !== '' || record.length > 0) {
    record.push(field);
    records.push(record);
  }

  return records;
}

export interface CsvRecords {
  headers: string[];
  /** Her kayıt, başlık adı → hücre metni. Kısa satırlar boş string ile tamamlanır. */
  records: Array<Record<string, string>>;
}

/**
 * CSV metnini başlık + kayıt nesnelerine çevirir. Başlıklar trim edilir.
 * Kısa satırlardaki eksik hücreler boş string olur; fazla hücreler yok sayılır.
 */
export function csvToRecords(text: string): CsvRecords {
  const rows = parseCsv(text);
  if (rows.length === 0) {
    return { headers: [], records: [] };
  }
  const headers = rows[0].map((h) => h.trim());
  const records = rows.slice(1).map((cells) => {
    const rec: Record<string, string> = {};
    for (let i = 0; i < headers.length; i++) {
      rec[headers[i]] = (cells[i] ?? '').trim();
    }
    return rec;
  });
  return { headers, records };
}

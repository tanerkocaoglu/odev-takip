/**
 * Tarih biçimlendirme — üründe tarih gösterimi `dd.MM.yyyy` (Türkiye).
 *
 * `new Date(iso)` ile parse ETMEZ: `due_date` gibi tarih-only ISO değerleri
 * UTC gece yarısı sayılır ve negatif saat dilimlerinde gün kayabilir. Yalnızca
 * ilk 10 karakter (`yyyy-aa-gg`) parçalanır; saat diliminden bağımsızdır.
 */

/** `2026-09-22` veya tam ISO `2026-09-22T10:00:00Z` → `22.09.2026`. */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '';
  const [y, m, d] = iso.slice(0, 10).split('-');
  if (!y || !m || !d) return iso;
  return `${d}.${m}.${y}`;
}

const ISTANBUL_PARTS = new Intl.DateTimeFormat('tr-TR', {
  timeZone: 'Europe/Istanbul',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

function istanbulParts(input: string | number | Date): Record<string, string> | null {
  const date = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(date.getTime())) return null;
  const out: Record<string, string> = {};
  for (const p of ISTANBUL_PARTS.formatToParts(date)) out[p.type] = p.value;
  return out;
}

/** Anlık damga → `HH:mm` (Europe/Istanbul). Geçersiz girdide boş dize. */
export function formatTime(input: string | number | Date): string {
  const p = istanbulParts(input);
  return p ? `${p.hour}:${p.minute}` : '';
}

/** Anlık damga → `gg.aa.yyyy HH:mm` (Europe/Istanbul; tarayıcı saat diliminden bağımsız). */
export function formatDateTime(input: string | number | Date): string {
  const p = istanbulParts(input);
  return p ? `${p.day}.${p.month}.${p.year} ${p.hour}:${p.minute}` : '';
}

/** Anlık damga → `gg.aa.yyyy` (Europe/Istanbul takvimine göre; saat dilimi kaymasız). */
export function formatDateIst(input: string | number | Date): string {
  return formatDateTime(input).slice(0, 10);
}

/** Bugünün tarihi `yyyy-aa-gg` — Europe/Istanbul takvimine göre (tarayıcı saat diliminden bağımsız). */
export function todayIstanbulISO(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Istanbul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

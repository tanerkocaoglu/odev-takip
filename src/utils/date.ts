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

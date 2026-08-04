/**
 * Telefon normalizasyonu — kullanıcının girdiği numaradan boşluk/tire/
 * parantezleri temizler. Geliştirme ve admin CRUD dahil tek nokta.
 */

export function normalizePhone(raw: string): string {
  return raw.replace(/[\s\-()]/g, '');
}

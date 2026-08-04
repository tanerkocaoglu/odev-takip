/**
 * Türkçe metin normalizasyonu.
 *
 * Kural (CLAUDE.md): Normalizasyon yalnızca sunucuda yapılır; istemciden
 * gelen normalize değere güvenilmez. Yazma anında `full_name_normalized`
 * üretilir ve ARAMA SORGUSU da aynı fonksiyondan geçirilir — böylece
 * indeks ile arama ifadesi birebir eşleşir.
 *
 * Tam ASCII'ye iner: ö→o, ü→u, ş→s, ç→c, ğ→g, İ→i, I→ı→i ("İIıi" → "iiii").
 */

const TR_CHAR_MAP: Record<string, string> = {
  ı: 'i',
  ğ: 'g',
  ü: 'u',
  ş: 's',
  ö: 'o',
  ç: 'c',
};

/**
 * Türkçe karakterleri ASCII karşılıklarına sadeleştirir; küçük harfe çevirir.
 *
 * Sıralama önemli: önce `toLocaleLowerCase('tr')` çalıştırılır (büyük I → ı
 * dahil Türkçe küçük harf kuralları), sonra karakter haritası uygulanır.
 * Böylece "İIıi" → "iiii" garanti edilir (I → ı → i).
 */
export function normalizeTurkish(input: string): string {
  const lowercased = input.toLocaleLowerCase('tr');
  let result = '';
  for (const ch of lowercased) {
    result += TR_CHAR_MAP[ch] ?? ch;
  }
  return result;
}

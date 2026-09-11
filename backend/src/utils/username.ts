/**
 * Otomatik `username` üretimi — spec.md §2.1.
 *
 * İsim tabanlıdır: `normalizeTurkish(full_name)` ile ASCII'ye indirgenmiş,
 * boşluk/noktalama temizlenmiş isim + sıralı sayaç.
 * Örnek: "Örnek Kişi 8" → `ornekkisi81`, ikinci "Örnek Kişi 8" → `ornekkisi82`.
 *
 * Sayaç mantığı: aynı isim önekiyle başlayan (`prefix%`) mevcut kullanıcı
 * adlarındaki en yüksek sayının +1'i; üretilen ad doluysa (eşzamanlı kayıt)
 * sayı artırılarak yeniden denenir. `idx_users_username` UNIQUE kısıtı son
 * güvencedir.
 *
 * Geriye dönük: yalnızca **yeni** üretilen adları etkiler; sistemdeki mevcut
 * `ogrenci1` / `veli3` gibi adlara dokunulmaz.
 *
 * Normalizasyon (CLAUDE.md): yalnızca sunucuda üretilir; istemci değerine
 * güvenilmez.
 */

import { db } from '../db/index.js';
import { normalizeTurkish } from './text.js';

/**
 * İsimden kullanıcı adı öneki üretir: "Örnek Kişi 8" → "ornekkisi8".
 * Türkçe karakterler ASCII'ye iner, harf/rakam dışı karakterler atılır.
 * İsim tamamen boşalırsa güvenli bir varsayılana düşer.
 */
export function usernamePrefix(fullName: string): string {
  const ascii = normalizeTurkish(fullName).replace(/[^a-z0-9]+/g, '');
  return ascii || 'kullanici';
}

/**
 * Verilen ad için bir sonraki boş kullanıcı adını üretir.
 * Çakışmada sayaç artırılır; DB'deki UNIQUE indeks bu fonksiyonu son güvence
 * yapar (eşzamanlı iki istekte biri çakışırsa arayan taraf 409'a çevirir).
 */
export function nextUsername(fullName: string): string {
  const prefix = usernamePrefix(fullName);

  const rows = db
    .prepare(`SELECT username FROM users WHERE username LIKE ?`)
    .all(`${prefix}%`) as Array<{ username: string }>;

  let max = 0;
  for (const { username } of rows) {
    const suffix = username.slice(prefix.length);
    if (suffix !== '' && /^\d+$/.test(suffix)) {
      const n = Number(suffix);
      if (n > max) max = n;
    }
  }

  let n = max + 1;
  let candidate = `${prefix}${n}`;
  for (;;) {
    const taken = db
      .prepare(`SELECT id FROM users WHERE username = ?`)
      .get(candidate);
    if (!taken) {
      return candidate;
    }
    n += 1;
    candidate = `${prefix}${n}`;
  }
}

/**
 * Otomatik `username` üretimi — spec.md §2.1:
 * - Öğrenci: `ogrenci<n>` — n, o roldeki en yüksek sıra numarasının +1'i.
 * - Veli: `veli<n>` — aynı mantık, veli kapsamında.
 * - Üretilen ad doluysa (örn. eşzamanlı iki kayıt) n bir artırılarak yeniden
 *   denenir; `idx_users_username` UNIQUE kısıtı çakışmayı garantiler.
 *
 * Normalizasyon (CLAUDE.md): `username` yalnızca sunucuda üretilir; istemciden
 * gelen normalize değere güvenilmez. Bu yüzden bu fonksiyon dışarıdan çağrılır.
 */

import { db } from '../db/index.js';

type UsernameRole = 'student' | 'guardian';

const PREFIX: Record<UsernameRole, string> = {
  student: 'ogrenci',
  guardian: 'veli',
};

/** Bir role ait en yüksek mevcut sıra numarası (yoksa 0). */
function maxSequence(role: UsernameRole): number {
  const prefix = PREFIX[role];
  const row = db
    .prepare(
      `SELECT username FROM users
       WHERE role = ? AND deleted_at IS NULL AND username LIKE ?`,
    )
    .all(role, `${prefix}%`) as Array<{ username: string }>;

  let max = 0;
  for (const { username } of row) {
    const n = Number(username.slice(prefix.length));
    if (Number.isInteger(n) && n > 0 && n > max) {
      max = n;
    }
  }
  return max;
}

/**
 * Bir sonraki boş username'i üretir. Çakışmada n artırılır; DB'deki UNIQUE
 * indeks bu fonksiyonu son güvence yapar (eşzamanlı iki istekte biri çakışırsa
 * arayan taraf UNIQUE ihlalini 409'a çevirir).
 */
export function nextUsername(role: UsernameRole): string {
  const prefix = PREFIX[role];
  let n = maxSequence(role) + 1;
  let candidate = `${prefix}${n}`;
  // Nadir eşzamanlı durumda boş slot bulunana kadar artır.
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

/**
 * Yerel dosya deposu sıfırlama yardımcısı (wipe/reset).
 *
 * Yalnızca **yerel `uploads/` klasörünü** siler. Uzak depoya (R2) **asla**
 * dokunmaz — `db:wipe`/`db:reset` dev/demo "sıfırla" araçlarıdır ve gerçek
 * üretim bucket'ındaki nesneleri silmemelidir. Bu modül bilinçli olarak
 * `services/storage.ts`'i import etmez; R2 çağrısı yapısı gereği imkânsızdır
 * (bkz. `localReset.test.ts` kaynak-koruma testi).
 */

import fs from 'node:fs';

/**
 * Verilen yerel uploads klasörünü (varsa) siler. Dizin yoksa hiçbir şey
 * yapmaz. Dizinin **kendisi** hedeftir; başka yollara dokunulmaz.
 * Silindiyse `true`, zaten yoksa `false` döner.
 */
export function removeLocalUploads(uploadsDir: string): boolean {
  if (!fs.existsSync(uploadsDir)) return false;
  fs.rmSync(uploadsDir, { recursive: true, force: true });
  return true;
}

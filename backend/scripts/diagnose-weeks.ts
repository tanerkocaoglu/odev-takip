/**
 * Hafta tanımı teşhisi — `npm run diagnose-weeks` (SALT-OKUNUR).
 *
 * Tüm haftaları tarar: `[start_date, end_date]` tam 7 gün olmayanları ve bu
 * haftalarda `day_of_week`'ten türeyen gerçek ders günü aralığın dışına düşen
 * `class_courses` atamalarını listeler. **Hiçbir yazma yapmaz** (yalnızca
 * SELECT). Render Shell'de çalıştırılıp üretimdeki gerçek durumu görmek için
 * tasarlanmıştır; kalıcı ürün akışının parçası değildir.
 *
 * Örnek:
 *   npm run diagnose-weeks
 */

import { loadEnv } from '../src/utils/env.js';
import { diagnoseWeeks } from '../src/services/weekDiagnostics.js';
import { formatDateTR } from '../src/utils/weeks.js';

loadEnv();

try {
  const result = diagnoseWeeks();

  console.log('=== diagnose-weeks (SALT-OKUNUR — hiçbir şey yazmaz) ===');
  console.log(`Taranan hafta: ${result.total_weeks}`);
  console.log(`7 gün olmayan (hatalı): ${result.malformed.length}`);
  console.log('');

  if (result.malformed.length === 0) {
    console.log('Hatalı hafta tanımı bulunamadı.');
  }

  for (const w of result.malformed) {
    console.log(
      `! week_no=${w.week_no} ${formatDateTR(w.start_date)}–${formatDateTR(w.end_date)}` +
        ` (${w.days} gün) label="${w.label}"`,
    );
    console.log(
      `    week_id=${w.week_id} | atama=${w.course_count} | aralık-dışı ders=${w.out_of_range.length} | rapor=${w.report_count}`,
    );
    for (const o of w.out_of_range) {
      console.log(
        `      - ${o.class_name} · ${o.course_name} (day_of_week=${o.day_of_week})` +
          ` -> ${formatDateTR(o.class_date)} (hafta aralığının dışında)`,
      );
    }
    console.log('');
  }
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
}

/**
 * Hafta ve son tarih hesapları.
 *
 * Kural (CLAUDE.md · spec.md §5.2): Gün hesapları (`day_of_week`, `due_date`)
 * yerel takvime göre yapılır; UTC üzerinden gün çıkarımı yapılmaz.
 *
 * Tatil haftası `weeks` tablosunda kayıt olarak açılmadığından; önceki/sonraki
 * ders haftası, takvimde (start_date'e göre) en yakın kayıt olarak bulunur
 * (bkz. getPreviousWeek / calculateDueDate).
 */

export interface WeekRecord {
  id: string;
  academic_year_id: string;
  week_no: number;
  start_date: string; // YYYY-MM-DD (yerel)
  end_date: string; // YYYY-MM-DD (yerel)
  label: string;
}

/** ISO tarihini (YYYY-MM-DD) yerel saat diliminde Date'e çevirir (UTC değil). */
function parseLocalDate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** Date'i yerel saat diliminde YYYY-MM-DD biçimine çevirir (toISOString kullanılmaz). */
function toLocalISODate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Tarihin hafta içi gününü döner: 1=Pazartesi ... 7=Pazar. */
function weekdayOf(date: Date): number {
  // JS: 0=Pazar, 6=Cumartesi → 1=Pazartesi, 7=Pazar
  return ((date.getDay() + 6) % 7) + 1;
}

/**
 * Bir haftanın bir önceki ders yapılan haftasını döner.
 *
 * Tatil haftaları `weeks` tablosunda kayıt olarak açılmadığı için, aynı eğitim
 * yılında `start_date`'i bu haftadan önce olan son kayıt alınır (week_no - 1
 * DEĞİL). Böylece arada tatil olsa bile "bir önceki ders yapılan hafta"
 * kendiliğinden bulunur. Yılın ilk ders haftası için `null` döner.
 */
export function getPreviousWeek(
  weeks: WeekRecord[],
  currentWeek: WeekRecord,
): WeekRecord | null {
  const previous = weeks
    .filter(
      (w) =>
        w.academic_year_id === currentWeek.academic_year_id &&
        w.start_date < currentWeek.start_date,
    )
    .sort((a, b) => (a.start_date < b.start_date ? 1 : -1));
  return previous[0] ?? null;
}

/**
 * Ödevin son tarihini hesaplar (spec.md §5.2):
 * `report.week.start_date`'ten sonraki ilk tarih öyle ki
 * `weekday(tarih) == class_course.day_of_week` ve o tarih bir sonraki
 * `weeks` kaydının aralığına düşüyor (tatil haftası varsa otomatik kayar).
 *
 * Sonraki `weeks` kaydı yoksa (eğitim yılının son haftası) `null` döner.
 */
export function calculateDueDate(
  currentWeek: WeekRecord,
  dayOfWeek: number,
  weeks: WeekRecord[],
): string | null {
  const nextWeek = getNextWeek(weeks, currentWeek);
  if (!nextWeek) return null;

  const start = parseLocalDate(nextWeek.start_date);
  const end = parseLocalDate(nextWeek.end_date);

  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    if (weekdayOf(d) === dayOfWeek) {
      return toLocalISODate(d);
    }
  }

  return null;
}

/**
 * Aynı eğitim yılında `start_date`'i bu haftadan sonra olan ilk kaydı döner;
 * yoksa (eğitim yılının son haftası) `null`. Tatil haftası kaydı olmadığından
 * bu, "bir sonraki ders yapılan hafta"dır.
 */
function getNextWeek(
  weeks: WeekRecord[],
  currentWeek: WeekRecord,
): WeekRecord | null {
  const next = weeks
    .filter(
      (w) =>
        w.academic_year_id === currentWeek.academic_year_id &&
        w.start_date > currentWeek.start_date,
    )
    .sort((a, b) => (a.start_date < b.start_date ? -1 : 1));
  return next[0] ?? null;
}

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

/** İki haneli sıfır dolgulu sayı ("3" → "03"). */
function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/**
 * Haftanın **gerçek başlangıcına göre** göreli gün sırası (1..7).
 *
 * `class_courses.day_of_week` ISO 8601 (1=Pazartesi .. 7=Pazar) saklanır; ama
 * bir haftanın kronolojik dersi hafta başına göre okunur. Hafta başlangıcı
 * sistemde sabit değildir — her `weeks` kaydının `start_date`'i belirler
 * (seed Pazartesi, üretimde Cumartesi olabilir). Örn. Cumartesi başlangıçlı
 * haftada: Cumartesi=1, Pazar=2, ..., Cuma=7.
 *
 * Pazartesi başlangıçlı haftada `dayOfWeek` ile birebir aynıdır (davranış
 * değişmez).
 */
export function relativeWeekday(dayOfWeek: number, weekStartDate: string): number {
  const start = weekdayOf(parseLocalDate(weekStartDate));
  return ((dayOfWeek - start + 7) % 7) + 1;
}

/**
 * Tek-hafta ders listeleri için ortak karşılaştırıcı: önce hafta başına göre
 * göreli gün, sonra `lesson_time` (yoksa en sona değil, boş string olarak
 * alfabetik başa). Tüm sıralama yüzeyleri bunu kullanır — kopya mantık yok.
 */
export function compareWeekdayLessonTime<T extends { day_of_week: number; lesson_time: string | null }>(
  weekStartDate: string,
): (a: T, b: T) => number {
  return (a, b) =>
    relativeWeekday(a.day_of_week, weekStartDate) -
      relativeWeekday(b.day_of_week, weekStartDate) ||
    (a.lesson_time ?? '').localeCompare(b.lesson_time ?? '');
}

/**
 * Çok-haftalı / sayfalı sorgular için SQL parçası: satırın kendi haftasının
 * `start_date`'ine göre göreli gün sırası. Örn.
 * `ORDER BY w.start_date DESC, ${relativeDayOrderSql('cc.day_of_week', 'w.start_date')}, cc.lesson_time`.
 *
 * `strftime('%w', ...)`: 0=Pazar .. 6=Cumartesi → ISO (1=Pazartesi) dönüşümü.
 */
export function relativeDayOrderSql(dayExpr: string, weekStartExpr: string): string {
  const isoStart = `((CAST(strftime('%w', ${weekStartExpr}) AS INTEGER) + 6) % 7 + 1)`;
  return `((${dayExpr} - ${isoStart} + 7) % 7 + 1)`;
}

/**
 * Hafta etiketini tarihten üretir: `gg.aa - gg.aa.yyyy` (nokta ayraçlı,
 * gün ve ay sıfır dolgulu; örn. `07.09 - 13.09.2026`).
 *
 * Hafta iki farklı yıla taşıyorsa yıl iki tarafta da tam yazılır:
 * `29.12.2025 - 04.01.2026`.
 */
export function formatWeekLabel(startDate: string, endDate: string): string {
  const [sy, sm, sd] = startDate.split('-').map(Number);
  const [ey, em, ed] = endDate.split('-').map(Number);
  const start = `${pad2(sd)}.${pad2(sm)}`;
  const end = `${pad2(ed)}.${pad2(em)}`;
  if (sy !== ey) {
    return `${start}.${sy} - ${end}.${ey}`;
  }
  return `${start} - ${end}.${ey}`;
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

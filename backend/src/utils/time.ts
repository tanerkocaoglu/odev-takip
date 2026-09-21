/**
 * Zaman yardımcıları — CLAUDE.md: gün hesapları yerel takvime göre yapılır,
 * UTC üzerinden gün çıkarımı yapılmaz. Zaman dilimi Europe/Istanbul.
 */

import { classDateForWeek, type WeekRecord } from './weeks.js';

/**
 * Yerel takvimde bugün (YYYY-MM-DD) — makine yerel saatine göre.
 * `localDateISO`'dan farkı: sabit bir girdi yerine "şu an"ı ve Europe/Istanbul
 * yerine makine saat dilimini kullanır (mevcut davranış korunur).
 */
export function localTodayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`;
}

/**
 * Hafta başladı mı? (spec.md §5.1): `bugün >= week.start_date`. Başlamamış
 * (gelecekteki) bir hafta doldurulamaz — öğretmen ekranında yalnızca
 * salt-okunur önizleme olarak gösterilir ve backend yazma uçları 403 döner.
 * Tek tarih kaynağı burasıdır (kopya `start_date > bugün` mantığı yazılmaz).
 */
export function hasWeekStarted(week: { start_date: string }): boolean {
  return localTodayISO() >= week.start_date;
}

/**
 * Hafta bitti mi? (bir haftalık pencere analizleri için): `bugün > week.end_date`.
 * `hasWeekStarted`'ten farkı: **devam eden** hafta (bugün aralığın içinde) henüz
 * "bitmiş" sayılmaz. Risk penceresi gibi "son N **geçmiş** hafta" hesapları
 * yalnızca bitmiş haftaları kullanmalıdır (bugün > end_date).
 * Tek tarih kaynağı burasıdır (kopya `end_date < bugün` mantığı yazılmaz).
 */
export function hasWeekEnded(week: { end_date: string }): boolean {
  return localTodayISO() > week.end_date;
}

/**
 * Ders günü bu haftada geçti mi? (spec.md §5.1: "ders günü geçtiği halde
 * draft olanlar üstte ve vurgulu görünür"). Hafta tamamen bittiyse de geçmiş.
 *
 * Ders günü, haftanın **gerçek başlangıcına göre** hesaplanır: `start_date`'ten
 * `relativeWeekday - 1` gün sonrası. `day_of_week` ISO (1=Pazartesi) olduğundan
 * `start_date`'i doğrudan `day_of_week` ile eşlemek yalnızca Pazartesi
 * başlangıçlı haftalarda doğru olurdu; Cumartesi başlangıçlı haftada Pazar
 * dersi yanlışlıkla ~6 gün ileri kayardı.
 */
export function isOverdue(week: WeekRecord, dayOfWeek: number): boolean {
  const [y, m, d] = classDateForWeek(week.start_date, dayOfWeek).split('-').map(Number);
  const classDay = new Date(y, m - 1, d);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return classDay < today;
}

/**
 * Bir dersin **gerçek takvim günü** haftanın tanımlı `[start_date, end_date]`
 * aralığının içinde mi? (spec.md §3.1)
 *
 * Normal 7 günlük haftada daima true'dur. Hafta 7 günden kısa/uzun tanımlanmışsa
 * (kötü veri) `day_of_week`'ten türeyen gün `end_date`'i aşabilir — bu durumda
 * `false` döner ve rapor akışı bunu sessizce yok saymaz (savunma katmanı).
 */
export function isClassDayWithinWeek(
  week: { start_date: string; end_date: string },
  dayOfWeek: number,
): boolean {
  return classDateForWeek(week.start_date, dayOfWeek) <= week.end_date;
}

/**
 * Yerel takvimde bir gün öncesi (YYYY-MM-DD) — UTC çıkarımı yapılmaz.
 * `getPreviousWeek` boş döndüğünde (yılın ilk haftası) eski enrollment'ı
 * hafta başlangıcından bir gün önce kapatmak için kullanılır.
 */
export function prevDay(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  date.setDate(date.getDate() - 1);
  const py = date.getFullYear();
  const pm = String(date.getMonth() + 1).padStart(2, '0');
  const pd = String(date.getDate()).padStart(2, '0');
  return `${py}-${pm}-${pd}`;
}

/** ISO tarih/saat (UTC) → Europe/Istanbul yerel tarihi (YYYY-MM-DD). */
export function localDateISO(input: string | Date): string {
  const d = typeof input === 'string' ? new Date(input) : input;
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Istanbul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

/**
 * Geç teslim mi? (kullanıcı kararı): submitted_at (Europe/Istanbul) >
 * due_date gününün 23:59:59'u ise geç sayılır. Yani submitted_at'ın yerel
 * günü due_date'den sonraysa is_late = true.
 */
export function isLateSubmission(submittedAt: string, dueDate: string): boolean {
  return localDateISO(submittedAt) > dueDate;
}

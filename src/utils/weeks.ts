/**
 * Hafta seçici yardımcıları (frontend) — varsayılan hafta ve geçmiş hafta
 * tespiti. Sunucu asıl otoritedir (geçmiş hafta orada da reddedilir); buradaki
 * mantık yalnızca UX içindir.
 */

import type { Week } from '../types';

/** Bugün (YYYY-MM-DD) — makine yerel takvimi (mevcut `defaultWeekId` deseni). */
function todayISO(): string {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(
    today.getDate(),
  ).padStart(2, '0')}`;
}

/**
 * Yıl başlamadıysa en erken haftaya, aksi hâlde "şu anki" haftaya düşer
 * (`weeks` `start_date`'e göre artan sıralı beklenir).
 */
export function defaultWeekId(weeks: Week[]): string {
  if (weeks.length === 0) return '';
  const today = todayISO();
  const current = [...weeks].reverse().find((w) => w.start_date <= today);
  return (current ?? weeks[0]).id;
}

/** Hafta bitmiş mi? (`end_date < bugün`) — bitmiş haftalar seçilemez. */
export function isWeekPast(week: Week): boolean {
  return week.end_date < todayISO();
}

/**
 * Öğrenci/CSV başlangıç seçicisi için varsayılan hafta: aktif veya gelecek
 * haftalar arasından `defaultWeekId`; hiç seçilebilir hafta yoksa `''`
 * (çağıran `week_id`'yi göndermez, sunucu kendi varsayılanını uygular).
 */
export function defaultSelectableWeekId(weeks: Week[]): string {
  const selectable = weeks.filter((w) => !isWeekPast(w));
  if (selectable.length === 0) return '';
  return defaultWeekId(selectable);
}

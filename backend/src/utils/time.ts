/**
 * Zaman yardımcıları — CLAUDE.md: gün hesapları yerel takvime göre yapılır,
 * UTC üzerinden gün çıkarımı yapılmaz. Zaman dilimi Europe/Istanbul.
 */

import type { WeekRecord } from './weeks.js';

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
 * Ders günü bu haftada geçti mi? (spec.md §5.1: "ders günü geçtiği halde
 * draft olanlar üstte ve vurgulu görünür"). Hafta tamamen bittiyse de geçmiş.
 */
export function isOverdue(week: WeekRecord, dayOfWeek: number): boolean {
  const [y, m, d] = week.start_date.split('-').map(Number);
  const classDay = new Date(y, m - 1, d);
  classDay.setDate(classDay.getDate() + (dayOfWeek - 1));
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return classDay < today;
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

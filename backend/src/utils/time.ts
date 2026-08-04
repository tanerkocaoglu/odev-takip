/**
 * Zaman yardımcıları — CLAUDE.md: gün hesapları yerel takvime göre yapılır,
 * UTC üzerinden gün çıkarımı yapılmaz. Zaman dilimi Europe/Istanbul.
 */

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

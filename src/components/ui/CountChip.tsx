/**
 * Sayaç çipi — bir sekme/filtre/başlığın yanındaki sayı (ör. eksik rapor sayısı).
 * Durum rozeti DEĞİLDİR: ikonsuz, nötr, yalnızca sayı taşır. Durum bilgisi için `Badge`.
 */

export function CountChip({ value, label }: { value: number; label?: string }) {
  return (
    <span
      aria-label={label ? `${value} ${label}` : undefined}
      className="tabular inline-flex min-w-5 items-center justify-center rounded-full bg-subtle px-1.5 text-xs font-medium text-muted"
    >
      {value}
    </span>
  );
}

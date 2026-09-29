/**
 * Özet kartı — ikon dairesinde semantik ton, büyük sayı, etiket. Kartın anlamı ikon
 * rengi + metindedir (kenar çizgisi yok). `to` verilirse tıklanabilir bağlantı kartıdır.
 */

import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { LucideIcon } from 'lucide-react';
import { Card } from './Card';
import { cx } from './cx';

const TONES = {
  success: 'bg-success/10 text-success',
  warning: 'bg-warning/10 text-warning',
  info: 'bg-info/10 text-info',
  danger: 'bg-danger/10 text-danger',
  neutral: 'bg-subtle text-muted',
} as const;

export function StatCard({
  icon: Icon,
  tone = 'neutral',
  value,
  suffix,
  label,
  hint,
  to,
}: {
  icon: LucideIcon;
  tone?: keyof typeof TONES;
  value: ReactNode;
  /** Sayının yanındaki küçük metin (ör. "hazır"). */
  suffix?: string;
  label: string;
  hint?: string;
  to?: string;
}) {
  const body = (
    <>
      <span className={cx('flex h-8 w-8 items-center justify-center rounded-full', TONES[tone])}>
        <Icon size={16} aria-hidden="true" />
      </span>
      <p className="tabular mt-2 text-2xl font-semibold text-text">
        {value}
        {suffix && <span className="ml-1 text-base font-normal text-muted">{suffix}</span>}
      </p>
      <p className="mt-1 text-[13px] text-muted">{label}</p>
      {hint && <p className="tabular mt-0.5 text-xs text-muted">{hint}</p>}
    </>
  );
  if (to) {
    return (
      <Link to={to} className="card-interactive block rounded-md border border-border bg-surface p-4">
        {body}
      </Link>
    );
  }
  return <Card>{body}</Card>;
}

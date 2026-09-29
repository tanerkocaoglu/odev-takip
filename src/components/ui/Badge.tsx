/**
 * Durum rozeti — renk + ikon + metin (renk tek başına anlam taşımaz).
 * Tonlar semantik renk ailelerine bağlıdır:
 * positive=success (tamam), warning (gecikmiş), danger (eksik), info (hazır/bilgi),
 * neutral (sönük — henüz bir şey olmamış).
 */

import type { ReactNode } from 'react';
import { Circle, CircleAlert, CircleCheck, Clock, Info, type LucideIcon } from 'lucide-react';
import { ATTENDANCE_LABELS, type Attendance } from '../../types';
import { cx } from './cx';

export type BadgeTone = 'neutral' | 'positive' | 'warning' | 'danger' | 'info';

const TONES: Record<BadgeTone, { cls: string; icon: LucideIcon }> = {
  neutral: { cls: 'bg-muted/10 text-muted', icon: Circle },
  positive: { cls: 'bg-success/10 text-success', icon: CircleCheck },
  warning: { cls: 'bg-warning/10 text-warning', icon: Clock },
  danger: { cls: 'bg-danger/10 text-danger', icon: CircleAlert },
  info: { cls: 'bg-info/10 text-info', icon: Info },
};

export function Badge({
  tone = 'neutral',
  children,
  icon,
}: {
  tone?: BadgeTone;
  children: ReactNode;
  /** Varsayılan ton ikonunu değiştirir. */
  icon?: LucideIcon;
}) {
  const Icon = icon ?? TONES[tone].icon;
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium',
        TONES[tone].cls,
      )}
    >
      <Icon size={12} aria-hidden="true" className="shrink-0" />
      {children}
    </span>
  );
}

const STATUS_LABELS: Record<'draft' | 'completed' | 'sent', string> = {
  draft: 'Taslak',
  completed: 'Tamamlandı',
  sent: 'Gönderildi',
};

/** Rapor durumu: Taslak nötr, Tamamlandı mavi (gönderim bekliyor), Gönderildi yeşil. */
export function StatusBadge({ status }: { status: 'draft' | 'completed' | 'sent' }) {
  const tone: BadgeTone =
    status === 'draft' ? 'neutral' : status === 'completed' ? 'info' : 'positive';
  return <Badge tone={tone}>{STATUS_LABELS[status]}</Badge>;
}

const ATTENDANCE_TONES: Record<Attendance, BadgeTone> = {
  present: 'neutral',
  late: 'warning',
  absent: 'danger',
  excused: 'info',
};

export function AttendanceBadge({ attendance }: { attendance: Attendance }) {
  return <Badge tone={ATTENDANCE_TONES[attendance]}>{ATTENDANCE_LABELS[attendance]}</Badge>;
}

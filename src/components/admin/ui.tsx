/**
 * Admin sayfalarında ortak küçük UI parçaları.
 * Tasarım token'larından türetilir — yeni renk/boyut tanımlanmaz.
 */

import type { ReactNode } from 'react';
import { Inbox, Search, type LucideIcon } from 'lucide-react';
import { ATTENDANCE_LABELS, type Attendance } from '../../types';

export const inputClass =
  'h-9 w-full rounded-md border border-border bg-surface px-3 text-sm text-text placeholder:text-muted focus:border-accent';

/**
 * Dolgulu rozetler — tek stil, mevcut durum renkleri. Yeni renk icat edilmez.
 * positive=yeşil (status-sent), neutral=gri (status-draft),
 * warning=amber (attendance-late), danger=kırmızı (danger),
 * info=mavi (status-completed).
 */
export type BadgeTone = 'neutral' | 'positive' | 'warning' | 'danger' | 'info';

const BADGE_TONES: Record<BadgeTone, string> = {
  neutral: 'bg-status-draft/10 text-status-draft',
  positive: 'bg-status-sent/10 text-status-sent',
  warning: 'bg-att-late/10 text-att-late',
  danger: 'bg-danger/10 text-danger',
  info: 'bg-status-completed/10 text-status-completed',
};

export function Badge({
  tone = 'neutral',
  children,
}: {
  tone?: BadgeTone;
  children: ReactNode;
}) {
  return (
    <span
      className={
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ' +
        BADGE_TONES[tone]
      }
    >
      {children}
    </span>
  );
}

const STATUS_LABELS: Record<'draft' | 'completed' | 'sent', string> = {
  draft: 'Taslak',
  completed: 'Tamamlandı',
  sent: 'Gönderildi',
};

/**
 * Rapor durumu rozeti — Taslak nötr gri, Tamamlandı mavi (hazır, gönderim
 * bekliyor), Gönderildi yeşil. "Tamamlandı ↔ Gönderildi" ayrımı korunur.
 */
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

/** Devamsızlık rozeti — attendance renk kümesi. */
export function AttendanceBadge({ attendance }: { attendance: Attendance }) {
  return <Badge tone={ATTENDANCE_TONES[attendance]}>{ATTENDANCE_LABELS[attendance]}</Badge>;
}

export function Field({
  label,
  htmlFor,
  children,
  error,
}: {
  label: string;
  htmlFor?: string;
  children: ReactNode;
  error?: string;
}) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-1 block text-sm font-medium text-muted">
        {label}
      </label>
      {children}
      {error && <p className="mt-1 text-xs font-medium text-att-absent">{error}</p>}
    </div>
  );
}

/** Sayfa başlığı — sekme ikonuyla aynı ikonu kullanır. */
export function PageTitle({
  icon: Icon,
  children,
}: {
  icon: LucideIcon;
  children: ReactNode;
}) {
  return (
    <h1 className="flex items-center gap-2 text-xl font-semibold text-text">
      <Icon size={18} aria-hidden="true" className="text-accent" />
      {children}
    </h1>
  );
}

export function FormError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p role="alert" className="text-sm font-medium text-att-absent">
      {message}
    </p>
  );
}

export function LoadingState() {
  return <p className="py-8 text-center text-sm text-muted">Yükleniyor…</p>;
}

export function EmptyState({ message, action }: { message: string; action?: ReactNode }) {
  return (
    <div className="elevation-1 rounded-md border border-border bg-surface py-10 text-center">
      <span className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-bg text-muted">
        <Inbox size={18} aria-hidden="true" />
      </span>
      <p className="text-sm text-muted">{message}</p>
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}

export function SearchBox({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  return (
    <div className="relative w-full max-w-xs">
      <Search
        size={15}
        aria-hidden="true"
        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted"
      />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={inputClass + ' pl-9'}
      />
    </div>
  );
}

export function PrimaryButton({
  children,
  onClick,
  type = 'button',
  disabled,
}: {
  children: ReactNode;
  onClick?: () => void;
  type?: 'button' | 'submit';
  disabled?: boolean;
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className="card-interactive rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-fg hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {children}
    </button>
  );
}

export function SecondaryButton({
  children,
  onClick,
  type = 'button',
}: {
  children: ReactNode;
  onClick?: () => void;
  type?: 'button' | 'submit';
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      className="rounded-md border border-border px-4 py-2 text-sm font-medium text-text transition-colors hover:bg-bg"
    >
      {children}
    </button>
  );
}

export function DangerButton({
  children,
  onClick,
}: {
  children: ReactNode;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-md border border-danger/30 px-3 py-1.5 text-sm font-medium text-danger transition-colors hover:bg-danger/5"
    >
      {children}
    </button>
  );
}

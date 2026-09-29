/**
 * Yüklenme / boş / hata durumları ve satır içi bildirimler.
 * Her veri ekranı üçünü de karşılar:
 *   yükleniyor → `LoadingState` (blok iskelet, metin değil)
 *   hata       → `ErrorState` (ne oldu + "Yeniden dene")
 *   boş        → `EmptyState` (davet eden cümle + varsa eylem)
 */

import type { ReactNode } from 'react';
import { CircleAlert, CircleCheck, Info, Inbox, TriangleAlert, type LucideIcon } from 'lucide-react';
import { Button } from './Button';
import { cx } from './cx';

export function Skeleton({ className = '' }: { className?: string }) {
  return <div aria-hidden="true" className={cx('shimmer rounded-md', className)} />;
}

/**
 * Sayfa/liste yüklenirken. `rows` kadar satır iskeleti; ekran okuyucuya
 * "Yükleniyor…" duyurulur.
 */
export function LoadingState({ rows = 4 }: { rows?: number }) {
  return (
    <div role="status" aria-busy="true" className="space-y-2 py-2">
      <span className="sr-only">Yükleniyor…</span>
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-12 w-full" />
      ))}
    </div>
  );
}

export function EmptyState({
  message,
  action,
  icon: Icon = Inbox,
}: {
  message: string;
  action?: ReactNode;
  icon?: LucideIcon;
}) {
  return (
    <div className="rounded-md border border-border bg-surface px-4 py-10 text-center">
      <span className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-subtle text-muted">
        <Icon size={18} aria-hidden="true" />
      </span>
      <p className="text-sm text-muted">{message}</p>
      {action && <div className="mt-3 flex justify-center">{action}</div>}
    </div>
  );
}

export function ErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div
      role="alert"
      className="rounded-md border border-danger/30 bg-danger/5 px-4 py-6 text-center"
    >
      <span className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-danger/10 text-danger">
        <CircleAlert size={18} aria-hidden="true" />
      </span>
      <p className="text-sm font-medium text-danger">{message}</p>
      {onRetry && (
        <div className="mt-3 flex justify-center">
          <Button onClick={onRetry}>Yeniden dene</Button>
        </div>
      )}
    </div>
  );
}

/** Form gönderiminden dönen hata — formun içinde, düğmelerin üstünde. */
export function FormError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p role="alert" className="flex items-start gap-1.5 text-sm font-medium text-danger">
      <CircleAlert size={15} aria-hidden="true" className="mt-0.5 shrink-0" />
      {message}
    </p>
  );
}

type NoticeTone = 'info' | 'success' | 'warning' | 'danger';

const NOTICE: Record<NoticeTone, { cls: string; icon: LucideIcon }> = {
  info: { cls: 'border-info/30 bg-info/5 text-info', icon: Info },
  success: { cls: 'border-success/30 bg-success/5 text-success', icon: CircleCheck },
  warning: { cls: 'border-warning/40 bg-warning/5 text-warning', icon: TriangleAlert },
  danger: { cls: 'border-danger/30 bg-danger/5 text-danger', icon: CircleAlert },
};

/** Kalıcı sayfa içi bilgi bandı (ör. "Bu rapor gönderildi"). İkon + metin. */
export function InlineNotice({
  tone = 'info',
  children,
}: {
  tone?: NoticeTone;
  children: ReactNode;
}) {
  const { cls, icon: Icon } = NOTICE[tone];
  return (
    <div className={cx('flex items-start gap-2 rounded-md border px-3 py-2 text-sm', cls)}>
      <Icon size={16} aria-hidden="true" className="mt-0.5 shrink-0" />
      <div className="min-w-0">{children}</div>
    </div>
  );
}

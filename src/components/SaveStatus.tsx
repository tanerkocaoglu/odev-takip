/**
 * Otomatik kaydetme durumu — ekran okuyucuya `aria-live` ile duyurulur.
 * Dört durum ayırt edilir (renk + ikon + metin):
 *   idle    → boş (canlı bölge yerinde durur)
 *   saving  → "Kaydediliyor…"
 *   saved   → "Kaydedildi 14:32" (Europe/Istanbul)
 *   error   → "Kaydedilemedi" + "Yeniden dene"
 */

import { CircleAlert, CircleCheck, LoaderCircle } from 'lucide-react';
import { formatTime } from '../utils/date';

export type SaveState = 'idle' | 'saving' | 'saved' | 'error';

export default function SaveStatus({
  state,
  savedAt,
  onRetry,
  className = '',
}: {
  state: SaveState;
  savedAt: number | null;
  onRetry: () => void;
  className?: string;
}) {
  return (
    <div role="status" aria-live="polite" className={'text-[13px] ' + className}>
      {state === 'saving' && (
        <span className="inline-flex items-center gap-1.5 text-muted">
          <LoaderCircle size={14} aria-hidden="true" className="animate-spin" />
          Kaydediliyor…
        </span>
      )}
      {state === 'saved' && (
        <span className="tabular inline-flex items-center gap-1.5 text-success">
          <CircleCheck size={14} aria-hidden="true" />
          Kaydedildi{savedAt ? ` ${formatTime(savedAt)}` : ''}
        </span>
      )}
      {state === 'error' && (
        <span className="inline-flex items-center gap-2 text-danger">
          <CircleAlert size={14} aria-hidden="true" />
          Kaydedilemedi
          <button
            type="button"
            onClick={onRetry}
            className="rounded-md px-1.5 py-1 font-medium underline underline-offset-2 hover:text-danger/80 max-md:min-h-11"
          >
            Yeniden dene
          </button>
        </span>
      )}
    </div>
  );
}

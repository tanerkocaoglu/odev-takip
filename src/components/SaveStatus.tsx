/**
 * Otomatik kaydetme durumu. Dört durum ayırt edilir (renk + ikon + metin):
 *   idle    → boş
 *   saving  → "Kaydediliyor…"
 *   saved   → "Kaydedildi 14:32" (Europe/Istanbul)
 *   error   → "Kaydedilemedi" + "Yeniden dene"
 *
 * `SaveStatus` görsel kopyadır (birden çok yerde durabilir: başlık, mobil alt
 * çubuk); ekran okuyucuya duyuru için sayfada TEK `SaveAnnouncer` bulunur
 * (`aria-live`, görünmez) — çubuk klavye açılınca gizlense de duyuru sürer.
 */

import { CircleAlert, CircleCheck, LoaderCircle } from 'lucide-react';
import { formatTime } from '../utils/date';

export type SaveState = 'idle' | 'saving' | 'saved' | 'error';

function saveStatusText(state: SaveState, savedAt: number | null): string {
  if (state === 'saving') return 'Kaydediliyor…';
  if (state === 'saved') return `Kaydedildi${savedAt ? ` ${formatTime(savedAt)}` : ''}`;
  if (state === 'error') return 'Kaydedilemedi';
  return '';
}

/** Görünmez `aria-live` bölgesi — sayfada bir kez. */
export function SaveAnnouncer({ state, savedAt }: { state: SaveState; savedAt: number | null }) {
  return (
    <div role="status" aria-live="polite" className="sr-only">
      {saveStatusText(state, savedAt)}
    </div>
  );
}

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
    <div className={'text-[13px] ' + className}>
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

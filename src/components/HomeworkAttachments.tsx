/**
 * Öğretmen ödev ekleri (PDF) — kompakt satır içi liste.
 *
 * `compact` yoğunluk hedeflenir: büyük dropzone yok; küçük "PDF ekle" butonu +
 * tek satır PDF çipleri. Öğretmen rapor giriş ekranının klavye/hız akışını
 * bozmaz. Ekleme/kaldırma yalnızca `onAdd`/`onRemove` verildiğinde gösterilir
 * (girişli diğer yüzeyler salt-okunur listeler).
 */

import { useRef } from 'react';
import { FileText, Paperclip, Plus, X } from 'lucide-react';
import type { HomeworkAttachment } from '../types';

function isPdf(file: File): boolean {
  return file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
}

export default function HomeworkAttachments({
  attachments,
  onOpen,
  onAdd,
  onRemove,
  busy = false,
  emptyLabel = 'Ek yok',
  size = 'compact',
}: {
  attachments: HomeworkAttachment[];
  onOpen: (key: string) => void;
  /** Verilirse "PDF ekle" butonu görünür. */
  onAdd?: (files: File[]) => void;
  /** Verilirse her çip üzerinde kaldırma (×) görünür. */
  onRemove?: (attachmentId: string) => void;
  busy?: boolean;
  emptyLabel?: string;
  /**
   * compact: öğretmen rapor girişi (tek satır çipler, hız).
   * comfortable: öğrenci/veli (telefon): her ek ≥ 44px yüksekliğinde satır.
   */
  size?: 'compact' | 'comfortable';
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  function handleFiles(list: FileList | null) {
    if (!list || !onAdd) return;
    const files = Array.from(list).filter(isPdf);
    if (files.length > 0) onAdd(files);
    if (inputRef.current) inputRef.current.value = '';
  }

  if (size === 'comfortable') {
    return (
      <div>
        <p className="mb-1.5 inline-flex items-center gap-1 text-[13px] font-medium text-muted">
          <Paperclip size={13} aria-hidden="true" />
          Öğretmenin eklediği dosyalar
        </p>
        {attachments.length === 0 ? (
          <p className="text-[13px] text-muted">{emptyLabel}</p>
        ) : (
          <ul className="space-y-1.5">
            {attachments.map((a) => (
              <li key={a.id}>
                <button
                  type="button"
                  onClick={() => onOpen(a.key)}
                  title={a.filename}
                  className="flex min-h-11 w-full items-center gap-2 rounded-md border border-border bg-surface px-3 text-left text-sm font-medium text-accent transition-colors hover:border-accent"
                >
                  <FileText size={16} aria-hidden="true" className="shrink-0" />
                  <span className="min-w-0 flex-1 truncate">{a.filename}</span>
                  <span className="shrink-0 text-[13px] font-normal text-muted">PDF</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="inline-flex items-center gap-1 text-[12px] text-muted">
        <Paperclip size={12} aria-hidden="true" />
        Ekler
      </span>

      {attachments.length === 0 && !onAdd && (
        <span className="text-[12px] text-muted">{emptyLabel}</span>
      )}

      {attachments.map((a) => (
        <span
          key={a.id}
          className="inline-flex max-w-[220px] items-center gap-1 rounded-md border border-border bg-bg px-2 py-0.5"
        >
          <button
            type="button"
            onClick={() => onOpen(a.key)}
            title={a.filename}
            className="inline-flex min-w-0 items-center gap-1 text-[12px] font-medium text-accent hover:underline"
          >
            <FileText size={12} aria-hidden="true" className="shrink-0" />
            <span className="truncate">{a.filename}</span>
          </button>
          {onRemove && (
            <button
              type="button"
              disabled={busy}
              onClick={() => onRemove(a.id)}
              aria-label={`${a.filename} ekini kaldır`}
              className="shrink-0 text-muted transition-colors hover:text-danger disabled:opacity-50"
            >
              <X size={12} aria-hidden="true" />
            </button>
          )}
        </span>
      ))}

      {onAdd && (
        <>
          <input
            ref={inputRef}
            type="file"
            accept="application/pdf,.pdf"
            multiple
            className="hidden"
            onChange={(e) => handleFiles(e.target.files)}
          />
          <button
            type="button"
            disabled={busy}
            onClick={() => inputRef.current?.click()}
            className="inline-flex min-h-[28px] items-center gap-1 rounded-md border border-border px-2 py-0.5 text-[12px] font-medium text-text transition-colors hover:bg-bg disabled:opacity-50"
          >
            <Plus size={12} aria-hidden="true" />
            PDF ekle
          </button>
        </>
      )}
    </div>
  );
}

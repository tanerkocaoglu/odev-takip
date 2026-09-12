/**
 * Görsel lightbox / galeri modalı.
 *
 * Öğretmen teslim kontrol ve öğrenci "Ödevlerim" ekranlarında görsel teslim
 * dosyalarına tıklanınca açılır. `compact`/`comfortable` yoğunluklarının
 * dışında, kendi başına bir overlay bileşenidir — hangi ekranda açılırsa aynı
 * görünür. PDF'ler bu bileşene girmez (çağıran taraf filtreler).
 *
 * Yükleme stratejisi: lazy + komşu ön yükleme. Yalnızca aktif görsel ve
 * komşuları (index ±1) fetch edilir; pencere dışında kalan blob URL'ler
 * `URL.revokeObjectURL` ile serbest bırakılır (sızıntı olmaz).
 *
 * `src` verilirse (henüz yüklenmemiş, tarayıcıdaki bekleyen dosya) doğrudan
 * kullanılır; bu URL'nin sahibi çağırandır ve lightbox onu revoke etmez.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import {
  fetchProtectedFileUrl,
  releaseProtectedFileUrl,
  ApiClientError,
} from '../services/api';

export interface LightboxImage {
  /** Kimlik/anahtar. Sunucu görselinde dosya key'i; yerelde sentetik kimlik. */
  key: string;
  filename: string;
  /** Yerel (henüz yüklenmemiş) görsel için hazır blob URL. */
  src?: string;
}

interface ImageLightboxProps {
  images: LightboxImage[];
  initialIndex: number;
  onClose: () => void;
}

const FOCUSABLE =
  'button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

export default function ImageLightbox({
  images,
  initialIndex,
  onClose,
}: ImageLightboxProps) {
  const total = images.length;
  const [index, setIndex] = useState(initialIndex);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  const urlsRef = useRef<Record<string, string>>({});
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const triggerRef = useRef<HTMLElement | null>(null);

  const safeIndex = Math.min(Math.max(index, 0), Math.max(total - 1, 0));
  const current = total > 0 ? images[safeIndex] : undefined;
  const currentUrl = current ? (current.src ?? urls[current.key]) : undefined;

  const keysSignature = useMemo(() => images.map((i) => i.key).join('|'), [images]);

  const revoke = useCallback((key: string) => {
    const url = urlsRef.current[key];
    if (url) {
      releaseProtectedFileUrl(url);
      delete urlsRef.current[key];
    }
  }, []);

  // Aktif görsel + komşularını yükle; pencere dışındaki URL'leri serbest bırak.
  useEffect(() => {
    const list = images;
    if (list.length === 0) return;

    const wantedIndexes = [safeIndex - 1, safeIndex, safeIndex + 1].filter(
      (i) => i >= 0 && i < list.length,
    );
    const wanted = new Set(wantedIndexes.map((i) => list[i].key));

    for (const key of Object.keys(urlsRef.current)) {
      if (!wanted.has(key)) revoke(key);
    }

    let cancelled = false;
    const load = async (key: string) => {
      if (urlsRef.current[key]) return;
      const item = list.find((i) => i.key === key);
      // Yerel (src'li) görselin URL'si çağırana aittir; lightbox fetch/revoke etmez.
      if (item?.src) return;
      try {
        const url = await fetchProtectedFileUrl(key);
        if (cancelled) {
          // Efekt temizlendi (index değişti veya bileşen kapandı) — üretilen
          // URL'yi hemen bırak; aksi hâlde blob bellekte kalır.
          releaseProtectedFileUrl(url);
          return;
        }
        urlsRef.current[key] = url;
        setUrls({ ...urlsRef.current });
      } catch (err) {
        // Hata yalnızca aktif görsel için gösterilir; komşu hatası ekranı bozmaz.
        if (!cancelled && key === list[safeIndex].key) {
          setError(
            err instanceof ApiClientError ? err.message : 'Görsel yüklenemedi.',
          );
        }
      }
    };

    setError(null);
    Promise.all([...wanted].map((key) => load(key)));
    return () => {
      cancelled = true;
    };
    // `keysSignature` yeterli; `images` içeriği yalnızca anahtarlar üzerinden
    // etkilidir ve gereksiz yeniden çalışmayı önlemek için dışarıda tutulur.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [safeIndex, keysSignature, revoke]);

  // Açıkken body scroll kilidi + odağı modal içine taşı; kapanınca geri ver.
  useEffect(() => {
    triggerRef.current = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeButtonRef.current?.focus();
    // Obje kimliği sabit (yalnızca property eklenir/silinir) — kopyası güvenli.
    const urls = urlsRef.current;
    return () => {
      document.body.style.overflow = previousOverflow;
      for (const key of Object.keys(urls)) {
        releaseProtectedFileUrl(urls[key]);
        delete urls[key];
      }
      triggerRef.current?.focus?.();
    };
  }, []);

  const goPrev = useCallback(() => setIndex((i) => Math.max(0, i - 1)), []);
  const goNext = useCallback(
    () => setIndex((i) => Math.min(total - 1, i + 1)),
    [total],
  );

  // Klavye: Esc kapat, oklar gezin, Tab focus trap.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        goPrev();
        return;
      }
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        goNext();
        return;
      }
      if (e.key === 'Tab') {
        const dialog = dialogRef.current;
        if (!dialog) return;
        const focusables = Array.from(
          dialog.querySelectorAll<HTMLElement>(FOCUSABLE),
        );
        if (focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose, goPrev, goNext]);

  if (total === 0 || !current) return null;

  const navButtonClass =
    'absolute top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-md text-white/80 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white';

  // Portal: overlay `document.body`'ye taşınır. Aksi hâlde `.card-interactive`
  // gibi `transform` alan bir ata, `position: fixed`'in containing block'u olur;
  // hover'da overlay'in boyutu değişince `:hover` sürekli tetiklenip modal
  // büyüyüp küçülür. Portal bu döngüyü ve overflow kırpmasını engeller.
  return createPortal(
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label="Görsel önizleme"
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 p-4"
      onClick={onClose}
    >
      <button
        ref={closeButtonRef}
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
        aria-label="Kapat"
        className="absolute right-3 top-3 flex h-11 w-11 items-center justify-center rounded-md text-white/80 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
      >
        <X className="h-6 w-6" aria-hidden="true" />
      </button>

      {safeIndex > 0 && (
        <button
          type="button"
          aria-label="Önceki görsel"
          onClick={(e) => {
            e.stopPropagation();
            goPrev();
          }}
          className={`${navButtonClass} left-3`}
        >
          <ChevronLeft className="h-7 w-7" aria-hidden="true" />
        </button>
      )}

      {safeIndex < total - 1 && (
        <button
          type="button"
          aria-label="Sonraki görsel"
          onClick={(e) => {
            e.stopPropagation();
            goNext();
          }}
          className={`${navButtonClass} right-3`}
        >
          <ChevronRight className="h-7 w-7" aria-hidden="true" />
        </button>
      )}

      <div
        className="flex max-h-full max-w-full flex-col items-center"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex min-h-[40vh] items-center justify-center">
          {error ? (
            <p className="text-sm font-medium text-white">{error}</p>
          ) : currentUrl ? (
            <img
              src={currentUrl}
              alt={current.filename}
              className="max-h-[80vh] max-w-[92vw] object-contain"
            />
          ) : (
            <p className="text-sm text-white/80">Yükleniyor…</p>
          )}
        </div>
        <p className="tabular mt-3 text-sm text-white/80">
          {safeIndex + 1} / {total}
        </p>
        <p className="mt-1 max-w-[92vw] truncate text-xs text-white/60">
          {current.filename}
        </p>
      </div>
    </div>,
    document.body,
  );
}

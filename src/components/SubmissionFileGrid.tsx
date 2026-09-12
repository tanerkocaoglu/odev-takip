/**
 * Teslim dosyaları grid görünümü.
 *
 * - Görseller: gerçek görsel önizlemesi olan kare thumbnail'ler. Sunucudaki
 *   teslimler için `GET /files/:key/thumb` (küçük, lazy blob URL); henüz
 *   yüklenmemiş bekleyen dosyalar için tarayıcı `URL.createObjectURL`.
 * - PDF'ler: dosya ikonu + ad; sunucuda `onOpenPdf`, bekleyende yerel blob URL.
 * - Thumbnail tıklamasınca bileşen kendi `ImageLightbox`'ını açar (mevcut lazy
 *   yükleme/klavye/focus trap davranışı aynen).
 *
 * `collapsible`: dosya sayısı eşiği (4) aşarsa galeri varsayılan daraltılır;
 * ilk 4 dosya + "+N daha (toplam M dosya)" gösterilir. Öğretmen teslim kontrol
 * ekranında `collapsible` verilmez → her zaman açık. PDF'ler de sayıma dahildir.
 *
 * Blob URL yaşam döngüsü: bileşen yalnızca kendi ürettiği URL'leri (sunucu
 * thumb + yerel dosya) liste değişiminde ve unmount'ta revoke eder.
 */

import { useEffect, useRef, useState } from 'react';
import { FileText, X } from 'lucide-react';
import type { SubmissionFile } from '../types';
import ImageLightbox, { type LightboxImage } from './ImageLightbox';
import { fetchProtectedThumbUrl, releaseProtectedFileUrl } from '../services/api';

/** Sunucu görseli mi (PDF değil)? */
function isImage(file: { mime: string; ext: string }): boolean {
  return file.mime !== 'application/pdf' && file.ext !== 'pdf';
}

function isPdfName(name: string): boolean {
  return name.toLowerCase().endsWith('.pdf');
}

export type SubmissionFileGridProps =
  | {
      variant: 'server';
      files: SubmissionFile[];
      onOpenPdf: (key: string) => void;
      /** 4'ten fazla dosyada daralt/ aç (varsayılan: false). */
      collapsible?: boolean;
    }
  | {
      variant: 'local';
      files: File[];
      onRemove: (index: number) => void;
      collapsible?: boolean;
    };

const GRID_CLASS = 'grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6';

/** Bu sayıdan fazla dosya varsa (collapsible ise) galeri daraltılır. */
const THRESHOLD = 4;

/** Sunucu varyantında sabit boş dizi (effect bağımlılığı kimliği oynamasın). */
const NO_FILES: File[] = [];

export default function SubmissionFileGrid(props: SubmissionFileGridProps) {
  const [lightbox, setLightbox] = useState<{ images: LightboxImage[]; index: number } | null>(
    null,
  );
  const [expanded, setExpanded] = useState(false);

  // ---- Sunucu thumbnail'ları (lazy blob URL) ----
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const thumbsRef = useRef<Record<string, string>>({});
  const serverFiles = props.variant === 'server' ? props.files : [];
  const serverSignature = serverFiles
    .filter(isImage)
    .map((f) => f.key)
    .join('|');

  useEffect(() => {
    if (props.variant !== 'server') return;
    const keys = serverFiles.filter(isImage).map((f) => f.key);
    const wanted = new Set(keys);

    for (const key of Object.keys(thumbsRef.current)) {
      if (!wanted.has(key)) {
        releaseProtectedFileUrl(thumbsRef.current[key]);
        delete thumbsRef.current[key];
      }
    }

    let cancelled = false;
    (async () => {
      for (const key of keys) {
        if (thumbsRef.current[key]) continue;
        try {
          const url = await fetchProtectedThumbUrl(key);
          if (cancelled) {
            releaseProtectedFileUrl(url);
            return;
          }
          thumbsRef.current[key] = url;
          setThumbs({ ...thumbsRef.current });
        } catch {
          // Thumbnail yüklenemedi — hücre boş kalır; tam görsel lightbox'ta açılır.
        }
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.variant, serverSignature]);

  // Unmount'ta tüm sunucu thumbnail URL'lerini bırak.
  useEffect(
    () => () => {
      for (const key of Object.keys(thumbsRef.current)) {
        releaseProtectedFileUrl(thumbsRef.current[key]);
      }
      thumbsRef.current = {};
    },
    [],
  );

  // ---- Bekleyen (yerel) dosya önizlemeleri ----
  const [localUrls, setLocalUrls] = useState<string[]>([]);
  const localFiles = props.variant === 'local' ? props.files : NO_FILES;

  useEffect(() => {
    if (props.variant !== 'local') return;
    const urls = localFiles.map((f) => URL.createObjectURL(f));
    setLocalUrls(urls);
    return () => {
      for (const url of urls) releaseProtectedFileUrl(url);
    };
  }, [props.variant, localFiles]);

  // Liste eşiğin altına düşünce daraltma durumu sıfırlanır.
  useEffect(() => {
    if (props.files.length <= THRESHOLD) setExpanded(false);
  }, [props.files.length]);

  const fileNameAt = (index: number): string =>
    props.variant === 'server' ? props.files[index].filename : props.files[index].name;

  const openImageAt = (index: number) => {
    if (props.variant === 'server') {
      const images = props.files.filter(isImage);
      const file = props.files[index];
      if (!isImage(file)) return;
      setLightbox({
        images: images.map((f) => ({ key: f.key, filename: f.filename })),
        index: images.indexOf(file),
      });
      return;
    }
    const all = props.files;
    const images = all.filter((f) => !isPdfName(f.name));
    const file = all[index];
    if (isPdfName(file.name)) return;
    setLightbox({
      images: images.map((f) => ({
        key: `local:${all.indexOf(f)}`,
        filename: f.name,
        src: localUrls[all.indexOf(f)],
      })),
      index: images.indexOf(file),
    });
  };

  const openPdfAt = (index: number) => {
    if (props.variant === 'server') {
      props.onOpenPdf((props.files[index] as SubmissionFile).key);
    } else {
      const file = props.files[index] as File;
      const url = URL.createObjectURL(file);
      window.open(url, '_blank', 'noreferrer');
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    }
  };

  // Dosya sırası korunur (görsel + PDF birlikte); daraltmada ilk 4 gösterilir.
  const items = props.files.map((_, index) => ({
    index,
    isPdf:
      props.variant === 'server'
        ? !isImage((props.files as SubmissionFile[])[index])
        : isPdfName((props.files as File[])[index].name),
  }));

  const collapsible = props.collapsible ?? false;
  const collapsed = collapsible && !expanded && items.length > THRESHOLD;
  const visibleItems = collapsed ? items.slice(0, THRESHOLD) : items;
  const hiddenCount = Math.max(items.length - THRESHOLD, 0);

  return (
    <>
      <div className={GRID_CLASS}>
        {visibleItems.map((item) => {
          const name = fileNameAt(item.index);
          if (item.isPdf) {
            return (
              <PdfCell
                key={`pdf-${item.index}-${name}`}
                filename={name}
                onClick={() => openPdfAt(item.index)}
              />
            );
          }
          const src =
            props.variant === 'server'
              ? thumbs[(props.files[item.index] as SubmissionFile).key]
              : localUrls[item.index];
          const onRemove =
            props.variant === 'local' ? () => props.onRemove(item.index) : undefined;
          return (
            <ImageCell
              key={`img-${item.index}-${name}`}
              filename={name}
              src={src}
              onClick={() => openImageAt(item.index)}
              onRemove={onRemove}
            />
          );
        })}

        {collapsed && (
          <button
            type="button"
            onClick={() => setExpanded(true)}
            aria-label={`${items.length} dosyanın tümünü göster`}
            className="flex min-h-11 min-w-11 flex-col items-center justify-center gap-0.5 rounded-md border border-border bg-surface p-2 text-accent transition-colors hover:border-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            <span className="text-sm font-medium">+{hiddenCount} daha</span>
            <span className="text-[11px] text-muted">(toplam {items.length} dosya)</span>
          </button>
        )}
      </div>

      {collapsible && expanded && items.length > THRESHOLD && (
        <button
          type="button"
          onClick={() => setExpanded(false)}
          aria-label="Dosyaları daralt"
          className="mt-2 inline-flex min-h-11 items-center rounded-md border border-border px-3 text-xs font-medium text-muted transition-colors hover:border-accent hover:text-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          Daha az göster
        </button>
      )}

      {lightbox && (
        <ImageLightbox
          images={lightbox.images}
          initialIndex={lightbox.index}
          onClose={() => setLightbox(null)}
        />
      )}
    </>
  );
}

/** Kare görsel thumbnail hücresi (+ kaldır butonu). */
function ImageCell({
  filename,
  src,
  onClick,
  onRemove,
}: {
  filename: string;
  src?: string;
  onClick: () => void;
  onRemove?: () => void;
}) {
  return (
    <div className="relative">
      <button
        type="button"
        onClick={onClick}
        aria-label={`${filename} görselini aç`}
        className="block w-full overflow-hidden rounded-md border border-border bg-bg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        <div className="aspect-square w-full">
          {src ? (
            <img src={src} alt="" aria-hidden="true" className="h-full w-full object-cover" />
          ) : (
            <div className="shimmer h-full w-full" aria-hidden="true" />
          )}
        </div>
        <span className="block truncate px-1 py-1 text-[11px] text-muted">{filename}</span>
      </button>
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          aria-label={`${filename} dosyasını kaldır`}
          className="absolute right-1 top-1 flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-white transition-colors hover:bg-black/80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      )}
    </div>
  );
}

/** PDF hücresi — ikon + ad; yeni sekmede açılır. */
function PdfCell({ filename, onClick }: { filename: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`${filename} PDF dosyasını aç`}
      className="flex w-full flex-col items-center gap-1 overflow-hidden rounded-md border border-border bg-surface p-2 text-accent transition-colors hover:border-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
    >
      <span className="flex h-14 w-14 items-center justify-center rounded-md bg-bg">
        <FileText className="h-6 w-6" aria-hidden="true" />
      </span>
      <span className="w-full truncate text-center text-[11px] text-muted">{filename}</span>
    </button>
  );
}

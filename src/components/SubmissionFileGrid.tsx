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
  | { variant: 'server'; files: SubmissionFile[]; onOpenPdf: (key: string) => void }
  | { variant: 'local'; files: File[]; onRemove: (index: number) => void };

const GRID_CLASS = 'grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6';

/** Sunucu varyantında sabit boş dizi (effect bağımlılığı kimliği oynamasın). */
const NO_FILES: File[] = [];

export default function SubmissionFileGrid(props: SubmissionFileGridProps) {
  const [lightbox, setLightbox] = useState<{ images: LightboxImage[]; index: number } | null>(
    null,
  );

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

  const openServerImage = (imageFiles: SubmissionFile[], index: number) => {
    setLightbox({
      images: imageFiles.map((f) => ({ key: f.key, filename: f.filename })),
      index,
    });
  };

  const openLocalImage = (imageFiles: File[], index: number) => {
    const allLocal = localFiles;
    setLightbox({
      images: imageFiles.map((f) => ({
        key: `local:${allLocal.indexOf(f)}`,
        filename: f.name,
        src: localUrls[allLocal.indexOf(f)],
      })),
      index,
    });
  };

  const openLocalPdf = (file: File) => {
    const url = URL.createObjectURL(file);
    window.open(url, '_blank', 'noreferrer');
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  };

  return (
    <>
      <div className={GRID_CLASS}>
        {props.variant === 'server'
          ? (() => {
              const images = props.files.filter(isImage);
              const pdfs = props.files.filter((f) => !isImage(f));
              return (
                <>
                  {images.map((f, i) => (
                    <ImageCell
                      key={f.key}
                      filename={f.filename}
                      src={thumbs[f.key]}
                      onClick={() => openServerImage(images, i)}
                    />
                  ))}
                  {pdfs.map((f) => (
                    <PdfCell
                      key={f.key}
                      filename={f.filename}
                      onClick={() => props.onOpenPdf(f.key)}
                    />
                  ))}
                </>
              );
            })()
          : (() => {
              const images = props.files.filter((f) => !isPdfName(f.name));
              const pdfs = props.files.filter((f) => isPdfName(f.name));
              return (
                <>
                  {images.map((f, i) => (
                    <ImageCell
                      key={`local-${i}-${f.name}`}
                      filename={f.name}
                      src={localUrls[props.files.indexOf(f)]}
                      onClick={() => openLocalImage(images, i)}
                      onRemove={() => props.onRemove(props.files.indexOf(f))}
                    />
                  ))}
                  {pdfs.map((f, i) => (
                    <PdfCell
                      key={`pdf-${i}-${f.name}`}
                      filename={f.name}
                      onClick={() => openLocalPdf(f)}
                    />
                  ))}
                </>
              );
            })()}
      </div>

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

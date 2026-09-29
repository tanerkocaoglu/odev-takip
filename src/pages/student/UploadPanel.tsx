/**
 * Yükleme paneli — fotoğraf çek / dosya seç, önizle, dosya başına durumla gönder.
 *
 * Telefon öncelikli (comfortable): tüm dokunma hedefleri ≥ 44px, alanlar 16px.
 * - Boş kuyruk: büyük "Ödevi fotoğrafla çek" + "Galeriden seç" + kural ipucu.
 * - Kuyruk: her dosya bir satır (küçük resim → lightbox / PDF → yeni sekme, ad, boyut,
 *   durum rozeti, kaldır / yeniden dene). Seçim doğrulaması kuralları (`uploadRules`)
 *   değiştirmez; ihlaller sabit cümle + dosya ayrıntısıyla gösterilir.
 * - Toplam ilerleme: "3 / 8 dosya yüklendi" + ilerleme çubuğu (aria-live).
 * Puan/not/rapor içeriği bu ekranda ASLA yer almaz (spec §6).
 */

import { useEffect, useRef, useState } from 'react';
import { Camera, FileText, ImagePlus, RotateCw, X } from 'lucide-react';
import ImageLightbox, { type LightboxImage } from '../../components/ImageLightbox';
import { Badge, Button, Field, InlineNotice, Textarea, type BadgeTone } from '../../components/ui';
import { cx } from '../../components/ui';
import { isPdfFile, formatSize, MAX_FILES } from './uploadRules';
import type { QueueItem, UploadState, useHomeworkUploads } from './useHomeworkUploads';

type Uploads = ReturnType<typeof useHomeworkUploads>;

/** Kuyruktaki dosyalar için önizleme blob URL'leri (oluşturma/serbest bırakma burada). */
function useObjectUrls(items: QueueItem[]): Record<number, string> {
  const created = useRef<Record<number, string>>({});
  const [urls, setUrls] = useState<Record<number, string>>({});
  useEffect(() => {
    const live = new Set(items.map((i) => i.uid));
    let changed = false;
    for (const item of items) {
      if (!created.current[item.uid]) {
        created.current[item.uid] = URL.createObjectURL(item.file);
        changed = true;
      }
    }
    for (const key of Object.keys(created.current)) {
      const uid = Number(key);
      if (!live.has(uid)) {
        URL.revokeObjectURL(created.current[uid]);
        delete created.current[uid];
        changed = true;
      }
    }
    if (changed) setUrls({ ...created.current });
  }, [items]);
  useEffect(
    () => () => {
      for (const url of Object.values(created.current)) URL.revokeObjectURL(url);
      created.current = {};
    },
    [],
  );
  return urls;
}

const STATUS_BADGE: Record<QueueItem['status'], { tone: BadgeTone; label: string }> = {
  ready: { tone: 'neutral', label: 'Hazır' },
  uploading: { tone: 'info', label: 'Yükleniyor…' },
  done: { tone: 'positive', label: 'Yüklendi' },
  error: { tone: 'danger', label: 'Yüklenemedi' },
};

function FileRow({
  item,
  url,
  busy,
  onOpen,
  onRemove,
  onRetry,
}: {
  item: QueueItem;
  url?: string;
  busy: boolean;
  onOpen: () => void;
  onRemove: () => void;
  onRetry: () => void;
}) {
  const pdf = isPdfFile(item.file);
  const { tone, label } = STATUS_BADGE[item.status];
  return (
    <li
      data-status={item.status}
      className={cx(
        'flex items-start gap-3 rounded-md border bg-surface p-2',
        item.status === 'error' ? 'border-danger/40' : 'border-border',
      )}
    >
      <button
        type="button"
        onClick={onOpen}
        aria-label={pdf ? `${item.file.name} PDF dosyasını aç` : `${item.file.name} görselini aç`}
        className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-subtle text-muted"
      >
        {pdf ? (
          <FileText size={22} aria-hidden="true" />
        ) : url ? (
          <img src={url} alt="" aria-hidden="true" className="h-full w-full object-cover" />
        ) : (
          <span className="shimmer h-full w-full" aria-hidden="true" />
        )}
      </button>

      <div className="min-w-0 flex-1 py-0.5">
        <p className="truncate text-sm font-medium text-text">{item.file.name}</p>
        <p className="tabular mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-muted">
          {formatSize(item.file.size)}
          <Badge tone={tone} spin={item.status === 'uploading'}>
            {label}
          </Badge>
        </p>
        {item.status === 'error' && item.error && (
          <p role="alert" className="mt-1 text-[13px] font-medium text-danger">
            {item.error}
          </p>
        )}
        {item.status === 'error' && (
          <Button
            size="sm"
            onClick={onRetry}
            disabled={busy}
            aria-label={`${item.file.name} için yeniden dene`}
            className="mt-2"
          >
            <RotateCw size={14} aria-hidden="true" />
            Yeniden dene
          </Button>
        )}
      </div>

      {(item.status === 'ready' || item.status === 'error') && (
        <button
          type="button"
          onClick={onRemove}
          disabled={busy}
          aria-label={`${item.file.name} dosyasını kaldır`}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-muted transition-colors hover:bg-subtle hover:text-text disabled:opacity-50"
        >
          <X size={18} aria-hidden="true" />
        </button>
      )}
    </li>
  );
}

export default function UploadPanel({
  homeworkId,
  uploads,
  serverCount = 0,
  mode = 'new',
}: {
  homeworkId: string;
  uploads: Uploads;
  /** Sunucuda bu teslimde zaten bulunan dosya sayısı (30 sınırına katılır). */
  serverCount?: number;
  /** new: ilk teslim ("Gönder"); append: tamamlanmış teslime ekleme ("Dosyaları ekle"). */
  mode?: 'new' | 'append';
}) {
  const st: UploadState = uploads.get(homeworkId);
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const urls = useObjectUrls(st.items);
  const [lightbox, setLightbox] = useState<{
    images: LightboxImage[];
    index: number;
  } | null>(null);

  const total = st.items.length;
  const doneCount = st.items.filter((i) => i.status === 'done').length;
  const errorCount = st.items.filter((i) => i.status === 'error').length;
  const hasPendingWork = st.items.some((i) => i.status === 'ready' || i.status === 'error');
  const showProgress = total > 0 && (st.uploading || doneCount > 0 || errorCount > 0);

  function pick(list: FileList | null) {
    if (!list || list.length === 0) return;
    uploads.addFiles(homeworkId, Array.from(list), serverCount);
  }

  function openItem(item: QueueItem) {
    if (isPdfFile(item.file)) {
      const url = URL.createObjectURL(item.file);
      window.open(url, '_blank', 'noreferrer');
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
      return;
    }
    const images = st.items.filter((i) => !isPdfFile(i.file));
    setLightbox({
      images: images.map((i) => ({
        key: `local:${i.uid}`,
        filename: i.file.name,
        src: urls[i.uid],
      })),
      index: images.findIndex((i) => i.uid === item.uid),
    });
  }

  const submitLabel = st.uploading
    ? mode === 'append'
      ? 'Ekleniyor…'
      : 'Gönderiliyor…'
    : errorCount > 0 && !st.items.some((i) => i.status === 'ready')
      ? 'Hatalıları yeniden gönder'
      : mode === 'append'
        ? 'Dosyaları ekle'
        : 'Gönder';

  return (
    <div>
      {/* Gizli girdiler (erişilebilir adlı): galeri/dosya ve arka kamera */}
      <input
        ref={fileRef}
        type="file"
        multiple
        accept=".jpg,.jpeg,.png,.heic,.heif,.pdf,image/jpeg,image/png,image/heic,application/pdf"
        className="hidden"
        aria-label="Ödev dosyalarını seç"
        onChange={(e) => {
          pick(e.target.files);
          e.target.value = '';
        }}
      />
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        aria-label="Kamerayla fotoğraf çek"
        onChange={(e) => {
          pick(e.target.files);
          e.target.value = '';
        }}
      />

      {total === 0 ? (
        <div className={cx('flex flex-col gap-2', mode === 'new' && 'items-stretch')}>
          <Button
            variant={mode === 'new' ? 'primary' : 'secondary'}
            size="lg"
            onClick={() => cameraRef.current?.click()}
            className={mode === 'new' ? 'min-h-14 w-full' : 'w-full'}
          >
            <Camera size={20} aria-hidden="true" />
            {mode === 'new' ? 'Ödevi fotoğrafla çek' : 'Kamerayla çek'}
          </Button>
          <Button size="lg" onClick={() => fileRef.current?.click()} className="w-full">
            <ImagePlus size={18} aria-hidden="true" />
            {mode === 'new' ? 'Galeriden seç' : 'Dosya ekle'}
          </Button>
          {mode === 'new' && (
            <p className="text-center text-[13px] text-muted">
              JPEG, PNG, HEIC veya PDF · en fazla {MAX_FILES} dosya, her biri 10 MB
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          <ul className="space-y-2">
            {st.items.map((item) => (
              <FileRow
                key={item.uid}
                item={item}
                url={urls[item.uid]}
                busy={st.uploading}
                onOpen={() => openItem(item)}
                onRemove={() => uploads.remove(homeworkId, item.uid)}
                onRetry={() => void uploads.start(homeworkId, item.uid)}
              />
            ))}
          </ul>

          <div className="flex flex-wrap gap-2">
            <Button size="sm" disabled={st.uploading} onClick={() => cameraRef.current?.click()}>
              <Camera size={15} aria-hidden="true" />
              Kamerayla çek
            </Button>
            <Button size="sm" disabled={st.uploading} onClick={() => fileRef.current?.click()}>
              <ImagePlus size={15} aria-hidden="true" />
              {mode === 'new' ? 'Galeriden seç' : 'Dosya ekle'}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={st.uploading}
              onClick={() => uploads.clear(homeworkId)}
            >
              Seçimi temizle
            </Button>
          </div>

          <Field label="Not (isteğe bağlı)" htmlFor={`note-${homeworkId}`}>
            <Textarea
              id={`note-${homeworkId}`}
              value={st.note}
              onChange={(e) => uploads.setNote(homeworkId, e.target.value)}
              rows={2}
              maxLength={1000}
              placeholder="Ödeve ilişkin kısa bir not…"
            />
          </Field>

          {showProgress && (
            <div>
              <p aria-live="polite" className="tabular text-sm text-text">
                {doneCount} / {total} dosya yüklendi
                {errorCount > 0 ? ` · ${errorCount} hata` : ''}
              </p>
              <div
                role="progressbar"
                aria-label="Yükleme ilerlemesi"
                aria-valuemin={0}
                aria-valuemax={total}
                aria-valuenow={doneCount}
                className="mt-1.5 h-2 overflow-hidden rounded-full bg-subtle"
              >
                <div
                  className={cx(
                    'h-full rounded-full transition-all',
                    errorCount > 0 ? 'bg-danger' : 'bg-success',
                  )}
                  style={{ width: `${(doneCount / total) * 100}%` }}
                />
              </div>
            </div>
          )}

          {errorCount > 0 && !st.uploading && (
            <div role="alert">
              <InlineNotice tone="danger">
                {errorCount} dosya yüklenemedi. Her dosyayı ayrı ayrı yeniden deneyebilir ya da
                kaldırabilirsiniz; yüklenenler kaybolmaz.
              </InlineNotice>
            </div>
          )}

          <Button
            variant="primary"
            size="lg"
            className="w-full"
            loading={st.uploading}
            disabled={!hasPendingWork}
            onClick={() => void uploads.start(homeworkId)}
          >
            {submitLabel}
          </Button>
        </div>
      )}

      {st.notice && (
        <div role="alert" className="mt-3">
          <InlineNotice tone="danger">
            <p className="font-medium">{st.notice.message}</p>
            {st.notice.details.length > 0 && (
              <ul className="mt-1 list-disc space-y-0.5 pl-4 text-[13px]">
                {st.notice.details.map((d) => (
                  <li key={d} className="break-all">
                    {d}
                  </li>
                ))}
              </ul>
            )}
          </InlineNotice>
        </div>
      )}

      {lightbox && (
        <ImageLightbox
          images={lightbox.images}
          initialIndex={lightbox.index}
          onClose={() => setLightbox(null)}
        />
      )}
    </div>
  );
}

/**
 * Öğrenci "Ödevlerim" — spec.md §5.3, §6 Öğrenci.
 *
 * Kompozisyon bilinçli olarak "dikey kart listesi + üstte filtre kutusu"ndan
 * uzak:
 * - Durum sekmeleri (Bekleyen / Tamamlanan) → gruplama ve gezinme.
 * - Hafta ve ders, kutu içi dropdown değil; yatay kaydırılabilir çip şeritleri.
 * - Bekleyen her ödev, yükleme alanının karta hâkim olduğu bir "yakalama"
 *   kartıdır; tek tek yatay kaydırılır (snap carousel). Ders/tarih ikincil.
 * - Tamamlananlar, teslim fotoğraflarını öne çıkaran bir ızgarada listelenir.
 *
 * Kırmızı çizgi: ekranda yalnızca ders, öğretmen, hafta, açıklama, son tarih
 * ve teslim durumu vardır — puan/not/değerlendirme süreci asla.
 */

import { useCallback, useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import {
  BookOpen,
  Camera,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleDashed,
  Clock3,
  ImagePlus,
  XCircle,
} from 'lucide-react';
import type { StudentHomework } from '../../types';
import { formatDate } from '../../utils/date';
import { studentApi, openProtectedFile, ApiClientError } from '../../services/api';
import { EmptyState, FormError } from '../../components/admin/ui';
import SubmissionFileGrid from '../../components/SubmissionFileGrid';

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const MAX_FILES = 30;
const ALLOWED_EXT = new Set(['jpg', 'jpeg', 'png', 'heic', 'heif', 'pdf']);

interface PendingState {
  files: File[];
  note: string;
}

/** Kart/rozet durumu — teslim durumundan türetilir. */
type CardStatus = 'submitted' | 'late' | 'overdue' | 'pending';
type Tab = 'pending' | 'done';

function todayIso(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(
    now.getDate(),
  ).padStart(2, '0')}`;
}

function cardStatus(item: StudentHomework): CardStatus {
  const sub = item.submission;
  if (sub) return sub.is_late ? 'late' : 'submitted';
  return item.due_date < todayIso() ? 'overdue' : 'pending';
}

function pickFiles(
  list: FileList | null,
  currentCount: number,
): { files: File[] } | { error: string } {
  if (!list) return { files: [] };
  const incoming = Array.from(list);
  if (currentCount + incoming.length > MAX_FILES) {
    return { error: 'En fazla 30 dosya seçebilirsiniz.' };
  }
  if (incoming.some((f) => f.size > MAX_FILE_SIZE)) {
    return { error: 'Her dosya en fazla 10 MB olabilir.' };
  }
  if (
    incoming.some((f) => !ALLOWED_EXT.has(f.name.toLowerCase().split('.').pop() ?? ''))
  ) {
    return { error: 'Yalnızca JPEG, PNG, HEIC veya PDF dosyası yükleyebilirsiniz.' };
  }
  return { files: incoming };
}

function SubmissionBadge({ status }: { status: CardStatus }) {
  const base = 'inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ';
  if (status === 'submitted') {
    return (
      <span className={base + 'bg-sub-uploaded/10 text-sub-uploaded'}>
        <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
        Yüklendi
      </span>
    );
  }
  if (status === 'late') {
    return (
      <span className={base + 'bg-sub-late/10 text-sub-late'}>
        <Clock3 className="h-3.5 w-3.5" aria-hidden="true" />
        Geç yüklendi
      </span>
    );
  }
  if (status === 'overdue') {
    return (
      <span className={base + 'bg-sub-missing/10 text-sub-missing'}>
        <XCircle className="h-3.5 w-3.5" aria-hidden="true" />
        Yüklenmedi
      </span>
    );
  }
  return (
    <span className={base + 'bg-status-draft/10 text-status-draft'}>
      <CircleDashed className="h-3.5 w-3.5" aria-hidden="true" />
      Yüklenmedi
    </span>
  );
}

/** Ortak yakalama davranışları — pending ve done kartları aynı state'i kullanır. */
interface CaptureHandlers {
  pending: PendingState;
  uploading: boolean;
  uploadError?: string;
  fileInputRef: (el: HTMLInputElement | null) => void;
  cameraInputRef: (el: HTMLInputElement | null) => void;
  onPick: () => void;
  onPickCamera: () => void;
  onFiles: (files: File[]) => void;
  onNote: (note: string) => void;
  onClearFiles: () => void;
  onRemoveFile: (index: number) => void;
  onUpload: () => void;
}

function HiddenFileInputs({ fileInputRef, cameraInputRef, onFiles, currentCount }: {
  fileInputRef: (el: HTMLInputElement | null) => void;
  cameraInputRef: (el: HTMLInputElement | null) => void;
  onFiles: (files: File[]) => void;
  currentCount: number;
}) {
  const [error, setError] = useState<string | null>(null);
  const accept = (list: FileList | null) => {
    const res = pickFiles(list, currentCount);
    if ('error' in res) {
      setError(res.error);
      return;
    }
    setError(null);
    if (res.files.length > 0) onFiles(res.files);
  };
  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept=".jpg,.jpeg,.png,.heic,.heif,.pdf,image/jpeg,image/png,image/heic,application/pdf"
        className="hidden"
        onChange={(e) => {
          accept(e.target.files);
          e.target.value = '';
        }}
        aria-label="Ödev dosyalarını seç"
      />
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          accept(e.target.files);
          e.target.value = '';
        }}
        aria-label="Kamerayla fotoğraf çek"
      />
      {error && <p className="px-1 text-sm font-medium text-sub-missing">{error}</p>}
    </>
  );
}

/** Bekleyen kart: yükleme alanı kartın baskın görsel unsurudur. */
function CaptureZone({ handlers }: { handlers: CaptureHandlers }) {
  const { pending, uploading, uploadError } = handlers;
  const hasSelected = pending.files.length > 0;

  return (
    <div className="relative overflow-hidden rounded-2xl border-2 border-dashed border-accent/35 bg-accent/[0.04]">
      <HiddenFileInputs
        fileInputRef={handlers.fileInputRef}
        cameraInputRef={handlers.cameraInputRef}
        onFiles={handlers.onFiles}
        currentCount={pending.files.length}
      />

      {!hasSelected ? (
        <div className="flex flex-col items-center gap-4 px-6 py-10 text-center">
          <button
            type="button"
            onClick={handlers.onPickCamera}
            className="group flex flex-col items-center gap-4"
          >
            <span className="flex h-20 w-20 items-center justify-center rounded-full bg-accent text-accent-fg shadow-[var(--elevation-2)] transition-transform group-hover:-translate-y-0.5">
              <Camera size={34} aria-hidden="true" />
            </span>
            <span>
              <span className="block text-lg font-semibold text-text">
                Ödevi fotoğrafla çek
              </span>
              <span className="mt-1 block text-sm text-muted">
                Kamera açılır; çek, sonra gönder.
              </span>
            </span>
          </button>
          <button
            type="button"
            onClick={handlers.onPick}
            className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border bg-surface px-4 text-sm font-medium text-text transition-colors hover:border-accent hover:text-accent"
          >
            <ImagePlus size={18} aria-hidden="true" />
            Galeriden seç
          </button>
          <span className="text-xs text-muted">
            JPEG, PNG, HEIC veya PDF · en fazla 30 dosya, her biri 10 MB
          </span>
        </div>
      ) : (
        <div className="p-3">
          <SubmissionFileGrid
            variant="local"
            files={pending.files}
            collapsible
            onRemove={handlers.onRemoveFile}
          />
          <div className="mt-3 flex flex-wrap items-center gap-3 px-1">
            <button
              type="button"
              onClick={handlers.onPickCamera}
              className="text-xs font-medium text-accent hover:underline"
            >
              Kamerayla çek
            </button>
            <button
              type="button"
              onClick={handlers.onPick}
              className="text-xs font-medium text-accent hover:underline"
            >
              Galeriden seç
            </button>
            <button
              type="button"
              onClick={handlers.onClearFiles}
              className="text-xs font-medium text-muted hover:text-text"
            >
              Seçimi temizle
            </button>
          </div>
          <label className="mt-3 block px-1">
            <span className="mb-1 block text-xs font-medium text-muted">
              Not (isteğe bağlı)
            </span>
            <textarea
              value={pending.note}
              onChange={(e) => handlers.onNote(e.target.value)}
              rows={2}
              maxLength={1000}
              placeholder="Ödeve ilişkin kısa bir not…"
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text placeholder:text-muted focus:border-accent"
            />
          </label>
          <button
            type="button"
            onClick={handlers.onUpload}
            disabled={uploading}
            className="mt-3 flex min-h-12 w-full items-center justify-center rounded-xl bg-accent text-sm font-semibold text-accent-fg transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {uploading ? 'Gönderiliyor…' : 'Gönder'}
          </button>
        </div>
      )}

      {uploadError && (
        <p className="px-4 py-2 text-sm font-medium text-sub-missing">{uploadError}</p>
      )}
    </div>
  );
}

function PendingCard({
  item,
  handlers,
  className,
}: {
  item: StudentHomework;
  handlers: CaptureHandlers;
  className: string;
}) {
  const status = cardStatus(item);
  return (
    <article data-status={status} data-slide className={'snap-center ' + className}>
      <div className="flex h-full flex-col overflow-hidden rounded-3xl border border-border bg-surface shadow-[var(--elevation-2)]">
        <div className="flex items-start justify-between gap-2 px-5 pt-4">
          <div className="min-w-0">
            <p className="truncate text-xs font-semibold uppercase tracking-wide text-accent">
              {item.course_name} · {item.teacher_name}
            </p>
            <p className="tabular mt-1 text-xs text-muted">
              Hafta {item.week.week_no} · {item.week.label}
            </p>
          </div>
          <SubmissionBadge status={status} />
        </div>

        <div className="px-4 pt-4">
          <CaptureZone handlers={handlers} />
        </div>

        <div className="px-5 pb-5 pt-3">
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-text">
            {item.description}
          </p>
          <p className="tabular mt-2 text-sm text-muted">
            Son tarih:{' '}
            <span className="font-medium text-text">{formatDate(item.due_date)}</span>
          </p>
        </div>
      </div>
    </article>
  );
}

function DoneCard({
  item,
  handlers,
}: {
  item: StudentHomework;
  handlers: CaptureHandlers;
}) {
  const status = cardStatus(item);
  const [openError, setOpenError] = useState<string | null>(null);
  const hasSelected = handlers.pending.files.length > 0;

  return (
    <article
      data-status={status}
      className="overflow-hidden rounded-2xl border border-border bg-surface elevation-1"
    >
      <div className="flex items-start justify-between gap-2 px-4 pt-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-text">
            {item.course_name} · {item.teacher_name}
          </p>
          <p className="tabular mt-0.5 text-xs text-muted">
            Hafta {item.week.week_no} · {item.week.label}
          </p>
        </div>
        <SubmissionBadge status={status} />
      </div>

      <p className="whitespace-pre-wrap px-4 pt-2 text-sm leading-relaxed text-text">
        {item.description}
      </p>
      <p className="tabular px-4 pt-1 text-xs text-muted">
        Son tarih: {formatDate(item.due_date)}
        {item.submission && <> · Teslim: {formatDate(item.submission.submitted_at.slice(0, 10))}</>}
      </p>

      {item.submission && (
        <div className="px-4 pt-3">
          <SubmissionFileGrid
            variant="server"
            files={item.submission.files}
            collapsible
            onOpenPdf={(key) => {
              setOpenError(null);
              openProtectedFile(key).catch((err) =>
                setOpenError(
                  err instanceof ApiClientError ? err.message : 'Dosya açılırken bir hata oluştu.',
                ),
              );
            }}
          />
        </div>
      )}

      <div className="mt-3 border-t border-border px-4 py-3">
        {/* Ekleme: 30 sınırı sunucudaki dosyalar + yeni seçilenler toplamıdır. */}
        <HiddenFileInputs
          fileInputRef={handlers.fileInputRef}
          cameraInputRef={handlers.cameraInputRef}
          onFiles={handlers.onFiles}
          currentCount={(item.submission?.files.length ?? 0) + handlers.pending.files.length}
        />
        {!hasSelected ? (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handlers.onPickCamera}
              className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl border border-border text-sm font-medium text-text transition-colors hover:border-accent hover:text-accent"
            >
              <Camera size={17} aria-hidden="true" />
              Kamerayla çek
            </button>
            <button
              type="button"
              onClick={handlers.onPick}
              className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl border border-border text-sm font-medium text-text transition-colors hover:border-accent hover:text-accent"
            >
              <ImagePlus size={17} aria-hidden="true" />
              Dosya ekle
            </button>
          </div>
        ) : (
          <div>
            <SubmissionFileGrid
              variant="local"
              files={handlers.pending.files}
              collapsible
              onRemove={handlers.onRemoveFile}
            />
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={handlers.onPickCamera}
                className="text-xs font-medium text-accent hover:underline"
              >
                Kamerayla çek
              </button>
              <button
                type="button"
                onClick={handlers.onPick}
                className="text-xs font-medium text-accent hover:underline"
              >
                Dosya ekle
              </button>
              <button
                type="button"
                onClick={handlers.onClearFiles}
                className="text-xs font-medium text-muted hover:text-text"
              >
                Seçimi temizle
              </button>
            </div>
            <button
              type="button"
              onClick={handlers.onUpload}
              disabled={handlers.uploading}
              className="mt-3 flex min-h-12 w-full items-center justify-center rounded-xl bg-accent text-sm font-semibold text-accent-fg transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {handlers.uploading ? 'Ekleniyor…' : 'Dosyaları ekle'}
            </button>
          </div>
        )}
        {(handlers.uploadError || openError) && (
          <p className="mt-2 text-sm font-medium text-sub-missing">
            {handlers.uploadError || openError}
          </p>
        )}
      </div>
    </article>
  );
}

function PendingSkeleton() {
  return (
    <div className="space-y-4" aria-hidden="true">
      <div className="shimmer h-16 w-1/2 rounded-2xl" />
      <div className="shimmer h-11 w-full rounded-2xl" />
      <div className="shimmer h-96 w-full rounded-3xl" />
    </div>
  );
}

export default function HomeworkListPage() {
  const [items, setItems] = useState<StudentHomework[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('pending');
  const [pending, setPending] = useState<Record<string, PendingState>>({});
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<Record<string, string>>({});
  const [weekFilter, setWeekFilter] = useState('');
  const [courseFilter, setCourseFilter] = useState('');
  const [activeSlide, setActiveSlide] = useState(0);
  const fileInputs = useRef<Record<string, HTMLInputElement | null>>({});
  const cameraInputs = useRef<Record<string, HTMLInputElement | null>>({});
  const railRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await studentApi.homeworks();
      setItems(res.items);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Bir hata oluştu.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Filtre (hafta/ders) veya sekme değişince liste her zaman başa döner:
  // yatay carousel başlangıca sarılır, aktif nokta sıfırlanır.
  useEffect(() => {
    setActiveSlide(0);
    const el = railRef.current;
    if (el) el.scrollLeft = 0;
  }, [weekFilter, courseFilter, tab]);

  const weekOptions = [...new Set((items ?? []).map((i) => i.week.week_no))].sort(
    (a, b) => b - a,
  );
  const courseOptions = [...new Set((items ?? []).map((i) => i.course_name))].sort();
  const baseFiltered = (items ?? []).filter(
    (i) =>
      (!weekFilter || String(i.week.week_no) === weekFilter) &&
      (!courseFilter || i.course_name === courseFilter),
  );
  const pendingItems = baseFiltered.filter((i) => !i.submission);
  const doneItems = baseFiltered.filter((i) => i.submission);

  if (loading) return <div className="customer-face"><PendingSkeleton /></div>;

  function handlersFor(item: StudentHomework): CaptureHandlers {
    return {
      pending: pending[item.id] ?? { files: [], note: '' },
      uploading: uploadingId === item.id,
      uploadError: uploadError[item.id],
      fileInputRef: (el) => {
        fileInputs.current[item.id] = el;
      },
      cameraInputRef: (el) => {
        cameraInputs.current[item.id] = el;
      },
      onPick: () => fileInputs.current[item.id]?.click(),
      onPickCamera: () => cameraInputs.current[item.id]?.click(),
      onFiles: (files) =>
        setPending((prev) => {
          const current = prev[item.id] ?? { files: [], note: '' };
          return { ...prev, [item.id]: { ...current, files: [...current.files, ...files] } };
        }),
      onNote: (note) =>
        setPending((prev) => ({
          ...prev,
          [item.id]: { ...(prev[item.id] ?? { files: [], note: '' }), note },
        })),
      onClearFiles: () =>
        setPending((prev) => ({
          ...prev,
          [item.id]: { files: [], note: prev[item.id]?.note ?? '' },
        })),
      onRemoveFile: (index) =>
        setPending((prev) => {
          const current = prev[item.id] ?? { files: [], note: '' };
          return {
            ...prev,
            [item.id]: { ...current, files: current.files.filter((_, i) => i !== index) },
          };
        }),
      onUpload: async () => {
        const p = pending[item.id];
        if (!p || p.files.length === 0) return;
        setUploadingId(item.id);
        setUploadError((prev) => ({ ...prev, [item.id]: '' }));
        try {
          await studentApi.submit(item.id, p.files, p.note || undefined);
          setPending((prev) => ({ ...prev, [item.id]: { files: [], note: '' } }));
          await load();
          setTab('done');
        } catch (err) {
          setUploadError((prev) => ({
            ...prev,
            [item.id]:
              err instanceof ApiClientError ? err.message : 'Yükleme sırasında bir hata oluştu.',
          }));
        } finally {
          setUploadingId(null);
        }
      },
    };
  }

  const prefersReducedMotion =
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const scrollBehavior: ScrollBehavior = prefersReducedMotion ? 'auto' : 'smooth';

  function goToSlide(index: number) {
    const clamped = Math.max(0, Math.min(index, pendingItems.length - 1));
    setActiveSlide(clamped);
    const el = railRef.current;
    // sr-only ipucu gibi ek çocuklar sırayı kaydırmasın diye kartlar
    // `data-slide` ile seçilir.
    const card = el?.querySelectorAll<HTMLElement>('[data-slide]')[clamped];
    if (card && typeof card.scrollIntoView === 'function') {
      card.scrollIntoView({ behavior: scrollBehavior, inline: 'center', block: 'nearest' });
    }
  }

  function scrollRail(dir: -1 | 1) {
    goToSlide(activeSlide + dir);
  }

  // Klavye: sol/sağ ok kartlar arasında gezinir, Home/End başa/sona gider.
  function onRailKeyDown(e: ReactKeyboardEvent<HTMLDivElement>) {
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      goToSlide(activeSlide + 1);
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      goToSlide(activeSlide - 1);
    } else if (e.key === 'Home') {
      e.preventDefault();
      goToSlide(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      goToSlide(pendingItems.length - 1);
    }
  }

  function onRailScroll() {
    const el = railRef.current;
    if (!el) return;
    const first = el.querySelector<HTMLElement>('[data-slide]');
    const step = first && first.offsetWidth ? first.offsetWidth + 16 : el.clientWidth || 1;
    const idx = Math.min(
      pendingItems.length - 1,
      Math.max(0, Math.round(el.scrollLeft / step)),
    );
    setActiveSlide(idx);
  }

  const hasItems = (items ?? []).length > 0;

  return (
    <div className="space-y-6">
      <header className="brand-hero rounded-3xl border border-border px-5 py-6">
        <h1 className="text-2xl font-semibold tracking-tight text-text">Ödevlerim</h1>
        <p className="mt-1.5 max-w-prose text-sm leading-relaxed text-muted">
          Ödevini fotoğrafla çekebilir ya da dosya seçebilirsin. Son tarihi ve
          teslim durumunu buradan takip et.
        </p>
      </header>

      <FormError message={error} />
      {error && (
        <button
          type="button"
          onClick={load}
          className="rounded-xl border border-border px-4 py-2 text-sm font-medium text-text transition-colors hover:border-accent hover:text-accent"
        >
          Yeniden dene
        </button>
      )}

      {!error && !hasItems && <EmptyState message="Sana verilmiş ödev yok." />}

      {!error && hasItems && (
        <>
          {/* Durum sekmeleri — gruplama ve gezinme */}
          <div
            role="tablist"
            aria-label="Ödev durumu"
            className="flex gap-1 rounded-2xl border border-border bg-surface p-1"
          >
            <button
              role="tab"
              type="button"
              aria-selected={tab === 'pending'}
              onClick={() => setTab('pending')}
              className={
                'flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl text-sm font-medium transition-colors ' +
                (tab === 'pending' ? 'bg-accent text-accent-fg' : 'text-muted hover:text-text')
              }
            >
              Bekleyen
              <span
                className={
                  'tabular rounded-full px-1.5 text-xs ' +
                  (tab === 'pending' ? 'bg-accent-fg/20' : 'bg-bg')
                }
              >
                {pendingItems.length}
              </span>
            </button>
            <button
              role="tab"
              type="button"
              aria-selected={tab === 'done'}
              onClick={() => setTab('done')}
              className={
                'flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl text-sm font-medium transition-colors ' +
                (tab === 'done' ? 'bg-accent text-accent-fg' : 'text-muted hover:text-text')
              }
            >
              Tamamlanan
              <span
                className={
                  'tabular rounded-full px-1.5 text-xs ' +
                  (tab === 'done' ? 'bg-accent-fg/20' : 'bg-bg')
                }
              >
                {doneItems.length}
              </span>
            </button>
          </div>

          {/* Hafta şeridi — kutu içi dropdown değil, yatay çipler */}
          <section>
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
              Hafta
            </h2>
            <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
              {[{ value: '', label: 'Tümü' }, ...weekOptions.map((w) => ({ value: String(w), label: `Hafta ${w}` }))].map(
                (opt) => (
                  <button
                    key={opt.value || 'all'}
                    type="button"
                    aria-pressed={weekFilter === opt.value}
                    onClick={() => setWeekFilter(opt.value)}
                    className={
                      'shrink-0 rounded-full border px-4 py-2 text-sm font-medium transition-colors ' +
                      (weekFilter === opt.value
                        ? 'border-accent bg-accent text-accent-fg'
                        : 'border-border bg-surface text-text hover:border-accent hover:text-accent')
                    }
                  >
                    {opt.label}
                  </button>
                ),
              )}
            </div>
          </section>

          {/* Ders şeridi */}
          {courseOptions.length > 1 && (
            <section>
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
                Ders
              </h2>
              <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
                {[{ value: '', label: 'Tümü' }, ...courseOptions.map((c) => ({ value: c, label: c }))].map(
                  (opt) => (
                    <button
                      key={opt.value || 'all'}
                      type="button"
                      aria-pressed={courseFilter === opt.value}
                      onClick={() => setCourseFilter(opt.value)}
                      className={
                        'shrink-0 rounded-full border px-4 py-2 text-sm font-medium transition-colors ' +
                        (courseFilter === opt.value
                          ? 'border-accent bg-accent text-accent-fg'
                          : 'border-border bg-surface text-text hover:border-accent hover:text-accent')
                      }
                    >
                      {opt.label}
                    </button>
                  ),
                )}
              </div>
            </section>
          )}

          {baseFiltered.length === 0 ? (
            <EmptyState message="Bu filtrelerle ödev bulunamadı." />
          ) : tab === 'pending' ? (
            pendingItems.length === 0 ? (
              <div className="rounded-3xl border border-dashed border-border bg-surface/60 py-14 text-center">
                <span className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-sub-uploaded/10 text-sub-uploaded">
                  <CheckCircle2 size={26} aria-hidden="true" />
                </span>
                <p className="text-sm font-medium text-text">Bekleyen ödev yok</p>
                <p className="mt-1 text-sm text-muted">
                  Bu listedeki her şeyi tamamladın.
                </p>
              </div>
            ) : (
              <div className="relative">
                <div
                  ref={railRef}
                  data-testid="pending-rail"
                  role="group"
                  aria-roledescription="karusel"
                  aria-label="Bekleyen ödevler"
                  tabIndex={0}
                  onKeyDown={onRailKeyDown}
                  onScroll={onRailScroll}
                  className="-mx-4 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-1 outline-offset-[-2px] [scrollbar-width:none] lg:mx-0 lg:grid lg:grid-cols-2 lg:overflow-visible lg:px-0 lg:pb-0 xl:grid-cols-3"
                >
                  <p className="sr-only">
                    Kartlar arasında sol ve sağ ok tuşlarıyla gezinin.
                  </p>
                  {pendingItems.map((item) => (
                    <PendingCard
                      key={item.id}
                      item={item}
                      handlers={handlersFor(item)}
                      className="w-[86%] shrink-0 first:ml-0 sm:w-[400px] lg:w-auto lg:shrink"
                    />
                  ))}
                </div>
                {pendingItems.length > 1 && (
                  // Yalnızca mobil/dar ekran: carousel kontrolü. Nokta sayısı
                  // ödev sayısıyla büyümez; "N / M" sayacı + ince çubuk kullanılır.
                  <div className="mt-4 lg:hidden">
                    <div className="flex items-center justify-center gap-4">
                      <button
                        type="button"
                        onClick={() => scrollRail(-1)}
                        disabled={activeSlide === 0}
                        aria-label="Önceki ödev"
                        className="flex h-11 w-11 items-center justify-center rounded-full border border-border bg-surface text-text transition-colors hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        <ChevronLeft size={20} aria-hidden="true" />
                      </button>
                      <span
                        aria-live="polite"
                        aria-atomic="true"
                        className="tabular min-w-[3.5rem] text-center text-sm font-medium text-muted"
                      >
                        {activeSlide + 1} / {pendingItems.length}
                      </span>
                      <button
                        type="button"
                        onClick={() => scrollRail(1)}
                        disabled={activeSlide === pendingItems.length - 1}
                        aria-label="Sonraki ödev"
                        className="flex h-11 w-11 items-center justify-center rounded-full border border-border bg-surface text-text transition-colors hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        <ChevronRight size={20} aria-hidden="true" />
                      </button>
                    </div>
                    <div
                      className="mx-auto mt-2 h-1 w-40 overflow-hidden rounded-full bg-border"
                      aria-hidden="true"
                    >
                      <div
                        className="h-full rounded-full bg-accent transition-all"
                        style={{
                          width: `${((activeSlide + 1) / pendingItems.length) * 100}%`,
                        }}
                      />
                    </div>
                  </div>
                )}
              </div>
            )
          ) : doneItems.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-border bg-surface/60 py-14 text-center">
              <span className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-accent/10 text-accent">
                <BookOpen size={26} aria-hidden="true" />
              </span>
              <p className="text-sm font-medium text-text">Henüz teslim yok</p>
              <p className="mt-1 text-sm text-muted">
                Bir ödev yüklediğinde burada görünecek.
              </p>
            </div>
          ) : (
            <div className="grid items-start gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {doneItems.map((item) => (
                <DoneCard key={item.id} item={item} handlers={handlersFor(item)} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

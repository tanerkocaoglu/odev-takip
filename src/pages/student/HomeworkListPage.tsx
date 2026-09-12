/**
 * Öğrenci "Ödevlerim" — spec.md §5.3, §6 Öğrenci.
 * `comfortable` yoğunluk (mobil öncelikli). Ekranda yalnızca ders, öğretmen,
 * hafta, açıklama, son tarih ve teslim durumu vardır — puan/not/rapor asla
 * gösterilmez. Yükleme: jpg/jpeg/png/heic/pdf, dosya başına 10 MB, teslim
 * başına 30 dosya; son tarih geçtikten sonra da yüklenebilir (geç rozeti).
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { BookOpen, Camera, CheckCircle2, Clock3, UploadCloud, XCircle } from 'lucide-react';
import type { StudentHomework } from '../../types';
import { studentApi, openProtectedFile, ApiClientError } from '../../services/api';
import { LoadingState, EmptyState, FormError, PageTitle, FilterSelect } from '../../components/admin/ui';
import SubmissionFileGrid from '../../components/SubmissionFileGrid';

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const MAX_FILES = 30;
const ALLOWED_EXT = new Set(['jpg', 'jpeg', 'png', 'heic', 'heif', 'pdf']);

interface PendingState {
  files: File[];
  note: string;
}

function fmtDate(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}.${m}.${y}`;
}

/**
 * Kart/rozet durumu — teslim durumundan türetilir. Öğrenci yalnızca kendi
 * teslim durumunu görür (puan/not/değerlendirme süreci asla).
 */
type CardStatus = 'submitted' | 'late' | 'overdue' | 'pending';

/** Sol kenar şeridi renkleri — mevcut teslim/nötr token'ları, yeni renk yok. */
const CARD_STRIPES: Record<CardStatus, string> = {
  submitted: 'border-l-sub-uploaded',
  late: 'border-l-sub-late',
  overdue: 'border-l-sub-late',
  pending: 'border-l-status-draft',
};

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

function SubmissionBadge({ status }: { status: CardStatus }) {
  const base = 'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ';
  if (status === 'submitted') {
    return (
      <span className={base + 'bg-sub-uploaded/10 text-sub-uploaded'}>
        <CheckCircle2 className="h-3.5 w-3.5" />
        Yüklendi
      </span>
    );
  }
  if (status === 'late') {
    return (
      <span className={base + 'bg-sub-late/10 text-sub-late'}>
        <Clock3 className="h-3.5 w-3.5" />
        Geç yüklendi
      </span>
    );
  }
  const overdue = status === 'overdue';
  return (
    <span
      className={
        base +
        (overdue ? 'bg-sub-late/10 text-sub-late' : 'bg-status-draft/10 text-status-draft')
      }
    >
      <XCircle className="h-3.5 w-3.5" />
      Yüklenmedi
    </span>
  );
}

export default function HomeworkListPage() {
  const [items, setItems] = useState<StudentHomework[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<Record<string, PendingState>>({});
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<Record<string, string>>({});
  const [weekFilter, setWeekFilter] = useState('');
  const [courseFilter, setCourseFilter] = useState('');
  const fileInputs = useRef<Record<string, HTMLInputElement | null>>({});
  const cameraInputs = useRef<Record<string, HTMLInputElement | null>>({});

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

  if (loading) return <LoadingState />;

  // Filtre seçenekleri mevcut ödevlerden türetilir (client-side; backend ucu yok).
  // Hafta: en yakın (büyük) haftadan geriye doğru sıralanır.
  const weekOptions = [...new Set((items ?? []).map((i) => i.week.week_no))].sort(
    (a, b) => b - a,
  );
  const courseOptions = [...new Set((items ?? []).map((i) => i.course_name))].sort();
  const filtered = (items ?? []).filter(
    (i) =>
      (!weekFilter || String(i.week.week_no) === weekFilter) &&
      (!courseFilter || i.course_name === courseFilter),
  );

  return (
    <div className="space-y-6">
      <PageTitle icon={BookOpen}>Ödevlerim</PageTitle>

      <FormError message={error} />
      {error && (
        <button
          type="button"
          onClick={load}
          className="rounded-md border border-border px-3 py-1.5 text-sm font-medium text-text hover:bg-bg"
        >
          Yeniden dene
        </button>
      )}

      {!error && items && items.length === 0 && (
        <EmptyState message="Sana verilmiş ödev yok." />
      )}

      {!error && items && items.length > 0 && (
        <div className="space-y-6">
          <div className="flex flex-wrap gap-3">
            <FilterSelect label="Hafta" value={weekFilter} onChange={setWeekFilter}>
              <option value="">Tümü</option>
              {weekOptions.map((w) => (
                <option key={w} value={String(w)}>
                  Hafta {w}
                </option>
              ))}
            </FilterSelect>
            <FilterSelect label="Ders" value={courseFilter} onChange={setCourseFilter}>
              <option value="">Tümü</option>
              {courseOptions.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </FilterSelect>
          </div>

          {filtered.length === 0 && (
            <EmptyState message="Bu filtrelerle ödev bulunamadı." />
          )}

          {filtered.map((item) => (
            <HomeworkCard
              key={item.id}
              item={item}
              pending={pending[item.id] ?? { files: [], note: '' }}
              uploading={uploadingId === item.id}
              uploadError={uploadError[item.id]}
              fileInputRef={(el) => {
                fileInputs.current[item.id] = el;
              }}
              cameraInputRef={(el) => {
                cameraInputs.current[item.id] = el;
              }}
              onPick={() => fileInputs.current[item.id]?.click()}
              onPickCamera={() => cameraInputs.current[item.id]?.click()}
              onFiles={(files) =>
                setPending((prev) => {
                  const current = prev[item.id] ?? { files: [], note: '' };
                  return { ...prev, [item.id]: { ...current, files: [...current.files, ...files] } };
                })
              }
              onNote={(note) =>
                setPending((prev) => ({ ...prev, [item.id]: { ...(prev[item.id] ?? { files: [], note: '' }), note } }))
              }
              onClearFiles={() =>
                setPending((prev) => ({ ...prev, [item.id]: { files: [], note: prev[item.id]?.note ?? '' } }))
              }
              onRemoveFile={(index) =>
                setPending((prev) => {
                  const current = prev[item.id] ?? { files: [], note: '' };
                  return {
                    ...prev,
                    [item.id]: { ...current, files: current.files.filter((_, i) => i !== index) },
                  };
                })
              }
              onUpload={async () => {
                const p = pending[item.id];
                if (!p || p.files.length === 0) return;
                setUploadingId(item.id);
                setUploadError((prev) => ({ ...prev, [item.id]: '' }));
                try {
                  await studentApi.submit(item.id, p.files, p.note || undefined);
                  setPending((prev) => ({ ...prev, [item.id]: { files: [], note: '' } }));
                  await load();
                } catch (err) {
                  setUploadError((prev) => ({
                    ...prev,
                    [item.id]: err instanceof ApiClientError ? err.message : 'Yükleme sırasında bir hata oluştu.',
                  }));
                } finally {
                  setUploadingId(null);
                }
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function HomeworkCard({
  item,
  pending,
  uploading,
  uploadError,
  fileInputRef,
  cameraInputRef,
  onPick,
  onPickCamera,
  onFiles,
  onNote,
  onClearFiles,
  onRemoveFile,
  onUpload,
}: {
  item: StudentHomework;
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
}) {
  const [pickError, setPickError] = useState<string | null>(null);
  const [openError, setOpenError] = useState<string | null>(null);

  const selectFiles = (list: FileList | null) => {
    if (!list) return;
    const incoming = Array.from(list);
    // Eklenenler mevcut seçimle toplanır (aynı 30'luk üst sınır geçerli).
    if (pending.files.length + incoming.length > MAX_FILES) {
      setPickError('En fazla 30 dosya seçebilirsiniz.');
      return;
    }
    if (incoming.some((f) => f.size > MAX_FILE_SIZE)) {
      setPickError('Her dosya en fazla 10 MB olabilir.');
      return;
    }
    if (
      incoming.some(
        (f) => !ALLOWED_EXT.has(f.name.toLowerCase().split('.').pop() ?? ''),
      )
    ) {
      setPickError('Yalnızca JPEG, PNG, HEIC veya PDF dosyası yükleyebilirsiniz.');
      return;
    }
    setPickError(null);
    onFiles(incoming);
  };

  const hasSelected = pending.files.length > 0;
  const status = cardStatus(item);

  return (
    <div
      data-status={status}
      className={
        'elevation-1 rounded-md border border-border border-l-4 bg-surface p-5 ' +
        CARD_STRIPES[status]
      }
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-base font-medium text-text">
            <BookOpen size={16} aria-hidden="true" className="shrink-0 text-muted" />
            <span className="truncate">
              {item.course_name} · {item.teacher_name}
            </span>
          </p>
          <p className="tabular mt-0.5 text-xs text-muted">
            Hafta {item.week.week_no} · {item.week.label}
          </p>
        </div>
        <SubmissionBadge status={status} />
      </div>

      <p className="mt-3 whitespace-pre-wrap text-sm text-text">{item.description}</p>
      <p className="tabular mt-2 text-sm text-muted">
        Son tarih: <span className="font-medium text-text">{fmtDate(item.due_date)}</span>
      </p>

      {/* Teslim edildiyse: dosyalar + tarih */}
      {item.submission && (
        <div className="mt-4 space-y-2">
          <p className="tabular text-xs text-muted">
            Teslim: {fmtDate(item.submission.submitted_at.slice(0, 10))}
          </p>
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
          {openError && (
            <p className="text-sm font-medium text-att-absent">{openError}</p>
          )}
        </div>
      )}

      {/* Yükleme alanı — her zaman yeniden/güncelleme imkânı */}
      <div className="card-interactive mt-4 rounded-md border border-dashed border-border p-4">
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".jpg,.jpeg,.png,.heic,.heif,.pdf,image/jpeg,image/png,image/heic,application/pdf"
          className="hidden"
          onChange={(e) => {
            selectFiles(e.target.files);
            e.target.value = '';
          }}
          aria-label="Ödev dosyalarını seç"
        />
        {/* Arka kamera girişi; masaüstünde capture etkisizdir, normal seçici açılır. */}
        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => {
            selectFiles(e.target.files);
            e.target.value = '';
          }}
          aria-label="Kamerayla fotoğraf çek"
        />

        {!hasSelected ? (
          <div className="flex min-h-11 w-full flex-col items-center justify-center gap-3 text-sm text-muted">
            <div className="flex flex-col items-center gap-2 sm:flex-row sm:gap-4">
              <button
                type="button"
                onClick={onPick}
                className="flex min-h-11 items-center gap-2 rounded-md border border-border px-4 py-2 font-medium text-accent transition-colors hover:border-accent hover:text-text"
              >
                <UploadCloud className="h-5 w-5" aria-hidden="true" />
                <span>Dosya seç</span>
              </button>
              <button
                type="button"
                onClick={onPickCamera}
                className="flex min-h-11 items-center gap-2 rounded-md border border-border px-4 py-2 font-medium text-accent transition-colors hover:border-accent hover:text-text"
              >
                <Camera className="h-5 w-5" aria-hidden="true" />
                <span>Kamerayla çek</span>
              </button>
            </div>
            <span className="text-xs">JPEG, PNG, HEIC veya PDF · en fazla 30 dosya, her biri 10 MB</span>
          </div>
        ) : (
          <div>
            <SubmissionFileGrid
              variant="local"
              files={pending.files}
              collapsible
              onRemove={onRemoveFile}
            />
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={onPick}
                className="text-xs font-medium text-accent hover:underline"
              >
                Dosya seç
              </button>
              <button
                type="button"
                onClick={onPickCamera}
                className="text-xs font-medium text-accent hover:underline"
              >
                Kamerayla çek
              </button>
              <button
                type="button"
                onClick={onClearFiles}
                className="text-xs font-medium text-muted hover:text-text"
              >
                Seçimi temizle
              </button>
            </div>
          </div>
        )}

        {pickError && <p className="mt-2 text-sm font-medium text-att-absent">{pickError}</p>}

        <label className="mt-3 block">
          <span className="mb-1 block text-xs font-medium text-muted">Not (isteğe bağlı)</span>
          <textarea
            value={pending.note}
            onChange={(e) => onNote(e.target.value)}
            rows={2}
            maxLength={1000}
            placeholder="Ödeve ilişkin kısa bir not…"
            className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text placeholder:text-muted focus:border-accent"
          />
        </label>

        <div className="mt-3 flex items-center gap-3">
          <button
            type="button"
            onClick={onUpload}
            disabled={!hasSelected || uploading}
            className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-fg transition-colors hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {uploading ? 'Yükleniyor…' : 'Gönder'}
          </button>
          {uploadError && <p className="text-sm font-medium text-att-absent">{uploadError}</p>}
        </div>
      </div>
    </div>
  );
}

/**
 * Öğrenci "Ödevlerim" — spec.md §5.3, §6 Öğrenci.
 * `comfortable` yoğunluk (mobil öncelikli). Ekranda yalnızca ders, öğretmen,
 * hafta, açıklama, son tarih ve teslim durumu vardır — puan/not/rapor asla
 * gösterilmez. Yükleme: jpg/jpeg/png/heic/pdf, dosya başına 10 MB, teslim
 * başına 10 dosya; son tarih geçtikten sonra da yüklenebilir (geç rozeti).
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { CheckCircle2, Clock3, FileText, UploadCloud, XCircle } from 'lucide-react';
import type { StudentHomework } from '../../types';
import { studentApi, openProtectedFile, ApiClientError } from '../../services/api';
import { LoadingState, EmptyState, FormError } from '../../components/admin/ui';

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const MAX_FILES = 10;
const ALLOWED_EXT = new Set(['jpg', 'jpeg', 'png', 'heic', 'heif', 'pdf']);

interface PendingState {
  files: File[];
  note: string;
}

function fmtDate(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}.${m}.${y}`;
}

function fmtBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function SubmissionBadge({ item }: { item: StudentHomework }) {
  const sub = item.submission;
  if (sub) {
    return (
      <span
        className={
          'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ' +
          (sub.is_late ? 'bg-amber/10 text-sub-late' : 'bg-green/10 text-sub-uploaded')
        }
      >
        {sub.is_late ? <Clock3 className="h-3.5 w-3.5" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
        {sub.is_late ? 'Geç yüklendi' : 'Yüklendi'}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-red/10 px-2 py-0.5 text-xs font-medium text-sub-missing">
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
  const fileInputs = useRef<Record<string, HTMLInputElement | null>>({});

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

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-text">Ödevlerim</h1>

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
          {items.map((item) => (
            <HomeworkCard
              key={item.id}
              item={item}
              pending={pending[item.id] ?? { files: [], note: '' }}
              uploading={uploadingId === item.id}
              uploadError={uploadError[item.id]}
              fileInputRef={(el) => {
                fileInputs.current[item.id] = el;
              }}
              onPick={() => fileInputs.current[item.id]?.click()}
              onFiles={(files) =>
                setPending((prev) => ({ ...prev, [item.id]: { ...(prev[item.id] ?? { files: [], note: '' }), files } }))
              }
              onNote={(note) =>
                setPending((prev) => ({ ...prev, [item.id]: { ...(prev[item.id] ?? { files: [], note: '' }), note } }))
              }
              onClearFiles={() =>
                setPending((prev) => ({ ...prev, [item.id]: { files: [], note: prev[item.id]?.note ?? '' } }))
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
  onPick,
  onFiles,
  onNote,
  onClearFiles,
  onUpload,
}: {
  item: StudentHomework;
  pending: PendingState;
  uploading: boolean;
  uploadError?: string;
  fileInputRef: (el: HTMLInputElement | null) => void;
  onPick: () => void;
  onFiles: (files: File[]) => void;
  onNote: (note: string) => void;
  onClearFiles: () => void;
  onUpload: () => void;
}) {
  const [pickError, setPickError] = useState<string | null>(null);
  const [openError, setOpenError] = useState<string | null>(null);

  const selectFiles = (list: FileList | null) => {
    if (!list) return;
    const incoming = Array.from(list);
    if (incoming.length > MAX_FILES) {
      setPickError('En fazla 10 dosya seçebilirsiniz.');
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

  return (
    <div className="rounded-md border border-border bg-surface p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-base font-medium text-text">
            {item.course_name} · {item.teacher_name}
          </p>
          <p className="tabular mt-0.5 text-xs text-muted">
            Hafta {item.week.week_no} · {item.week.label}
          </p>
        </div>
        <SubmissionBadge item={item} />
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
          <ul className="space-y-1">
            {item.submission.files.map((f) => (
              <li key={f.key}>
                <button
                  type="button"
                  onClick={() => {
                    setOpenError(null);
                    openProtectedFile(f.key).catch((err) =>
                      setOpenError(
                        err instanceof ApiClientError
                          ? err.message
                          : 'Dosya açılırken bir hata oluştu.',
                      ),
                    );
                  }}
                  className="inline-flex items-center gap-1.5 text-sm text-accent hover:underline"
                >
                  <FileText className="h-4 w-4 shrink-0" />
                  <span className="truncate">{f.filename}</span>
                  <span className="tabular text-xs text-muted">({fmtBytes(f.size)})</span>
                </button>
              </li>
            ))}
          </ul>
          {openError && (
            <p className="text-sm font-medium text-att-absent">{openError}</p>
          )}
        </div>
      )}

      {/* Yükleme alanı — her zaman yeniden/güncelleme imkânı */}
      <div className="mt-4 rounded-md border border-dashed border-border p-4">
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

        {!hasSelected ? (
          <button
            type="button"
            onClick={onPick}
            className="flex min-h-11 w-full flex-col items-center justify-center gap-1 text-sm text-muted transition-colors hover:text-text"
          >
            <UploadCloud className="h-5 w-5" />
            <span className="font-medium text-accent">Dosya seç</span>
            <span className="text-xs">JPEG, PNG, HEIC veya PDF · en fazla 10 dosya, her biri 10 MB</span>
          </button>
        ) : (
          <div>
            <ul className="space-y-1">
              {pending.files.map((f, i) => (
                <li key={`${f.name}-${i}`} className="flex items-center justify-between gap-2 text-sm">
                  <span className="flex min-w-0 items-center gap-1.5">
                    <FileText className="h-4 w-4 shrink-0 text-muted" />
                    <span className="truncate">{f.name}</span>
                  </span>
                  <span className="tabular shrink-0 text-xs text-muted">{fmtBytes(f.size)}</span>
                </li>
              ))}
            </ul>
            <button
              type="button"
              onClick={onClearFiles}
              className="mt-2 text-xs font-medium text-muted hover:text-text"
            >
              Seçimi temizle
            </button>
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

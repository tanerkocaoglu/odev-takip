/**
 * Ödev yükleme kuyruğu — ödev başına dosya listesi, dosya başına durum ve
 * SIRALI yükleme.
 *
 * Her dosya kendi isteğiyle (`studentApi.submit(id, [dosya], not)`) gider; sunucu
 * teslimi ilk dosyada oluşturur, sonrakileri ekler (append, toplam 30 sınırı sunucuda
 * da doğrulanır). Böylece bir dosyanın hatası (ör. HEIC dönüştürülemedi) diğerlerini
 * bozmaz ve yalnızca o dosya yeniden denenir. Not her isteğe eklenir (aynı değer).
 * Bütün dosyalar yüklendiğinde `onFinished(id)` çağrılır (liste yenilenir).
 */

import { useCallback, useRef, useState } from 'react';
import { studentApi, ApiClientError } from '../../services/api';
import { validatePick, type PickNotice } from './uploadRules';

export type QueueStatus = 'ready' | 'uploading' | 'done' | 'error';

export interface QueueItem {
  uid: number;
  file: File;
  status: QueueStatus;
  error?: string;
}

export interface UploadState {
  items: QueueItem[];
  note: string;
  notice: PickNotice | null;
  uploading: boolean;
}

const EMPTY: UploadState = {
  items: [],
  note: '',
  notice: null,
  uploading: false,
};

let nextUid = 1;

export function useHomeworkUploads(onFinished: (homeworkId: string) => Promise<void> | void) {
  // `ref` tek doğru kaynaktır (async döngü güncel durumu eşzamanlı okur); `state` yalnızca
  // yeniden çizim içindir. Her değişiklik ikisine birlikte yazılır.
  const [state, setState] = useState<Record<string, UploadState>>({});
  const ref = useRef<Record<string, UploadState>>({});

  const patch = useCallback((id: string, fn: (s: UploadState) => UploadState) => {
    const next = { ...ref.current, [id]: fn(ref.current[id] ?? EMPTY) };
    ref.current = next;
    setState(next);
  }, []);

  const get = useCallback((id: string): UploadState => state[id] ?? EMPTY, [state]);

  const addFiles = useCallback(
    (id: string, files: File[], serverCount: number) => {
      const current = ref.current[id] ?? EMPTY;
      const res = validatePick(files, serverCount + current.items.length);
      patch(id, (s) => ({
        ...s,
        notice: res.notice,
        items: [
          ...s.items,
          ...res.accepted.map((file) => ({
            uid: nextUid++,
            file,
            status: 'ready' as const,
          })),
        ],
      }));
    },
    [patch],
  );

  const remove = useCallback(
    (id: string, uid: number) =>
      patch(id, (s) => ({
        ...s,
        notice: null,
        items: s.items.filter((i) => i.uid !== uid),
      })),
    [patch],
  );

  const clear = useCallback(
    (id: string) => patch(id, (s) => ({ ...s, notice: null, items: [] })),
    [patch],
  );

  const setNote = useCallback(
    (id: string, note: string) => patch(id, (s) => ({ ...s, note })),
    [patch],
  );

  const setItem = useCallback(
    (id: string, uid: number, change: Partial<QueueItem>) =>
      patch(id, (s) => ({
        ...s,
        items: s.items.map((i) => (i.uid === uid ? { ...i, ...change } : i)),
      })),
    [patch],
  );

  /** `only` verilirse yalnızca o dosya; yoksa hazır + hatalı tüm dosyalar (sırayla). */
  const start = useCallback(
    async (id: string, only?: number) => {
      const s0 = ref.current[id] ?? EMPTY;
      if (s0.uploading) return;
      const targets = s0.items.filter((i) =>
        only !== undefined ? i.uid === only : i.status === 'ready' || i.status === 'error',
      );
      if (targets.length === 0) return;

      patch(id, (s) => ({ ...s, uploading: true, notice: null }));
      for (const target of targets) {
        setItem(id, target.uid, { status: 'uploading', error: undefined });
        try {
          const note = (ref.current[id]?.note ?? '').trim();
          await studentApi.submit(id, [target.file], note || undefined);
          setItem(id, target.uid, { status: 'done' });
        } catch (err) {
          setItem(id, target.uid, {
            status: 'error',
            error:
              err instanceof ApiClientError
                ? err.message
                : 'Yükleme sırasında bir hata oluştu. Bağlantınızı kontrol edip yeniden deneyin.',
          });
        }
      }
      patch(id, (s) => ({ ...s, uploading: false }));

      const after = ref.current[id] ?? EMPTY;
      if (after.items.length > 0 && after.items.every((i) => i.status === 'done')) {
        patch(id, () => EMPTY);
        await onFinished(id);
      }
    },
    [patch, setItem, onFinished],
  );

  return { get, addFiles, remove, clear, setNote, start };
}

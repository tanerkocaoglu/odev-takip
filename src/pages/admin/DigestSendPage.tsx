/**
 * Admin — Haftalık gönderim (spec.md §5.4).
 * `pending` (eksikli, uyarılı) + `ready` (aktif) + `sent` satırları listelenir;
 * sınıf filtresiyle çalışır. "Gönder" → **popup engelleme deseni**:
 * tıklama anında senkron boş sekme açılır, send yanıtı gelince sekmenin
 * `location.href`'ine wa.me linki atanır; hata gelirse sekme kapatılır.
 * Sekme engellenmişse wa.me linki kopyalanabilir buton olarak sunulur.
 */

import { useCallback, useEffect, useState } from 'react';
import type { AdminDigestItem, DigestSnapshot, ClassItem } from '../../types';
import { adminApi, ApiClientError } from '../../services/api';
import ReportSnapshot from '../../components/ReportSnapshot';
import { EmptyState, FormError, LoadingState } from '../../components/admin/ui';

const STATUS_LABELS: Record<string, string> = {
  pending: 'Eksikli',
  ready: 'Hazır',
  sent: 'Gönderildi',
};

export default function DigestSendPage() {
  const [items, setItems] = useState<AdminDigestItem[] | null>(null);
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [classId, setClassId] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [sendingId, setSendingId] = useState<string | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const [sendOk, setSendOk] = useState<string | null>(null);
  const [copyLink, setCopyLink] = useState<string | null>(null);

  const [previewId, setPreviewId] = useState<string | null>(null);
  const [preview, setPreview] = useState<DigestSnapshot | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await adminApi.digests.list({ class_id: classId || undefined });
      setItems(res.items);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Bir hata oluştu.');
    } finally {
      setLoading(false);
    }
  }, [classId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    adminApi.academicYears
      .list()
      .then((res) => {
        const active = res.items.find((y) => y.is_active === 1);
        if (!active) return null;
        return adminApi.classes.list({ academicYearId: active.id });
      })
      .then((res) => {
        if (res) setClasses(res.items);
      })
      .catch(() => {
        // Filtre listesi yüklenemezse sayfa filtresiz çalışır.
      });
  }, []);

  async function openPreview(item: AdminDigestItem) {
    if (previewId === item.id) {
      setPreviewId(null);
      setPreview(null);
      return;
    }
    setPreviewId(item.id);
    setPreview(null);
    try {
      const res = await adminApi.digests.preview(item.id);
      setPreview(res.preview);
    } catch (err) {
      setSendError(err instanceof ApiClientError ? err.message : 'Önizleme yüklenemedi.');
      setPreviewId(null);
    }
  }

  /**
   * "Gönder ve sonraki" — popup engelleme deseni (spec §5.4):
   * 1) Tıklama anında senkron boş sekme aç (kullanıcı jesti içinde).
   * 2) Send yanıtı gelince sekmeye wa.me linkini ata.
   * 3) Hata gelirse sekmeyi kapat, mesajı göster.
   * 4) Sekme engellendiyse linki kopyalanabilir buton olarak sun.
   */
  async function handleSend(item: AdminDigestItem) {
    const win = window.open('', '_blank');
    setSendingId(item.id);
    setSendError(null);
    setSendOk(null);
    setCopyLink(null);
    try {
      const res = await adminApi.digests.send(item.id);
      if (win) {
        win.location.href = res.wa_me_url;
      } else {
        setCopyLink(res.wa_me_url);
      }
      setSendOk(`${item.student_name} için rapor gönderildi.`);
      await load();
    } catch (err) {
      if (win) win.close();
      setSendError(err instanceof ApiClientError ? err.message : 'Rapor gönderilemedi.');
    } finally {
      setSendingId(null);
    }
  }

  async function handleRevoke(item: AdminDigestItem) {
    if (!window.confirm(`${item.student_name} için gönderimi iptal et?`)) return;
    setSendError(null);
    try {
      await adminApi.digests.revoke(item.id);
      await load();
    } catch (err) {
      setSendError(err instanceof ApiClientError ? err.message : 'İptal edilemedi.');
    }
  }

  async function copyLinkToClipboard(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setSendOk('Link kopyalandı.');
    } catch {
      setSendOk(`Link: ${url}`);
    }
  }

  const badge = (status: string, isRevoked: boolean) => {
    const styles: Record<string, string> = {
      pending: 'bg-att-late/10 text-att-late',
      ready: 'bg-status-completed/10 text-status-completed',
      sent: isRevoked
        ? 'bg-status-draft/10 text-status-draft'
        : 'bg-status-sent/10 text-status-sent',
    };
    return (
      <span
        className={
          'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ' +
          (styles[status] ?? 'bg-status-draft/10 text-status-draft')
        }
      >
        {isRevoked ? 'İptal edildi' : STATUS_LABELS[status]}
      </span>
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-text">Haftalık gönderim</h1>
          <p className="text-sm text-muted">
            Hazır raporlar gönderilebilir; eksikli raporlar yalnızca eksik dersleri içerir.
          </p>
        </div>
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-muted">Sınıf</span>
          <select
            value={classId}
            onChange={(e) => setClassId(e.target.value)}
            className="h-9 rounded-md border border-border bg-surface px-3 text-sm text-text focus:border-accent"
          >
            <option value="">Tümü</option>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <FormError message={error} />
      <FormError message={sendError} />
      {sendOk && <p className="text-sm font-medium text-status-sent">{sendOk}</p>}

      {copyLink && (
        <div className="rounded-md border border-border bg-surface p-4 text-sm">
          <p className="text-muted">
            Tarayıcı açılır pencereyi engelledi. WhatsApp bağlantısını kopyalayıp elle
            açabilirsiniz:
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <code className="break-all rounded bg-bg px-2 py-1 text-xs text-text">
              {copyLink}
            </code>
            <button
              type="button"
              onClick={() => void copyLinkToClipboard(copyLink)}
              className="rounded-md border border-border px-3 py-1.5 text-sm font-medium text-text hover:bg-bg"
            >
              Kopyala
            </button>
          </div>
        </div>
      )}

      {preview && previewId && (
        <div className="rounded-md border border-border bg-surface p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-base font-semibold text-text">Önizleme</h2>
            <button
              type="button"
              onClick={() => {
                setPreviewId(null);
                setPreview(null);
              }}
              className="rounded-md border border-border px-3 py-1.5 text-sm font-medium text-text hover:bg-bg"
            >
              Kapat
            </button>
          </div>
          <ReportSnapshot snapshot={preview} showStudent />
        </div>
      )}

      {loading ? (
        <LoadingState />
      ) : items && items.length === 0 ? (
        <EmptyState message="Bu hafta gönderilecek kayıt yok." />
      ) : (
        items && (
          <div className="overflow-hidden rounded-md border border-border bg-surface">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-[13px] font-medium text-muted">
                  <th className="px-3 py-2">Öğrenci</th>
                  <th className="px-3 py-2">Veli</th>
                  <th className="px-3 py-2">Sınıf</th>
                  <th className="px-3 py-2">Durum</th>
                  <th className="px-3 py-2">Gönderim</th>
                  <th className="px-3 py-2">Görüntülenme</th>
                  <th className="px-3 py-2 text-right">İşlem</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => {
                  const isRevoked = item.is_revoked;
                  const isSent = item.status === 'sent';
                  // pending/ready → "Gönder"; sent (iptal edilmiş dahil) → "Yeniden gönder".
                  // İptal edilen digest yeniden gönderilebilir: send, yeni token üretir,
                  // is_revoked=0 yapar, send_count artırır (spec §5.4).
                  const canSend = !isSent && !isRevoked;
                  const canResend = isSent;
                  const canRevoke = isSent && !isRevoked;
                  return (
                    <tr key={item.id} className="border-b border-border last:border-b-0">
                      <td className="px-3 py-2 font-medium text-text">{item.student_name}</td>
                      <td className="px-3 py-2 text-[13px] text-muted">
                        {item.guardian_name}
                      </td>
                      <td className="px-3 py-2 text-[13px] text-text">
                        {item.class.name ?? '—'}
                      </td>
                      <td className="px-3 py-2">
                        {badge(item.status, item.is_revoked)}
                        {item.status === 'pending' && (
                          <span className="mt-0.5 block text-xs text-muted">
                            {item.total_courses - item.missing_course_count} dersten{' '}
                            {item.total_courses} dersin raporu var
                          </span>
                        )}
                      </td>
                      <td className="tabular px-3 py-2 text-[13px] text-muted">
                        {item.sent_at
                          ? `${item.send_count} · ${new Date(item.sent_at).toLocaleDateString('tr-TR')}`
                          : '—'}
                      </td>
                      <td className="px-3 py-2 text-[13px] text-muted">
                        {item.last_viewed_at ? (
                          <span className="text-status-sent">
                            Görüntülendi:{' '}
                            <span className="tabular">
                              {new Date(item.last_viewed_at).toLocaleDateString('tr-TR', {
                                day: 'numeric',
                                month: 'short',
                              })}
                            </span>
                          </span>
                        ) : (
                          <span>Henüz görüntülenmedi</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <button
                          type="button"
                          onClick={() => void openPreview(item)}
                          className="mr-3 text-sm font-medium text-muted hover:text-text"
                        >
                          {previewId === item.id ? 'Gizle' : 'Önizle'}
                        </button>
                        {canSend && (
                          <button
                            type="button"
                            disabled={sendingId === item.id}
                            onClick={() => void handleSend(item)}
                            className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-accent-fg transition-colors hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {sendingId === item.id ? 'Gönderiliyor…' : 'Gönder'}
                          </button>
                        )}
                        {canResend && (
                          <button
                            type="button"
                            disabled={sendingId === item.id}
                            onClick={() => void handleSend(item)}
                            className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-accent-fg transition-colors hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {sendingId === item.id ? 'Gönderiliyor…' : 'Yeniden gönder'}
                          </button>
                        )}
                        {canRevoke && (
                          <button
                            type="button"
                            onClick={() => void handleRevoke(item)}
                            className="ml-2 rounded-md border border-danger/30 px-3 py-1.5 text-sm font-medium text-danger transition-colors hover:bg-danger/5"
                          >
                            İptal
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )
      )}
    </div>
  );
}

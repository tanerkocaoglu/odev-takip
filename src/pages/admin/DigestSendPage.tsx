/**
 * Admin — Haftalık gönderim (spec.md §5.4).
 * `pending` (eksikli, uyarılı) + `ready` (aktif) + `sent` satırları listelenir;
 * sınıf filtresiyle çalışır. "Gönder" → **popup engelleme deseni**:
 * tıklama anında senkron boş sekme açılır, send yanıtı gelince sekmenin
 * `location.href`'ine wa.me linki atanır; hata gelirse sekme kapatılır.
 * Sekme engellenmişse wa.me linki kopyalanabilir buton olarak sunulur.
 */

import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Send } from 'lucide-react';
import type { AdminDigestItem, DigestSnapshot, ClassItem } from '../../types';
import { adminApi, ApiClientError } from '../../services/api';
import { formatDateIst } from '../../utils/date';
import ReportSnapshot from '../../components/ReportSnapshot';
import {
  ActionError,
  Badge,
  Button,
  ConfirmDialog,
  CountChip,
  DataTable,
  FilterSelect,
  InlineNotice,
  ListState,
  LoadingState,
  Modal,
  PageHeader,
  Toolbar,
  buttonClass,
  type BadgeTone,
  type Column,
} from '../../components/ui';

const STATUS_LABELS: Record<string, string> = {
  pending: 'Eksikli',
  ready: 'Hazır',
  sent: 'Gönderildi',
};

const DIGEST_TONES: Record<string, BadgeTone> = {
  pending: 'warning',
  ready: 'info',
  sent: 'positive',
};

/** Satırın özeti: "Öğrenci · Hafta N · Sınıf" — onay metinleri ve açıklamalar bunu kullanır. */
const describeItem = (item: AdminDigestItem) =>
  `${item.student_name} (veli: ${item.guardian_name}) · ${item.week.week_no}. hafta · ${item.class.name ?? '—'}`;

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
  const [revokeItem, setRevokeItem] = useState<AdminDigestItem | null>(null);
  const [revoking, setRevoking] = useState(false);

  const [previewId, setPreviewId] = useState<string | null>(null);
  const [preview, setPreview] = useState<DigestSnapshot | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await adminApi.digests.list({ class_id: classId || undefined });
      setItems(res.items);
    } catch (err) {
      setError(
        err instanceof ApiClientError
          ? err.message
          : 'Gönderim listesi yüklenemedi. Bağlantınızı kontrol edip yeniden deneyin.',
      );
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
      setSendOk(
        `${item.student_name} için ${item.week.week_no}. hafta raporu gönderildi (${item.class.name ?? '—'}). ${
          win ? 'WhatsApp yeni sekmede açıldı.' : ''
        }`.trim(),
      );
      await load();
      focusNextSend(item.id);
    } catch (err) {
      if (win) win.close();
      setSendError(err instanceof ApiClientError ? err.message : 'Rapor gönderilemedi.');
    } finally {
      setSendingId(null);
    }
  }

  async function handleRevoke() {
    if (!revokeItem) return;
    setRevoking(true);
    setSendError(null);
    try {
      await adminApi.digests.revoke(revokeItem.id);
      setRevokeItem(null);
      await load();
    } catch (err) {
      setRevokeItem(null);
      setSendError(err instanceof ApiClientError ? err.message : 'Bağlantı iptal edilemedi.');
    } finally {
      setRevoking(false);
    }
  }

  /** "Gönder ve sonraki": gönderimden sonra odak listedeki bir sonraki "Gönder" düğmesine geçer. */
  function focusNextSend(sentId: string) {
    window.setTimeout(() => {
      const buttons = Array.from(document.querySelectorAll<HTMLElement>('[data-digest-send]'));
      const next = buttons.find((b) => b.dataset.digestSend !== sentId) ?? buttons[0];
      next?.focus();
    }, 0);
  }

  async function copyLinkToClipboard(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setSendOk('Link kopyalandı.');
    } catch {
      setSendOk(`Link: ${url}`);
    }
  }

  const badge = (status: string, isRevoked: boolean) =>
    isRevoked ? (
      <Badge tone="neutral">İptal edildi</Badge>
    ) : (
      <Badge tone={DIGEST_TONES[status] ?? 'neutral'}>{STATUS_LABELS[status] ?? status}</Badge>
    );

  // Önizlenen digest gönderilmemişse (pending/ready) veya geri çekilmişse
  // ders kartlarında "Düzenle" gösterilir. Geri çekilmiş digest'te `status`
  // hâlâ 'sent' kalır (revoke yalnızca `is_revoked` işaretler); admin düzenleyip
  // aynı satırdan "Yeniden gönder" ile taze snapshot üretebilir (spec §5.4).
  // Düzenlenmemiş `sent` digest'te ise gösterilmez.
  const previewItem = items?.find((i) => i.id === previewId) ?? null;
  const canEditPreview =
    previewItem !== null && (previewItem.is_revoked || previewItem.status !== 'sent');

  const counts = {
    ready: items?.filter((i) => i.status === 'ready' && !i.is_revoked).length ?? 0,
    pending: items?.filter((i) => i.status === 'pending').length ?? 0,
    sent: items?.filter((i) => i.status === 'sent' && !i.is_revoked).length ?? 0,
  };

  const columns: Column<AdminDigestItem>[] = [
    {
      key: 'student',
      header: 'Öğrenci',
      card: 'title',
      wrap: true,
      cell: (i) => <span className="font-medium">{i.student_name}</span>,
    },
    {
      key: 'guardian',
      header: 'Veli',
      wrap: true,
      className: 'text-muted',
      cell: (i) => i.guardian_name,
    },
    { key: 'class', header: 'Sınıf', cell: (i) => i.class.name ?? '—' },
    {
      key: 'status',
      header: 'Durum',
      cell: (i) => (
        <span className="flex flex-col items-start gap-0.5">
          {badge(i.status, i.is_revoked)}
          {i.status === 'pending' && (
            <span className="tabular text-xs font-medium text-warning">
              {i.total_courses - i.missing_course_count} / {i.total_courses} dersin raporu var
            </span>
          )}
        </span>
      ),
    },
    {
      key: 'sent',
      header: 'Gönderim',
      className: 'tabular text-muted',
      cell: (i) => (i.sent_at ? `${i.send_count} · ${formatDateIst(i.sent_at)}` : '—'),
    },
    {
      key: 'viewed',
      header: 'Görüntülenme',
      wrap: true,
      className: 'text-muted',
      cell: (i) =>
        i.last_viewed_at ? (
          <span className="text-success">
            Görüntülendi: <span className="tabular">{formatDateIst(i.last_viewed_at)}</span>
          </span>
        ) : (
          <span>Henüz görüntülenmedi</span>
        ),
    },
  ];

  function sendAction(item: AdminDigestItem) {
    // pending/ready → "Gönder"; sent (iptal edilmiş dahil) → "Yeniden gönder".
    // İptal edilen digest yeniden gönderilebilir: send yeni token üretir,
    // is_revoked=0 yapar, send_count artırır (spec §5.4).
    const isSent = item.status === 'sent';
    const canSend = !isSent && !item.is_revoked;
    const canResend = isSent;
    const descId = `send-desc-${item.id}`;
    return (
      <>
        <Button size="sm" variant="ghost" onClick={() => void openPreview(item)}>
          Önizle
        </Button>
        {(canSend || canResend) && (
          <>
            <Button
              size="sm"
              variant="primary"
              data-digest-send={item.id}
              aria-describedby={descId}
              loading={sendingId === item.id}
              onClick={() => void handleSend(item)}
            >
              {canResend ? 'Yeniden gönder' : 'Gönder'}
            </Button>
            <span id={descId} className="sr-only">
              {canResend
                ? `${describeItem(item)}: yeni rapor bağlantısı üretir, önceki bağlantı geçersiz olur; WhatsApp yeni sekmede açılır.`
                : `${describeItem(item)}: rapor bağlantısı üretilir ve WhatsApp yeni sekmede açılır${
                    item.status === 'pending'
                      ? `; ${item.missing_course_count} dersin raporu eksik gider`
                      : ''
                  }.`}
            </span>
          </>
        )}
      </>
    );
  }

  return (
    <div className="space-y-4">
      <PageHeader
        icon={Send}
        title="Haftalık gönderim"
        description="Hazır raporlar gönderilebilir; eksikli raporlar yalnızca girilmiş dersleri içerir. Gönder, rapor bağlantısını üretir ve WhatsApp'ı yeni sekmede açar."
      />

      <Toolbar
        filters={
          <>
            <FilterSelect label="Sınıf" value={classId} onChange={setClassId}>
              <option value="">Tümü</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </FilterSelect>
            {items && !loading && !error && (
              <p
                className="flex flex-wrap items-center gap-x-3 gap-y-1 pb-2 text-[13px] text-muted"
                aria-label="Gönderim özeti"
              >
                <span className="inline-flex items-center gap-1.5">
                  <CountChip value={counts.ready} /> hazır
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <CountChip value={counts.pending} /> eksikli
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <CountChip value={counts.sent} /> gönderildi
                </span>
              </p>
            )}
          </>
        }
      />

      <ActionError message={sendError} onDismiss={() => setSendError(null)} />
      {sendOk && (
        <div role="status">
          <InlineNotice tone="success">{sendOk}</InlineNotice>
        </div>
      )}

      {copyLink && (
        <InlineNotice tone="warning">
          <p>
            Tarayıcı açılır pencereyi engelledi. WhatsApp bağlantısını kopyalayıp elle
            açabilirsiniz:
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <code className="break-all rounded bg-subtle px-2 py-1 text-xs text-text">
              {copyLink}
            </code>
            <Button size="sm" onClick={() => void copyLinkToClipboard(copyLink)}>
              Kopyala
            </Button>
          </div>
        </InlineNotice>
      )}

      <ListState
        loading={loading}
        error={error}
        onRetry={() => void load()}
        empty={!items || items.length === 0}
        emptyMessage="Bu hafta gönderilecek kayıt yok."
      >
        <DataTable
          rows={items ?? []}
          columns={columns}
          rowKey={(i) => i.id}
          rowLabel={(i) => i.student_name}
          rowAction={sendAction}
          actions={(i) =>
            i.status === 'sent' && !i.is_revoked
              ? [
                  {
                    label: 'Bağlantıyı iptal et',
                    danger: true,
                    onSelect: () => setRevokeItem(i),
                  },
                ]
              : []
          }
        />
      </ListState>

      <ConfirmDialog
        open={revokeItem !== null}
        title="Bağlantıyı iptal et"
        confirmLabel="Bağlantıyı iptal et"
        loading={revoking}
        onConfirm={() => void handleRevoke()}
        onCancel={() => setRevokeItem(null)}
      >
        {revokeItem && (
          <div className="space-y-2">
            <p>
              <strong className="text-text">{describeItem(revokeItem)}</strong> raporunun bağlantısı
              iptal edilecek.
            </p>
            <p>
              Eski bağlantı kalıcı olarak geçersiz olur ve <code>/r/{'{token}'}</code> adresi 410
              döner. Raporu yeniden gönderirseniz yeni bir bağlantı üretilir.
            </p>
          </div>
        )}
      </ConfirmDialog>

      <Modal
        open={previewId !== null}
        title={previewItem ? `Önizleme — ${previewItem.student_name}` : 'Önizleme'}
        size="lg"
        onClose={() => {
          setPreviewId(null);
          setPreview(null);
        }}
      >
        {!preview && <LoadingState rows={3} />}
        {preview && (
          <ReportSnapshot
            snapshot={preview}
            renderCourseAction={
              canEditPreview
                ? (course) =>
                    course.status === 'completed' || course.status === 'sent' ? (
                      <Link
                        to={`/teacher/reports/${course.class_course_id}/${preview.week.id}?returnTo=${encodeURIComponent(
                          '/admin/digests',
                        )}`}
                        className={buttonClass('secondary', 'sm')}
                      >
                        Düzenle
                      </Link>
                    ) : null
                : undefined
            }
          />
        )}
      </Modal>
    </div>
  );
}

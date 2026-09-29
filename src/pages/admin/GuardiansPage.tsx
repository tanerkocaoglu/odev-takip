import { useState, type FormEvent } from 'react';
import type { Guardian } from '../../types';
import { adminApi, ApiClientError } from '../../services/api';
import { useList } from '../../hooks/useList';
import { formatDate } from '../../utils/date';
import {
  ActionError,
  Badge,
  Button,
  ConfirmDialog,
  CountChip,
  DataTable,
  Field,
  FormActions,
  FormError,
  InlineNotice,
  Input,
  ListState,
  Modal,
  Pagination,
  SearchBox,
  Toolbar,
  type Column,
} from '../../components/ui';

export default function GuardiansPage() {
  const { items, total, page, pageSize, loading, error, q, setQ, setPage, reload } =
    useList<Guardian>((params) => adminApi.guardians.list(params));

  const [actionError, setActionError] = useState<string | null>(null);
  const [createdNotice, setCreatedNotice] = useState<string | null>(null);

  const [formOpen, setFormOpen] = useState(false);
  const [editGuardian, setEditGuardian] = useState<Guardian | null>(null);
  const [fullName, setFullName] = useState('');
  const [whatsappPhone, setWhatsappPhone] = useState('');
  const [password, setPassword] = useState('');
  const [consentAt, setConsentAt] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const [resetGuardian, setResetGuardian] = useState<Guardian | null>(null);
  const [resetPassword, setResetPassword] = useState('');
  const [resetSubmitting, setResetSubmitting] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  const [deleteGuardian, setDeleteGuardian] = useState<Guardian | null>(null);
  const [deleting, setDeleting] = useState(false);

  function openCreate() {
    setEditGuardian(null);
    setFullName('');
    setWhatsappPhone('');
    setPassword('');
    setConsentAt(false);
    setFormError(null);
    setFieldErrors({});
    setFormOpen(true);
  }

  function openEdit(guardian: Guardian) {
    setEditGuardian(guardian);
    setFullName(guardian.full_name);
    setWhatsappPhone(guardian.whatsapp_phone);
    setConsentAt(guardian.consent_at !== null);
    setFormError(null);
    setFieldErrors({});
    setFormOpen(true);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);
    // WhatsApp numarası zorunlu (fallback yok — spec §3.1): boşsa alanın altında gösterilir.
    if (!whatsappPhone.trim()) {
      setFieldErrors({
        whatsapp_phone: 'WhatsApp numarası zorunlu; rapor bağlantısı bu numaraya gönderilir.',
      });
      return;
    }
    setFieldErrors({});
    setSubmitting(true);
    try {
      if (editGuardian) {
        await adminApi.guardians.patch(editGuardian.id, {
          full_name: fullName.trim(),
          whatsapp_phone: whatsappPhone.trim(),
          consent_at: consentAt,
        });
      } else {
        const created = await adminApi.guardians.create({
          full_name: fullName.trim(),
          whatsapp_phone: whatsappPhone.trim(),
          password,
        });
        // Oluşturma sırasında KVKK kutusu işaretlendiyse ayrı PATCH ile kaydet.
        if (consentAt) {
          await adminApi.guardians.patch(created.id, { consent_at: true });
        }
        setCreatedNotice(
          `${created.full_name} oluşturuldu. Kullanıcı adı: ${created.username} — başlangıç şifresiyle birlikte veliye iletin.`,
        );
      }
      setFormOpen(false);
      await reload();
    } catch (err) {
      if (err instanceof ApiClientError) {
        const fields = err.fields ?? {};
        setFieldErrors(fields);
        if (Object.keys(fields).length === 0) setFormError(err.message);
      } else {
        setFormError('Veli kaydedilemedi.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function handleReset(event: FormEvent) {
    event.preventDefault();
    if (!resetGuardian) return;
    setResetSubmitting(true);
    setResetError(null);
    try {
      await adminApi.guardians.resetPassword(resetGuardian.id, resetPassword);
      setResetGuardian(null);
      setResetPassword('');
    } catch (err) {
      setResetError(err instanceof ApiClientError ? err.message : 'Şifre sıfırlanamadı.');
    } finally {
      setResetSubmitting(false);
    }
  }

  async function handleDelete() {
    if (!deleteGuardian) return;
    setDeleting(true);
    setActionError(null);
    try {
      await adminApi.guardians.remove(deleteGuardian.id);
      setDeleteGuardian(null);
      await reload();
    } catch (err) {
      setDeleteGuardian(null);
      setActionError(err instanceof ApiClientError ? err.message : 'Veli silinemedi.');
    } finally {
      setDeleting(false);
    }
  }

  /** Tek tıkla KVKK onayı aç/kapat — satırdan. */
  async function toggleConsent(guardian: Guardian) {
    const newValue = guardian.consent_at === null;
    setActionError(null);
    try {
      await adminApi.guardians.patch(guardian.id, { consent_at: newValue });
      await reload();
    } catch (err) {
      setActionError(err instanceof ApiClientError ? err.message : 'KVKK onayı değiştirilemedi.');
    }
  }

  /** Ekrandaki aktif arama sonucunu CSV indirir (spec §5.7). */
  async function handleExport() {
    setExporting(true);
    setActionError(null);
    try {
      await adminApi.exports.guardians({ q });
    } catch (err) {
      setActionError(err instanceof ApiClientError ? err.message : 'CSV indirilemedi.');
    } finally {
      setExporting(false);
    }
  }

  const columns: Column<Guardian>[] = [
    {
      key: 'name',
      header: 'Ad',
      card: 'title',
      cell: (g) => <span className="font-medium">{g.full_name}</span>,
    },
    {
      key: 'username',
      header: 'Kullanıcı adı',
      className: 'tabular text-muted',
      cell: (g) => g.username,
    },
    {
      key: 'phone',
      header: 'WhatsApp',
      className: 'tabular text-muted',
      cell: (g) => g.whatsapp_phone,
    },
    {
      key: 'children',
      header: 'Çocuk',
      className: 'tabular text-muted',
      cell: (g) => g.child_count ?? 0,
    },
    {
      key: 'consent',
      header: 'KVKK',
      cell: (g) => (
        <button
          type="button"
          onClick={() => void toggleConsent(g)}
          aria-label={
            g.consent_at
              ? `${g.full_name}: KVKK onayı verildi (${formatDate(g.consent_at)}). Kaldırmak için tıklayın`
              : `${g.full_name}: KVKK onayı yok. Vermek için tıklayın`
          }
          title="KVKK açık rızası — rapor gönderimi için zorunlu"
          className="-my-1 rounded-full max-md:-my-3 max-md:py-3"
        >
          {g.consent_at ? (
            <Badge tone="positive">Onaylı</Badge>
          ) : (
            <Badge tone="warning">Onaysız</Badge>
          )}
        </button>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <Toolbar
        filters={
          <>
            <SearchBox
              value={q}
              onChange={(v) => setQ(v)}
              placeholder="Veli ara…"
              label="Veli ara"
            />
            {!loading && !error && (
              <p className="flex items-center gap-1.5 pb-2 text-[13px] text-muted">
                <CountChip value={total} /> veli
              </p>
            )}
          </>
        }
        actions={
          <>
            <Button onClick={handleExport} loading={exporting}>
              {exporting ? 'İndiriliyor…' : 'CSV indir'}
            </Button>
            <Button variant="primary" onClick={openCreate}>
              Yeni veli
            </Button>
          </>
        }
      />

      {createdNotice && (
        <div role="status">
          <InlineNotice tone="success">{createdNotice}</InlineNotice>
        </div>
      )}
      <ActionError message={actionError} onDismiss={() => setActionError(null)} />

      <ListState
        loading={loading}
        error={error}
        onRetry={() => void reload()}
        empty={items.length === 0}
        emptyMessage="Veli bulunamadı."
      >
        <DataTable
          rows={items}
          columns={columns}
          rowKey={(g) => g.id}
          rowLabel={(g) => g.full_name}
          actions={(g) => [
            { label: 'Düzenle', onSelect: () => openEdit(g) },
            {
              label: 'Şifre sıfırla',
              onSelect: () => {
                setResetGuardian(g);
                setResetPassword('');
                setResetError(null);
              },
            },
            { label: 'Sil', danger: true, onSelect: () => setDeleteGuardian(g) },
          ]}
        />
      </ListState>
      <Pagination page={page} pageSize={pageSize} total={total} onChange={setPage} />

      <ConfirmDialog
        open={deleteGuardian !== null}
        title="Veliyi sil"
        confirmLabel="Veliyi sil"
        loading={deleting}
        onConfirm={() => void handleDelete()}
        onCancel={() => setDeleteGuardian(null)}
      >
        {deleteGuardian?.full_name} silinsin mi?
      </ConfirmDialog>

      <Modal
        open={formOpen}
        title={editGuardian ? 'Veliyi düzenle' : 'Yeni veli'}
        onClose={() => setFormOpen(false)}
      >
        <form onSubmit={handleSubmit} noValidate className="space-y-4">
          <Field label="Ad soyad" htmlFor="g-name" error={fieldErrors.full_name}>
            <Input
              id="g-name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              required
            />
          </Field>
          <Field
            label="WhatsApp numarası (zorunlu)"
            htmlFor="g-whatsapp"
            error={fieldErrors.whatsapp_phone}
          >
            <Input
              id="g-whatsapp"
              type="tel"
              value={whatsappPhone}
              onChange={(e) => setWhatsappPhone(e.target.value)}
              className="tabular"
              placeholder="+90 5XX XXX XX XX"
            />
          </Field>
          {!editGuardian && (
            <Field
              label="Başlangıç şifresi (veliye iletin)"
              htmlFor="g-password"
              error={fieldErrors.password}
              hint="En az 6 karakter. Kullanıcı adı otomatik üretilir."
            >
              <Input
                id="g-password"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
              />
            </Field>
          )}
          {editGuardian && (
            <p className="text-xs text-muted">
              Kullanıcı adı:{' '}
              <span className="tabular font-medium text-text">{editGuardian.username}</span>{' '}
              (otomatik üretilir). Şifre değişimi için "Şifre sıfırla".
            </p>
          )}
          {/* KVKK açık rızası — yeni veli oluşturma ve düzenleme için */}
          <label
            className="flex min-h-9 cursor-pointer items-center gap-2 text-sm max-md:min-h-11"
            htmlFor="g-consent"
          >
            <input
              id="g-consent"
              type="checkbox"
              checked={consentAt}
              onChange={(e) => setConsentAt(e.target.checked)}
              className="h-4 w-4 accent-accent"
            />
            <span>
              KVKK açık rızası alındı{' '}
              <span className="text-xs text-muted">(rapor göndermek için zorunlu)</span>
            </span>
          </label>

          <FormError message={formError} />
          <FormActions>
            <Button onClick={() => setFormOpen(false)}>İptal</Button>
            <Button variant="primary" type="submit" loading={submitting}>
              {editGuardian ? 'Veliyi kaydet' : 'Veliyi ekle'}
            </Button>
          </FormActions>
        </form>
      </Modal>

      <Modal
        open={resetGuardian !== null}
        title={`${resetGuardian?.full_name ?? ''} — şifre sıfırla`}
        onClose={() => setResetGuardian(null)}
      >
        <form onSubmit={handleReset} className="space-y-4">
          <p className="text-sm text-muted">
            Kullanıcı adı: {resetGuardian?.username}. Eski oturumlar bu işlemle sona erer.
          </p>
          <Field label="Yeni şifre (veliye iletin)" htmlFor="g-reset">
            <Input
              id="g-reset"
              type="password"
              autoComplete="new-password"
              value={resetPassword}
              onChange={(e) => setResetPassword(e.target.value)}
              required
              minLength={6}
            />
          </Field>
          <FormError message={resetError} />
          <FormActions>
            <Button onClick={() => setResetGuardian(null)}>İptal</Button>
            <Button variant="primary" type="submit" loading={resetSubmitting}>
              Şifreyi sıfırla
            </Button>
          </FormActions>
        </form>
      </Modal>
    </div>
  );
}

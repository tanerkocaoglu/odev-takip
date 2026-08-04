import { useState, type FormEvent } from 'react';
import type { Guardian } from '../../types';
import { adminApi, ApiClientError } from '../../services/api';
import { useList } from '../../hooks/useList';
import Modal from '../../components/admin/Modal';
import Pagination from '../../components/admin/Pagination';
import {
  DangerButton,
  EmptyState,
  Field,
  FormError,
  LoadingState,
  PrimaryButton,
  SecondaryButton,
  SearchBox,
  inputClass,
} from '../../components/admin/ui';

export default function GuardiansPage() {
  const { items, total, page, pageSize, loading, error, setError, setQ, setPage, reload } =
    useList<Guardian>((params) => adminApi.guardians.list(params));

  const [formOpen, setFormOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [fullName, setFullName] = useState('');
  const [whatsappPhone, setWhatsappPhone] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [resetId, setResetId] = useState<string | null>(null);
  const [resetPassword, setResetPassword] = useState('');
  const [resetSubmitting, setResetSubmitting] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);

  function openCreate() {
    setEditId(null);
    setFullName('');
    setWhatsappPhone('');
    setPassword('');
    setFormError(null);
    setFormOpen(true);
  }

  function openEdit(guardian: Guardian) {
    setEditId(guardian.id);
    setFullName(guardian.full_name);
    setWhatsappPhone(guardian.whatsapp_phone);
    setFormError(null);
    setFormOpen(true);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setFormError(null);
    try {
      if (editId) {
        await adminApi.guardians.patch(editId, {
          full_name: fullName.trim(),
          whatsapp_phone: whatsappPhone.trim(),
        });
      } else {
        await adminApi.guardians.create({
          full_name: fullName.trim(),
          whatsapp_phone: whatsappPhone.trim(),
          password,
        });
      }
      setFormOpen(false);
      await reload();
    } catch (err) {
      setFormError(err instanceof ApiClientError ? err.message : 'Bir hata oluştu.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleReset(event: FormEvent) {
    event.preventDefault();
    if (!resetId) return;
    setResetSubmitting(true);
    setResetError(null);
    try {
      await adminApi.guardians.resetPassword(resetId, resetPassword);
      setResetId(null);
      setResetPassword('');
    } catch (err) {
      setResetError(err instanceof ApiClientError ? err.message : 'Bir hata oluştu.');
    } finally {
      setResetSubmitting(false);
    }
  }

  async function handleDelete(guardian: Guardian) {
    if (!window.confirm(`${guardian.full_name} silinsin mi?`)) return;
    try {
      await adminApi.guardians.remove(guardian.id);
      await reload();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Bir hata oluştu.');
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <SearchBox value={''} onChange={(v) => setQ(v)} placeholder="Veli ara…" />
        <PrimaryButton onClick={openCreate}>Yeni veli</PrimaryButton>
      </div>

      {error && <FormError message={error} />}
      {loading ? (
        <LoadingState />
      ) : items.length === 0 ? (
        <EmptyState message="Veli bulunamadı." />
      ) : (
        <div className="overflow-hidden rounded-md border border-border bg-surface">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-bg text-left text-xs font-medium text-muted">
              <tr>
                <th className="px-3 py-2">Ad</th>
                <th className="px-3 py-2">Kullanıcı adı</th>
                <th className="px-3 py-2">WhatsApp</th>
                <th className="px-3 py-2">Çocuk</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {items.map((guardian) => (
                <tr key={guardian.id} className="border-b border-border last:border-0">
                  <td className="px-3 py-2 font-medium text-text">{guardian.full_name}</td>
                  <td className="tabular px-3 py-2 text-muted">{guardian.username}</td>
                  <td className="tabular px-3 py-2 text-muted">{guardian.whatsapp_phone}</td>
                  <td className="tabular px-3 py-2 text-muted">{guardian.child_count ?? 0}</td>
                  <td className="px-3 py-2 text-right">
                    <button
                      type="button"
                      onClick={() => {
                        setResetId(guardian.id);
                        setResetPassword('');
                        setResetError(null);
                      }}
                      className="mr-3 text-sm font-medium text-muted hover:text-text"
                    >
                      Şifre sıfırla
                    </button>
                    <button
                      type="button"
                      onClick={() => openEdit(guardian)}
                      className="mr-3 text-sm font-medium text-muted hover:text-text"
                    >
                      Düzenle
                    </button>
                    <DangerButton onClick={() => handleDelete(guardian)}>Sil</DangerButton>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pagination page={page} pageSize={pageSize} total={total} onChange={setPage} />

      <Modal
        open={formOpen}
        title={editId ? 'Veliyi düzenle' : 'Yeni veli'}
        onClose={() => setFormOpen(false)}
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <Field label="Ad soyad" htmlFor="g-name">
            <input
              id="g-name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              required
              className={inputClass}
            />
          </Field>
          <Field label="WhatsApp numarası (zorunlu)" htmlFor="g-whatsapp">
            <input
              id="g-whatsapp"
              type="tel"
              value={whatsappPhone}
              onChange={(e) => setWhatsappPhone(e.target.value)}
              required
              className={inputClass}
              placeholder="+90 5XX XXX XX XX"
            />
          </Field>
          {!editId && (
            <Field label="Başlangıç şifresi (veliye iletin)" htmlFor="g-password">
              <input
                id="g-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                className={inputClass}
              />
            </Field>
          )}
          {editId && (
            <p className="text-xs text-muted">
              Kullanıcı adı: otomatik üretilir (veli…). Şifre değişimi için "Şifre sıfırla".
            </p>
          )}
          <FormError message={formError} />
          <div className="flex justify-end gap-2">
            <SecondaryButton onClick={() => setFormOpen(false)}>İptal</SecondaryButton>
            <PrimaryButton type="submit" disabled={submitting}>
              {submitting ? 'Kaydediliyor…' : 'Kaydet'}
            </PrimaryButton>
          </div>
        </form>
      </Modal>

      <Modal
        open={resetId !== null}
        title="Şifre sıfırla"
        onClose={() => setResetId(null)}
      >
        <form onSubmit={handleReset} className="space-y-4">
          <Field label="Yeni şifre (veliye iletin)" htmlFor="g-reset">
            <input
              id="g-reset"
              type="password"
              value={resetPassword}
              onChange={(e) => setResetPassword(e.target.value)}
              required
              minLength={6}
              className={inputClass}
            />
          </Field>
          <FormError message={resetError} />
          <div className="flex justify-end gap-2">
            <SecondaryButton onClick={() => setResetId(null)}>İptal</SecondaryButton>
            <PrimaryButton type="submit" disabled={resetSubmitting}>
              {resetSubmitting ? 'Sıfırlanıyor…' : 'Şifreyi sıfırla'}
            </PrimaryButton>
          </div>
        </form>
      </Modal>
    </div>
  );
}

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
  const [phone, setPhone] = useState('');
  const [whatsappPhone, setWhatsappPhone] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  function openCreate() {
    setEditId(null);
    setFullName('');
    setPhone('');
    setWhatsappPhone('');
    setFormError(null);
    setFormOpen(true);
  }

  function openEdit(guardian: Guardian) {
    setEditId(guardian.id);
    setFullName(guardian.full_name);
    setPhone(guardian.phone);
    setWhatsappPhone(guardian.whatsapp_phone ?? '');
    setFormError(null);
    setFormOpen(true);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setFormError(null);
    try {
      const whatsapp = whatsappPhone.trim() || null;
      if (editId) {
        await adminApi.guardians.patch(editId, {
          full_name: fullName.trim(),
          phone: phone.trim(),
          whatsapp_phone: whatsapp,
        });
      } else {
        await adminApi.guardians.create({
          full_name: fullName.trim(),
          phone: phone.trim(),
          whatsapp_phone: whatsapp,
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
                <th className="px-3 py-2">Telefon</th>
                <th className="px-3 py-2">WhatsApp</th>
                <th className="px-3 py-2">Çocuk</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {items.map((guardian) => (
                <tr key={guardian.id} className="border-b border-border last:border-0">
                  <td className="px-3 py-2 font-medium text-text">{guardian.full_name}</td>
                  <td className="tabular px-3 py-2 text-muted">{guardian.phone}</td>
                  <td className="tabular px-3 py-2 text-muted">
                    {guardian.whatsapp_phone ?? (
                      <span className="text-xs text-muted">giriş numarası</span>
                    )}
                  </td>
                  <td className="tabular px-3 py-2 text-muted">{guardian.child_count ?? 0}</td>
                  <td className="px-3 py-2 text-right">
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
          <Field label="Telefon (giriş için)" htmlFor="g-phone">
            <input
              id="g-phone"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              required
              className={inputClass}
              placeholder="+90 5XX XXX XX XX"
            />
          </Field>
          <Field label="WhatsApp numarası" htmlFor="g-whatsapp">
            <input
              id="g-whatsapp"
              type="tel"
              value={whatsappPhone}
              onChange={(e) => setWhatsappPhone(e.target.value)}
              className={inputClass}
              placeholder="Boş bırakılırsa giriş numarasına gönderilir"
            />
          </Field>
          <FormError message={formError} />
          <div className="flex justify-end gap-2">
            <SecondaryButton onClick={() => setFormOpen(false)}>İptal</SecondaryButton>
            <PrimaryButton type="submit" disabled={submitting}>
              {submitting ? 'Kaydediliyor…' : 'Kaydet'}
            </PrimaryButton>
          </div>
        </form>
      </Modal>
    </div>
  );
}

/**
 * Okul yönetimi — spec.md §6 Admin (migration #6).
 * Arayüzde "Okul" adı kullanılır; `classes` (dershane grubu) ile karışmaz.
 */

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import type { School } from '../../types';
import { adminApi, ApiClientError } from '../../services/api';
import Modal from '../../components/admin/Modal';
import {
  DangerButton,
  EmptyState,
  Field,
  FormError,
  LoadingState,
  PrimaryButton,
  SearchBox,
  SecondaryButton,
  inputClass,
} from '../../components/admin/ui';

export default function SchoolsPage() {
  const [items, setItems] = useState<School[] | null>(null);
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [formOpen, setFormOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await adminApi.schools.list(q || undefined);
      setItems(res.items);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Bir hata oluştu.');
    } finally {
      setLoading(false);
    }
  }, [q]);

  useEffect(() => {
    void load();
  }, [load]);

  function openCreate() {
    setEditId(null);
    setName('');
    setFormError(null);
    setFormOpen(true);
  }

  function openEdit(school: School) {
    setEditId(school.id);
    setName(school.name);
    setFormError(null);
    setFormOpen(true);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setFormError(null);
    try {
      if (editId) {
        await adminApi.schools.patch(editId, { name: name.trim() });
      } else {
        await adminApi.schools.create({ name: name.trim() });
      }
      setFormOpen(false);
      await load();
    } catch (err) {
      setFormError(err instanceof ApiClientError ? err.message : 'Bir hata oluştu.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(school: School) {
    if (!window.confirm(`${school.name} silinsin mi?`)) return;
    try {
      await adminApi.schools.remove(school.id);
      await load();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Bir hata oluştu.');
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <SearchBox value={q} onChange={setQ} placeholder="Okul ara…" />
        <PrimaryButton onClick={openCreate}>Yeni okul</PrimaryButton>
      </div>

      <FormError message={error} />

      {loading ? (
        <LoadingState />
      ) : !items || items.length === 0 ? (
        <EmptyState message="Okul bulunamadı. Öğrenci formundan da okul ekleyebilirsiniz." />
      ) : (
        <div className="overflow-hidden rounded-md border border-border bg-surface">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-bg text-left text-xs font-medium text-muted">
              <tr>
                <th className="px-3 py-2">Okul</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {items.map((school) => (
                <tr key={school.id} className="border-b border-border last:border-0">
                  <td className="px-3 py-2 font-medium text-text">{school.name}</td>
                  <td className="px-3 py-2 text-right">
                    <button
                      type="button"
                      onClick={() => openEdit(school)}
                      className="mr-3 text-sm font-medium text-muted hover:text-text"
                    >
                      Düzenle
                    </button>
                    <DangerButton onClick={() => handleDelete(school)}>Sil</DangerButton>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal
        open={formOpen}
        title={editId ? 'Okulu düzenle' : 'Yeni okul'}
        onClose={() => setFormOpen(false)}
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <Field label="Okul adı" htmlFor="school-name">
            <input
              id="school-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              minLength={1}
              className={inputClass}
              placeholder="Örn. Örnek Okul 1"
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

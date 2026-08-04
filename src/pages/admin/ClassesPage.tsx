import { useCallback, useEffect, useState, type FormEvent } from 'react';
import type { AcademicYear, ClassItem } from '../../types';
import { adminApi, ApiClientError } from '../../services/api';
import Modal from '../../components/admin/Modal';
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

export default function ClassesPage() {
  const [years, setYears] = useState<AcademicYear[]>([]);
  const [yearId, setYearId] = useState('');
  const [q, setQ] = useState('');
  const [items, setItems] = useState<ClassItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [formOpen, setFormOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    adminApi.academicYears
      .list()
      .then((data) => {
        setYears(data.items);
        const active = data.items.find((y) => y.is_active === 1);
        setYearId((prev) => prev || active?.id || data.items[0]?.id || '');
      })
      .catch(() => setError('Eğitim yılları yüklenemedi.'));
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await adminApi.classes.list({ academicYearId: yearId || undefined, q });
      setItems(data.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Bir hata oluştu.');
    } finally {
      setLoading(false);
    }
  }, [yearId, q]);

  useEffect(() => {
    load();
  }, [load]);

  function openCreate() {
    setEditId(null);
    setName('');
    setFormError(null);
    setFormOpen(true);
  }

  function openEdit(item: ClassItem) {
    setEditId(item.id);
    setName(item.name);
    setFormError(null);
    setFormOpen(true);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setFormError(null);
    try {
      if (editId) {
        await adminApi.classes.patch(editId, { name: name.trim() });
      } else {
        await adminApi.classes.create({ academic_year_id: yearId, name: name.trim() });
      }
      setFormOpen(false);
      await load();
    } catch (err) {
      setFormError(err instanceof ApiClientError ? err.message : 'Bir hata oluştu.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(item: ClassItem) {
    if (!window.confirm(`"${item.name}" silinsin mi?`)) return;
    try {
      await adminApi.classes.remove(item.id);
      await load();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Bir hata oluştu.');
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Eğitim yılı" htmlFor="class-year">
            <select
              id="class-year"
              value={yearId}
              onChange={(e) => setYearId(e.target.value)}
              className={inputClass}
            >
              {years.map((y) => (
                <option key={y.id} value={y.id}>
                  {y.name}
                </option>
              ))}
            </select>
          </Field>
          <SearchBox value={q} onChange={setQ} placeholder="Sınıf ara…" />
        </div>
        <PrimaryButton onClick={openCreate} disabled={!yearId}>
          Yeni sınıf
        </PrimaryButton>
      </div>

      {error && <FormError message={error} />}
      {loading ? (
        <LoadingState />
      ) : items.length === 0 ? (
        <EmptyState message="Bu eğitim yılında sınıf yok." />
      ) : (
        <div className="overflow-hidden rounded-md border border-border bg-surface">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-bg text-left text-xs font-medium text-muted">
              <tr>
                <th className="px-3 py-2">Sınıf adı</th>
                <th className="px-3 py-2">Eğitim yılı</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} className="border-b border-border last:border-0">
                  <td className="px-3 py-2 font-medium text-text">{item.name}</td>
                  <td className="px-3 py-2 text-muted">{item.academic_year_name}</td>
                  <td className="px-3 py-2 text-right">
                    <button
                      type="button"
                      onClick={() => openEdit(item)}
                      className="mr-3 text-sm font-medium text-muted hover:text-text"
                    >
                      Düzenle
                    </button>
                    <DangerButton onClick={() => handleDelete(item)}>Sil</DangerButton>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal
        open={formOpen}
        title={editId ? 'Sınıfı düzenle' : 'Yeni sınıf'}
        onClose={() => setFormOpen(false)}
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <Field label="Sınıf adı" htmlFor="class-name">
            <input
              id="class-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className={inputClass}
              placeholder="ÖKLİD"
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

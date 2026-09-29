/**
 * Okul yönetimi — spec.md §6 Admin (migration #6).
 * Arayüzde "Okul" adı kullanılır; `classes` (dershane grubu) ile karışmaz.
 */

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import type { School } from '../../types';
import { adminApi, ApiClientError } from '../../services/api';
import {
  ActionError,
  Button,
  ConfirmDialog,
  CountChip,
  DataTable,
  Field,
  FormActions,
  Input,
  ListState,
  Modal,
  SearchBox,
  Toolbar,
  type Column,
} from '../../components/ui';

const COLUMNS: Column<School>[] = [
  {
    key: 'name',
    header: 'Okul',
    card: 'title',
    cell: (s) => <span className="font-medium">{s.name}</span>,
  },
];

export default function SchoolsPage() {
  const [items, setItems] = useState<School[] | null>(null);
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const [formOpen, setFormOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [deleteSchool, setDeleteSchool] = useState<School | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await adminApi.schools.list(q || undefined);
      setItems(res.items);
    } catch (err) {
      setError(
        err instanceof ApiClientError
          ? err.message
          : 'Okullar yüklenemedi. Bağlantınızı kontrol edip yeniden deneyin.',
      );
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
      setFormError(err instanceof ApiClientError ? err.message : 'Okul kaydedilemedi.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete() {
    if (!deleteSchool) return;
    setDeleting(true);
    setActionError(null);
    try {
      await adminApi.schools.remove(deleteSchool.id);
      setDeleteSchool(null);
      await load();
    } catch (err) {
      setDeleteSchool(null);
      setActionError(err instanceof ApiClientError ? err.message : 'Okul silinemedi.');
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="space-y-4">
      <Toolbar
        filters={
          <>
            <SearchBox value={q} onChange={setQ} placeholder="Okul ara…" label="Okul ara" />
            {items && !loading && !error && (
              <p className="flex items-center gap-1.5 pb-2 text-[13px] text-muted">
                <CountChip value={items.length} /> okul
              </p>
            )}
          </>
        }
        actions={
          <Button variant="primary" onClick={openCreate}>
            Yeni okul
          </Button>
        }
      />

      <ActionError message={actionError} onDismiss={() => setActionError(null)} />

      <ListState
        loading={loading}
        error={error}
        onRetry={() => void load()}
        empty={!items || items.length === 0}
        emptyMessage="Okul bulunamadı. Öğrenci formundan da okul ekleyebilirsiniz."
        emptyAction={
          <Button variant="primary" onClick={openCreate}>
            Yeni okul
          </Button>
        }
      >
        <DataTable
          rows={items ?? []}
          columns={COLUMNS}
          rowKey={(s) => s.id}
          rowLabel={(s) => s.name}
          actions={(s) => [
            { label: 'Düzenle', onSelect: () => openEdit(s) },
            { label: 'Sil', danger: true, onSelect: () => setDeleteSchool(s) },
          ]}
        />
      </ListState>

      <ConfirmDialog
        open={deleteSchool !== null}
        title="Okulu sil"
        confirmLabel="Okulu sil"
        loading={deleting}
        onConfirm={() => void handleDelete()}
        onCancel={() => setDeleteSchool(null)}
      >
        {deleteSchool?.name} silinsin mi?
      </ConfirmDialog>

      <Modal
        open={formOpen}
        title={editId ? 'Okulu düzenle' : 'Yeni okul'}
        onClose={() => setFormOpen(false)}
      >
        <form onSubmit={handleSubmit}>
          <Field label="Okul adı" htmlFor="school-name" error={formError ?? undefined}>
            <Input
              id="school-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              minLength={1}
              placeholder="Örn. Örnek Okul 1"
            />
          </Field>
          <FormActions>
            <Button onClick={() => setFormOpen(false)}>İptal</Button>
            <Button variant="primary" type="submit" loading={submitting}>
              {editId ? 'Okulu kaydet' : 'Okulu ekle'}
            </Button>
          </FormActions>
        </form>
      </Modal>
    </div>
  );
}

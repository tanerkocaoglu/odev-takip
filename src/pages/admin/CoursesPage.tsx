import { useCallback, useEffect, useState, type FormEvent } from 'react';
import type { Course } from '../../types';
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

const COLUMNS: Column<Course>[] = [
  {
    key: 'name',
    header: 'Ders adı',
    card: 'title',
    cell: (c) => <span className="font-medium">{c.name}</span>,
  },
];

export default function CoursesPage() {
  const [q, setQ] = useState('');
  const [items, setItems] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const [formOpen, setFormOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [deleteItem, setDeleteItem] = useState<Course | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await adminApi.courses.list(q || undefined);
      setItems(data.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Dersler yüklenemedi. Yeniden deneyin.');
    } finally {
      setLoading(false);
    }
  }, [q]);

  useEffect(() => {
    load();
  }, [load]);

  function openCreate() {
    setEditId(null);
    setName('');
    setFormError(null);
    setFormOpen(true);
  }

  function openEdit(item: Course) {
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
        await adminApi.courses.patch(editId, { name: name.trim() });
      } else {
        await adminApi.courses.create({ name: name.trim() });
      }
      setFormOpen(false);
      await load();
    } catch (err) {
      setFormError(err instanceof ApiClientError ? err.message : 'Ders kaydedilemedi.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete() {
    if (!deleteItem) return;
    setDeleting(true);
    setActionError(null);
    try {
      await adminApi.courses.remove(deleteItem.id);
      setDeleteItem(null);
      await load();
    } catch (err) {
      setDeleteItem(null);
      setActionError(err instanceof ApiClientError ? err.message : 'Ders silinemedi.');
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="space-y-4">
      <Toolbar
        filters={
          <>
            <SearchBox value={q} onChange={setQ} placeholder="Ders ara…" label="Ders ara" />
            {!loading && !error && (
              <p className="flex items-center gap-1.5 pb-2 text-[13px] text-muted">
                <CountChip value={items.length} /> ders
              </p>
            )}
          </>
        }
        actions={
          <Button variant="primary" onClick={openCreate}>
            Yeni ders
          </Button>
        }
      />

      <ActionError message={actionError} onDismiss={() => setActionError(null)} />

      <ListState
        loading={loading}
        error={error}
        onRetry={() => void load()}
        empty={items.length === 0}
        emptyMessage="Ders tanımlanmamış."
        emptyAction={
          <Button variant="primary" onClick={openCreate}>
            Yeni ders
          </Button>
        }
      >
        <DataTable
          rows={items}
          columns={COLUMNS}
          rowKey={(c) => c.id}
          rowLabel={(c) => c.name}
          actions={(c) => [
            { label: 'Düzenle', onSelect: () => openEdit(c) },
            { label: 'Sil', danger: true, onSelect: () => setDeleteItem(c) },
          ]}
        />
      </ListState>

      <ConfirmDialog
        open={deleteItem !== null}
        title="Dersi sil"
        confirmLabel="Dersi sil"
        loading={deleting}
        onConfirm={() => void handleDelete()}
        onCancel={() => setDeleteItem(null)}
      >
        "{deleteItem?.name}" silinsin mi?
      </ConfirmDialog>

      <Modal
        open={formOpen}
        title={editId ? 'Dersi düzenle' : 'Yeni ders'}
        onClose={() => setFormOpen(false)}
      >
        <form onSubmit={handleSubmit}>
          <Field label="Ders adı" htmlFor="course-name" error={formError ?? undefined}>
            <Input
              id="course-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              placeholder="Matematik"
            />
          </Field>
          <FormActions>
            <Button onClick={() => setFormOpen(false)}>İptal</Button>
            <Button variant="primary" type="submit" loading={submitting}>
              {editId ? 'Dersi kaydet' : 'Dersi ekle'}
            </Button>
          </FormActions>
        </form>
      </Modal>
    </div>
  );
}

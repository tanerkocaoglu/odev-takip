import { useCallback, useEffect, useState, type FormEvent } from 'react';
import type { AcademicYear, ClassItem } from '../../types';
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
  Select,
  Toolbar,
  type Column,
} from '../../components/ui';

const COLUMNS: Column<ClassItem>[] = [
  {
    key: 'name',
    header: 'Sınıf adı',
    card: 'title',
    cell: (c) => <span className="font-medium">{c.name}</span>,
  },
  {
    key: 'year',
    header: 'Eğitim yılı',
    className: 'text-muted',
    cell: (c) => c.academic_year_name,
  },
];

export default function ClassesPage() {
  const [years, setYears] = useState<AcademicYear[]>([]);
  const [yearId, setYearId] = useState('');
  const [q, setQ] = useState('');
  const [items, setItems] = useState<ClassItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const [formOpen, setFormOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [deleteItem, setDeleteItem] = useState<ClassItem | null>(null);
  const [deleting, setDeleting] = useState(false);

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
      setError(err instanceof Error ? err.message : 'Sınıflar yüklenemedi. Yeniden deneyin.');
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
      setFormError(err instanceof ApiClientError ? err.message : 'Sınıf kaydedilemedi.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete() {
    if (!deleteItem) return;
    setDeleting(true);
    setActionError(null);
    try {
      await adminApi.classes.remove(deleteItem.id);
      setDeleteItem(null);
      await load();
    } catch (err) {
      setDeleteItem(null);
      setActionError(err instanceof ApiClientError ? err.message : 'Sınıf silinemedi.');
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="space-y-4">
      <Toolbar
        filters={
          <>
            <Field label="Eğitim yılı" htmlFor="class-year">
              <Select id="class-year" value={yearId} onChange={(e) => setYearId(e.target.value)}>
                {years.map((y) => (
                  <option key={y.id} value={y.id}>
                    {y.name}
                  </option>
                ))}
              </Select>
            </Field>
            <SearchBox value={q} onChange={setQ} placeholder="Sınıf ara…" label="Sınıf ara" />
            {!loading && !error && (
              <p className="flex items-center gap-1.5 pb-2 text-[13px] text-muted">
                <CountChip value={items.length} /> sınıf
              </p>
            )}
          </>
        }
        actions={
          <Button variant="primary" onClick={openCreate} disabled={!yearId}>
            Yeni sınıf
          </Button>
        }
      />

      <ActionError message={actionError} onDismiss={() => setActionError(null)} />

      <ListState
        loading={loading}
        error={error}
        onRetry={() => void load()}
        empty={items.length === 0}
        emptyMessage="Bu eğitim yılında sınıf yok."
        emptyAction={
          <Button variant="primary" onClick={openCreate} disabled={!yearId}>
            Yeni sınıf
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
        title="Sınıfı sil"
        confirmLabel="Sınıfı sil"
        loading={deleting}
        onConfirm={() => void handleDelete()}
        onCancel={() => setDeleteItem(null)}
      >
        "{deleteItem?.name}" silinsin mi?
      </ConfirmDialog>

      <Modal
        open={formOpen}
        title={editId ? 'Sınıfı düzenle' : 'Yeni sınıf'}
        onClose={() => setFormOpen(false)}
      >
        <form onSubmit={handleSubmit}>
          <Field label="Sınıf adı" htmlFor="class-name" error={formError ?? undefined}>
            <Input
              id="class-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              placeholder="ÖKLİD"
            />
          </Field>
          <FormActions>
            <Button onClick={() => setFormOpen(false)}>İptal</Button>
            <Button variant="primary" type="submit" loading={submitting}>
              {editId ? 'Sınıfı kaydet' : 'Sınıfı ekle'}
            </Button>
          </FormActions>
        </form>
      </Modal>
    </div>
  );
}

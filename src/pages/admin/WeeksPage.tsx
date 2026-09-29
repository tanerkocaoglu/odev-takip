import { useCallback, useEffect, useState, type FormEvent } from 'react';
import type { AcademicYear, Week } from '../../types';
import { adminApi, ApiClientError } from '../../services/api';
import {
  ActionError,
  Button,
  ConfirmDialog,
  CountChip,
  DataTable,
  Field,
  FormActions,
  FormError,
  Input,
  ListState,
  Modal,
  Select,
  Toolbar,
  type Column,
} from '../../components/ui';
import { formatDate } from '../../utils/date';

/**
 * Etiket önizlemesi: sunucunun `formatWeekLabel` çıktısının birebir karşılığı
 * (`gg.aa - gg.aa.yyyy`; hafta yıl değiştiriyorsa yıl iki tarafta yazılır).
 * Yalnızca girilen tarihlerin gösterimidir; tarih/gün hesabı yapmaz — kayıtlı
 * etiket her zaman sunucudan gelir.
 */
function previewWeekLabel(start: string, end: string): string | null {
  const s = start.slice(0, 10).split('-').map(Number);
  const e = end.slice(0, 10).split('-').map(Number);
  if (s.length !== 3 || e.length !== 3 || [...s, ...e].some((n) => Number.isNaN(n))) {
    return null;
  }
  const pad = (n: number) => String(n).padStart(2, '0');
  const startPart = `${pad(s[2])}.${pad(s[1])}`;
  const endPart = `${pad(e[2])}.${pad(e[1])}`;
  return s[0] !== e[0]
    ? `${startPart}.${s[0]} - ${endPart}.${e[0]}`
    : `${startPart} - ${endPart}.${e[0]}`;
}

export default function WeeksPage() {
  const [years, setYears] = useState<AcademicYear[]>([]);
  const [yearId, setYearId] = useState('');
  const [weeks, setWeeks] = useState<Week[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [deleteWeek, setDeleteWeek] = useState<Week | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [createFieldErrors, setCreateFieldErrors] = useState<Record<string, string>>({});

  const [formOpen, setFormOpen] = useState(false);
  const [weekNo, setWeekNo] = useState(1);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [editWeek, setEditWeek] = useState<Week | null>(null);
  const [editStart, setEditStart] = useState('');
  const [editEnd, setEditEnd] = useState('');
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [editFieldErrors, setEditFieldErrors] = useState<Record<string, string>>({});

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
    if (!yearId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await adminApi.weeks.list(yearId);
      setWeeks(data.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Haftalar yüklenemedi. Yeniden deneyin.');
    } finally {
      setLoading(false);
    }
  }, [yearId]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleCreate(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setFormError(null);
    setCreateFieldErrors({});
    try {
      await adminApi.weeks.create({
        academic_year_id: yearId,
        week_no: weekNo,
        start_date: startDate,
        end_date: endDate,
      });
      setFormOpen(false);
      setWeekNo(weeks.length + 1);
      setStartDate('');
      setEndDate('');
      await load();
    } catch (err) {
      if (err instanceof ApiClientError) {
        setFormError(err.message);
        setCreateFieldErrors(err.fields ?? {});
      } else {
        setFormError('Hafta kaydedilemedi.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete() {
    if (!deleteWeek) return;
    setDeleting(true);
    setActionError(null);
    try {
      await adminApi.weeks.remove(deleteWeek.id);
      setDeleteWeek(null);
      await load();
    } catch (err) {
      setDeleteWeek(null);
      setActionError(err instanceof ApiClientError ? err.message : 'Hafta silinemedi.');
    } finally {
      setDeleting(false);
    }
  }

  function openEdit(week: Week) {
    setEditWeek(week);
    setEditStart(week.start_date);
    setEditEnd(week.end_date);
    setEditError(null);
    setEditFieldErrors({});
  }

  async function handleEdit(event: FormEvent) {
    event.preventDefault();
    if (!editWeek) return;
    setEditSubmitting(true);
    setEditError(null);
    setEditFieldErrors({});
    try {
      await adminApi.weeks.patch(editWeek.id, {
        start_date: editStart,
        end_date: editEnd,
      });
      setEditWeek(null);
      await load();
    } catch (err) {
      if (err instanceof ApiClientError) {
        setEditError(err.message);
        setEditFieldErrors(err.fields ?? {});
      } else {
        setEditError('Hafta kaydedilemedi.');
      }
    } finally {
      setEditSubmitting(false);
    }
  }

  const editPreview = previewWeekLabel(editStart, editEnd);

  // Durum (geçmiş/şimdiki) sütunu yok: API hafta durumu döndürmez ve tarih/gün hesabı
  // frontend'de yapılmaz (bkz. PROGRESS.md 6b kararı).
  const columns: Column<Week>[] = [
    {
      key: 'no',
      header: 'Hafta',
      card: 'title',
      className: 'tabular',
      cell: (w) => <span className="tabular font-medium">Hafta {w.week_no}</span>,
    },
    {
      key: 'start',
      header: 'Başlangıç',
      className: 'tabular text-muted',
      cell: (w) => formatDate(w.start_date),
    },
    {
      key: 'end',
      header: 'Bitiş',
      className: 'tabular text-muted',
      cell: (w) => formatDate(w.end_date),
    },
    { key: 'label', header: 'Etiket', className: 'tabular text-muted', cell: (w) => w.label },
  ];

  return (
    <div className="space-y-4">
      <Toolbar
        filters={
          <>
            <Field label="Eğitim yılı" htmlFor="week-year">
              <Select
                id="week-year"
                value={yearId}
                onChange={(e) => setYearId(e.target.value)}
                className="max-w-xs"
              >
                {years.map((y) => (
                  <option key={y.id} value={y.id}>
                    {y.name}
                  </option>
                ))}
              </Select>
            </Field>
            {!loading && !error && (
              <p className="flex items-center gap-1.5 pb-2 text-[13px] text-muted">
                <CountChip value={weeks.length} /> hafta
              </p>
            )}
          </>
        }
        actions={
          <Button variant="primary" onClick={() => setFormOpen(true)} disabled={!yearId}>
            Yeni hafta
          </Button>
        }
      />

      <ActionError message={actionError} onDismiss={() => setActionError(null)} />

      <ListState
        loading={loading}
        error={error}
        onRetry={() => void load()}
        empty={weeks.length === 0}
        emptyMessage="Bu eğitim yılı için hafta tanımlanmamış."
        emptyAction={
          <Button variant="primary" onClick={() => setFormOpen(true)} disabled={!yearId}>
            Yeni hafta
          </Button>
        }
      >
        <DataTable
          rows={weeks}
          columns={columns}
          rowKey={(w) => w.id}
          rowLabel={(w) => `Hafta ${w.week_no}`}
          actions={(w) => [
            { label: 'Düzenle', onSelect: () => openEdit(w) },
            { label: 'Sil', danger: true, onSelect: () => setDeleteWeek(w) },
          ]}
        />
      </ListState>

      <ConfirmDialog
        open={deleteWeek !== null}
        title="Haftayı sil"
        confirmLabel="Haftayı sil"
        loading={deleting}
        onConfirm={() => void handleDelete()}
        onCancel={() => setDeleteWeek(null)}
      >
        Hafta {deleteWeek?.week_no} silinsin mi?
      </ConfirmDialog>

      <Modal open={formOpen} title="Yeni hafta" onClose={() => setFormOpen(false)}>
        <form onSubmit={handleCreate} className="space-y-4">
          <Field label="Hafta numarası" htmlFor="week-no" error={createFieldErrors.week_no}>
            <Input
              id="week-no"
              type="number"
              min={1}
              value={weekNo}
              onChange={(e) => setWeekNo(Number(e.target.value))}
              required
              className="tabular"
            />
          </Field>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Başlangıç" htmlFor="week-start" error={createFieldErrors.start_date}>
              <Input
                id="week-start"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                required
              />
            </Field>
            <Field label="Bitiş" htmlFor="week-end" error={createFieldErrors.end_date}>
              <Input
                id="week-end"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                required
              />
            </Field>
          </div>
          <p className="text-sm text-muted">
            Etiket, girilen tarihlerden otomatik oluşturulur (örn. 07.09 - 13.09.2026).
          </p>
          <FormError message={Object.keys(createFieldErrors).length === 0 ? formError : null} />
          <FormActions>
            <Button onClick={() => setFormOpen(false)}>İptal</Button>
            <Button variant="primary" type="submit" loading={submitting}>
              Haftayı ekle
            </Button>
          </FormActions>
        </form>
      </Modal>

      <Modal
        open={editWeek !== null}
        title={editWeek ? `Hafta ${editWeek.week_no} düzenle` : 'Haftayı düzenle'}
        onClose={() => setEditWeek(null)}
      >
        <form onSubmit={handleEdit} className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Başlangıç" htmlFor="edit-week-start" error={editFieldErrors.start_date}>
              <Input
                id="edit-week-start"
                type="date"
                value={editStart}
                onChange={(e) => {
                  setEditStart(e.target.value);
                  setEditError(null);
                  setEditFieldErrors({});
                }}
                required
              />
            </Field>
            <Field label="Bitiş" htmlFor="edit-week-end" error={editFieldErrors.end_date}>
              <Input
                id="edit-week-end"
                type="date"
                value={editEnd}
                onChange={(e) => {
                  setEditEnd(e.target.value);
                  setEditError(null);
                  setEditFieldErrors({});
                }}
                required
              />
            </Field>
          </div>
          <p className="text-sm text-muted">
            {editPreview ? (
              <>
                Etiket: <span className="tabular font-medium text-text">{editPreview}</span>
              </>
            ) : (
              'Etiket, girilen tarihlerden otomatik oluşturulur.'
            )}
          </p>
          <FormError message={Object.keys(editFieldErrors).length === 0 ? editError : null} />
          <FormActions>
            <Button onClick={() => setEditWeek(null)}>İptal</Button>
            <Button variant="primary" type="submit" loading={editSubmitting}>
              Haftayı kaydet
            </Button>
          </FormActions>
        </form>
      </Modal>
    </div>
  );
}

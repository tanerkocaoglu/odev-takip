import { useCallback, useEffect, useState, type FormEvent } from 'react';
import type { AcademicYear } from '../../types';
import { adminApi, ApiClientError } from '../../services/api';
import {
  ActionError,
  Badge,
  Button,
  DataTable,
  Field,
  FormActions,
  FormError,
  Input,
  ListState,
  Modal,
  PageHeader,
  type Column,
} from '../../components/ui';
import { formatDate } from '../../utils/date';

export default function AcademicYearsPage() {
  const [years, setYears] = useState<AcademicYear[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const [formOpen, setFormOpen] = useState(false);
  const [name, setName] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [isActive, setIsActive] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [editYear, setEditYear] = useState<AcademicYear | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await adminApi.academicYears.list();
      setYears(data.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Eğitim yılları yüklenemedi. Yeniden deneyin.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  /** Yeni yıl → POST; "Düzenle" → PATCH (yeni kayıt oluşturmaz; yalnızca değişen alanlar gider). */
  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setFormError(null);
    setFieldErrors({});
    try {
      if (editYear) {
        const patch: Parameters<typeof adminApi.academicYears.patch>[1] = {};
        if (name.trim() !== editYear.name) patch.name = name.trim();
        if (startDate !== editYear.start_date) patch.start_date = startDate;
        if (endDate !== editYear.end_date) patch.end_date = endDate;
        if (isActive !== (editYear.is_active === 1)) patch.is_active = isActive;
        await adminApi.academicYears.patch(editYear.id, patch);
      } else {
        await adminApi.academicYears.create({
          name: name.trim(),
          start_date: startDate,
          end_date: endDate,
          is_active: isActive,
        });
      }
      setFormOpen(false);
      setEditYear(null);
      setName('');
      setStartDate('');
      setEndDate('');
      setIsActive(false);
      await load();
    } catch (err) {
      if (err instanceof ApiClientError) {
        const fields = err.fields ?? {};
        setFieldErrors(fields);
        // Adla çakışma (409) yıl adı alanının altında; alan eşlemesi yoksa genel hata
        if (err.status === 409) setFieldErrors({ name: err.message });
        else if (Object.keys(fields).length === 0) setFormError(err.message);
      } else {
        setFormError('Eğitim yılı kaydedilemedi.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function toggleActive(year: AcademicYear) {
    setActionError(null);
    try {
      await adminApi.academicYears.patch(year.id, { is_active: true });
      await load();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Yıl aktif yapılamadı.');
    }
  }

  function openForm(year?: AcademicYear) {
    setEditYear(year ?? null);
    if (year) {
      setName(year.name);
      setStartDate(year.start_date);
      setEndDate(year.end_date);
      setIsActive(year.is_active === 1);
    } else {
      setName('');
      setStartDate('');
      setEndDate('');
      setIsActive(false);
    }
    setFormError(null);
    setFieldErrors({});
    setFormOpen(true);
  }

  const columns: Column<AcademicYear>[] = [
    {
      key: 'name',
      header: 'Yıl',
      card: 'title',
      cell: (y) => <span className="font-medium">{y.name}</span>,
    },
    {
      key: 'start',
      header: 'Başlangıç',
      className: 'tabular text-muted',
      cell: (y) => formatDate(y.start_date),
    },
    {
      key: 'end',
      header: 'Bitiş',
      className: 'tabular text-muted',
      cell: (y) => formatDate(y.end_date),
    },
    {
      key: 'status',
      header: 'Durum',
      cell: (y) =>
        y.is_active === 1 ? (
          <Badge tone="positive">Aktif</Badge>
        ) : (
          <Badge tone="neutral">Pasif</Badge>
        ),
    },
  ];

  return (
    <div className="space-y-4">
      <PageHeader
        description="Eğitim yılı tanımlayın; tek yıl aktif olabilir."
        title="Eğitim yılı"
        actions={
          <Button variant="primary" onClick={() => openForm()}>
            Yeni eğitim yılı
          </Button>
        }
      />

      <ActionError message={actionError} onDismiss={() => setActionError(null)} />

      <ListState
        loading={loading}
        error={error}
        onRetry={() => void load()}
        empty={years.length === 0}
        emptyMessage="Henüz eğitim yılı tanımlanmamış."
        emptyAction={
          <Button variant="primary" onClick={() => openForm()}>
            Yeni eğitim yılı
          </Button>
        }
      >
        <DataTable
          rows={years}
          columns={columns}
          rowKey={(y) => y.id}
          rowLabel={(y) => y.name}
          actions={(y) => [
            ...(y.is_active === 1
              ? []
              : [{ label: 'Aktif yap', onSelect: () => void toggleActive(y) }]),
            { label: 'Düzenle', onSelect: () => openForm(y) },
          ]}
        />
      </ListState>

      <Modal
        open={formOpen}
        title={editYear ? 'Eğitim yılını düzenle' : 'Yeni eğitim yılı'}
        onClose={() => setFormOpen(false)}
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <Field label="Yıl adı" htmlFor="year-name" error={fieldErrors.name}>
            <Input
              id="year-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              placeholder="2026-2027"
            />
          </Field>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Başlangıç" htmlFor="year-start" error={fieldErrors.start_date}>
              <Input
                id="year-start"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                required
              />
            </Field>
            <Field label="Bitiş" htmlFor="year-end" error={fieldErrors.end_date}>
              <Input
                id="year-end"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                required
              />
            </Field>
          </div>
          <label className="flex min-h-9 items-center gap-2 text-sm text-text max-md:min-h-11">
            <input
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              className="h-4 w-4 accent-accent"
            />
            Bu yılı aktif yap
          </label>
          <FormError message={formError} />
          <FormActions>
            <Button onClick={() => setFormOpen(false)}>İptal</Button>
            <Button variant="primary" type="submit" loading={submitting}>
              {editYear ? 'Eğitim yılını kaydet' : 'Eğitim yılını ekle'}
            </Button>
          </FormActions>
        </form>
      </Modal>
    </div>
  );
}

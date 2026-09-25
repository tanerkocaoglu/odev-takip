import { useCallback, useEffect, useState, type FormEvent } from 'react';
import type { AcademicYear, Week } from '../../types';
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
  inputClass,
} from '../../components/admin/ui';

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
      setError(err instanceof Error ? err.message : 'Bir hata oluştu.');
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
      setFormError(err instanceof ApiClientError ? err.message : 'Bir hata oluştu.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(week: Week) {
    if (!window.confirm(`Hafta ${week.week_no} silinsin mi?`)) return;
    try {
      await adminApi.weeks.remove(week.id);
      await load();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Bir hata oluştu.');
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
        setEditError('Bir hata oluştu.');
      }
    } finally {
      setEditSubmitting(false);
    }
  }

  const editPreview = previewWeekLabel(editStart, editEnd);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Field label="Eğitim yılı" htmlFor="week-year">
          <select
            id="week-year"
            value={yearId}
            onChange={(e) => setYearId(e.target.value)}
            className={inputClass + ' max-w-xs'}
          >
            {years.map((y) => (
              <option key={y.id} value={y.id}>
                {y.name}
              </option>
            ))}
          </select>
        </Field>
        <PrimaryButton onClick={() => setFormOpen(true)} disabled={!yearId}>
          Yeni hafta
        </PrimaryButton>
      </div>

      {error && <FormError message={error} />}
      {loading ? (
        <LoadingState />
      ) : weeks.length === 0 ? (
        <EmptyState message="Bu eğitim yılı için hafta tanımlanmamış." />
      ) : (
        <div className="overflow-hidden rounded-md border border-border bg-surface">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-bg text-left text-xs font-medium text-muted">
              <tr>
                <th className="px-3 py-2">Hafta</th>
                <th className="px-3 py-2">Başlangıç</th>
                <th className="px-3 py-2">Bitiş</th>
                <th className="px-3 py-2">Etiket</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {weeks.map((week) => (
                <tr key={week.id} className="border-b border-border last:border-0">
                  <td className="tabular px-3 py-2 font-medium text-text">{week.week_no}</td>
                  <td className="tabular px-3 py-2 text-muted">{week.start_date}</td>
                  <td className="tabular px-3 py-2 text-muted">{week.end_date}</td>
                  <td className="px-3 py-2 text-muted">{week.label}</td>
                  <td className="px-3 py-2 text-right">
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => openEdit(week)}
                        className="rounded-md border border-border px-3 py-1.5 text-sm font-medium text-text transition-colors hover:bg-bg"
                      >
                        Düzenle
                      </button>
                      <DangerButton onClick={() => handleDelete(week)}>Sil</DangerButton>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={formOpen} title="Yeni hafta" onClose={() => setFormOpen(false)}>
        <form onSubmit={handleCreate} className="space-y-4">
          <Field label="Hafta numarası" htmlFor="week-no">
            <input
              id="week-no"
              type="number"
              min={1}
              value={weekNo}
              onChange={(e) => setWeekNo(Number(e.target.value))}
              required
              className={inputClass}
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Başlangıç" htmlFor="week-start">
              <input
                id="week-start"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                required
                className={inputClass}
              />
            </Field>
            <Field label="Bitiş" htmlFor="week-end">
              <input
                id="week-end"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                required
                className={inputClass}
              />
            </Field>
          </div>
          <p className="text-sm text-muted">
            Etiket, girilen tarihlerden otomatik oluşturulur (örn. 07.09 - 13.09.2026).
          </p>
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
        open={editWeek !== null}
        title={editWeek ? `Hafta ${editWeek.week_no} düzenle` : 'Haftayı düzenle'}
        onClose={() => setEditWeek(null)}
      >
        <form onSubmit={handleEdit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Başlangıç" htmlFor="edit-week-start" error={editFieldErrors.start_date}>
              <input
                id="edit-week-start"
                type="date"
                value={editStart}
                onChange={(e) => {
                  setEditStart(e.target.value);
                  setEditError(null);
                  setEditFieldErrors({});
                }}
                required
                className={inputClass}
              />
            </Field>
            <Field label="Bitiş" htmlFor="edit-week-end" error={editFieldErrors.end_date}>
              <input
                id="edit-week-end"
                type="date"
                value={editEnd}
                onChange={(e) => {
                  setEditEnd(e.target.value);
                  setEditError(null);
                  setEditFieldErrors({});
                }}
                required
                className={inputClass}
              />
            </Field>
          </div>
          <p className="text-sm text-muted">
            {editPreview ? (
              <>
                Etiket: <span className="font-medium text-text">{editPreview}</span>
              </>
            ) : (
              'Etiket, girilen tarihlerden otomatik oluşturulur.'
            )}
          </p>
          <FormError message={Object.keys(editFieldErrors).length === 0 ? editError : null} />
          <div className="flex justify-end gap-2">
            <SecondaryButton onClick={() => setEditWeek(null)}>İptal</SecondaryButton>
            <PrimaryButton type="submit" disabled={editSubmitting}>
              {editSubmitting ? 'Kaydediliyor…' : 'Kaydet'}
            </PrimaryButton>
          </div>
        </form>
      </Modal>
    </div>
  );
}

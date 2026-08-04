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
  const [label, setLabel] = useState('');
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
        label: label.trim(),
      });
      setFormOpen(false);
      setWeekNo(weeks.length + 1);
      setStartDate('');
      setEndDate('');
      setLabel('');
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
                    <DangerButton onClick={() => handleDelete(week)}>Sil</DangerButton>
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
          <Field label="Etiket" htmlFor="week-label">
            <input
              id="week-label"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              required
              className={inputClass}
              placeholder="01 - 07 Eylül"
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

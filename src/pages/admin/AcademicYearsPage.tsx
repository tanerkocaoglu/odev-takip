import { useCallback, useEffect, useState, type FormEvent } from 'react';
import type { AcademicYear } from '../../types';
import { adminApi } from '../../services/api';
import { ApiClientError } from '../../services/api';
import Modal from '../../components/admin/Modal';
import {
  Badge,
  EmptyState,
  Field,
  FormError,
  LoadingState,
  PrimaryButton,
  SecondaryButton,
  inputClass,
} from '../../components/admin/ui';

export default function AcademicYearsPage() {
  const [years, setYears] = useState<AcademicYear[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [formOpen, setFormOpen] = useState(false);
  const [name, setName] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [isActive, setIsActive] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await adminApi.academicYears.list();
      setYears(data.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Bir hata oluştu.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleCreate(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setFormError(null);
    try {
      await adminApi.academicYears.create({
        name: name.trim(),
        start_date: startDate,
        end_date: endDate,
        is_active: isActive,
      });
      setFormOpen(false);
      setName('');
      setStartDate('');
      setEndDate('');
      setIsActive(false);
      await load();
    } catch (err) {
      setFormError(err instanceof ApiClientError ? err.message : 'Bir hata oluştu.');
    } finally {
      setSubmitting(false);
    }
  }

  async function toggleActive(year: AcademicYear) {
    try {
      await adminApi.academicYears.patch(year.id, { is_active: true });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Bir hata oluştu.');
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted">
          Eğitim yılı tanımlayın; tek yıl aktif olabilir.
        </p>
        <PrimaryButton onClick={() => setFormOpen(true)}>Yeni eğitim yılı</PrimaryButton>
      </div>

      {error && <FormError message={error} />}
      {loading ? (
        <LoadingState />
      ) : years.length === 0 ? (
        <EmptyState message="Henüz eğitim yılı tanımlanmamış." />
      ) : (
        <div className="overflow-hidden rounded-md border border-border bg-surface">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-bg text-left text-xs font-medium text-muted">
              <tr>
                <th className="px-3 py-2">Yıl</th>
                <th className="px-3 py-2">Başlangıç</th>
                <th className="px-3 py-2">Bitiş</th>
                <th className="px-3 py-2">Durum</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {years.map((year) => (
                <tr key={year.id} className="border-b border-border last:border-0">
                  <td className="px-3 py-2 font-medium text-text">{year.name}</td>
                  <td className="tabular px-3 py-2 text-muted">{year.start_date}</td>
                  <td className="tabular px-3 py-2 text-muted">{year.end_date}</td>
                  <td className="px-3 py-2">
                    {year.is_active === 1 ? (
                      <Badge tone="positive">Aktif</Badge>
                    ) : (
                      <button
                        type="button"
                        onClick={() => toggleActive(year)}
                        className="text-sm font-medium text-accent underline-offset-2 hover:underline"
                      >
                        Aktif yap
                      </button>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <button
                      type="button"
                      onClick={() => {
                        setName(year.name);
                        setStartDate(year.start_date);
                        setEndDate(year.end_date);
                        setIsActive(year.is_active === 1);
                        setFormOpen(true);
                      }}
                      className="text-sm font-medium text-muted hover:text-text"
                    >
                      Düzenle
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal
        open={formOpen}
        title="Eğitim yılı"
        onClose={() => setFormOpen(false)}
      >
        <form onSubmit={handleCreate} className="space-y-4">
          <Field label="Yıl adı" htmlFor="year-name">
            <input
              id="year-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className={inputClass}
              placeholder="2026-2027"
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Başlangıç" htmlFor="year-start">
              <input
                id="year-start"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                required
                className={inputClass}
              />
            </Field>
            <Field label="Bitiş" htmlFor="year-end">
              <input
                id="year-end"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                required
                className={inputClass}
              />
            </Field>
          </div>
          <label className="flex items-center gap-2 text-sm text-text">
            <input
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              className="h-4 w-4 accent-accent"
            />
            Bu yılı aktif yap
          </label>
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

import { useState, type FormEvent } from 'react';
import type { Teacher } from '../../types';
import { adminApi, ApiClientError } from '../../services/api';
import { useList } from '../../hooks/useList';
import Modal from '../../components/admin/Modal';
import Pagination from '../../components/admin/Pagination';
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

export default function TeachersPage() {
  const { items, total, page, pageSize, loading, error, setError, setQ, setPage, reload } =
    useList<Teacher>((params) => adminApi.teachers.list(params));

  const [formOpen, setFormOpen] = useState(false);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [resetId, setResetId] = useState<string | null>(null);
  const [resetPassword, setResetPassword] = useState('');
  const [resetSubmitting, setResetSubmitting] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);

  function openCreate() {
    setFullName('');
    setEmail('');
    setPassword('');
    setFormError(null);
    setFormOpen(true);
  }

  async function handleCreate(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setFormError(null);
    try {
      await adminApi.teachers.create({
        full_name: fullName.trim(),
        email: email.trim(),
        password,
      });
      setFormOpen(false);
      await reload();
    } catch (err) {
      setFormError(err instanceof ApiClientError ? err.message : 'Bir hata oluştu.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleReset(event: FormEvent) {
    event.preventDefault();
    if (!resetId) return;
    setResetSubmitting(true);
    setResetError(null);
    try {
      await adminApi.teachers.resetPassword(resetId, resetPassword);
      setResetId(null);
      setResetPassword('');
    } catch (err) {
      setResetError(err instanceof ApiClientError ? err.message : 'Bir hata oluştu.');
    } finally {
      setResetSubmitting(false);
    }
  }

  async function handleDelete(teacher: Teacher) {
    if (!window.confirm(`${teacher.full_name} silinsin mi?`)) return;
    try {
      await adminApi.teachers.remove(teacher.id);
      await reload();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Bir hata oluştu.');
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <SearchBox value={''} onChange={(v) => { setQ(v); }} placeholder="Öğretmen ara…" />
        <PrimaryButton onClick={openCreate}>Yeni öğretmen</PrimaryButton>
      </div>

      {error && <FormError message={error} />}
      {loading ? (
        <LoadingState />
      ) : items.length === 0 ? (
        <EmptyState message="Öğretmen bulunamadı." />
      ) : (
        <div className="overflow-hidden rounded-md border border-border bg-surface">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-bg text-left text-xs font-medium text-muted">
              <tr>
                <th className="px-3 py-2">Ad</th>
                <th className="px-3 py-2">E-posta</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {items.map((teacher) => (
                <tr key={teacher.id} className="border-b border-border last:border-0">
                  <td className="px-3 py-2 font-medium text-text">{teacher.full_name}</td>
                  <td className="px-3 py-2 text-muted">{teacher.email}</td>
                  <td className="px-3 py-2 text-right">
                    <button
                      type="button"
                      onClick={() => {
                        setResetId(teacher.id);
                        setResetPassword('');
                        setResetError(null);
                      }}
                      className="mr-3 text-sm font-medium text-muted hover:text-text"
                    >
                      Şifre sıfırla
                    </button>
                    <DangerButton onClick={() => handleDelete(teacher)}>Sil</DangerButton>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pagination page={page} pageSize={pageSize} total={total} onChange={setPage} />

      <Modal open={formOpen} title="Yeni öğretmen" onClose={() => setFormOpen(false)}>
        <form onSubmit={handleCreate} className="space-y-4">
          <Field label="Ad soyad" htmlFor="t-name">
            <input
              id="t-name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              required
              className={inputClass}
            />
          </Field>
          <Field label="E-posta" htmlFor="t-email">
            <input
              id="t-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className={inputClass}
            />
          </Field>
          <Field label="Şifre (öğretmene iletin)" htmlFor="t-password">
            <input
              id="t-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              className={inputClass}
            />
          </Field>
          <FormError message={formError} />
          <div className="flex justify-end gap-2">
            <SecondaryButton onClick={() => setFormOpen(false)}>İptal</SecondaryButton>
            <PrimaryButton type="submit" disabled={submitting}>
              {submitting ? 'Oluşturuluyor…' : 'Öğretmen oluştur'}
            </PrimaryButton>
          </div>
        </form>
      </Modal>

      <Modal
        open={resetId !== null}
        title="Şifre sıfırla"
        onClose={() => setResetId(null)}
      >
        <form onSubmit={handleReset} className="space-y-4">
          <Field label="Yeni şifre (öğretmene iletin)" htmlFor="t-reset">
            <input
              id="t-reset"
              type="password"
              value={resetPassword}
              onChange={(e) => setResetPassword(e.target.value)}
              required
              minLength={6}
              className={inputClass}
            />
          </Field>
          <FormError message={resetError} />
          <div className="flex justify-end gap-2">
            <SecondaryButton onClick={() => setResetId(null)}>İptal</SecondaryButton>
            <PrimaryButton type="submit" disabled={resetSubmitting}>
              {resetSubmitting ? 'Sıfırlanıyor…' : 'Şifreyi sıfırla'}
            </PrimaryButton>
          </div>
        </form>
      </Modal>
    </div>
  );
}

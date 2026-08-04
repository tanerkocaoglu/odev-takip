import { useCallback, useEffect, useState, type FormEvent } from 'react';
import type { ClassItem, Guardian, Student, Week } from '../../types';
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

export default function StudentsPage() {
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [classFilter, setClassFilter] = useState('');

  const { items, total, page, pageSize, loading, error, setError, setQ, setPage, reload } =
    useList<Student>((params) =>
      adminApi.students.list({ ...params, classId: classFilter || undefined }),
    );

  const [formOpen, setFormOpen] = useState(false);
  const [fullName, setFullName] = useState('');
  const [password, setPassword] = useState('');
  const [guardianId, setGuardianId] = useState('');
  const [classId, setClassId] = useState('');
  const [guardianQuery, setGuardianQuery] = useState('');
  const [guardianResults, setGuardianResults] = useState<Guardian[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [moveStudent, setMoveStudent] = useState<Student | null>(null);
  const [moveClassId, setMoveClassId] = useState('');
  const [moveWeekId, setMoveWeekId] = useState('');
  const [weeks, setWeeks] = useState<Week[]>([]);
  const [moveSubmitting, setMoveSubmitting] = useState(false);
  const [moveError, setMoveError] = useState<string | null>(null);

  const [resetStudent, setResetStudent] = useState<Student | null>(null);
  const [resetPassword, setResetPassword] = useState('');
  const [resetSubmitting, setResetSubmitting] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);

  useEffect(() => {
    adminApi.academicYears.list().then(async (yearData) => {
      const active = yearData.items.find((y) => y.is_active === 1);
      const yearId = active?.id ?? yearData.items[0]?.id ?? '';
      if (!yearId) return;
      const [classData, weekData] = await Promise.all([
        adminApi.classes.list({ academicYearId: yearId }),
        adminApi.weeks.list(yearId),
      ]);
      setClasses(classData.items);
      setWeeks(weekData.items);
      setClassId((prev) => prev || classData.items[0]?.id || '');
    });
  }, []);

  const searchGuardians = useCallback(async (q: string) => {
    const data = await adminApi.guardians.list({ q, pageSize: 10 });
    setGuardianResults(data.items);
  }, []);

  useEffect(() => {
    searchGuardians(guardianQuery);
  }, [guardianQuery, searchGuardians]);

  useEffect(() => {
    reload(1, '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classFilter]);

  function openCreate() {
    setFullName('');
    setPassword('');
    setGuardianId('');
    setGuardianQuery('');
    setGuardianResults([]);
    setFormError(null);
    setFormOpen(true);
  }

  async function handleCreate(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setFormError(null);
    try {
      await adminApi.students.create({
        full_name: fullName.trim(),
        guardian_id: guardianId,
        class_id: classId,
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

  function openMove(student: Student) {
    setMoveStudent(student);
    setMoveClassId('');
    setMoveWeekId(weeks[0]?.id ?? '');
    setMoveError(null);
  }

  async function handleMove(event: FormEvent) {
    event.preventDefault();
    if (!moveStudent) return;
    setMoveSubmitting(true);
    setMoveError(null);
    try {
      await adminApi.students.changeClass(moveStudent.id, {
        class_id: moveClassId,
        week_id: moveWeekId,
      });
      setMoveStudent(null);
      await reload();
    } catch (err) {
      setMoveError(err instanceof ApiClientError ? err.message : 'Bir hata oluştu.');
    } finally {
      setMoveSubmitting(false);
    }
  }

  async function handleReset(event: FormEvent) {
    event.preventDefault();
    if (!resetStudent) return;
    setResetSubmitting(true);
    setResetError(null);
    try {
      await adminApi.students.resetPassword(resetStudent.id, resetPassword);
      setResetStudent(null);
      setResetPassword('');
    } catch (err) {
      setResetError(err instanceof ApiClientError ? err.message : 'Bir hata oluştu.');
    } finally {
      setResetSubmitting(false);
    }
  }

  async function handleDelete(student: Student) {
    if (!window.confirm(`${student.full_name} silinsin mi?`)) return;
    try {
      await adminApi.students.remove(student.id);
      await reload();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Bir hata oluştu.');
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap items-end gap-3">
          <SearchBox value={''} onChange={(v) => setQ(v)} placeholder="Öğrenci veya veli ara…" />
          <Field label="Sınıf" htmlFor="st-class-filter">
            <select
              id="st-class-filter"
              value={classFilter}
              onChange={(e) => setClassFilter(e.target.value)}
              className={inputClass}
            >
              <option value="">Tümü</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <PrimaryButton onClick={openCreate} disabled={!classes.length}>
          Yeni öğrenci
        </PrimaryButton>
      </div>

      {error && <FormError message={error} />}
      {loading ? (
        <LoadingState />
      ) : items.length === 0 ? (
        <EmptyState message="Öğrenci bulunamadı." />
      ) : (
        <div className="overflow-hidden rounded-md border border-border bg-surface">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-bg text-left text-xs font-medium text-muted">
              <tr>
                <th className="px-3 py-2">Ad</th>
                <th className="px-3 py-2">Veli</th>
                <th className="px-3 py-2">Sınıf</th>
                <th className="px-3 py-2">Kullanıcı adı</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {items.map((student) => (
                <tr key={student.id} className="border-b border-border last:border-0">
                  <td className="px-3 py-2 font-medium text-text">{student.full_name}</td>
                  <td className="px-3 py-2 text-muted">{student.guardian_name ?? '—'}</td>
                  <td className="px-3 py-2 text-muted">{student.class_name}</td>
                  <td className="tabular px-3 py-2 text-muted">{student.username}</td>
                  <td className="px-3 py-2 text-right">
                    <button
                      type="button"
                      onClick={() => {
                        setResetStudent(student);
                        setResetPassword('');
                        setResetError(null);
                      }}
                      className="mr-3 text-sm font-medium text-muted hover:text-text"
                    >
                      Şifre sıfırla
                    </button>
                    <button
                      type="button"
                      onClick={() => openMove(student)}
                      className="mr-3 text-sm font-medium text-muted hover:text-text"
                    >
                      Sınıf değiştir
                    </button>
                    <DangerButton onClick={() => handleDelete(student)}>Sil</DangerButton>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pagination page={page} pageSize={pageSize} total={total} onChange={setPage} />

      <Modal open={formOpen} title="Yeni öğrenci" onClose={() => setFormOpen(false)}>
        <form onSubmit={handleCreate} className="space-y-4">
          <Field label="Ad soyad" htmlFor="st-name">
            <input
              id="st-name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              required
              className={inputClass}
            />
          </Field>
          <Field label="Veli (arayın ve seçin)" htmlFor="st-guardian-search">
            <input
              id="st-guardian-search"
              value={guardianQuery}
              onChange={(e) => setGuardianQuery(e.target.value)}
              className={inputClass}
              placeholder="Veli adı yazın…"
            />
          </Field>
          <div className="max-h-40 overflow-y-auto rounded-md border border-border">
            {guardianResults.length === 0 ? (
              <p className="p-3 text-sm text-muted">Veli bulunamadı.</p>
            ) : (
              guardianResults.map((g) => (
                <button
                  key={g.id}
                  type="button"
                  onClick={() => setGuardianId(g.id)}
                  className={
                    'block w-full px-3 py-2 text-left text-sm transition-colors ' +
                    (guardianId === g.id
                      ? 'bg-accent/10 font-medium text-accent'
                      : 'text-text hover:bg-bg')
                  }
                >
                  {g.full_name} · {g.username}
                </button>
              ))
            )}
          </div>
          <Field label="Sınıf" htmlFor="st-class">
            <select
              id="st-class"
              value={classId}
              onChange={(e) => setClassId(e.target.value)}
              required
              className={inputClass}
            >
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Başlangıç şifresi (öğrenciye iletin)" htmlFor="st-password">
            <input
              id="st-password"
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
            <PrimaryButton type="submit" disabled={submitting || !guardianId}>
              {submitting ? 'Oluşturuluyor…' : 'Öğrenci oluştur'}
            </PrimaryButton>
          </div>
        </form>
      </Modal>

      <Modal
        open={moveStudent !== null}
        title={`${moveStudent?.full_name ?? ''} — sınıf değiştir`}
        onClose={() => setMoveStudent(null)}
      >
        <form onSubmit={handleMove} className="space-y-4">
          <p className="text-sm text-muted">
            Geçiş haftasını seçin: yeni sınıf, seçilen haftanın başında başlar;
            önceki sınıf kaydı önceki haftanın sonunda kapanır.
          </p>
          <Field label="Yeni sınıf" htmlFor="mv-class">
            <select
              id="mv-class"
              value={moveClassId}
              onChange={(e) => setMoveClassId(e.target.value)}
              required
              className={inputClass}
            >
              <option value="">Seçin…</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Geçiş haftası" htmlFor="mv-week">
            <select
              id="mv-week"
              value={moveWeekId}
              onChange={(e) => setMoveWeekId(e.target.value)}
              required
              className={inputClass}
            >
              {weeks.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.label}
                </option>
              ))}
            </select>
          </Field>
          <FormError message={moveError} />
          <div className="flex justify-end gap-2">
            <SecondaryButton onClick={() => setMoveStudent(null)}>İptal</SecondaryButton>
            <PrimaryButton type="submit" disabled={moveSubmitting || !moveClassId}>
              {moveSubmitting ? 'Taşınıyor…' : 'Sınıfı değiştir'}
            </PrimaryButton>
          </div>
        </form>
      </Modal>

      <Modal
        open={resetStudent !== null}
        title={`${resetStudent?.full_name ?? ''} — şifre sıfırla`}
        onClose={() => setResetStudent(null)}
      >
        <form onSubmit={handleReset} className="space-y-4">
          <p className="text-sm text-muted">
            Kullanıcı adı: {resetStudent?.username}. Eski oturumlar bu işlemle
            sona erer.
          </p>
          <Field label="Yeni şifre (öğrenciye iletin)" htmlFor="st-reset">
            <input
              id="st-reset"
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
            <SecondaryButton onClick={() => setResetStudent(null)}>İptal</SecondaryButton>
            <PrimaryButton type="submit" disabled={resetSubmitting}>
              {resetSubmitting ? 'Sıfırlanıyor…' : 'Şifreyi sıfırla'}
            </PrimaryButton>
          </div>
        </form>
      </Modal>
    </div>
  );
}

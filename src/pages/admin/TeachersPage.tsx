import { useEffect, useState, type FormEvent } from 'react';
import type { Teacher } from '../../types';
import { adminApi, ApiClientError } from '../../services/api';
import { useList } from '../../hooks/useList';
import { Link } from 'react-router-dom';
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
  Pagination,
  SearchBox,
  Select,
  Toolbar,
  buttonClass,
  type Column,
} from '../../components/ui';

const COLUMNS: Column<Teacher>[] = [
  {
    key: 'name',
    header: 'Ad',
    card: 'title',
    cell: (t) => <span className="font-medium">{t.full_name}</span>,
  },
  { key: 'email', header: 'E-posta', className: 'text-muted', cell: (t) => t.email },
];

export default function TeachersPage() {
  const { items, total, page, pageSize, loading, error, q, setQ, setPage, reload } =
    useList<Teacher>((params) => adminApi.teachers.list(params));

  const [deleteTeacher, setDeleteTeacher] = useState<Teacher | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [blockedTeacher, setBlockedTeacher] = useState<Teacher | null>(null);

  const [allTeachers, setAllTeachers] = useState<Teacher[]>([]);

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

  // Atamaları devretme — hedef dropdown + kaynağın atama sayısı.
  const [transferTeacher, setTransferTeacher] = useState<Teacher | null>(null);
  const [transferCount, setTransferCount] = useState(0);
  const [targetTeacherId, setTargetTeacherId] = useState('');
  const [transferSubmitting, setTransferSubmitting] = useState(false);
  const [transferError, setTransferError] = useState<string | null>(null);
  const [transferConfirmOpen, setTransferConfirmOpen] = useState(false);

  useEffect(() => {
    adminApi.teachers
      .list({ pageSize: 100 })
      .then((res) => setAllTeachers(res.items))
      .catch(() => {
        // Hedef listesi yüklenemezse devir modali boş kalır.
      });
  }, []);

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

  async function handleDelete() {
    if (!deleteTeacher) return;
    setDeleting(true);
    setActionError(null);
    try {
      await adminApi.teachers.remove(deleteTeacher.id);
      setDeleteTeacher(null);
      setBlockedTeacher(null);
      await reload();
    } catch (err) {
      // 409: aktif atama var → çıkış yolu (devret / Atamalar) sunulur; liste yerinde kalır.
      setBlockedTeacher(err instanceof ApiClientError && err.status === 409 ? deleteTeacher : null);
      setDeleteTeacher(null);
      setActionError(err instanceof ApiClientError ? err.message : 'Öğretmen silinemedi.');
    } finally {
      setDeleting(false);
    }
  }

  async function openTransfer(teacher: Teacher) {
    setTransferTeacher(teacher);
    setTargetTeacherId('');
    setTransferError(null);
    setTransferCount(0);
    try {
      const cc = await adminApi.classCourses.list();
      setTransferCount(cc.items.filter((x) => x.teacher_id === teacher.id).length);
    } catch {
      setTransferError('Atama sayısı yüklenemedi.');
    }
  }

  /** Form gönderimi devri yapmaz: önce kim kimin yerine geçiyor + kaç atama özeti onaylanır. */
  function requestTransfer(event: FormEvent) {
    event.preventDefault();
    if (!transferTeacher || !targetTeacherId) return;
    setTransferError(null);
    setTransferConfirmOpen(true);
  }

  async function handleTransfer() {
    if (!transferTeacher) return;
    setTransferSubmitting(true);
    setTransferError(null);
    try {
      await adminApi.teachers.transferAssignments(transferTeacher.id, targetTeacherId);
      setTransferConfirmOpen(false);
      setTransferTeacher(null);
      setTargetTeacherId('');
      await reload();
    } catch (err) {
      // Hata, devir formunda gösterilir (onay diyaloğu kapanır; seçim korunur).
      setTransferConfirmOpen(false);
      setTransferError(err instanceof ApiClientError ? err.message : 'Devir yapılamadı.');
    } finally {
      setTransferSubmitting(false);
    }
  }

  const transferTarget = allTeachers.find((t) => t.id === targetTeacherId);

  return (
    <div className="space-y-4">
      <Toolbar
        filters={
          <>
            <SearchBox value={q} onChange={setQ} placeholder="Öğretmen ara…" label="Öğretmen ara" />
            {!loading && !error && (
              <p className="flex items-center gap-1.5 pb-2 text-[13px] text-muted">
                <CountChip value={total} /> öğretmen
              </p>
            )}
          </>
        }
        actions={
          <Button variant="primary" onClick={openCreate}>
            Yeni öğretmen
          </Button>
        }
      />

      <ActionError
        message={actionError}
        onDismiss={() => {
          setActionError(null);
          setBlockedTeacher(null);
        }}
      >
        {blockedTeacher && (
          <>
            <Button
              size="sm"
              onClick={() => {
                const t = blockedTeacher;
                setActionError(null);
                setBlockedTeacher(null);
                void openTransfer(t);
              }}
            >
              Atamaları devret
            </Button>
            <Link to="/admin/class-courses" className={buttonClass('secondary', 'sm')}>
              Atamalara git
            </Link>
          </>
        )}
      </ActionError>

      <ListState
        loading={loading}
        error={error}
        onRetry={() => void reload()}
        empty={items.length === 0}
        emptyMessage="Öğretmen bulunamadı."
      >
        <DataTable
          rows={items}
          columns={COLUMNS}
          rowKey={(t) => t.id}
          rowLabel={(t) => t.full_name}
          actions={(t) => [
            { label: 'Atamaları devret', onSelect: () => void openTransfer(t) },
            {
              label: 'Şifre sıfırla',
              onSelect: () => {
                setResetId(t.id);
                setResetPassword('');
                setResetError(null);
              },
            },
            { label: 'Sil', danger: true, onSelect: () => setDeleteTeacher(t) },
          ]}
        />
      </ListState>
      <Pagination page={page} pageSize={pageSize} total={total} onChange={setPage} />

      <ConfirmDialog
        open={deleteTeacher !== null}
        title="Öğretmeni sil"
        confirmLabel="Öğretmeni sil"
        loading={deleting}
        onConfirm={() => void handleDelete()}
        onCancel={() => setDeleteTeacher(null)}
      >
        {deleteTeacher?.full_name} silinsin mi? Aktif ataması olan öğretmen silinemez; önce
        atamaları devredin.
      </ConfirmDialog>

      <Modal open={formOpen} title="Yeni öğretmen" onClose={() => setFormOpen(false)}>
        <form onSubmit={handleCreate} className="space-y-4">
          <Field label="Ad soyad" htmlFor="t-name">
            <Input
              id="t-name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              required
            />
          </Field>
          <Field label="E-posta" htmlFor="t-email">
            <Input
              id="t-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </Field>
          <Field label="Şifre (öğretmene iletin)" htmlFor="t-password">
            <Input
              id="t-password"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
            />
          </Field>
          <FormError message={formError} />
          <FormActions>
            <Button onClick={() => setFormOpen(false)}>İptal</Button>
            <Button variant="primary" type="submit" disabled={submitting}>
              {submitting ? 'Oluşturuluyor…' : 'Öğretmen oluştur'}
            </Button>
          </FormActions>
        </form>
      </Modal>

      <Modal
        open={transferTeacher !== null && !transferConfirmOpen}
        title={`${transferTeacher?.full_name ?? ''} — atamaları devret`}
        onClose={() => setTransferTeacher(null)}
      >
        <form onSubmit={requestTransfer} className="space-y-4">
          <p className="text-sm text-muted">
            {transferCount > 0 ? (
              <>
                <span className="tabular font-medium text-text">{transferCount}</span> atama
                aşağıdaki öğretmene devredilecek. Devir sonrası bu öğretmenin ataması kalmayacağı
                için silinebilir.
              </>
            ) : (
              'Bu öğretmenin devredilecek ataması yok.'
            )}
          </p>
          <Field label="Hedef öğretmen" htmlFor="t-transfer-target">
            <Select
              id="t-transfer-target"
              value={targetTeacherId}
              onChange={(e) => setTargetTeacherId(e.target.value)}
              required
              disabled={transferCount === 0}
            >
              <option value="">Seçin…</option>
              {allTeachers
                .filter((t) => t.id !== transferTeacher?.id)
                .map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.full_name}
                  </option>
                ))}
            </Select>
          </Field>
          <FormError message={transferError} />
          <FormActions>
            <Button onClick={() => setTransferTeacher(null)}>İptal</Button>
            <Button
              variant="primary"
              type="submit"
              disabled={transferSubmitting || transferCount === 0}
            >
              {transferSubmitting ? 'Devrediliyor…' : 'Atamaları devret'}
            </Button>
          </FormActions>
        </form>
      </Modal>

      <ConfirmDialog
        open={transferConfirmOpen && !!transferTeacher && !!transferTarget}
        title="Atamaları devret"
        confirmLabel="Atamaları devret"
        danger={false}
        loading={transferSubmitting}
        onConfirm={() => void handleTransfer()}
        onCancel={() => setTransferConfirmOpen(false)}
      >
        <div className="space-y-2">
          <p>
            <strong className="text-text">{transferTeacher?.full_name}</strong> öğretmeninin tüm
            atamaları <strong className="text-text">{transferTarget?.full_name}</strong> öğretmenine
            geçecek.
          </p>
          <p>
            Etkilenen atama: <span className="tabular font-medium text-text">{transferCount}</span>.
            Devir tek işlemde yapılır; başarısız olursa hiçbir atama değişmez. Sonrasında{' '}
            {transferTeacher?.full_name} öğretmeninin ataması kalmaz.
          </p>
        </div>
      </ConfirmDialog>

      <Modal open={resetId !== null} title="Şifre sıfırla" onClose={() => setResetId(null)}>
        <form onSubmit={handleReset} className="space-y-4">
          <Field label="Yeni şifre (öğretmene iletin)" htmlFor="t-reset">
            <Input
              id="t-reset"
              type="password"
              autoComplete="new-password"
              value={resetPassword}
              onChange={(e) => setResetPassword(e.target.value)}
              required
              minLength={6}
            />
          </Field>
          <FormError message={resetError} />
          <FormActions>
            <Button onClick={() => setResetId(null)}>İptal</Button>
            <Button variant="primary" type="submit" disabled={resetSubmitting}>
              {resetSubmitting ? 'Sıfırlanıyor…' : 'Şifreyi sıfırla'}
            </Button>
          </FormActions>
        </form>
      </Modal>
    </div>
  );
}

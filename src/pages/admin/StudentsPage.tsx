import { useCallback, useEffect, useState, type FormEvent } from 'react';
import type {
  ClassItem,
  Guardian,
  School,
  Student,
  StudentImportResponse,
  Week,
} from '../../types';
import { GRADE_LEVELS, GRADE_LEVEL_LABELS } from '../../types';
import { adminApi, ApiClientError } from '../../services/api';
import { defaultSelectableWeekId, isWeekPast } from '../../utils/weeks';
import { useList } from '../../hooks/useList';
import {
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
  type Column,
  type RowMenuItem,
} from '../../components/ui';

export default function StudentsPage() {
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [classFilter, setClassFilter] = useState('');
  const [schools, setSchools] = useState<School[]>([]);

  const { items, total, page, pageSize, loading, error, setError, q, setQ, setPage, reload } =
    useList<Student>((params) =>
      adminApi.students.list({ ...params, classId: classFilter || undefined }),
    );

  // ---------- Yeni öğrenci oluşturma ----------
  const [formOpen, setFormOpen] = useState(false);
  const [fullName, setFullName] = useState('');
  const [password, setPassword] = useState('');
  const [guardianId, setGuardianId] = useState('');
  const [classId, setClassId] = useState('');
  const [createWeekId, setCreateWeekId] = useState('');
  const [schoolId, setSchoolId] = useState('');
  const [gradeLevel, setGradeLevel] = useState('');
  const [guardianQuery, setGuardianQuery] = useState('');
  const [guardianResults, setGuardianResults] = useState<Guardian[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Hızlı okul ekleme (öğrenci formu içinden).
  const [newSchoolOpen, setNewSchoolOpen] = useState(false);
  const [newSchoolName, setNewSchoolName] = useState('');
  const [newSchoolSubmitting, setNewSchoolSubmitting] = useState(false);
  const [newSchoolError, setNewSchoolError] = useState<string | null>(null);

  // ---------- Düzenleme modalı ----------
  const [editStudent, setEditStudent] = useState<Student | null>(null);
  const [editFullName, setEditFullName] = useState('');
  const [editSchoolId, setEditSchoolId] = useState('');
  const [editGradeLevel, setEditGradeLevel] = useState('');
  const [editGuardianId, setEditGuardianId] = useState('');
  const [editGuardianQuery, setEditGuardianQuery] = useState('');
  const [editGuardianResults, setEditGuardianResults] = useState<Guardian[]>([]);
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  // ---------- Sınıf değişikliği ----------
  const [moveStudent, setMoveStudent] = useState<Student | null>(null);
  const [moveClassId, setMoveClassId] = useState('');
  const [moveWeekId, setMoveWeekId] = useState('');
  const [weeks, setWeeks] = useState<Week[]>([]);
  const [moveSubmitting, setMoveSubmitting] = useState(false);
  const [moveError, setMoveError] = useState<string | null>(null);

  // ---------- Şifre sıfırlama ----------
  const [resetStudent, setResetStudent] = useState<Student | null>(null);
  const [resetPassword, setResetPassword] = useState('');
  const [resetSubmitting, setResetSubmitting] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);

  // ---------- CSV ile toplu ekleme ----------
  const [importOpen, setImportOpen] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importWeekId, setImportWeekId] = useState('');
  const [importPassword, setImportPassword] = useState('');
  const [importResult, setImportResult] = useState<StudentImportResponse | null>(null);
  const [importLoading, setImportLoading] = useState(false);
  const [importSubmitting, setImportSubmitting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [importSuccess, setImportSuccess] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  // ---------- Silme onayı ----------
  const [deleteStudent, setDeleteStudent] = useState<Student | null>(null);
  const [deleting, setDeleting] = useState(false);

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

  useEffect(() => {
    adminApi.schools
      .list()
      .then((res) => setSchools(res.items))
      .catch(() => {});
  }, []);

  const searchGuardians = useCallback(async (q: string) => {
    const data = await adminApi.guardians.list({ q, pageSize: 10 });
    setGuardianResults(data.items);
  }, []);

  const searchEditGuardians = useCallback(async (q: string) => {
    const data = await adminApi.guardians.list({ q, pageSize: 10 });
    setEditGuardianResults(data.items);
  }, []);

  useEffect(() => {
    searchGuardians(guardianQuery);
  }, [guardianQuery, searchGuardians]);
  useEffect(() => {
    searchEditGuardians(editGuardianQuery);
  }, [editGuardianQuery, searchEditGuardians]);

  useEffect(() => {
    reload(1, '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classFilter]);

  // ---------- Yeni öğrenci ----------
  function openCreate() {
    setFullName('');
    setPassword('');
    setGuardianId('');
    setGuardianQuery('');
    setGuardianResults([]);
    setCreateWeekId(defaultSelectableWeekId(weeks));
    setSchoolId('');
    setGradeLevel('');
    setNewSchoolOpen(false);
    setNewSchoolName('');
    setNewSchoolError(null);
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
        school_id: schoolId || null,
        grade_level: gradeLevel || null,
        week_id: createWeekId || undefined,
      });
      setFormOpen(false);
      await reload();
    } catch (err) {
      setFormError(err instanceof ApiClientError ? err.message : 'Bir hata oluştu.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleAddSchool(event: FormEvent) {
    event.preventDefault();
    setNewSchoolSubmitting(true);
    setNewSchoolError(null);
    try {
      const created = await adminApi.schools.create({ name: newSchoolName.trim() });
      setSchools((prev) => [...prev, created]);
      setSchoolId(created.id);
      setNewSchoolOpen(false);
      setNewSchoolName('');
    } catch (err) {
      setNewSchoolError(err instanceof ApiClientError ? err.message : 'Bir hata oluştu.');
    } finally {
      setNewSchoolSubmitting(false);
    }
  }

  // ---------- Öğrenci düzenleme ----------
  function openEdit(student: Student) {
    setEditStudent(student);
    setEditFullName(student.full_name);
    setEditSchoolId(student.school_id ?? '');
    setEditGradeLevel(student.grade_level ?? '');
    setEditGuardianId(student.guardian_id ?? '');
    setEditGuardianQuery('');
    setEditGuardianResults([]);
    setEditError(null);
  }

  async function handleEdit(event: FormEvent) {
    event.preventDefault();
    if (!editStudent) return;
    setEditSubmitting(true);
    setEditError(null);
    try {
      await adminApi.students.patch(editStudent.id, {
        full_name: editFullName.trim(),
        school_id: editSchoolId || null,
        grade_level: editGradeLevel || null,
        guardian_id: editGuardianId || undefined,
      });
      setEditStudent(null);
      await reload();
    } catch (err) {
      setEditError(err instanceof ApiClientError ? err.message : 'Bir hata oluştu.');
    } finally {
      setEditSubmitting(false);
    }
  }

  // ---------- Sınıf değişikliği ----------
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

  // ---------- Şifre sıfırlama ----------
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

  // ---------- CSV ile toplu ekleme ----------
  function openImport() {
    setImportFile(null);
    setImportWeekId(defaultSelectableWeekId(weeks));
    setImportPassword('');
    setImportResult(null);
    setImportError(null);
    setImportSuccess(null);
    setImportOpen(true);
  }

  async function handleTemplateDownload() {
    setImportError(null);
    try {
      await adminApi.students.downloadImportTemplate();
    } catch (err) {
      setImportError(err instanceof ApiClientError ? err.message : 'Şablon indirilemedi.');
    }
  }

  async function handlePreview() {
    if (!importFile) return;
    setImportLoading(true);
    setImportError(null);
    setImportResult(null);
    setImportSuccess(null);
    try {
      setImportResult(await adminApi.students.importPreview(importFile, importWeekId || undefined));
    } catch (err) {
      setImportError(err instanceof ApiClientError ? err.message : 'Dosya doğrulanamadı.');
    } finally {
      setImportLoading(false);
    }
  }

  async function handleImportCommit() {
    if (!importFile) return;
    setImportSubmitting(true);
    setImportError(null);
    try {
      const res = await adminApi.students.importCommit(
        importFile,
        importPassword,
        importWeekId || undefined,
      );
      setImportResult(res);
      if (res.committed) {
        setImportSuccess(`${res.created?.created_students ?? 0} öğrenci oluşturuldu.`);
        await reload();
      } else {
        setImportError('CSV dosyasında hatalar var, hiçbir kayıt oluşturulmadı.');
      }
    } catch (err) {
      setImportError(err instanceof ApiClientError ? err.message : 'Kaydedilemedi.');
    } finally {
      setImportSubmitting(false);
    }
  }

  async function handleExport() {
    setExporting(true);
    setError(null);
    try {
      await adminApi.exports.students({ q, classId: classFilter || undefined });
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'CSV indirilemedi.');
    } finally {
      setExporting(false);
    }
  }

  /** Hafta seçici seçenekleri — bitmiş haftalar seçilemez (spec §3.1/§5.6). */
  function renderWeekOptions() {
    if (weeks.length === 0) return <option value="">Hafta tanımlı değil</option>;
    return weeks.map((w) => (
      <option key={w.id} value={w.id} disabled={isWeekPast(w)}>
        {w.label}
        {isWeekPast(w) ? ' (geçmiş)' : ''}
      </option>
    ));
  }

  async function handleDelete() {
    if (!deleteStudent) return;
    setDeleting(true);
    try {
      await adminApi.students.remove(deleteStudent.id);
      setDeleteStudent(null);
      await reload();
    } catch (err) {
      setDeleteStudent(null);
      setError(err instanceof ApiClientError ? err.message : 'Bir hata oluştu.');
    } finally {
      setDeleting(false);
    }
  }

  function rowActions(student: Student): RowMenuItem[] {
    return [
      { label: 'Düzenle', onSelect: () => openEdit(student) },
      {
        label: 'Şifre sıfırla',
        onSelect: () => {
          setResetStudent(student);
          setResetPassword('');
          setResetError(null);
        },
      },
      { label: 'Sınıf değiştir', onSelect: () => openMove(student) },
      { label: 'Sil', danger: true, onSelect: () => setDeleteStudent(student) },
    ];
  }

  const columns: Column<Student>[] = [
    {
      key: 'name',
      header: 'Ad',
      card: 'title',
      cell: (st) => <span className="font-medium">{st.full_name}</span>,
    },
    {
      key: 'guardian',
      header: 'Veli',
      className: 'text-muted',
      cell: (st) => st.guardian_name ?? '—',
    },
    { key: 'class', header: 'Sınıf', className: 'text-muted', cell: (st) => st.class_name },
    { key: 'school', header: 'Okul', className: 'text-muted', cell: (st) => st.school_name ?? '—' },
    {
      key: 'grade',
      header: 'Sınıf seviyesi',
      className: 'text-muted',
      cell: (st) => (st.grade_level ? (GRADE_LEVEL_LABELS[st.grade_level] ?? st.grade_level) : '—'),
    },
    {
      key: 'username',
      header: 'Kullanıcı adı',
      className: 'tabular text-muted',
      cell: (st) => st.username,
    },
  ];

  return (
    <div className="space-y-4">
      <Toolbar
        filters={
          <>
            <SearchBox value={q} onChange={(v) => setQ(v)} placeholder="Öğrenci veya veli ara…" />
            <Field label="Sınıf" htmlFor="st-class-filter">
              <Select
                id="st-class-filter"
                value={classFilter}
                onChange={(e) => setClassFilter(e.target.value)}
              >
                <option value="">Tümü</option>
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </Field>
            {!loading && !error && (
              <p className="flex items-center gap-1.5 pb-2 text-[13px] text-muted">
                <CountChip value={total} /> öğrenci
              </p>
            )}
          </>
        }
        actions={
          <>
            <Button onClick={handleExport} loading={exporting}>
              {exporting ? 'İndiriliyor…' : 'CSV indir'}
            </Button>
            <Button onClick={openImport} disabled={!classes.length}>
              CSV ile toplu ekle
            </Button>
            <Button variant="primary" onClick={openCreate} disabled={!classes.length}>
              Yeni öğrenci
            </Button>
          </>
        }
      />

      <ListState
        loading={loading}
        error={error}
        onRetry={() => void reload()}
        empty={items.length === 0}
        emptyMessage="Öğrenci bulunamadı."
      >
        <DataTable
          rows={items}
          columns={columns}
          rowKey={(st) => st.id}
          rowLabel={(st) => st.full_name}
          actions={rowActions}
        />
      </ListState>
      <Pagination page={page} pageSize={pageSize} total={total} onChange={setPage} />

      <ConfirmDialog
        open={deleteStudent !== null}
        title="Öğrenciyi sil"
        confirmLabel="Öğrenciyi sil"
        loading={deleting}
        onConfirm={() => void handleDelete()}
        onCancel={() => setDeleteStudent(null)}
      >
        {deleteStudent?.full_name} silinsin mi?
      </ConfirmDialog>

      {/* ---- Yeni öğrenci oluşturma ---- */}
      <Modal open={formOpen} title="Yeni öğrenci" onClose={() => setFormOpen(false)}>
        <form onSubmit={handleCreate} className="space-y-4">
          <Field label="Ad soyad" htmlFor="st-name">
            <Input
              id="st-name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              required
            />
          </Field>
          <Field label="Veli (arayın ve seçin)" htmlFor="st-guardian-search">
            <Input
              id="st-guardian-search"
              value={guardianQuery}
              onChange={(e) => setGuardianQuery(e.target.value)}
              placeholder="Veli adı yazın…"
              autoComplete="off"
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
                      : 'text-text hover:bg-subtle')
                  }
                >
                  {g.full_name} · {g.username}
                </button>
              ))
            )}
          </div>
          <Field label="Sınıf" htmlFor="st-class">
            <Select
              id="st-class"
              value={classId}
              onChange={(e) => setClassId(e.target.value)}
              required
            >
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Başlangıç haftası" htmlFor="st-week">
            <Select
              id="st-week"
              value={createWeekId}
              onChange={(e) => setCreateWeekId(e.target.value)}
            >
              {renderWeekOptions()}
            </Select>
          </Field>
          <p className="text-xs text-muted">
            Öğrenci seçilen haftadan itibaren sınıf listelerinde ve raporlarda görünür. Geçmiş
            haftalar seçilemez.
          </p>
          <Field label="Okul" htmlFor="st-school">
            <div className="flex gap-2">
              <Select id="st-school" value={schoolId} onChange={(e) => setSchoolId(e.target.value)}>
                <option value="">Seçilmedi</option>
                {schools.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
              <button
                type="button"
                onClick={() => setNewSchoolOpen((v) => !v)}
                className="whitespace-nowrap rounded-md border border-border px-3 text-sm font-medium text-text hover:bg-bg"
              >
                + Yeni okul
              </button>
            </div>
          </Field>
          {newSchoolOpen && (
            <form
              onSubmit={handleAddSchool}
              className="space-y-2 rounded-md border border-border p-3"
            >
              <Field label="Yeni okul adı" htmlFor="st-new-school">
                <Input
                  id="st-new-school"
                  value={newSchoolName}
                  onChange={(e) => setNewSchoolName(e.target.value)}
                  required
                  minLength={1}
                  placeholder="Örn. Örnek Okul 1"
                />
              </Field>
              <FormError message={newSchoolError} />
              <FormActions>
                <Button onClick={() => setNewSchoolOpen(false)}>İptal</Button>
                <Button variant="primary" type="submit" disabled={newSchoolSubmitting}>
                  {newSchoolSubmitting ? 'Ekleniyor…' : 'Okulu ekle'}
                </Button>
              </FormActions>
            </form>
          )}
          <Field label="Sınıf seviyesi" htmlFor="st-grade">
            <Select
              id="st-grade"
              value={gradeLevel}
              onChange={(e) => setGradeLevel(e.target.value)}
            >
              <option value="">Seçilmedi</option>
              {GRADE_LEVELS.map((g) => (
                <option key={g} value={g}>
                  {GRADE_LEVEL_LABELS[g]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Başlangıç şifresi (öğrenciye iletin)" htmlFor="st-password">
            <Input
              id="st-password"
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
            <Button variant="primary" type="submit" disabled={submitting || !guardianId}>
              {submitting ? 'Oluşturuluyor…' : 'Öğrenci oluştur'}
            </Button>
          </FormActions>
        </form>
      </Modal>

      {/* ---- Düzenleme modalı ---- */}
      <Modal
        open={editStudent !== null}
        title={`${editStudent?.full_name ?? ''} — düzenle`}
        onClose={() => setEditStudent(null)}
      >
        <form onSubmit={handleEdit} className="space-y-4">
          <Field label="Ad soyad" htmlFor="ed-name">
            <Input
              id="ed-name"
              value={editFullName}
              onChange={(e) => setEditFullName(e.target.value)}
              required
            />
          </Field>
          <Field label="Veli değiştir (boş bırakılırsa değişmez)" htmlFor="ed-guardian-search">
            <Input
              id="ed-guardian-search"
              value={editGuardianQuery}
              onChange={(e) => setEditGuardianQuery(e.target.value)}
              placeholder="Yeni veli adı yazın…"
              autoComplete="off"
            />
          </Field>
          {editGuardianResults.length > 0 && (
            <div className="max-h-32 overflow-y-auto rounded-md border border-border">
              {editGuardianResults.map((g) => (
                <button
                  key={g.id}
                  type="button"
                  onClick={() => {
                    setEditGuardianId(g.id);
                    setEditGuardianQuery(g.full_name);
                    setEditGuardianResults([]);
                  }}
                  className={
                    'block w-full px-3 py-2 text-left text-sm transition-colors ' +
                    (editGuardianId === g.id
                      ? 'bg-accent/10 font-medium text-accent'
                      : 'text-text hover:bg-subtle')
                  }
                >
                  {g.full_name} · {g.username}
                </button>
              ))}
            </div>
          )}
          {editGuardianId && !editGuardianQuery.trim() && (
            <p className="text-xs text-muted">
              Seçili veli: {editStudent?.guardian_name ?? editGuardianId}
            </p>
          )}
          <Field label="Okul" htmlFor="ed-school">
            <Select
              id="ed-school"
              value={editSchoolId}
              onChange={(e) => setEditSchoolId(e.target.value)}
            >
              <option value="">Seçilmedi</option>
              {schools.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Sınıf seviyesi" htmlFor="ed-grade">
            <Select
              id="ed-grade"
              value={editGradeLevel}
              onChange={(e) => setEditGradeLevel(e.target.value)}
            >
              <option value="">Seçilmedi</option>
              {GRADE_LEVELS.map((g) => (
                <option key={g} value={g}>
                  {GRADE_LEVEL_LABELS[g]}
                </option>
              ))}
            </Select>
          </Field>
          <p className="text-xs text-muted">
            Sınıf değişikliği için "Sınıf değiştir" işlemini kullanın.
          </p>
          <FormError message={editError} />
          <FormActions>
            <Button onClick={() => setEditStudent(null)}>İptal</Button>
            <Button variant="primary" type="submit" disabled={editSubmitting}>
              {editSubmitting ? 'Kaydediliyor…' : 'Kaydet'}
            </Button>
          </FormActions>
        </form>
      </Modal>

      {/* ---- Sınıf değiştirme ---- */}
      <Modal
        open={moveStudent !== null}
        title={`${moveStudent?.full_name ?? ''} — sınıf değiştir`}
        onClose={() => setMoveStudent(null)}
      >
        <form onSubmit={handleMove} className="space-y-4">
          <p className="text-sm text-muted">
            Geçiş haftasını seçin: yeni sınıf, seçilen haftanın başında başlar; önceki sınıf kaydı
            önceki haftanın sonunda kapanır.
          </p>
          <Field label="Yeni sınıf" htmlFor="mv-class">
            <Select
              id="mv-class"
              value={moveClassId}
              onChange={(e) => setMoveClassId(e.target.value)}
              required
            >
              <option value="">Seçin…</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Geçiş haftası" htmlFor="mv-week">
            <Select
              id="mv-week"
              value={moveWeekId}
              onChange={(e) => setMoveWeekId(e.target.value)}
              required
            >
              {weeks.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.label}
                </option>
              ))}
            </Select>
          </Field>
          <FormError message={moveError} />
          <FormActions>
            <Button onClick={() => setMoveStudent(null)}>İptal</Button>
            <Button variant="primary" type="submit" disabled={moveSubmitting || !moveClassId}>
              {moveSubmitting ? 'Taşınıyor…' : 'Sınıfı değiştir'}
            </Button>
          </FormActions>
        </form>
      </Modal>

      {/* ---- Şifre sıfırlama ---- */}
      <Modal
        open={resetStudent !== null}
        title={`${resetStudent?.full_name ?? ''} — şifre sıfırla`}
        onClose={() => setResetStudent(null)}
      >
        <form onSubmit={handleReset} className="space-y-4">
          <p className="text-sm text-muted">
            Kullanıcı adı: {resetStudent?.username}. Eski oturumlar bu işlemle sona erer.
          </p>
          <Field label="Yeni şifre (öğrenciye iletin)" htmlFor="st-reset">
            <Input
              id="st-reset"
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
            <Button onClick={() => setResetStudent(null)}>İptal</Button>
            <Button variant="primary" type="submit" disabled={resetSubmitting}>
              {resetSubmitting ? 'Sıfırlanıyor…' : 'Şifreyi sıfırla'}
            </Button>
          </FormActions>
        </form>
      </Modal>

      {/* ---- CSV ile toplu ekleme ---- */}
      <Modal
        open={importOpen}
        title="CSV ile toplu öğrenci ekle"
        onClose={() => setImportOpen(false)}
      >
        <div className="space-y-4">
          <p className="text-sm text-muted">
            Şablonu indirin, doldurun ve yükleyin. Önizlemede hata yoksa kaydedin; tek satır bile
            hatalıysa hiçbir kayıt oluşturulmaz.
          </p>
          <div>
            <Button onClick={handleTemplateDownload}>Şablon indir</Button>
          </div>
          <Field label="CSV dosyası" htmlFor="imp-file">
            <Input
              id="imp-file"
              type="file"
              accept=".csv,text/csv"
              onChange={(e) => {
                setImportFile(e.target.files?.[0] ?? null);
                setImportResult(null);
                setImportSuccess(null);
                setImportError(null);
              }}
              className="h-auto py-1.5 file:mr-3 file:rounded-md file:border file:border-border file:bg-subtle file:px-3 file:py-1 file:text-sm file:font-medium file:text-text"
            />
          </Field>
          <Field label="Başlangıç haftası (tüm grup için)" htmlFor="imp-week">
            <Select
              id="imp-week"
              value={importWeekId}
              onChange={(e) => setImportWeekId(e.target.value)}
            >
              {renderWeekOptions()}
            </Select>
          </Field>
          <p className="text-xs text-muted">
            Dosyadaki tüm öğrenciler bu haftadan itibaren aktif olur. Geçmiş haftalar seçilemez.
          </p>
          <Field label="Yeni öğrenci/veliler için ortak başlangıç şifresi" htmlFor="imp-pass">
            <Input
              id="imp-pass"
              type="password"
              autoComplete="new-password"
              value={importPassword}
              onChange={(e) => setImportPassword(e.target.value)}
              minLength={6}
              placeholder="En az 6 karakter"
            />
          </Field>
          <FormError message={importError} />
          {importSuccess && (
            <p role="status" className="text-sm font-medium text-success">
              {importSuccess}
            </p>
          )}
          <FormActions>
            <Button onClick={handlePreview} disabled={!importFile || importLoading}>
              {importLoading ? 'Doğrulanıyor…' : 'Önizle'}
            </Button>
            <Button
              variant="primary"
              onClick={handleImportCommit}
              disabled={
                !importFile || !importResult?.ok || importSubmitting || importSuccess !== null
              }
            >
              {importSubmitting
                ? 'Kaydediliyor…'
                : `${importResult?.summary.new_students ?? 0} kaydı oluştur`}
            </Button>
          </FormActions>

          {importResult && (
            <div className="space-y-3 rounded-md border border-border bg-subtle/60 p-3">
              <p className="text-sm text-text">
                <strong className="tabular">{importResult.summary.new_students}</strong> yeni
                öğrenci · <strong className="tabular">{importResult.summary.new_guardians}</strong>{' '}
                yeni veli · <strong className="tabular">{importResult.summary.new_schools}</strong>{' '}
                yeni okul
                {importResult.summary.matched_guardians > 0 &&
                  ` · ${importResult.summary.matched_guardians} mevcut veli eşleşti`}
                {importResult.summary.matched_schools > 0 &&
                  ` · ${importResult.summary.matched_schools} mevcut okul eşleşti`}
              </p>
              {importResult.errors.length > 0 && (
                <div>
                  <p className="mb-1 text-sm font-medium text-danger">
                    Hatalar ({importResult.errors.length})
                  </p>
                  <ul className="max-h-40 space-y-1 overflow-y-auto text-xs text-text">
                    {importResult.errors.map((e, i) => (
                      <li key={i}>
                        Satır <span className="tabular">{e.row}</span> · {e.field}: {e.message}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {importResult.warnings.length > 0 && (
                <div>
                  <p className="mb-1 text-sm font-medium text-warning">
                    Uyarılar ({importResult.warnings.length})
                  </p>
                  <ul className="max-h-32 space-y-1 overflow-y-auto text-xs text-muted">
                    {importResult.warnings.map((w, i) => (
                      <li key={i}>
                        Satır <span className="tabular">{w.row}</span> · {w.field}: {w.message}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
}

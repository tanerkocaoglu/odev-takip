import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  DAY_LABELS,
  type AcademicYear,
  type ClassCourse,
  type ClassItem,
  type Course,
  type Teacher,
} from '../../types';
import { adminApi, ApiClientError } from '../../services/api';
import { ArrowLeftRight, X } from 'lucide-react';
import {
  ActionError,
  Button,
  Card,
  ConfirmDialog,
  CountChip,
  DataTable,
  Field,
  FormActions,
  FormError,
  Input,
  ListState,
  Modal,
  SearchBox,
  Select,
  Toolbar,
  type Column,
} from '../../components/ui';

/**
 * Atamalar — tüm sınıflar tek listede (sınıf filtresiz), isim araması ile.
 * İki satır seçilip "Yer değiştir" ile öğretmenler sınıflar arası takas
 * edilir (örn. ÖKLİD Cebir ↔ PİSAGOR Cebir) — spec.md §6 Admin.
 */
export default function ClassCoursesPage() {
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [items, setItems] = useState<ClassCourse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [actionError, setActionError] = useState<string | null>(null);
  const [swapOpen, setSwapOpen] = useState(false);
  const [swapping, setSwapping] = useState(false);
  const [deleteItem, setDeleteItem] = useState<ClassCourse | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [courses, setCourses] = useState<Course[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);

  const [formOpen, setFormOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [classId, setClassId] = useState('');
  const [courseId, setCourseId] = useState('');
  const [teacherId, setTeacherId] = useState('');
  const [dayOfWeek, setDayOfWeek] = useState(1);
  const [lessonTime, setLessonTime] = useState('09:00');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    adminApi.academicYears.list().then(async (data) => {
      const active = data.items.find((y: AcademicYear) => y.is_active === 1);
      const yearId = active?.id ?? data.items[0]?.id ?? '';
      if (!yearId) return;
      const [classData, courseData, teacherData] = await Promise.all([
        adminApi.classes.list({ academicYearId: yearId }),
        adminApi.courses.list(),
        adminApi.teachers.list({ pageSize: 100 }),
      ]);
      setClasses(classData.items);
      setCourses(courseData.items);
      setTeachers(teacherData.items);
    });
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setActionError(null);
    try {
      const data = await adminApi.classCourses.list();
      setItems(data.items);
    } catch (err) {
      setError(
        err instanceof ApiClientError
          ? err.message
          : 'Atamalar yüklenemedi. Bağlantınızı kontrol edip yeniden deneyin.',
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Arama — görüntülenen satırlarda (küçük liste; sınıf/ders/öğretmen adında).
  const filtered = useMemo(() => {
    const needle = q.trim().toLocaleLowerCase('tr');
    if (!needle) return items;
    return items.filter((i) =>
      [i.class_name, i.course_name, i.teacher_name]
        .filter(Boolean)
        .some((v) => (v as string).toLocaleLowerCase('tr').includes(needle)),
    );
  }, [items, q]);

  function toggleSelect(id: string) {
    setActionError(null);
    setSelected((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= 2) return prev; // en fazla 2 satır
      return [...prev, id];
    });
  }

  function openCreate() {
    setEditId(null);
    setClassId(classes[0]?.id ?? '');
    setCourseId('');
    setTeacherId('');
    setDayOfWeek(1);
    setLessonTime('09:00');
    setFormError(null);
    setFormOpen(true);
  }

  function openEdit(item: ClassCourse) {
    setEditId(item.id);
    setClassId(item.class_id);
    setCourseId(item.course_id);
    setTeacherId(item.teacher_id);
    setDayOfWeek(item.day_of_week);
    setLessonTime(item.lesson_time ?? '09:00');
    setFormError(null);
    setFormOpen(true);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setFormError(null);
    try {
      if (editId) {
        await adminApi.classCourses.patch(editId, {
          teacher_id: teacherId,
          day_of_week: dayOfWeek,
          lesson_time: lessonTime,
        });
      } else {
        await adminApi.classCourses.create({
          class_id: classId,
          course_id: courseId,
          teacher_id: teacherId,
          day_of_week: dayOfWeek,
          lesson_time: lessonTime,
        });
      }
      setFormOpen(false);
      setSelected([]);
      await load();
    } catch (err) {
      setFormError(err instanceof ApiClientError ? err.message : 'Atama kaydedilemedi.');
    } finally {
      setSubmitting(false);
    }
  }

  const selA = items.find((i) => i.id === selected[0]);
  const selB = items.find((i) => i.id === selected[1]);
  const asg = (i: ClassCourse) => `${i.class_name} · ${i.course_name}`;

  /** "Yer değiştir": aynı öğretmen kontrolü sonrası onay diyaloğu açılır. */
  function requestSwap() {
    if (!selA || !selB) return;
    if (selA.teacher_id === selB.teacher_id) {
      setActionError('Aynı öğretmene ait atamaların yerini değiştirmeye gerek yok.');
      return;
    }
    setActionError(null);
    setSwapOpen(true);
  }

  async function handleSwap() {
    if (!selA || !selB) return;
    setSwapping(true);
    setActionError(null);
    try {
      await adminApi.classCourses.swap(selA.id, selB.id);
      setSwapOpen(false);
      setSelected([]);
      await load();
    } catch (err) {
      setSwapOpen(false);
      setActionError(err instanceof ApiClientError ? err.message : 'Takas yapılamadı.');
    } finally {
      setSwapping(false);
    }
  }

  async function handleDelete() {
    if (!deleteItem) return;
    setDeleting(true);
    setActionError(null);
    try {
      await adminApi.classCourses.remove(deleteItem.id);
      setSelected((prev) => prev.filter((x) => x !== deleteItem.id));
      setDeleteItem(null);
      await load();
    } catch (err) {
      setDeleteItem(null);
      setActionError(err instanceof ApiClientError ? err.message : 'Atama silinemedi.');
    } finally {
      setDeleting(false);
    }
  }

  const columns: Column<ClassCourse>[] = [
    {
      key: 'class',
      header: 'Sınıf',
      card: 'title',
      cell: (i) => <span className="font-medium">{i.class_name}</span>,
    },
    { key: 'course', header: 'Ders', cell: (i) => i.course_name },
    { key: 'teacher', header: 'Öğretmen', className: 'text-muted', cell: (i) => i.teacher_name },
    {
      key: 'day',
      header: 'Gün',
      className: 'text-muted',
      cell: (i) => DAY_LABELS[i.day_of_week],
    },
    { key: 'time', header: 'Saat', className: 'tabular text-muted', cell: (i) => i.lesson_time },
  ];

  return (
    <div className="space-y-4">
      <Toolbar
        filters={
          <>
            <SearchBox
              value={q}
              onChange={setQ}
              placeholder="Sınıf, ders veya öğretmen ara…"
              label="Atama ara"
            />
            {!loading && !error && (
              <p className="flex items-center gap-1.5 pb-2 text-[13px] text-muted">
                <CountChip value={filtered.length} /> atama
              </p>
            )}
          </>
        }
        actions={
          <Button variant="primary" onClick={openCreate} disabled={!classes.length}>
            Yeni atama
          </Button>
        }
      />

      {/* Seçim durumu: kaç atama seçili, hangi ikisi takas edilecek */}
      <div className="sticky top-14 z-20 lg:top-0">
        <Card padding="sm">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <p className="flex items-center gap-2 text-sm text-text" aria-live="polite">
              <ArrowLeftRight size={16} aria-hidden="true" className="text-muted" />
              <span className="tabular font-medium">Seçili: {selected.length}/2</span>
              <span className="text-muted">
                {selected.length === 2 ? '' : 'Öğretmenleri yer değiştirmek için iki atama seçin.'}
              </span>
            </p>
            <div className="ml-auto flex items-center gap-2">
              {selected.length > 0 && (
                <Button size="sm" variant="ghost" onClick={() => setSelected([])}>
                  Seçimi temizle
                </Button>
              )}
              <Button variant="primary" onClick={requestSwap} disabled={selected.length !== 2}>
                Yer değiştir
              </Button>
            </div>
          </div>
          {selected.length > 0 && (
            <ul className="mt-2 flex flex-wrap gap-2">
              {[selA, selB].filter(Boolean).map((i) => (
                <li
                  key={i!.id}
                  className="inline-flex items-center gap-1 rounded-full bg-subtle py-0.5 pl-3 pr-1 text-[13px] text-text"
                >
                  <span>
                    {asg(i!)} <span className="text-muted">({i!.teacher_name})</span>
                  </span>
                  <button
                    type="button"
                    aria-label={`${asg(i!)} seçimini kaldır`}
                    onClick={() => toggleSelect(i!.id)}
                    className="flex h-6 w-6 items-center justify-center rounded-full text-muted transition-colors hover:bg-border hover:text-text max-md:h-11 max-md:w-11"
                  >
                    <X size={13} aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <ActionError message={actionError} onDismiss={() => setActionError(null)} />

      <ListState
        loading={loading}
        error={error}
        onRetry={() => void load()}
        empty={filtered.length === 0}
        emptyMessage={q ? 'Bu aramayla atama bulunamadı.' : 'Henüz atama yok.'}
        emptyAction={
          q ? undefined : (
            <Button variant="primary" onClick={openCreate} disabled={!classes.length}>
              Yeni atama
            </Button>
          )
        }
      >
        <DataTable
          rows={filtered}
          columns={columns}
          rowKey={(i) => i.id}
          rowLabel={asg}
          select={{
            isSelected: (i) => selected.includes(i.id),
            onToggle: (i) => toggleSelect(i.id),
            label: (i) => `${asg(i)} seç`,
          }}
          actions={(i) => [
            { label: 'Düzenle', onSelect: () => openEdit(i) },
            { label: 'Sil', danger: true, onSelect: () => setDeleteItem(i) },
          ]}
        />
      </ListState>

      <ConfirmDialog
        open={swapOpen && !!selA && !!selB}
        title="Öğretmenleri yer değiştir"
        confirmLabel="Yer değiştir"
        danger={false}
        loading={swapping}
        onConfirm={() => void handleSwap()}
        onCancel={() => setSwapOpen(false)}
      >
        {selA && selB && (
          <div className="space-y-2">
            <p>
              <strong className="text-text">{asg(selA)}</strong> atamasına{' '}
              <strong className="text-text">{selB.teacher_name}</strong>, ve{' '}
              <strong className="text-text">{asg(selB)}</strong> atamasına{' '}
              <strong className="text-text">{selA.teacher_name}</strong> geçecek.
            </p>
            <p>
              Toplam <span className="tabular font-medium text-text">2</span> atama etkilenir. İki
              değişiklik tek işlemde yapılır; biri başarısız olursa hiçbiri uygulanmaz. Ders günü ve
              saati değişmez.
            </p>
          </div>
        )}
      </ConfirmDialog>

      <ConfirmDialog
        open={deleteItem !== null}
        title="Atamayı sil"
        confirmLabel="Atamayı sil"
        loading={deleting}
        onConfirm={() => void handleDelete()}
        onCancel={() => setDeleteItem(null)}
      >
        "{deleteItem ? asg(deleteItem) : ''}" ataması silinsin mi?
      </ConfirmDialog>

      <Modal
        open={formOpen}
        title={editId ? 'Atamayı düzenle' : 'Yeni atama'}
        onClose={() => setFormOpen(false)}
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <Field label="Sınıf" htmlFor="cc-class">
            <Select
              id="cc-class"
              value={classId}
              onChange={(e) => setClassId(e.target.value)}
              disabled={editId !== null}
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
          <Field label="Ders" htmlFor="cc-course">
            <Select
              id="cc-course"
              value={courseId}
              onChange={(e) => setCourseId(e.target.value)}
              disabled={editId !== null}
              required
            >
              <option value="">Seçin…</option>
              {courses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Öğretmen" htmlFor="cc-teacher">
            <Select
              id="cc-teacher"
              value={teacherId}
              onChange={(e) => setTeacherId(e.target.value)}
              required
            >
              <option value="">Seçin…</option>
              {teachers.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.full_name}
                </option>
              ))}
            </Select>
          </Field>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Ders günü" htmlFor="cc-day">
              <Select
                id="cc-day"
                value={dayOfWeek}
                onChange={(e) => setDayOfWeek(Number(e.target.value))}
              >
                {DAY_LABELS.slice(1).map((label, i) => (
                  <option key={i + 1} value={i + 1}>
                    {label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Saat" htmlFor="cc-time">
              <Input
                id="cc-time"
                type="time"
                value={lessonTime}
                onChange={(e) => setLessonTime(e.target.value)}
              />
            </Field>
          </div>
          <FormError message={formError} />
          <FormActions>
            <Button onClick={() => setFormOpen(false)}>İptal</Button>
            <Button variant="primary" type="submit" loading={submitting}>
              {editId ? 'Atamayı kaydet' : 'Atamayı ekle'}
            </Button>
          </FormActions>
        </form>
      </Modal>
    </div>
  );
}

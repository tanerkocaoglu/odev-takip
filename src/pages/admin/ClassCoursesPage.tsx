import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { DAY_LABELS, type AcademicYear, type ClassCourse, type ClassItem, type Course, type Teacher } from '../../types';
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
  SearchBox,
  inputClass,
} from '../../components/admin/ui';

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
      setError(err instanceof ApiClientError ? err.message : 'Bir hata oluştu.');
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
      setFormError(err instanceof ApiClientError ? err.message : 'Bir hata oluştu.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSwap() {
    const [aId, bId] = selected;
    const a = items.find((i) => i.id === aId);
    const b = items.find((i) => i.id === bId);
    if (!a || !b) return;
    if (a.teacher_id === b.teacher_id) {
      setActionError('Aynı öğretmene ait atamaların yerini değiştirmeye gerek yok.');
      return;
    }
    if (!window.confirm(`"${a.class_name} · ${a.course_name}" ile "${b.class_name} · ${b.course_name}" öğretmenleri yer değiştirsin mi?`)) {
      return;
    }
    setActionError(null);
    try {
      await adminApi.classCourses.swap(aId, bId);
      setSelected([]);
      await load();
    } catch (err) {
      setActionError(err instanceof ApiClientError ? err.message : 'Takas yapılamadı.');
    }
  }

  async function handleDelete(item: ClassCourse) {
    if (!window.confirm(`"${item.class_name} · ${item.course_name}" ataması silinsin mi?`)) return;
    try {
      await adminApi.classCourses.remove(item.id);
      setSelected((prev) => prev.filter((x) => x !== item.id));
      await load();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Bir hata oluştu.');
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex items-end gap-3">
          <SearchBox value={q} onChange={setQ} placeholder="Sınıf, ders veya öğretmen ara…" />
          <PrimaryButton
            onClick={() => void handleSwap()}
            disabled={selected.length !== 2}
          >
            Yer değiştir
          </PrimaryButton>
        </div>
        <PrimaryButton onClick={openCreate} disabled={!classes.length}>
          Yeni atama
        </PrimaryButton>
      </div>

      <FormError message={error} />
      {actionError && <FormError message={actionError} />}

      {loading ? (
        <LoadingState />
      ) : filtered.length === 0 ? (
        <EmptyState message={q ? 'Bu aramayla atama bulunamadı.' : 'Henüz atama yok.'} />
      ) : (
        <div className="overflow-hidden rounded-md border border-border bg-surface">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-bg text-left text-xs font-medium text-muted">
              <tr>
                <th className="px-3 py-2" />
                <th className="px-3 py-2">Sınıf</th>
                <th className="px-3 py-2">Ders</th>
                <th className="px-3 py-2">Öğretmen</th>
                <th className="px-3 py-2">Gün</th>
                <th className="px-3 py-2">Saat</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((item) => {
                const isSelected = selected.includes(item.id);
                return (
                  <tr
                    key={item.id}
                    className={
                      'border-b border-border last:border-0 ' +
                      (isSelected ? 'bg-accent/5' : '')
                    }
                  >
                    <td className="px-3 py-2">
                      <input
                        type="checkbox"
                        aria-label={`${item.class_name} · ${item.course_name} seç`}
                        checked={isSelected}
                        onChange={() => toggleSelect(item.id)}
                        className="h-4 w-4 accent-accent"
                      />
                    </td>
                    <td className="px-3 py-2 font-medium text-text">{item.class_name}</td>
                    <td className="px-3 py-2 text-text">{item.course_name}</td>
                    <td className="px-3 py-2 text-muted">{item.teacher_name}</td>
                    <td className="px-3 py-2 text-muted">{DAY_LABELS[item.day_of_week]}</td>
                    <td className="tabular px-3 py-2 text-muted">{item.lesson_time}</td>
                    <td className="px-3 py-2 text-right">
                      <button
                        type="button"
                        onClick={() => openEdit(item)}
                        className="mr-3 text-sm font-medium text-muted hover:text-text"
                      >
                        Düzenle
                      </button>
                      <DangerButton onClick={() => handleDelete(item)}>Sil</DangerButton>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <Modal
        open={formOpen}
        title={editId ? 'Atamayı düzenle' : 'Yeni atama'}
        onClose={() => setFormOpen(false)}
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <Field label="Sınıf" htmlFor="cc-class">
            <select
              id="cc-class"
              value={classId}
              onChange={(e) => setClassId(e.target.value)}
              disabled={editId !== null}
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
          <Field label="Ders" htmlFor="cc-course">
            <select
              id="cc-course"
              value={courseId}
              onChange={(e) => setCourseId(e.target.value)}
              disabled={editId !== null}
              required
              className={inputClass}
            >
              <option value="">Seçin…</option>
              {courses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Öğretmen" htmlFor="cc-teacher">
            <select
              id="cc-teacher"
              value={teacherId}
              onChange={(e) => setTeacherId(e.target.value)}
              required
              className={inputClass}
            >
              <option value="">Seçin…</option>
              {teachers.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.full_name}
                </option>
              ))}
            </select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Ders günü" htmlFor="cc-day">
              <select
                id="cc-day"
                value={dayOfWeek}
                onChange={(e) => setDayOfWeek(Number(e.target.value))}
                className={inputClass}
              >
                {DAY_LABELS.slice(1).map((label, i) => (
                  <option key={i + 1} value={i + 1}>
                    {label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Saat" htmlFor="cc-time">
              <input
                id="cc-time"
                type="time"
                value={lessonTime}
                onChange={(e) => setLessonTime(e.target.value)}
                className={inputClass}
              />
            </Field>
          </div>
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

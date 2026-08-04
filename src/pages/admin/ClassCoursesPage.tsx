import { useCallback, useEffect, useState, type FormEvent } from 'react';
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
  inputClass,
} from '../../components/admin/ui';

export default function ClassCoursesPage() {
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [classId, setClassId] = useState('');
  const [items, setItems] = useState<ClassCourse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [courses, setCourses] = useState<Course[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);

  const [formOpen, setFormOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
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
      setClassId((prev) => prev || classData.items[0]?.id || '');
    });
  }, []);

  const load = useCallback(async () => {
    if (!classId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await adminApi.classCourses.list(classId);
      setItems(data.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Bir hata oluştu.');
    } finally {
      setLoading(false);
    }
  }, [classId]);

  useEffect(() => {
    load();
  }, [load]);

  function openCreate() {
    setEditId(null);
    setCourseId('');
    setTeacherId('');
    setDayOfWeek(1);
    setLessonTime('09:00');
    setFormError(null);
    setFormOpen(true);
  }

  function openEdit(item: ClassCourse) {
    setEditId(item.id);
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
      await load();
    } catch (err) {
      setFormError(err instanceof ApiClientError ? err.message : 'Bir hata oluştu.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(item: ClassCourse) {
    if (!window.confirm(`"${item.course_name}" ataması silinsin mi?`)) return;
    try {
      await adminApi.classCourses.remove(item.id);
      await load();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Bir hata oluştu.');
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <Field label="Sınıf" htmlFor="cc-class">
          <select
            id="cc-class"
            value={classId}
            onChange={(e) => setClassId(e.target.value)}
            className={inputClass}
          >
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>
        <PrimaryButton onClick={openCreate} disabled={!classId}>
          Yeni atama
        </PrimaryButton>
      </div>

      {error && <FormError message={error} />}
      {loading ? (
        <LoadingState />
      ) : items.length === 0 ? (
        <EmptyState message="Bu sınıfa ders atanmamış." />
      ) : (
        <div className="overflow-hidden rounded-md border border-border bg-surface">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-bg text-left text-xs font-medium text-muted">
              <tr>
                <th className="px-3 py-2">Ders</th>
                <th className="px-3 py-2">Öğretmen</th>
                <th className="px-3 py-2">Gün</th>
                <th className="px-3 py-2">Saat</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} className="border-b border-border last:border-0">
                  <td className="px-3 py-2 font-medium text-text">{item.course_name}</td>
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
              ))}
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

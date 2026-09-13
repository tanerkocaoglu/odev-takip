/**
 * Salt-okunur haftalık rapor görünümü — bir `DigestSnapshot`'ı render eder.
 * Hem `/r/{token}` public sayfası, hem veli paneli detayı, hem de admin digest
 * önizlemesi bu bileşeni kullanır (spec.md §5.4 adım 6, §6 Veli). KVKK gereği
 * snapshot yalnızca tek öğrencinin satırını içerir; bileşen bu yüzden tek
 * satırlık bir tablo çizer.
 *
 * Görsel dil: ders kartlarında duruma göre sol kenar şeridi + `BookOpen` ikonu
 * + `elevation-1`; rozetler paylaşılan `Badge` / `AttendanceBadge` ile dolgulu.
 * **Puanlar her zaman ham 1–10 değeridir** — yüzdelik veya başka bir özet
 * üretilmez (kırmızı çizgi).
 */

import { BookOpen } from 'lucide-react';
import type { ReactNode } from 'react';
import type { DigestSnapshot, DigestSnapshotCourse } from '../types';
import { DAY_LABELS } from '../types';
import { AttendanceBadge, Badge } from './admin/ui';

/** Sol kenar şeridi — devamsızlık veya "rapor girilmedi" durumundan türetilir. */
type CourseStripe = 'missing' | 'neutral' | 'present' | 'late' | 'absent' | 'excused';

const STRIPE_CLASS: Record<CourseStripe, string> = {
  missing: 'border-l-att-late',
  neutral: 'border-l-status-draft',
  present: 'border-l-status-draft',
  late: 'border-l-att-late',
  absent: 'border-l-att-absent',
  excused: 'border-l-excused',
};

function courseStripe(course: DigestSnapshotCourse): CourseStripe {
  if (course.status === 'missing') return 'missing';
  return course.entry?.attendance ?? 'neutral';
}

export default function ReportSnapshot({
  snapshot,
  showStudent = true,
  renderCourseAction,
  renderPrevHomework,
}: {
  snapshot: DigestSnapshot;
  showStudent?: boolean;
  /** Ders kartı başlığına eklenecek isteğe bağlı aksiyon (ör. admin "Düzenle"). */
  renderCourseAction?: (course: DigestSnapshotCourse) => ReactNode;
  /**
   * "Verilmiş ödev" satırının altına eklenecek isteğe bağlı içerik. Dosya
   * önizlemesi Bearer gerektirdiğinden yalnızca girişli veli detayı bu prop'u
   * geçirir; public/admin görünümlerinde hiçbir şey render edilmez.
   */
  renderPrevHomework?: (course: DigestSnapshotCourse) => ReactNode;
}) {
  return (
    <div className="space-y-6">
      <div className="elevation-1 rounded-md border border-border bg-surface p-5">
        <h2 className="text-lg font-semibold text-text">
          {snapshot.week.label} haftalık rapor
        </h2>
        <dl className="mt-2 space-y-1 text-sm text-muted">
          {showStudent && (
            <div className="flex gap-2">
              <dt className="font-medium text-text">Öğrenci:</dt>
              <dd>{snapshot.student.name}</dd>
            </div>
          )}
          <div className="flex gap-2">
            <dt className="font-medium text-text">Sınıf:</dt>
            <dd>{snapshot.class.name}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="font-medium text-text">Hafta:</dt>
            <dd className="tabular">
              {snapshot.week.start_date} – {snapshot.week.end_date}
            </dd>
          </div>
        </dl>
      </div>

      {snapshot.courses.map((course) => {
        const stripe = courseStripe(course);
        const cardClass =
          'elevation-1 rounded-md border border-border border-l-4 bg-surface p-5 ' +
          STRIPE_CLASS[stripe];

        if (course.status === 'missing') {
          return (
            <div
              key={course.class_course_id}
              data-status={stripe}
              className={cardClass}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="flex items-center gap-2 text-base font-semibold text-text">
                  <BookOpen size={16} aria-hidden="true" className="shrink-0 text-muted" />
                  {course.course_name}
                </h3>
                <div className="flex items-center gap-2">
                  <Badge tone="warning">Bu hafta rapor girilmedi</Badge>
                  {renderCourseAction?.(course)}
                </div>
              </div>
            </div>
          );
        }

        return (
          <div
            key={course.class_course_id}
            data-status={stripe}
            className={cardClass}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="flex items-center gap-2 text-base font-semibold text-text">
                <BookOpen size={16} aria-hidden="true" className="shrink-0 text-muted" />
                {course.course_name}
              </h3>
              <div className="flex items-center gap-2">
                <Badge tone="info">Rapor hazır</Badge>
                {renderCourseAction?.(course)}
              </div>
            </div>

            <dl className="mt-3 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
              <div className="flex gap-2">
                <dt className="font-medium text-muted">Öğretmen:</dt>
                <dd className="text-text">{course.teacher_name}</dd>
              </div>
              <div className="flex gap-2">
                <dt className="font-medium text-muted">Ders günü:</dt>
                <dd className="tabular text-text">
                  {DAY_LABELS[course.day_of_week]}
                  {course.lesson_time ? ` · ${course.lesson_time}` : ''}
                </dd>
              </div>
              {course.topic_covered && (
                <div className="flex gap-2 sm:col-span-2">
                  <dt className="font-medium text-muted">İşlenen konu:</dt>
                  <dd className="text-text">{course.topic_covered}</dd>
                </div>
              )}
              {course.prev_homework_text || course.prev_homework_id ? (
                <div className="sm:col-span-2">
                  <div className="flex gap-2">
                    <dt className="font-medium text-muted">Verilmiş ödev:</dt>
                    <dd className="text-text">{course.prev_homework_text || '—'}</dd>
                  </div>
                  {renderPrevHomework?.(course)}
                </div>
              ) : null}
              {course.homework && (
                <div className="flex gap-2 sm:col-span-2">
                  <dt className="font-medium text-muted">Yapılacak ödev:</dt>
                  <dd className="text-text">
                    {course.homework.description || '—'}
                    <span className="tabular text-muted">
                      {' '}
                      (son tarih: {course.homework.due_date})
                    </span>
                    {course.homework.graded_in_week && (
                      <span className="mt-1 block text-[13px] text-muted">
                        Bu ödevin değerlendirmesi{' '}
                        <span className="tabular">
                          {course.homework.graded_in_week.relative_week_no}. hafta
                        </span>{' '}
                        ({course.homework.graded_in_week.label}) raporunda görünecek.
                      </span>
                    )}
                  </dd>
                </div>
              )}
            </dl>

            {course.entry ? (
              <div className="mt-4 overflow-hidden rounded-md border border-border">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-bg text-left text-[13px] font-medium text-muted">
                      <th className="px-3 py-2">Devamsızlık</th>
                      <th className="px-3 py-2">Ödev puanı</th>
                      <th className="px-3 py-2">Ders içi performans puanı</th>
                      <th className="px-3 py-2">Not</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td className="px-3 py-2">
                        <AttendanceBadge attendance={course.entry.attendance} />
                      </td>
                      <td className="tabular px-3 py-2 font-medium text-text">
                        {course.entry.homework_score ?? '—'}
                      </td>
                      <td className="tabular px-3 py-2 font-medium text-text">
                        {course.entry.interest_score ?? '—'}
                      </td>
                      <td className="px-3 py-2 text-[13px] text-text">
                        {course.entry.teacher_note || '—'}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="mt-3 text-sm text-muted">
                Bu hafta öğrenci için rapor satırı girilmedi.
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}

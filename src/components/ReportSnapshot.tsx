/**
 * Salt-okunur haftalık rapor görünümü — bir `DigestSnapshot`'ı render eder.
 * Hem `/r/{token}` public sayfası hem veli paneli detayı bu bileşeni kullanır
 * (spec.md §5.4 adım 6, §6 Veli). KVKK gereği snapshot yalnızca tek öğrencinin
 * satırını içerir; bileşen bu yüzden tek satırlık bir tablo çizer.
 */

import type { DigestSnapshot, Attendance } from '../types';
import { ATTENDANCE_LABELS, DAY_LABELS } from '../types';

const ATT_STYLES: Record<Attendance, string> = {
  present: 'text-present',
  late: 'text-att-late',
  absent: 'text-att-absent',
  excused: 'text-excused',
};

const ATT_BG: Record<Attendance, string> = {
  present: 'bg-present/10',
  late: 'bg-att-late/10',
  absent: 'bg-att-absent/10',
  excused: 'bg-excused/10',
};

function AttendanceBadge({ attendance }: { attendance: Attendance }) {
  return (
    <span
      className={
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ' +
        ATT_BG[attendance] +
        ' ' +
        ATT_STYLES[attendance]
      }
    >
      {ATTENDANCE_LABELS[attendance]}
    </span>
  );
}

export default function ReportSnapshot({
  snapshot,
  showStudent = true,
}: {
  snapshot: DigestSnapshot;
  showStudent?: boolean;
}) {
  return (
    <div className="space-y-6">
      <div className="rounded-md border border-border bg-surface p-5">
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

      {snapshot.courses.map((course) =>
        course.status === 'missing' ? (
          <div
            key={course.class_course_id}
            className="rounded-md border border-border bg-surface p-5"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold text-text">
                {course.course_name}
              </h3>
              <span className="inline-flex items-center rounded-full bg-status-draft/10 px-2 py-0.5 text-xs font-medium text-status-draft">
                Bu hafta rapor girilmedi
              </span>
            </div>
          </div>
        ) : (
          <div
            key={course.class_course_id}
            className="rounded-md border border-border bg-surface p-5"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-base font-semibold text-text">
                {course.course_name}
              </h3>
              <span className="inline-flex items-center rounded-full bg-status-completed/10 px-2 py-0.5 text-xs font-medium text-status-completed">
                Rapor hazır
              </span>
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
              {course.prev_homework_text && (
                <div className="flex gap-2 sm:col-span-2">
                  <dt className="font-medium text-muted">Verilmiş ödev:</dt>
                  <dd className="text-text">{course.prev_homework_text}</dd>
                </div>
              )}
              {course.homework && (
                <div className="flex gap-2 sm:col-span-2">
                  <dt className="font-medium text-muted">Yapılacak ödev:</dt>
                  <dd className="text-text">
                    {course.homework.description || '—'}
                    <span className="tabular text-muted">
                      {' '}
                      (son tarih: {course.homework.due_date})
                    </span>
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
                      <th className="px-3 py-2">İlgi puanı</th>
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
        ),
      )}
    </div>
  );
}

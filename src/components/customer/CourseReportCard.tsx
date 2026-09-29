/**
 * Tek dersin karne kartı — rapor detayında ve public sayfada ortak.
 *
 * Sabit okuma sırası: başlık (ders + öğretmen + gün/saat) + devamsızlık rozeti →
 * iki puan (ham 1–10 + 10 adımlı gösterge) → öğretmen notu → işlenen konu /
 * verilmiş ödev / yapılacak ödev. Eksik ders ("Bu hafta rapor girilmedi") sönük
 * kalır, puan çizilmez. Durum yalnızca renkle değil ikon + metinle verilir.
 */

import { BookOpen } from 'lucide-react';
import type { ReactNode } from 'react';
import { DAY_LABELS, type DigestSnapshotCourse } from '../../types';
import { formatDate } from '../../utils/date';
import { AttendanceBadge, Badge, Card } from '../ui';
import ScoreScale from './ScoreScale';

function InfoRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-[13px] font-medium text-muted">{label}</dt>
      <dd className="mt-0.5 text-sm text-text">{children}</dd>
    </div>
  );
}

export default function CourseReportCard({
  course,
  renderPrevHomework,
}: {
  course: DigestSnapshotCourse;
  /** "Verilmiş ödev" satırının altına eklenecek isteğe bağlı içerik (dosyalar). */
  renderPrevHomework?: () => ReactNode;
}) {
  const missing = course.status === 'missing';
  const stripe = missing ? 'missing' : (course.entry?.attendance ?? 'neutral');
  return (
    <Card
      id={`course-${course.class_course_id}`}
      data-status={stripe}
      padding="lg"
      className="scroll-mt-4 break-inside-avoid"
    >
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-base font-semibold text-text">
            <BookOpen size={18} aria-hidden="true" className="shrink-0 text-muted" />
            {course.course_name}
          </h2>
          <p className="tabular mt-0.5 text-[13px] text-muted">
            {course.teacher_name} · {DAY_LABELS[course.day_of_week]}
            {course.lesson_time ? ` · ${course.lesson_time}` : ''}
          </p>
        </div>
        {missing ? (
          <Badge tone="warning">Bu hafta rapor girilmedi</Badge>
        ) : course.entry ? (
          <AttendanceBadge attendance={course.entry.attendance} />
        ) : null}
      </div>

      {missing ? (
        <p className="mt-4 text-sm text-muted">Bu hafta bu ders için rapor girilmedi.</p>
      ) : (
        <>
          {course.entry ? (
            <>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <ScoreScale label="Ödev puanı" value={course.entry.homework_score} />
                <ScoreScale label="Ders içi performans" value={course.entry.interest_score} />
              </div>
              {course.entry.teacher_note && (
                <figure className="mt-4 rounded-md bg-subtle/60 px-4 py-3">
                  <figcaption className="text-[13px] font-medium text-muted">
                    Öğretmen notu
                  </figcaption>
                  <blockquote className="mt-1 text-sm leading-relaxed text-text">
                    {course.entry.teacher_note}
                  </blockquote>
                </figure>
              )}
            </>
          ) : (
            <p className="mt-4 text-sm text-muted">
              Bu hafta öğrenci için rapor satırı girilmedi.
            </p>
          )}

          <dl className="mt-4 space-y-3">
            {course.topic_covered && (
              <InfoRow label="İşlenen konu">{course.topic_covered}</InfoRow>
            )}
            {(course.prev_homework_text || course.prev_homework_id) && (
              <div>
                <InfoRow label="Verilmiş ödev">{course.prev_homework_text || '—'}</InfoRow>
                {renderPrevHomework?.()}
              </div>
            )}
            {course.homework && (
              <div>
                <InfoRow label="Yapılacak ödev">
                  {course.homework.description || '—'}
                  <span className="tabular block text-[13px] text-muted">
                    Son tarih: {formatDate(course.homework.due_date)}
                  </span>
                </InfoRow>
                {course.homework.graded_in_week && (
                  <p className="mt-1 text-[13px] text-muted">
                    Bu ödevin değerlendirmesi{' '}
                    <span className="tabular">
                      {course.homework.graded_in_week.relative_week_no}. hafta
                    </span>{' '}
                    ({course.homework.graded_in_week.label}) raporunda görünecek.
                  </p>
                )}
              </div>
            )}
          </dl>
        </>
      )}
    </Card>
  );
}

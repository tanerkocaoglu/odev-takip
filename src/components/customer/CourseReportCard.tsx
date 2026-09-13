/**
 * Tek dersin karne kartı — rapor detayında ve public sayfada ortak.
 *
 * Sabit okuma sırası: başlık (ders + öğretmen + gün/saat + durum) → iki puan
 * (ham 1–10 + 10 adımlı gösterge) → devamsızlık → öğretmen notu → işlenen konu /
 * verilmiş ödev / yapılacak ödev + değerlendirme haftası notu. Eksik ders
 * ("Bu hafta rapor girilmedi") sönük kalır, puan çizilmez.
 */

import { BookOpen } from 'lucide-react';
import type { ReactNode } from 'react';
import { DAY_LABELS, type DigestSnapshotCourse } from '../../types';
import ScoreScale from './ScoreScale';
import AttendanceChip from './AttendanceChip';

function InfoRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex gap-2">
      <span className="shrink-0 font-medium text-muted">{label}</span>
      <span className="text-text">{children}</span>
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
    <article
      id={`course-${course.class_course_id}`}
      data-status={stripe}
      className="scroll-mt-32 rounded-2xl border border-border bg-surface p-5 elevation-1"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-base font-semibold text-text">
            <BookOpen size={18} aria-hidden="true" className="shrink-0 text-accent" />
            {course.course_name}
          </h2>
          <p className="tabular mt-0.5 text-sm text-muted">
            {course.teacher_name} · {DAY_LABELS[course.day_of_week]}
            {course.lesson_time ? ` · ${course.lesson_time}` : ''}
          </p>
        </div>
        <span
          className={
            'inline-flex shrink-0 items-center rounded-full px-2.5 py-1 text-xs font-medium ' +
            (missing
              ? 'bg-att-late/10 text-att-late'
              : 'bg-status-completed/10 text-status-completed')
          }
        >
          {missing ? 'Bu hafta rapor girilmedi' : 'Rapor hazır'}
        </span>
      </div>

      {missing ? (
        <p className="mt-4 text-sm text-muted">Bu hafta bu ders için rapor girilmedi.</p>
      ) : (
        <>
          {course.entry ? (
            <>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <ScoreScale label="Ödev puanı" value={course.entry.homework_score} />
                <ScoreScale
                  label="Ders içi performans"
                  value={course.entry.interest_score}
                />
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
                <span className="font-medium text-muted">Devamsızlık:</span>
                <AttendanceChip attendance={course.entry.attendance} />
              </div>
              {course.entry.teacher_note && (
                <blockquote className="mt-4 rounded-xl border-l-4 border-accent/40 bg-bg/50 px-4 py-3 text-sm italic leading-relaxed text-text">
                  {course.entry.teacher_note}
                </blockquote>
              )}
            </>
          ) : (
            <p className="mt-4 text-sm text-muted">
              Bu hafta öğrenci için rapor satırı girilmedi.
            </p>
          )}

          <div className="mt-4 space-y-2 text-sm">
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
                  <span className="tabular text-muted">
                    {' '}
                    (son tarih: {course.homework.due_date})
                  </span>
                </InfoRow>
                {course.homework.graded_in_week && (
                  <p className="mt-1 text-xs text-muted">
                    Bu ödevin değerlendirmesi{' '}
                    <span className="tabular">
                      {course.homework.graded_in_week.relative_week_no}. hafta
                    </span>{' '}
                    ({course.homework.graded_in_week.label}) raporunda görünecek.
                  </p>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </article>
  );
}

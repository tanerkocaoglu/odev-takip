/**
 * Haftalık raporun ortak görünümü — girişli veli detayı ve public `/r/{token}`
 * aynı bileşeni kullanır (`variant`).
 *
 * Üstte haftanın derslerine tek bakış (`CourseOverview`: her ders tek satır,
 * ham puanlarla); altında dört dersin **tamamı açık** dikey istif hâlinde —
 * hiçbiri sekme, akordiyon veya kaydırmalı kartla gizlenmez.
 *
 * `renderPrevHomework` yalnızca girişli veli detayında geçirilir (dosya
 * önizlemesi Bearer gerektirir); public görünümde dosya gömülmez.
 */

import type { ReactNode } from 'react';
import type { DigestSnapshot, DigestSnapshotCourse } from '../../types';
import ReportCover from './ReportCover';
import CourseReportCard from './CourseReportCard';
import CourseOverview from './CourseOverview';

export default function GuardianReportView({
  snapshot,
  variant,
  sentAt,
  renderPrevHomework,
}: {
  snapshot: DigestSnapshot;
  variant: 'guardian' | 'public';
  sentAt: string | null;
  renderPrevHomework?: (course: DigestSnapshotCourse) => ReactNode;
}) {
  const prefersReducedMotion =
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function jumpToCourse(classCourseId: string) {
    const el = document.getElementById(`course-${classCourseId}`);
    if (el && typeof el.scrollIntoView === 'function') {
      el.scrollIntoView({
        behavior: prefersReducedMotion ? 'auto' : 'smooth',
        block: 'start',
      });
    }
  }

  return (
    <div className="space-y-6">
      <ReportCover snapshot={snapshot} variant={variant} sentAt={sentAt} />

      {snapshot.courses.length > 1 && (
        <CourseOverview courses={snapshot.courses} onJump={jumpToCourse} />
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {snapshot.courses.map((c) => (
          <CourseReportCard
            key={c.class_course_id}
            course={c}
            renderPrevHomework={
              renderPrevHomework ? () => renderPrevHomework(c) : undefined
            }
          />
        ))}
      </div>
    </div>
  );
}

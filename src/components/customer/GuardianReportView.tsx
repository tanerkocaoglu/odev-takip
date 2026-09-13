/**
 * Haftalık raporun ortak görünümü — girişli veli detayı ve public `/r/{token}`
 * aynı bileşeni kullanır (`variant`).
 *
 * Dört dersin **tamamı açık** dikey istif hâlinde gösterilir; hiçbiri sekme,
 * akordiyon veya kaydırmalı kartla gizlenmez. Üstte derslere hızlı atlama
 * çipleri (sticky) bulunur — sayı sabit ve az olduğu için taşma riski yoktur;
 * yine de dar ekranda çip şeridi yatay kaydırılabilir.
 *
 * `renderPrevHomework` yalnızca girişli veli detayında geçirilir (dosya
 * önizlemesi Bearer gerektirir); public görünümde dosya gömülmez.
 */

import type { ReactNode } from 'react';
import type { DigestSnapshot, DigestSnapshotCourse } from '../../types';
import ReportCover from './ReportCover';
import CourseReportCard from './CourseReportCard';

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
        <nav
          aria-label="Derslere git"
          className="sticky top-0 z-20 -mx-4 border-b border-border/60 bg-bg/85 px-4 py-2 backdrop-blur-md"
        >
          <div className="flex gap-2 overflow-x-auto pb-0.5 [scrollbar-width:none]">
            {snapshot.courses.map((c) => (
              <button
                key={c.class_course_id}
                type="button"
                onClick={() => jumpToCourse(c.class_course_id)}
                className="shrink-0 rounded-full border border-border bg-surface px-3.5 py-2 text-sm font-medium text-text transition-colors hover:border-accent hover:text-accent"
              >
                {c.course_name}
              </button>
            ))}
          </div>
        </nav>
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

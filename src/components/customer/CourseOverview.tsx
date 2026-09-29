/**
 * Haftanın derslerine tek bakış — her ders tek satır: ders adı, devamsızlık
 * rozeti ve HAM puanlar ("Ödev 8 · Perf. 9"; ortalama/yüzde YOK). Satıra
 * dokununca ilgili ders kartına kaydırır. Telefonda haftanın 4 dersi birlikte,
 * kaydırmadan görünür.
 */

import { ChevronDown } from 'lucide-react';
import { DAY_LABELS, type DigestSnapshotCourse } from '../../types';
import { AttendanceBadge, Badge, Card } from '../ui';

export default function CourseOverview({
  courses,
  onJump,
}: {
  courses: DigestSnapshotCourse[];
  onJump: (classCourseId: string) => void;
}) {
  return (
    <section aria-labelledby="week-courses" className="print:hidden">
      <h2 id="week-courses" className="mb-2 text-sm font-semibold text-text">
        Haftanın dersleri
      </h2>
      <Card padding="none">
        <ul className="divide-y divide-border">
          {courses.map((c) => {
            const missing = c.status === 'missing';
            const scores = c.entry
              ? `Ödev ${c.entry.homework_score ?? '—'} · Perf. ${c.entry.interest_score ?? '—'}`
              : null;
            return (
              <li key={c.class_course_id}>
                <button
                  type="button"
                  onClick={() => onJump(c.class_course_id)}
                  aria-label={`${c.course_name} dersinin ayrıntısına git`}
                  className="flex min-h-14 w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-subtle/60"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-text">
                      {c.course_name}
                    </span>
                    <span className="tabular block truncate text-[13px] text-muted">
                      {DAY_LABELS[c.day_of_week]}
                      {c.lesson_time ? ` · ${c.lesson_time}` : ''}
                    </span>
                  </span>
                  <span className="flex shrink-0 flex-col items-end gap-1">
                    {missing ? (
                      <Badge tone="warning">Rapor girilmedi</Badge>
                    ) : c.entry ? (
                      <>
                        <AttendanceBadge attendance={c.entry.attendance} />
                        <span className="tabular text-[13px] text-muted">{scores}</span>
                      </>
                    ) : null}
                  </span>
                  <ChevronDown size={16} aria-hidden="true" className="shrink-0 text-muted" />
                </button>
              </li>
            );
          })}
        </ul>
      </Card>
    </section>
  );
}

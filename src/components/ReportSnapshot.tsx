/**
 * Admin gönderim önizlemesi — bir `DigestSnapshot`'ı veli tarafıyla AYNI bileşenlerle çizer
 * (`ReportCover` + `CourseReportCard`), böylece koordinatörün gördüğü, velinin göreceğiyle birebir
 * aynıdır. Yalnızca admin'e özgü eklentiler: ders başlığında isteğe bağlı eylem ("Düzenle") ve
 * ödev dosyaları (admin oturumu Bearer ile açar).
 * Snapshot veri biçimi sabittir; **puanlar her zaman ham 1–10 değeridir** (yüzde/özet yok).
 */

import type { ReactNode } from 'react';
import type { DigestSnapshot, DigestSnapshotCourse } from '../types';
import { openProtectedFile } from '../services/api';
import CourseReportCard from './customer/CourseReportCard';
import ReportCover from './customer/ReportCover';
import HomeworkAttachments from './HomeworkAttachments';

export default function ReportSnapshot({
  snapshot,
  renderCourseAction,
  renderPrevHomework,
}: {
  snapshot: DigestSnapshot;
  /** Ders kartı başlığına eklenecek isteğe bağlı aksiyon (ör. admin "Düzenle"). */
  renderCourseAction?: (course: DigestSnapshotCourse) => ReactNode;
  /** "Verilmiş ödev" altına ek içerik verilirse dosya listesinin yerine geçer. */
  renderPrevHomework?: (course: DigestSnapshotCourse) => ReactNode;
}) {
  const open = (key: string) => void openProtectedFile(key).catch(() => {});
  return (
    <div className="space-y-4">
      <ReportCover snapshot={snapshot} variant="guardian" sentAt={null} />
      <div className="grid gap-4 lg:grid-cols-2">
        {snapshot.courses.map((course) => (
          <CourseReportCard
            key={course.class_course_id}
            course={course}
            action={renderCourseAction?.(course)}
            renderPrevHomework={() =>
              renderPrevHomework ? (
                renderPrevHomework(course)
              ) : course.prev_homework_attachments &&
                course.prev_homework_attachments.length > 0 ? (
                <div className="mt-1.5">
                  <HomeworkAttachments
                    attachments={course.prev_homework_attachments}
                    onOpen={open}
                  />
                </div>
              ) : null
            }
            renderHomework={() =>
              course.homework_attachments && course.homework_attachments.length > 0 ? (
                <div className="mt-1.5">
                  <HomeworkAttachments attachments={course.homework_attachments} onOpen={open} />
                </div>
              ) : null
            }
          />
        ))}
      </div>
    </div>
  );
}

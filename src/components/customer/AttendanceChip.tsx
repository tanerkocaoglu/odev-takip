/**
 * Devamsızlık çipi — anlam taşıyan semantik renkler (ürün genelinde aynı):
 * nötr gri, amber, kırmızı, mavi. Renk tek başına anlam taşımaz; metin de var.
 */

import { ATTENDANCE_LABELS, type Attendance } from '../../types';

const TONES: Record<Attendance, string> = {
  present: 'bg-status-draft/10 text-status-draft',
  late: 'bg-att-late/10 text-att-late',
  absent: 'bg-att-absent/10 text-att-absent',
  excused: 'bg-excused/10 text-excused',
};

export default function AttendanceChip({ attendance }: { attendance: Attendance }) {
  return (
    <span
      className={
        'inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ' +
        TONES[attendance]
      }
    >
      {ATTENDANCE_LABELS[attendance]}
    </span>
  );
}

import type { StudentHomework } from '../../types';
import { todayIstanbulISO } from '../../utils/date';

/** Kart/rozet durumu — teslim durumundan türetilir. */
export type CardStatus = 'submitted' | 'late' | 'overdue' | 'pending';

export function cardStatus(item: StudentHomework): CardStatus {
  const sub = item.submission;
  if (sub) return sub.is_late ? 'late' : 'submitted';
  return item.due_date < todayIstanbulISO() ? 'overdue' : 'pending';
}

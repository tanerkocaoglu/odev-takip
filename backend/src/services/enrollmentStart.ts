/**
 * Enrollment başlangıç haftası çözümü — tekil öğrenci oluşturma ve CSV toplu
 * içe aktarma **aynı kuralı** kullanır (spec.md §3.1 / §5.6).
 *
 * `enrollments.start_date` artık "bugün" değil, admin'in seçtiği haftanın
 * `start_date`'idir. Seçim yoksa aktif haftanın başlangıcı (bugünü kapsayan,
 * yoksa en erken gelecek hafta) kullanılır; hiç hafta tanımlı değilse eski
 * davranış (bugün) korunur.
 *
 * Bitmiş (`end_date < bugün`) bir hafta **seçilemez** — öğrenciyi geçmişe
 * geri tarihli eklemek anlamsızdır. Aktif haftanın `start_date`'i (bugünden
 * önce, ör. Cumartesi) geçmiş sayılmaz; geçmişlik ölçütü haftanın
 * **bitmiş** olmasıdır (`hasWeekEnded`).
 */

import { db } from '../db/index.js';
import { AppError } from '../errors.js';
import type { WeekRecord } from '../utils/weeks.js';
import { hasWeekEnded, localTodayISO } from '../utils/time.js';
import { currentDigestWeek } from './digests.js';

/**
 * Bir enrollment için yazılacak `start_date`'i döner.
 *
 * @param weekId        Admin'in seçtiği hafta (opsiyonel).
 * @param expectedYearId Sınıfın (veya aktif yılın) eğitim yılı; verilirse
 *        seçilen hafta bu yıla ait olmalı.
 */
export function resolveEnrollmentStartDate(
  weekId: string | undefined,
  expectedYearId?: string | null,
): string {
  if (weekId) {
    const week = db.prepare(`SELECT * FROM weeks WHERE id = ?`).get(weekId) as
      | WeekRecord
      | undefined;
    if (!week) {
      throw new AppError('NOT_FOUND', 404, 'Hafta bulunamadı.');
    }
    if (expectedYearId && week.academic_year_id !== expectedYearId) {
      throw new AppError(
        'VALIDATION_ERROR',
        400,
        'Seçilen hafta ile sınıf aynı eğitim yılında olmalı.',
        { week_id: 'Seçilen hafta sınıfın eğitim yılında değil.' },
      );
    }
    if (hasWeekEnded(week)) {
      throw new AppError(
        'VALIDATION_ERROR',
        400,
        'Geçmiş bir hafta seçilemez. Yalnızca aktif veya gelecek bir hafta seçilebilir.',
        { week_id: 'Geçmiş bir hafta seçilemez.' },
      );
    }
    return week.start_date;
  }

  // Varsayılan: aktif haftanın başlangıcı. Aktif hafta yoksa (boşlukta en
  // erken gelecek hafta) currentDigestWeek onu verir; hafta bitmişse veya
  // farklı yıla aitse geçmişe düşmemek için bugüne inilir.
  const activeWeek = currentDigestWeek();
  if (
    activeWeek &&
    !hasWeekEnded(activeWeek) &&
    (!expectedYearId || activeWeek.academic_year_id === expectedYearId)
  ) {
    return activeWeek.start_date;
  }
  return localTodayISO();
}

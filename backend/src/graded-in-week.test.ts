/**
 * `resolveGradedInWeek` birim testleri — "Yapılacak ödev"in değerlendirme
 * haftası (bir sonraki ders haftası) çözümü.
 *
 * Bu testlerin kritik ayrımı (kullanıcı netleştirmesi): `null` **yalnızca**
 * gerçek eğitim yılı sonu için beklenen sonuçtur. Sorgu/veri tutarsızlıkları
 * (boş akademik yıl referansı, geriye giden hafta sırası) `null`'a
 * çevrilmemeli — hata fırlatmalı. Böylece "gerçekten son hafta" ile
 * "beklenmeyen bir hata" testte ayrı ayrı ele alınır ve ikincisi sessizce
 * birincisi gibi görünmez.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { db } from './db/index.js';
import { resetDb, insertTestUsers } from './test/helpers.js';
import { resolveGradedInWeek } from './services/digests.js';
import type { WeekRecord } from './utils/weeks.js';

function week(
  id: string,
  academicYearId: string,
  weekNo: number,
  start: string,
  end: string,
): WeekRecord {
  return {
    id,
    academic_year_id: academicYearId,
    week_no: weekNo,
    start_date: start,
    end_date: end,
    label: `Hafta ${weekNo}`,
  };
}

let w1: WeekRecord;
let w2: WeekRecord;
let badA: WeekRecord;
let badB: WeekRecord;

beforeAll(() => {
  resetDb();
  insertTestUsers();

  const insertYear = db.prepare(
    `INSERT INTO academic_years (id, name, start_date, end_date, is_active)
     VALUES (?, ?, ?, ?, ?)`,
  );
  insertYear.run('gw-year', '2026-2027', '2026-07-20', '2026-08-16', 1);
  insertYear.run('gw-year-bad', '2027-2028', '2027-07-20', '2027-08-16', 0);

  const insertWeek = db.prepare(
    `INSERT INTO weeks (id, academic_year_id, week_no, start_date, end_date, label)
     VALUES (?, ?, ?, ?, ?, ?)`,
  );
  w1 = week('gw-week-1', 'gw-year', 1, '2026-07-27', '2026-08-02');
  w2 = week('gw-week-2', 'gw-year', 2, '2026-08-03', '2026-08-09');
  insertWeek.run(w1.id, w1.academic_year_id, w1.week_no, w1.start_date, w1.end_date, w1.label);
  insertWeek.run(w2.id, w2.academic_year_id, w2.week_no, w2.start_date, w2.end_date, w2.label);

  // Tutarsız sıra: start_date'e göre SONRA gelen haftanın week_no'su DAHA KÜÇÜK.
  badA = week('gw-bad-a', 'gw-year-bad', 2, '2027-09-01', '2027-09-07');
  badB = week('gw-bad-b', 'gw-year-bad', 1, '2027-09-08', '2027-09-14');
  insertWeek.run(badA.id, badA.academic_year_id, badA.week_no, badA.start_date, badA.end_date, badA.label);
  insertWeek.run(badB.id, badB.academic_year_id, badB.week_no, badB.start_date, badB.end_date, badB.label);

  // Görece etiket temeli: sınıf + ilk aktif hafta (hafta 1).
  db.prepare(
    `INSERT INTO classes (id, academic_year_id, name, name_normalized, deleted_at)
     VALUES ('gw-class', 'gw-year', 'Graded Sınıf', 'graded sinif', NULL)`,
  ).run();
  db.prepare(
    `INSERT INTO enrollments (id, student_id, class_id, start_date, end_date)
     VALUES ('gw-enr', 'test-student-rec', 'gw-class', ?, NULL)`,
  ).run(w1.start_date);
});

describe('resolveGradedInWeek', () => {
  it('normal hafta → görece etiketli sonraki haftayı döner', () => {
    // Hafta 1'in değerlendirmesi hafta 2'de; sınıfın ilk aktif haftası 1 → 2.
    expect(resolveGradedInWeek(w1, 'gw-class')).toEqual({
      week_no: 2,
      label: 'Hafta 2',
      relative_week_no: 2,
    });
  });

  it('yılın son haftası (sonraki hafta kaydı yok) → null (beklenen)', () => {
    // Bu, `null`un haklı olduğu TEK durumdur.
    expect(resolveGradedInWeek(w2, 'gw-class')).toBeNull();
  });

  it('boş akademik yıl referansı → hata fırlatır (null beklenen sonuçla karışmaz)', () => {
    const broken: WeekRecord = { ...w1, academic_year_id: '' };
    expect(() => resolveGradedInWeek(broken, 'gw-class')).toThrow(
      /veri tutarsızlığı/,
    );
  });

  it('geriye giden hafta sırası → hata fırlatır (sessizce null olmaz)', () => {
    // badA (week_no 2) → start_date sonrası badB (week_no 1): tutarsız.
    expect(() => resolveGradedInWeek(badA, 'gw-class')).toThrow(/tutarsız/);
  });
});

import { describe, it, expect } from 'vitest';
import {
  calculateDueDate,
  getPreviousWeek,
  type WeekRecord,
} from './weeks.js';

function week(
  id: string,
  weekNo: number,
  startDate: string,
  endDate: string,
): WeekRecord {
  return {
    id,
    academic_year_id: 'ay-2025-2026',
    week_no: weekNo,
    start_date: startDate,
    end_date: endDate,
    label: `${startDate} - ${endDate}`,
  };
}

describe('getPreviousWeek', () => {
  it('normal haftada bir önceki haftayı döner', () => {
    const weeks = [
      week('w5', 5, '2025-10-27', '2025-11-02'),
      week('w6', 6, '2025-11-03', '2025-11-09'),
    ];
    const prev = getPreviousWeek(weeks, weeks[1]);
    expect(prev?.id).toBe('w5');
    expect(prev?.week_no).toBe(5);
  });

  it('arada tatil varsa bir önceki ders yapılan haftaya atlar', () => {
    // 6. hafta tatil — kayıt açılmadı. 7. haftanın önceki kaydı 5. hafta olur.
    const weeks = [
      week('w4', 4, '2025-10-20', '2025-10-26'),
      week('w5', 5, '2025-10-27', '2025-11-02'),
      week('w7', 7, '2025-11-10', '2025-11-16'),
    ];
    const prev = getPreviousWeek(weeks, weeks[2]);
    expect(prev?.id).toBe('w5');
    expect(prev?.week_no).toBe(5);
  });

  it('yılın ilk haftası için null döner', () => {
    const weeks = [week('w1', 1, '2025-09-01', '2025-09-07')];
    const prev = getPreviousWeek(weeks, weeks[0]);
    expect(prev).toBeNull();
  });
});

describe('calculateDueDate', () => {
  const weeks = [
    week('w1', 1, '2025-09-01', '2025-09-07'), // Pazartesi-Pazar
    week('w2', 2, '2025-09-08', '2025-09-14'),
    week('w3', 3, '2025-09-15', '2025-09-21'),
  ];

  it('normal haftada bir sonraki aynı ders gününü döner', () => {
    // 1. hafta ders günü: Çarşamba (3). Sonraki haftada Çarşamba: 10.09.2025
    expect(calculateDueDate(weeks[0], 3, weeks)).toBe('2025-09-10');
  });

  it('arada tatil haftası varsa sonraki ders haftasına kayar', () => {
    // 3. hafta kaçık (w4 doğrudan geliyor) — tatil sırasında kayıt yok.
    const withGap = [
      week('w1', 1, '2025-09-01', '2025-09-07'),
      week('w2', 2, '2025-09-08', '2025-09-14'),
      week('w4', 4, '2025-09-22', '2025-09-28'),
    ];
    // 2. hafta ders günü Salı (2) → yılın 4. haftasındaki Salı: 23.09.2025
    expect(calculateDueDate(withGap[1], 2, withGap)).toBe('2025-09-23');
  });

  it('yılın son haftası (sonraki weeks kaydı yok) için null döner', () => {
    expect(calculateDueDate(weeks[2], 5, weeks)).toBeNull();
  });

  it('döngü sonu: takip eden hafta içinde ders günü bulunamazsa null', () => {
    // 7 günlük haftada her gün 1-7 arasında bir değerle eşleşir;
    // bu yüzden normal koşulda asla null olmaz. Sınır: dayOfWeek 1..7 dışı.
    expect(calculateDueDate(weeks[0], 8, weeks)).toBeNull();
  });
});

import { afterEach, describe, it, expect, vi } from 'vitest';
import { hasWeekEnded, isClassDayWithinWeek, isOverdue, localTodayISO } from './time.js';
import type { WeekRecord } from './weeks.js';

function week(startDate: string): WeekRecord {
  return {
    id: 'w1',
    academic_year_id: 'y1',
    week_no: 1,
    start_date: startDate,
    end_date: startDate,
    label: 'Hafta 1',
  };
}

/** Belirli aralıklı hafta (bozuk tanım senaryoları için). */
function rangeWeek(startDate: string, endDate: string): WeekRecord {
  return {
    id: 'w1',
    academic_year_id: 'y1',
    week_no: 1,
    start_date: startDate,
    end_date: endDate,
    label: 'Hafta 1',
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('isClassDayWithinWeek', () => {
  it('normal 7 günlük haftada tüm günler aralık içinde', () => {
    const w = rangeWeek('2026-09-21', '2026-09-27');
    for (let d = 1; d <= 7; d++) {
      expect(isClassDayWithinWeek(w, d)).toBe(true);
    }
  });

  it('6 günlük haftada Pazar dersi aralık dışında (21..26)', () => {
    const w = rangeWeek('2026-09-21', '2026-09-26');
    expect(isClassDayWithinWeek(w, 6)).toBe(true); // Cumartesi 26 → son gün
    expect(isClassDayWithinWeek(w, 7)).toBe(false); // Pazar 27 → dışarıda
  });

  it('Cumartesi başlangıçlı 7 günlük haftada Pazar son gündür', () => {
    const w = rangeWeek('2026-09-26', '2026-10-02');
    expect(isClassDayWithinWeek(w, 7)).toBe(true); // Pazar 27
    expect(isClassDayWithinWeek(w, 1)).toBe(true); // Pazartesi 28
  });
});

describe('hasWeekEnded', () => {
  it('geçmiş hafta true; devam eden ve gelecek hafta false', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      vi.setSystemTime(new Date(2026, 8, 28, 10, 0, 0)); // 28.09.2026 Pazartesi
      expect(hasWeekEnded(rangeWeek('2026-09-14', '2026-09-20'))).toBe(true); // geçen hafta
      expect(hasWeekEnded(rangeWeek('2026-09-27', '2026-10-03'))).toBe(false); // bugünü kapsayan hafta
      expect(hasWeekEnded(rangeWeek('2026-10-05', '2026-10-11'))).toBe(false); // gelecek hafta
    } finally {
      vi.useRealTimers();
    }
  });

  it('end_date bugünse henüz bitmemiş sayılır; dünse bitmiştir', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      vi.setSystemTime(new Date(2026, 8, 28, 10, 0, 0)); // 28.09.2026
      expect(hasWeekEnded(rangeWeek('2026-09-22', '2026-09-28'))).toBe(false); // end == bugün
      expect(hasWeekEnded(rangeWeek('2026-09-21', '2026-09-27'))).toBe(true); // end < bugün
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('localTodayISO', () => {
  it('makine yerel gününü YYYY-MM-DD biçiminde döner', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 2, 9, 23, 30, 0));
    expect(localTodayISO()).toBe('2026-03-09');
  });

  it('ay ve gün tek haneliyse sıfırla doldurur', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 0, 5, 8, 0, 0));
    expect(localTodayISO()).toBe('2026-01-05');
  });
});

describe('isOverdue', () => {
  const monday = week('2026-03-09'); // Pazartesi

  it('ders günü bugünden önceyse true', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 2, 10, 12, 0, 0)); // Salı
    expect(isOverdue(monday, 1)).toBe(true); // Pazartesi 3/9 < 3/10
  });

  it('ders günü bugünse false (gün içinde geçmiş sayılmaz)', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 2, 10, 12, 0, 0)); // Salı
    expect(isOverdue(monday, 2)).toBe(false); // Salı 3/10 === bugün
  });

  it('ders günü gelecekteyse false', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 2, 10, 12, 0, 0)); // Salı
    expect(isOverdue(monday, 5)).toBe(false); // Cuma 3/13
  });
});

describe('isOverdue — hafta başlangıcı Pazartesi değilse', () => {
  // Cumartesi başlangıçlı hafta: 26.09.2026 (Cmt) .. 02.10.2026 (Cum).
  const saturday = week('2026-09-26');

  it('Pazar dersi (day_of_week=7) ertesi gün geçmiş sayılır', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 8, 28, 10, 0, 0)); // Pazartesi 28.09
    // Pazar 27.09 < Pazartesi 28.09 → geçmiş. (Eski hatalı hesap 02.10 derdi.)
    expect(isOverdue(saturday, 7)).toBe(true);
  });

  it('Salı dersi (day_of_week=2) henüz geçmemiş sayılır', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 8, 28, 10, 0, 0)); // Pazartesi 28.09
    // Salı 29.09 > Pazartesi 28.09 → geçmedi. (Eski hatalı hesap 27.09 derdi.)
    expect(isOverdue(saturday, 2)).toBe(false);
  });

  it('Cumartesi dersi (day_of_week=6) haftanın ilk günüdür', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 8, 26, 10, 0, 0)); // Cumartesi 26.09 (gün içi)
    expect(isOverdue(saturday, 6)).toBe(false); // 26.09 === bugün
  });
});

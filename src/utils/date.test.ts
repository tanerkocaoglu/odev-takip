import { describe, it, expect } from 'vitest';
import { formatDate, formatDateTime, formatTime } from './date';

describe('formatDate', () => {
  it('tarih-only ISOyu gg.aa.yyyy yapar', () => {
    expect(formatDate('2026-09-22')).toBe('22.09.2026');
  });

  it('tek haneli gün/ayı sıfır dolgusuyla korur', () => {
    expect(formatDate('2026-01-05')).toBe('05.01.2026');
  });

  it('tam ISO damgasının yalnızca tarih kısmını kullanır', () => {
    expect(formatDate('2026-09-22T23:30:00.000Z')).toBe('22.09.2026');
  });

  it('boş/eksik değerde boş dize döner', () => {
    expect(formatDate(null)).toBe('');
    expect(formatDate(undefined)).toBe('');
    expect(formatDate('')).toBe('');
  });
});

describe('formatDateTime / formatTime (Europe/Istanbul)', () => {
  it('UTC damgasını İstanbul saatine (UTC+3) çevirir', () => {
    expect(formatDateTime('2026-09-22T10:05:00.000Z')).toBe('22.09.2026 13:05');
    expect(formatTime('2026-09-22T10:05:00.000Z')).toBe('13:05');
  });

  it('gün sınırını İstanbul takvimine göre aşar', () => {
    expect(formatDateTime('2026-09-22T22:30:00.000Z')).toBe('23.09.2026 01:30');
  });

  it('geçersiz girdide boş dize döner', () => {
    expect(formatDateTime('bozuk')).toBe('');
    expect(formatTime('bozuk')).toBe('');
  });
});

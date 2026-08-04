/**
 * Public veli rapor sayfası frontend testleri — Aşama 5.
 * `/r/{token}`: geçerli snapshot render edilir; iptal/bilinmeyen token
 * "Bu rapor artık geçerli değil." gösterir (410).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import TokenReportPage from './pages/TokenReportPage';

function renderTokenPage(token: string) {
  return render(
    <MemoryRouter initialEntries={[`/r/${token}`]}>
      <Routes>
        <Route path="/r/:token" element={<TokenReportPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

function mockFetch(status: number, body: unknown) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  });
}

const SNAPSHOT = {
  week: { id: 'w1', week_no: 5, start_date: '2026-01-05', end_date: '2026-01-11', label: '05 - 11 Ocak' },
  class: { id: 'c1', name: 'ÖKLİD' },
  student: { id: 's1', name: 'Örnek Kişi 6' },
  guardian_name: 'Ayşe Örnek',
  courses: [
    {
      class_course_id: 'cc1',
      course_name: 'Matematik',
      teacher_name: 'Örnek Kişi 5',
      day_of_week: 1,
      lesson_time: '09:00',
      status: 'completed',
      topic_covered: 'Denklemler',
      prev_homework_text: 'Sayfa 10',
      homework: { description: 'Sayfa 12, 1-8', due_date: '2026-01-12' },
      entry: {
        student_id: 's1',
        student_name: 'Örnek Kişi 6',
        attendance: 'present',
        homework_score: 8,
        interest_score: 9,
        teacher_note: 'Gayretli.',
      },
    },
    {
      class_course_id: 'cc2',
      course_name: 'Fizik',
      teacher_name: 'Örnek Kişi 4',
      day_of_week: 3,
      lesson_time: null,
      status: 'missing',
      topic_covered: null,
      prev_homework_text: null,
      homework: null,
      entry: null,
    },
  ],
};

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('TokenReportPage', () => {
  it('geçerli snapshot içeriğini gösterir (dersler + puanlar + eksik ders)', async () => {
    vi.stubGlobal('fetch', mockFetch(200, { snapshot: SNAPSHOT, sent_at: null }));
    renderTokenPage('tok');

    await waitFor(() => {
      expect(screen.getByText('05 - 11 Ocak haftalık rapor')).toBeInTheDocument();
    });
    expect(screen.getByText('Örnek Kişi 6')).toBeInTheDocument();
    expect(screen.getByText('Matematik')).toBeInTheDocument();
    expect(screen.getByText('ÖKLİD')).toBeInTheDocument();
    expect(screen.getByText('8')).toBeInTheDocument();
    expect(screen.getByText('9')).toBeInTheDocument();
    expect(screen.getByText('Gayretli.')).toBeInTheDocument();
    expect(screen.getByText('Bu hafta rapor girilmedi')).toBeInTheDocument();
    expect(screen.getByText('Fizik')).toBeInTheDocument();
  });

  it('iptal edilmiş token 410 gösterir', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetch(410, {
        error: { code: 'GONE', message: 'Bu rapor artık geçerli değil.' },
      }),
    );
    renderTokenPage('dead');

    await waitFor(() => {
      expect(screen.getByText('Bu rapor artık geçerli değil.')).toBeInTheDocument();
    });
  });

  it('hata durumunda mesaj gösterilir', async () => {
    vi.stubGlobal('fetch', mockFetch(500, { error: { code: 'INTERNAL', message: 'Bir hata oluştu.' } }));
    renderTokenPage('x');

    await waitFor(() => {
      expect(screen.getByText('Bir hata oluştu.')).toBeInTheDocument();
    });
  });
});

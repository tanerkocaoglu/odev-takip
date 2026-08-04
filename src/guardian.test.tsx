/**
 * Veli paneli frontend testleri — Aşama 5.
 * GuardianHomePage: öğrenci seçimi + gönderilmiş rapor listesi; tek çocukta
 * otomatik seçim. Rapor detayı (snapshot + teslim geçmişi) ayrı testte.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { guardianApi } from './services/api';
import GuardianHomePage from './pages/guardian/GuardianHomePage';
import GuardianReportDetailPage from './pages/guardian/GuardianReportDetailPage';

function mockFetch(status: number, body: unknown) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  });
}

const STUDENTS = {
  items: [
    { student_id: 's1', student_name: 'Örnek Kişi 6', username: 'ogrenci1', class_name: 'ÖKLİD' },
    { student_id: 's2', student_name: 'Zeynep Örnek', username: 'ogrenci2', class_name: 'SEVA' },
  ],
};

const REPORTS = {
  items: [
    {
      id: 'd1',
      week: { id: 'w1', week_no: 5, start_date: '2026-01-05', end_date: '2026-01-11', label: '05 - 11 Ocak' },
      class_name: 'ÖKLİD',
      sent_at: '2026-01-12T10:00:00.000Z',
      send_count: 1,
      course_count: 4,
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

describe('guardianApi', () => {
  it('students doğru endpoint\'i çağırır', async () => {
    const fetchMock = mockFetch(200, { items: [] });
    vi.stubGlobal('fetch', fetchMock);
    await guardianApi.students();
    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toBe('/api/v1/guardian/students');
  });

  it('reports, öğrenci id\'sini sorguya ekler', async () => {
    const fetchMock = mockFetch(200, { items: [] });
    vi.stubGlobal('fetch', fetchMock);
    await guardianApi.reports('s1');
    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toBe('/api/v1/guardian/reports?student_id=s1');
  });
});

describe('GuardianHomePage', () => {
  it('birden çok çocukta seçici gösterilir; seçince raporlar listelenir', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => STUDENTS })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => REPORTS });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <MemoryRouter>
        <GuardianHomePage />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByLabelText('Öğrenci')).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText('Öğrenci'), { target: { value: 's1' } });

    await waitFor(() => {
      expect(screen.getByText('05 - 11 Ocak')).toBeInTheDocument();
    });
    expect(screen.getByText('ÖKLİD')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Aç' })).toHaveAttribute('href', '/guardian/reports/d1');
  });

  it('tek çocukta otomatik seçilir ve raporlar yüklenir', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ items: [STUDENTS.items[0]] }) })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => REPORTS });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <MemoryRouter>
        <GuardianHomePage />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText('05 - 11 Ocak')).toBeInTheDocument();
    });
    expect(screen.queryByLabelText('Öğrenci')).not.toBeInTheDocument();
  });

  it('gönderilmemiş rapor yoksa boş durum gösterilir', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ items: [STUDENTS.items[0]] }) })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ items: [] }) });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <MemoryRouter>
        <GuardianHomePage />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(
        screen.getByText('Bu öğrenci için henüz gönderilmiş rapor yok.'),
      ).toBeInTheDocument();
    });
  });
});

const DETAIL = {
  digest: {
    id: 'd1',
    week: { week_no: 5, start_date: '2026-01-05', end_date: '2026-01-11', label: '05 - 11 Ocak' },
    sent_at: '2026-01-12T10:00:00.000Z',
    send_count: 1,
  },
  snapshot: {
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
        prev_homework_text: null,
        homework: { description: 'Sayfa 12', due_date: '2026-01-12' },
        entry: {
          student_id: 's1',
          student_name: 'Örnek Kişi 6',
          attendance: 'present',
          homework_score: 8,
          interest_score: 9,
          teacher_note: null,
        },
      },
    ],
  },
  submissions: [
    {
      course_name: 'Matematik',
      description: 'Sayfa 12',
      due_date: '2026-01-12',
      submission: {
        id: 'sub1',
        note: null,
        submitted_at: '2026-01-11T18:00:00.000Z',
        is_late: false,
        status: 'submitted',
        reviewed_at: null,
        files: [{ key: '1234567890-0123456789abcdef.jpg', filename: 'odev.jpg', size: 1024, mime: 'image/jpeg', ext: 'jpg' }],
      },
    },
  ],
};

describe('GuardianReportDetailPage', () => {
  it('snapshot + ödev teslim geçmişi + dosya butonu gösterilir', async () => {
    vi.stubGlobal('fetch', mockFetch(200, DETAIL));
    render(
      <MemoryRouter initialEntries={['/guardian/reports/d1']}>
        <Routes>
          <Route path="/guardian/reports/:id" element={<GuardianReportDetailPage />} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(
        screen.getByRole('heading', { level: 1, name: '05 - 11 Ocak haftalık rapor' }),
      ).toBeInTheDocument();
    });
    expect(screen.getAllByText('Matematik').length).toBeGreaterThan(0);
    expect(screen.getByText('8')).toBeInTheDocument();
    expect(screen.getByText('Yüklendi')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /odev\.jpg/ })).toBeInTheDocument();
  });
});

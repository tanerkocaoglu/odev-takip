/**
 * Öğretmen rapor frontend testleri — Aşama 3.
 * teacherApi istemcisi (birim) + TeacherDashboardPage + ReportEntryPage.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { teacherApi } from './services/api';
import TeacherDashboardPage from './pages/teacher/TeacherDashboardPage';
import ReportEntryPage from './pages/teacher/ReportEntryPage';

const BASE_URL = '/api/v1';

function mockFetch(status: number, body: unknown) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  });
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('teacherApi', () => {
  it('dashboard doğru endpoint\'i çağırır', async () => {
    const fetchMock = mockFetch(200, { week: null, items: [] });
    vi.stubGlobal('fetch', fetchMock);
    await teacherApi.dashboard();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${BASE_URL}/teacher/dashboard`);
    expect(init.method ?? 'GET').toBe('GET');
  });

  it('openReport, class_course_id + week_id ile POST atar', async () => {
    const fetchMock = mockFetch(201, { report: {}, entries: [] });
    vi.stubGlobal('fetch', fetchMock);
    await teacherApi.openReport('cc1', 'w1');
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${BASE_URL}/teacher/reports`);
    expect(init.method).toBe('POST');
    expect(JSON.parse(String(init.body))).toEqual({
      class_course_id: 'cc1',
      week_id: 'w1',
    });
  });

  it('saveReport PUT, completeReport POST gönderir', async () => {
    const fetchMock = mockFetch(200, { report: {}, entries: [] });
    vi.stubGlobal('fetch', fetchMock);

    await teacherApi.saveReport('r1', { topic_covered: 'Konu' });
    const [putUrl, putInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(putUrl).toBe(`${BASE_URL}/teacher/reports/r1`);
    expect(putInit.method).toBe('PUT');
    expect(JSON.parse(String(putInit.body))).toEqual({ topic_covered: 'Konu' });

    await teacherApi.completeReport('r1');
    const [postUrl, postInit] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(postUrl).toBe(`${BASE_URL}/teacher/reports/r1/complete`);
    expect(postInit.method).toBe('POST');
  });
});

const DASHBOARD = {
  week: {
    id: 'w1',
    week_no: 5,
    start_date: '2026-01-05',
    end_date: '2026-01-11',
    label: '05 - 11 Ocak',
  },
  items: [
    {
      class_course_id: 'cc1',
      class_name: 'ÖKLİD',
      course_name: 'Matematik',
      day_of_week: 1,
      lesson_time: '09:00',
      report_id: null,
      status: null,
      is_overdue: true,
    },
    {
      class_course_id: 'cc2',
      class_name: 'SEVA',
      course_name: 'Fizik',
      day_of_week: 5,
      lesson_time: '10:00',
      report_id: 'r2',
      status: 'draft',
      is_overdue: false,
    },
  ],
};

describe('TeacherDashboardPage', () => {
  it('bu hafta doldurulacakları listeler; günü geçmiş vurgulanır', async () => {
    vi.stubGlobal('fetch', mockFetch(200, DASHBOARD));
    render(
      <MemoryRouter>
        <TeacherDashboardPage />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText('ÖKLİD · Matematik')).toBeInTheDocument();
    });
    expect(screen.getByText('SEVA · Fizik')).toBeInTheDocument();
    expect(screen.getByText('Günü geçti')).toBeInTheDocument();
    expect(screen.getByText('Taslak')).toBeInTheDocument();

    const link = screen.getByRole('link', { name: /ÖKLİD · Matematik/ });
    expect(link).toHaveAttribute('href', '/teacher/reports/cc1/w1');
  });

  it('boş haftada boş durum gösterilir', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetch(200, { week: DASHBOARD.week, items: [] }),
    );
    render(
      <MemoryRouter>
        <TeacherDashboardPage />
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(
        screen.getByText('Bu hafta doldurulacak rapor yok.'),
      ).toBeInTheDocument();
    });
  });
});

const REPORT = {
  report: {
    id: 'r1',
    class_course_id: 'cc1',
    week_id: 'w1',
    status: 'draft',
    completed_at: null,
    updated_at: '2026-01-05T10:00:00.000Z',
    topic_covered: 'İşlenen konu',
    prev_homework_text: 'Geçen haftanın ödevi',
    homework: { description: '', due_date: '2026-01-12' },
    week: {
      week_no: 5,
      start_date: '2026-01-05',
      end_date: '2026-01-11',
      label: '05 - 11 Ocak',
    },
    class_name: 'ÖKLİD',
    course_name: 'Matematik',
    teacher_name: 'Örnek Kişi 5',
    day_of_week: 1,
    lesson_time: '09:00',
  },
  entries: [
    {
      student_id: 's1',
      student_name: 'Öğrenci A',
      attendance: 'present',
      homework_score: null,
      interest_score: null,
      teacher_note: null,
    },
    {
      student_id: 's2',
      student_name: 'Öğrenci B',
      attendance: 'present',
      homework_score: 7,
      interest_score: 8,
      teacher_note: null,
    },
  ],
};

function renderEntryPage() {
  return render(
    <MemoryRouter initialEntries={['/teacher/reports/cc1/w1']}>
      <Routes>
        <Route path="/teacher/reports/:classCourseId/:weekId" element={<ReportEntryPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('ReportEntryPage', () => {
  it('raporu yükler; üst alanlar ve öğrenci satırları görünür', async () => {
    vi.stubGlobal('fetch', mockFetch(200, REPORT));
    renderEntryPage();

    await waitFor(() => {
      expect(screen.getAllByText('Öğrenci A').length).toBeGreaterThan(0);
    });
    expect(screen.getAllByText('Öğrenci B').length).toBeGreaterThan(0);

    const prev = screen.getByLabelText('Verilmiş olan ödev') as HTMLInputElement;
    expect(prev.value).toBe('Geçen haftanın ödevi');
    const topic = screen.getByLabelText('İşlenen konu') as HTMLInputElement;
    expect(topic.value).toBe('İşlenen konu');

    expect(
      screen.getByRole('button', { name: 'Raporu tamamla' }),
    ).toBeInTheDocument();
  });

  it('devamsızlık seçilince puan alanları devre dışı kalır', async () => {
    vi.stubGlobal('fetch', mockFetch(200, REPORT));
    renderEntryPage();

    await waitFor(() => {
      expect(screen.getAllByText('Öğrenci A').length).toBeGreaterThan(0);
    });

    const attendance = screen.getByLabelText('Devamsızlık');
    fireEvent.change(attendance, { target: { value: 'absent' } });

    expect(screen.getByLabelText('Ödev puanı')).toBeDisabled();
    expect(screen.getByLabelText('İlgi puanı')).toBeDisabled();
  });

  it('son hafta (homework yok) uyarısı gösterilir', async () => {
    const lastWeekReport = {
      ...REPORT,
      report: { ...REPORT.report, homework: null },
    };
    vi.stubGlobal('fetch', mockFetch(200, lastWeekReport));
    renderEntryPage();

    await waitFor(() => {
      expect(
        screen.getByText(/Yılın son haftası — teslim tarihini siz belirleyin/),
      ).toBeInTheDocument();
    });
  });
});

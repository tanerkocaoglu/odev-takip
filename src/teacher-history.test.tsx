/**
 * ReportHistoryPage — geçmiş rapor filtresi.
 * Durum/sınıf/hafta sunucu taraflı sorgu parametrelerine yansır; seçenekler
 * `/teacher/reports/filters`'tan gelir. Genel arama kutusu yalnızca admin
 * ekranındadır — burada bulunmaz.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import ReportHistoryPage from './pages/teacher/ReportHistoryPage';

function ok(body: unknown) {
  return { ok: true, status: 200, json: async () => body };
}

function report(id: string) {
  return {
    id,
    class_course_id: 'cc-' + id,
    week_id: 'w1',
    status: 'completed',
    completed_at: null,
    updated_at: '2026-08-04T10:00:00.000Z',
    day_of_week: 1,
    lesson_time: '09:00',
    class_name: 'ÖKLİD',
    course_name: 'Cebir',
    week_no: 20,
    week_start: '2026-08-03',
    week_end: '2026-08-09',
    week_label: 'Hafta 20',
    student_count: 6,
  };
}

const FILTERS = {
  classes: [
    { id: 'c1', name: 'ÖKLİD' },
    { id: 'c2', name: 'PİSAGOR' },
    { id: 'c-empty', name: 'BOŞ ŞUBE' },
  ],
  weeks: [{ id: 'w1', week_no: 20, label: 'Hafta 20', start_date: '2026-08-03' }],
};

function makeFetch() {
  return vi.fn((input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('/teacher/reports/filters')) return ok(FILTERS);
    if (url.includes('/teacher/reports')) {
      const query = new URL(url, 'http://x').searchParams;
      const empty = query.get('class_id') === 'c-empty';
      return ok({
        items: empty ? [] : [report('a')],
        total: empty ? 0 : 1,
        page: Number(query.get('page') ?? '1'),
        pageSize: 20,
      });
    }
    throw new Error(`beklenmeyen istek: ${url}`);
  });
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('ReportHistoryPage — filtreler', () => {
  it('seçenekler /teacher/reports/filters\'tan gelir; arama kutusu yoktur', async () => {
    const fetchMock = makeFetch();
    vi.stubGlobal('fetch', fetchMock);

    render(
      <MemoryRouter>
        <ReportHistoryPage />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByRole('option', { name: 'ÖKLİD' })).toBeInTheDocument();
    });
    expect(screen.getByRole('option', { name: 'PİSAGOR' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: '20. hafta · Hafta 20' })).toBeInTheDocument();
    // Genel arama yalnızca admin ekranında.
    expect(screen.queryByRole('searchbox')).not.toBeInTheDocument();
  });

  it('durum/sınıf/hafta sorgu parametrelerine yansır ve sayfa 1\'e döner', async () => {
    const fetchMock = makeFetch();
    vi.stubGlobal('fetch', fetchMock);

    render(
      <MemoryRouter>
        <ReportHistoryPage />
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(screen.getAllByText('ÖKLİD · Cebir').length).toBeGreaterThan(0);
    });

    fireEvent.change(screen.getByLabelText('Durum'), { target: { value: 'draft' } });
    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some(([u]) => String(u).includes('status=draft')),
      ).toBe(true);
    });

    fireEvent.change(screen.getByLabelText('Sınıf'), { target: { value: 'c1' } });
    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some(([u]) => String(u).includes('class_id=c1')),
      ).toBe(true);
    });

    fireEvent.change(screen.getByLabelText('Hafta'), { target: { value: 'w1' } });
    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some(([u]) => String(u).includes('week_id=w1')),
      ).toBe(true);
    });
  });

  it('sonuç yoksa filtre mesajı gösterilir', async () => {
    const fetchMock = makeFetch();
    vi.stubGlobal('fetch', fetchMock);

    render(
      <MemoryRouter>
        <ReportHistoryPage />
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(screen.getAllByText('ÖKLİD · Cebir').length).toBeGreaterThan(0);
    });

    fireEvent.change(screen.getByLabelText('Sınıf'), { target: { value: 'c-empty' } });
    await waitFor(() => {
      expect(screen.getByText('Bu filtrelerle rapor bulunamadı.')).toBeInTheDocument();
    });
  });
});

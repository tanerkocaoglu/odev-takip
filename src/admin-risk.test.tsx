/**
 * Admin panel — Riskli öğrenciler sekmesi testi (Aşama 6).
 * Sekmeye girince risk ucu çağrılır; risk_flags ayrı rozet olarak gösterilir.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import AdminDashboardPage from './pages/admin/AdminDashboardPage';

function ok(body: unknown) {
  return { ok: true, status: 200, json: async () => body };
}

const DASH = {
  week: { id: 'w1', week_no: 20, start_date: '2026-08-03', end_date: '2026-08-09', label: 'Hafta 20' },
  week_not_started: false,
  summary: { total: 40, completed: 10 },
  missing: [],
  matrix: [],
  digests: { pending: 0, ready: 0, sent: 0 },
};

const RISK = {
  weeks: [
    { id: 'w1', week_no: 1, start_date: '2026-07-27', end_date: '2026-08-02', label: 'x' },
    { id: 'w2', week_no: 2, start_date: '2026-08-03', end_date: '2026-08-09', label: 'y' },
    { id: 'w3', week_no: 3, start_date: '2026-08-10', end_date: '2026-08-16', label: 'z' },
  ],
  items: [
    {
      student_id: 's1',
      student_name: 'Riskli Ogrenci',
      class_name: 'OKLID',
      school_name: null,
      grade_level: '8',
      risk_flags: ['low_score', 'missing_submission'],
      avg_score: 3,
      missing_submission_count: 2,
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

describe('AdminDashboardPage — riskli öğrenciler sekmesi', () => {
  it('sekmeye girince risk listesi yüklenir; nedenler ayrı rozet olarak görünür', async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/admin/dashboard/risk')) return ok(RISK);
      if (url.includes('/admin/dashboard')) return ok(DASH);
      throw new Error(`beklenmeyen istek: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <MemoryRouter>
        <AdminDashboardPage />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText('Panel')).toBeInTheDocument();
    });

    // Varsayılan sekmede risk ucu çağrılmaz.
    expect(
      fetchMock.mock.calls.some(([u]) => String(u).includes('/admin/dashboard/risk')),
    ).toBe(false);

    fireEvent.click(screen.getByRole('tab', { name: /Riskli öğrenciler/ }));

    await waitFor(() => {
      expect(screen.getByText('Riskli Ogrenci')).toBeInTheDocument();
    });
    expect(screen.getByText('OKLID')).toBeInTheDocument();
    expect(screen.getByText('Düşük ortalama')).toBeInTheDocument();
    expect(screen.getByText('Teslim etmeme')).toBeInTheDocument();
  });

  it('bitmiş hafta var ama riskli öğrenci yoksa boş durum gösterilir', async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/admin/dashboard/risk')) return ok({ weeks: RISK.weeks, items: [] });
      if (url.includes('/admin/dashboard')) return ok(DASH);
      throw new Error(`beklenmeyen istek: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <MemoryRouter>
        <AdminDashboardPage />
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(screen.getByText('Panel')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('tab', { name: /Riskli öğrenciler/ }));

    await waitFor(() => {
      expect(
        screen.getByText('Bu kriterlerle riskli öğrenci yok.'),
      ).toBeInTheDocument();
    });
  });

  it('hiç bitmiş hafta yoksa "geçmiş hafta yok" boş durumu gösterilir', async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/admin/dashboard/risk')) return ok({ weeks: [], items: [] });
      if (url.includes('/admin/dashboard')) return ok(DASH);
      throw new Error(`beklenmeyen istek: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <MemoryRouter>
        <AdminDashboardPage />
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(screen.getByText('Panel')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('tab', { name: /Riskli öğrenciler/ }));

    await waitFor(() => {
      expect(
        screen.getByText('Henüz değerlendirilecek geçmiş hafta yok.'),
      ).toBeInTheDocument();
    });
  });
});

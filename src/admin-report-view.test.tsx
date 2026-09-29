/**
 * Admin rapor görünümü: liste satırı → salt-okunur görünüm; hata durumunda yeniden dene; CSV hatası listeyi bozmaz.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import AdminReportsPage from './pages/admin/AdminReportsPage';
import AdminReportViewPage from './pages/admin/AdminReportViewPage';

const ok = (body: unknown) => ({
  ok: true,
  status: 200,
  json: async () => body,
  headers: { get: () => null },
});
const fail = (status: number, message: string) => ({
  ok: false,
  status,
  json: async () => ({ error: { code: 'X', message } }),
  headers: { get: () => null },
});

const ITEM = {
  id: 'r1',
  class_course_id: 'cc1',
  week_id: 'w1',
  status: 'sent',
  completed_at: null,
  updated_at: '2026-08-04T10:00:00.000Z',
  day_of_week: 1,
  lesson_time: '09:00',
  class_name: 'ÖKLİD',
  course_name: 'Matematik',
  week_no: 20,
  week_start: '2026-08-03',
  week_end: '2026-08-09',
  week_label: '03.08 - 09.08.2026',
  student_count: 6,
};

beforeEach(() => localStorage.setItem('ds_token', 't'));
afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe('Raporlar', () => {
  it('satır başlığı rapor görünümüne bağlanır; durum rozeti ikon+metin', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL) =>
        String(input).includes('/filters')
          ? ok({ classes: [], weeks: [], teachers: [] })
          : ok({ items: [ITEM], total: 1, page: 1, pageSize: 20 }),
      ),
    );
    render(
      <MemoryRouter>
        <AdminReportsPage />
      </MemoryRouter>,
    );
    const link = await screen.findByRole('link', { name: /ÖKLİD · Matematik raporunu incele/ });
    expect(link).toHaveAttribute('href', '/admin/reports/r1');
    expect(screen.getByText('Gönderildi', { selector: 'span.rounded-full' })).toBeInTheDocument();
  });

  it('CSV indirme hatası listeyi bozmaz, kapatılabilir', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL) => {
        const u = String(input);
        if (u.includes('/filters')) return ok({ classes: [], weeks: [], teachers: [] });
        if (u.includes('/export'))
          return fail(429, 'Çok fazla istek. Bir saat sonra yeniden deneyin.');
        return ok({ items: [ITEM], total: 1, page: 1, pageSize: 20 });
      }),
    );
    render(
      <MemoryRouter>
        <AdminReportsPage />
      </MemoryRouter>,
    );
    await screen.findByRole('link', { name: /raporunu incele/ });
    fireEvent.click(screen.getByRole('button', { name: 'CSV indir' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Çok fazla istek');
    expect(screen.getByRole('link', { name: /raporunu incele/ })).toBeInTheDocument();
  });
});

describe('Rapor görünümü', () => {
  it('yükleme hatasında ErrorState + Yeniden dene', async () => {
    let n = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(() => {
        n += 1;
        return n === 1 ? fail(500, 'Sunucu hatası.') : fail(404, 'Rapor bulunamadı.');
      }),
    );
    render(
      <MemoryRouter initialEntries={['/admin/reports/r1']}>
        <Routes>
          <Route path="/admin/reports/:id" element={<AdminReportViewPage />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(await screen.findByText('Sunucu hatası.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /yeniden dene/i }));
    await waitFor(() => expect(screen.getByText('Rapor bulunamadı.')).toBeInTheDocument());
  });
});

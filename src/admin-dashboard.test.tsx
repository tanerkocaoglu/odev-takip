/**
 * Admin panel — henüz başlamamış hafta görünümü (spec.md §5.1/§5.5).
 *
 * Aktif yılda başlamış hafta yokken dashboard en erken (gelecek) haftaya düşer;
 * bu haftanın tüm atamaları doldurulmamış olsa da "eksik" sayılmaz. Ekranda
 * banner gösterilir, eksik listesi boş kalır ve matris "Eksik" yerine "Henüz
 * başlamadı" etiketi taşır.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import AdminDashboardPage from './pages/admin/AdminDashboardPage';

function ok(body: unknown) {
  return { ok: true, status: 200, json: async () => body };
}

const FUTURE_DASH = {
  week: {
    id: 'w1',
    week_no: 1,
    start_date: '2027-09-06',
    end_date: '2027-09-12',
    label: '1. hafta',
  },
  week_not_started: true,
  summary: { total: 0, completed: 0 },
  missing: [],
  matrix: [
    {
      class_id: 'c1',
      class_name: 'A Şubesi',
      courses: [
        {
          class_course_id: 'cc1',
          course_name: 'Matematik',
          teacher_name: 'Örnek Kişi 1',
          day_of_week: 1,
          lesson_time: '09:00',
          status: null,
          report_id: null,
        },
      ],
    },
  ],
  digests: { pending: 0, ready: 0, sent: 0 },
};

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('AdminDashboardPage — henüz başlamamış hafta', () => {
  it('banner gösterir; eksik listesi boş ve matris "Henüz başlamadı" der', async () => {
    vi.stubGlobal('fetch', vi.fn(() => ok(FUTURE_DASH)));

    render(
      <MemoryRouter>
        <AdminDashboardPage />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText('Panel')).toBeInTheDocument();
    });

    // Banner: hafta etiketi + tarih, "eksik" kelimesi geçmeden.
    expect(screen.getByText(/doldurulmaya başlanır/)).toBeInTheDocument();
    expect(screen.getByText(/06\.09\.2027/)).toBeInTheDocument();

    // Eksik listesi boş: nötr boş durum metni.
    expect(
      screen.getByText(/raporlar hafta başladığında doldurulacak/i),
    ).toBeInTheDocument();

    // Matris sekmesi: boş ders "Eksik" değil "Henüz başlamadı".
    fireEvent.click(screen.getByRole('tab', { name: /Tam matris/ }));
    await waitFor(() => {
      expect(screen.getAllByText('Henüz başlamadı').length).toBeGreaterThan(0);
    });
    // (kısa sekme etiketi "Eksik" de var; yalnızca rozetlere bakılır)
    expect(screen.queryByText('Eksik', { selector: 'span.rounded-full' })).toBeNull();
  });
});

/**
 * Admin haftalık ödev özeti sayfası testleri (spec.md §5.8):
 * sınıf + hafta seçilince tüm dersler listelenir; eksik ders "Rapor girilmedi"
 * olarak görünür; "PNG olarak indir" görsel üretimini tetikler.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { toBlob } from 'html-to-image';
import HomeworkSummaryPage from './pages/admin/HomeworkSummaryPage';

vi.mock('html-to-image', () => ({
  toBlob: vi.fn(async () => new Blob(['png'], { type: 'image/png' })),
}));

function ok(body: unknown) {
  return { ok: true, status: 200, json: async () => body };
}

const SUMMARY = {
  week: {
    id: 'w2',
    week_no: 2,
    label: '03.08 - 09.08.2026',
    start_date: '2026-08-03',
    end_date: '2026-08-09',
  },
  class: { id: 'c1', name: 'EURİST' },
  relative_week_no: 2,
  rows: [
    {
      class_course_id: 'cc1',
      course_name: 'Cebir',
      teacher_name: 'Örnek Kişi 8',
      day_of_week: 1,
      lesson_time: '09:00',
      status: 'completed',
      homework_description: '10. sayfa çözülecek',
    },
    {
      class_course_id: 'cc2',
      course_name: 'Geometri',
      teacher_name: 'Ayşe Demir',
      day_of_week: 2,
      lesson_time: '10:00',
      status: 'missing',
      homework_description: null,
    },
  ],
};

function makeFetch() {
  return vi.fn((input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('/admin/academic-years')) {
      return ok({
        items: [
          { id: 'y1', name: '2026-2027', start_date: '2026-07-20', end_date: '2027-06-30', is_active: 1 },
        ],
      });
    }
    if (url.includes('/admin/classes')) {
      return ok({ items: [{ id: 'c1', academic_year_id: 'y1', name: 'EURİST' }] });
    }
    if (url.includes('/admin/weeks')) {
      return ok({
        items: [
          { id: 'w1', academic_year_id: 'y1', week_no: 1, start_date: '2026-07-27', end_date: '2026-08-02', label: '27.07 - 02.08.2026' },
          { id: 'w2', academic_year_id: 'y1', week_no: 2, start_date: '2026-08-03', end_date: '2026-08-09', label: '03.08 - 09.08.2026' },
        ],
      });
    }
    if (url.includes('/admin/homework-summary')) return ok(SUMMARY);
    throw new Error(`beklenmeyen istek: ${url}`);
  });
}

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal('fetch', makeFetch());
  vi.stubGlobal('URL', {
    ...URL,
    createObjectURL: vi.fn(() => 'blob:test'),
    revokeObjectURL: vi.fn(),
  });
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function renderPage() {
  return render(
    <MemoryRouter>
      <HomeworkSummaryPage />
    </MemoryRouter>,
  );
}

describe('HomeworkSummaryPage', () => {
  it('sınıf + hafta seçilince tüm derslerin ödevini gösterir', async () => {
    renderPage();

    expect(await screen.findByText('2. Haftanın Ödevleri')).toBeInTheDocument();
    // Sınıf adı hem seçicide hem görselde görünür.
    expect(screen.getAllByText('EURİST').length).toBeGreaterThan(1);
    expect(screen.getByText('Örnek Kişi 8')).toBeInTheDocument();
    expect(screen.getByText('10. sayfa çözülecek')).toBeInTheDocument();
    expect(screen.getByText('Ayşe Demir')).toBeInTheDocument();
  });

  it('raporu olmayan ders satırı "Rapor girilmedi" olarak kalır (atlanmaz)', async () => {
    renderPage();

    await screen.findByText('2. Haftanın Ödevleri');
    expect(screen.getByText('Rapor girilmedi')).toBeInTheDocument();
    expect(screen.getByText('Geometri')).toBeInTheDocument();
  });

  it('"PNG olarak indir" görsel üretimini tetikler', async () => {
    renderPage();

    await screen.findByText('2. Haftanın Ödevleri');
    fireEvent.click(screen.getByRole('button', { name: /PNG olarak indir/ }));

    await waitFor(() => {
      expect(vi.mocked(toBlob)).toHaveBeenCalledTimes(1);
    });
  });
});

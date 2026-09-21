/**
 * Admin "Tüm raporlar" sayfalama testi — Aşama 5 eklentisi.
 * Sayfa başına 20 kayıt (PAGE_SIZE); "Sonraki" ile 2. sayfa yüklenir.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import AdminReportsPage from './pages/admin/AdminReportsPage';

function ok(body: unknown) {
  return { ok: true, status: 200, json: async () => body };
}

function report(id: string, status: string) {
  return {
    id,
    class_course_id: 'cc-' + id,
    week_id: 'w1',
    status,
    completed_at: null,
    updated_at: '2026-08-04T10:00:00.000Z',
    day_of_week: 1,
    lesson_time: '09:00',
    class_name: 'EURİST',
    course_name: 'Matematik',
    week_no: 20,
    week_start: '2026-08-03',
    week_end: '2026-08-09',
    week_label: 'Hafta 20',
    student_count: 6,
  };
}

function makeFetch() {
  return vi.fn((input: RequestInfo | URL) => {
    const url = String(input);
      if (url.includes('/teacher/reports/filters'))
        return ok({ classes: [], weeks: [], teachers: [{ id: 't-1', full_name: 'Öğretmen 1' }] });
    if (url.includes('/teacher/reports')) {
      const query = new URL(url, 'http://x').searchParams;
      const p = Number(query.get('page') ?? '1');
      return ok({
        items: p === 1 ? [report('a', 'completed'), report('b', 'draft')] : [report('c', 'sent')],
        total: 3,
        page: p,
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

describe('AdminReportsPage — sayfalama', () => {
  it('sayfa başına 20 kayıt; toplam + sayfa bilgisi gösterilir; Sonraki 2. sayfayı yükler', async () => {
    const fetchMock = makeFetch();
    vi.stubGlobal('fetch', fetchMock);

    render(
      <MemoryRouter>
        <AdminReportsPage />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getAllByText('EURİST · Matematik').length).toBeGreaterThan(0);
    });
    // 3 kayıt, 20'lik sayfada 1 sayfa → sayfalama gizli olur; toplam yine gösterilmez.
    expect(screen.queryByText(/3 kayıt/)).not.toBeInTheDocument();

    // İlk yükleme page=1 parametresiyle.
    const firstCall = fetchMock.mock.calls.find(
      ([u]) =>
        String(u).includes('/teacher/reports') && !String(u).includes('/filters'),
    )!;
    expect(String(firstCall[0])).toContain('page=1');
    expect(String(firstCall[0])).toContain('pageSize=20');
  });

  it('filtreler ve arama sorgu parametrelerine yansır', async () => {
    const fetchMock = makeFetch();
    vi.stubGlobal('fetch', fetchMock);

    render(
      <MemoryRouter>
        <AdminReportsPage />
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(screen.getAllByText('EURİST · Matematik').length).toBeGreaterThan(0);
    });

    fireEvent.change(screen.getByLabelText('Durum'), {
      target: { value: 'completed' },
    });
    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some(([u]) => String(u).includes('status=completed')),
      ).toBe(true);
    });

    fireEvent.change(screen.getByLabelText('Ara'), {
      target: { value: 'cebir' },
    });
    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some(([u]) => String(u).includes('q=cebir')),
      ).toBe(true);
    });
  });

  it('öğretmen dropdown\'ı teacher_id olarak sorguya yansır', async () => {
    const fetchMock = makeFetch();
    vi.stubGlobal('fetch', fetchMock);

    render(
      <MemoryRouter>
        <AdminReportsPage />
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(screen.getAllByText('EURİST · Matematik').length).toBeGreaterThan(0);
    });

    fireEvent.change(screen.getByLabelText('Öğretmen'), {
      target: { value: 't-1' },
    });
    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some(([u]) => String(u).includes('teacher_id=t-1')),
      ).toBe(true);
    });
  });

  it('20 kaydı aşan listede sayfalama çubuğu çıkar ve Sonraki çalışır', async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
    if (url.includes('/teacher/reports/filters'))
      return ok({ classes: [], weeks: [], teachers: [{ id: 't-1', full_name: 'Öğretmen 1' }] });
      if (url.includes('/teacher/reports')) {
        const query = new URL(url, 'http://x').searchParams;
        const p = Number(query.get('page') ?? '1');
        const start = (p - 1) * 20;
        const all = Array.from({ length: 25 }, (_, i) => report(`r${i}`, 'completed'));
        return ok({ items: all.slice(start, start + 20), total: 25, page: p, pageSize: 20 });
      }
      throw new Error(`beklenmeyen istek: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <MemoryRouter>
        <AdminReportsPage />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText('25 kayıt · 1/2 sayfa')).toBeInTheDocument();
    });
    // 1. sayfada 20 satır.
    expect(screen.getAllByText('EURİST · Matematik')).toHaveLength(20);

    fireEvent.click(screen.getByRole('button', { name: 'Sonraki' }));

    await waitFor(() => {
      expect(screen.getByText('25 kayıt · 2/2 sayfa')).toBeInTheDocument();
    });
    // 2. sayfada 5 satır.
    expect(screen.getAllByText('EURİST · Matematik')).toHaveLength(5);
  });
});

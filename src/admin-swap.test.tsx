/**
 * Atama takası + öğretmen devri frontend testleri.
 * ClassCoursesPage: tüm atamalar listelenir, 2 satır seçilince "Yer değiştir"
 * aktifleşir; aynı öğretmen atamaları engellenir. TeachersPage: "Atamaları
 * devret" modalı sayıyı gösterir ve transfer çağrısını atar.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import ClassCoursesPage from './pages/admin/ClassCoursesPage';
import TeachersPage from './pages/admin/TeachersPage';

function ok(body: unknown) {
  return { ok: true, status: 200, json: async () => body };
}

function cc(id: string, className: string, course: string, teacherId: string, teacherName: string) {
  return {
    id,
    class_id: 'c-' + className,
    course_id: 'co-' + course,
    teacher_id: teacherId,
    day_of_week: 1,
    lesson_time: '09:00',
    class_name: className,
    course_name: course,
    teacher_name: teacherName,
  };
}

const TEACHERS = {
  items: [
    { id: 't1', full_name: 'Ogretmen 1', email: 't1@x', is_active: 1, created_at: 'x' },
    { id: 't2', full_name: 'Ogretmen 2', email: 't2@x', is_active: 1, created_at: 'x' },
  ],
  total: 2,
  page: 1,
  pageSize: 20,
};

function classCoursesFetch(ccItems: unknown[]) {
  return vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = (init?.method ?? 'GET').toUpperCase();
    if (url.includes('/admin/academic-years')) {
      return ok({ items: [{ id: 'y', name: '2026-2027', is_active: 1 }] });
    }
    if (url.includes('/admin/classes')) {
      return ok({
        items: [
          { id: 'c-O', name: 'OKLID', academic_year_id: 'y' },
          { id: 'c-P', name: 'PISAGOR', academic_year_id: 'y' },
        ],
      });
    }
    if (url.includes('/admin/courses')) return ok({ items: [{ id: 'co-C', name: 'Cebir' }] });
    if (url.includes('/admin/teachers')) return ok(TEACHERS);
    if (url.includes('/admin/class-courses/swap') && method === 'POST') return ok({ items: [] });
    if (url.includes('/admin/class-courses')) return ok({ items: ccItems });
    throw new Error(`beklenmeyen istek: ${method} ${url}`);
  });
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('ClassCoursesPage — atama takası', () => {
  it('tüm atamaları listeler (Sınıf sütunu dahil); 2 satır seçilince Yer değiştir aktifleşir', async () => {
    const fetchMock = classCoursesFetch([
      cc('cc1', 'OKLID', 'Cebir', 't1', 'Ogretmen 1'),
      cc('cc2', 'PISAGOR', 'Cebir', 't2', 'Ogretmen 2'),
    ]);
    vi.stubGlobal('fetch', fetchMock);

    render(
      <MemoryRouter>
        <ClassCoursesPage />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText('OKLID')).toBeInTheDocument();
    });
    expect(screen.getByText('PISAGOR')).toBeInTheDocument();

    const swapBtn = screen.getByRole('button', { name: 'Yer değiştir' });
    expect((swapBtn as HTMLButtonElement).disabled).toBe(true);

    expect(screen.getByText('Seçili: 0/2')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('checkbox', { name: 'OKLID · Cebir seç' }));
    expect((swapBtn as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText('Seçili: 1/2')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('checkbox', { name: 'PISAGOR · Cebir seç' }));
    expect((swapBtn as HTMLButtonElement).disabled).toBe(false);
    expect(screen.getByText('Seçili: 2/2')).toBeInTheDocument();
    // seçili iki atama adıyla görünür ve tek tek kaldırılabilir
    fireEvent.click(screen.getByRole('button', { name: 'OKLID · Cebir seçimini kaldır' }));
    expect(screen.getByText('Seçili: 1/2')).toBeInTheDocument();
  });

  it('Yer değiştir, swap çağrısını iki id ile atar', async () => {
    const fetchMock = classCoursesFetch([
      cc('cc1', 'OKLID', 'Cebir', 't1', 'Ogretmen 1'),
      cc('cc2', 'PISAGOR', 'Cebir', 't2', 'Ogretmen 2'),
    ]);
    vi.stubGlobal('fetch', fetchMock);

    render(
      <MemoryRouter>
        <ClassCoursesPage />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText('OKLID')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('checkbox', { name: 'OKLID · Cebir seç' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'PISAGOR · Cebir seç' }));
    fireEvent.click(screen.getByRole('button', { name: 'Yer değiştir' }));

    // Onay diyaloğu kim kimin yerine geçiyor + kaç atama etkileniyor söyler; henüz çağrı yok.
    const dialog = await screen.findByRole('dialog', { name: 'Öğretmenleri yer değiştir' });
    expect(dialog).toHaveTextContent('OKLID · Cebir');
    expect(dialog).toHaveTextContent('Ogretmen 2');
    expect(dialog).toHaveTextContent('Toplam 2 atama etkilenir');
    expect(
      fetchMock.mock.calls.some(([u]) => String(u).includes('/admin/class-courses/swap')),
    ).toBe(false);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Yer değiştir' }));

    await waitFor(() => {
      const swapCall = fetchMock.mock.calls.find(
        ([u, i]) => String(u).includes('/admin/class-courses/swap') && i?.method === 'POST',
      );
      expect(swapCall).toBeDefined();
      expect(JSON.parse(String(swapCall![1]!.body))).toEqual({ cc_id_a: 'cc1', cc_id_b: 'cc2' });
    });
  });

  it('aynı öğretmene ait iki atamada takas engellenir (mesaj, POST yok)', async () => {
    const fetchMock = classCoursesFetch([
      cc('cc1', 'OKLID', 'Cebir', 't1', 'Ogretmen 1'),
      cc('cc2', 'PISAGOR', 'Cebir', 't1', 'Ogretmen 1'),
    ]);
    vi.stubGlobal('fetch', fetchMock);

    render(
      <MemoryRouter>
        <ClassCoursesPage />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText('OKLID')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('checkbox', { name: 'OKLID · Cebir seç' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'PISAGOR · Cebir seç' }));
    fireEvent.click(screen.getByRole('button', { name: 'Yer değiştir' }));

    expect(
      await screen.findByText('Aynı öğretmene ait atamaların yerini değiştirmeye gerek yok.'),
    ).toBeInTheDocument();
    const swapCalls = fetchMock.mock.calls.filter(
      ([u, i]) => String(u).includes('/admin/class-courses/swap') && i?.method === 'POST',
    );
    expect(swapCalls).toHaveLength(0);
  });
});

describe('TeachersPage — atamaları devret', () => {
  function teachersFetch() {
    return vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = (init?.method ?? 'GET').toUpperCase();
      if (
        url.includes('/admin/teachers') &&
        method === 'POST' &&
        url.includes('transfer-assignments')
      ) {
        return ok({ reassigned: 2 });
      }
      if (url.includes('/admin/teachers')) return ok(TEACHERS);
      if (url.includes('/admin/class-courses')) {
        return ok({
          items: [
            cc('cc1', 'OKLID', 'Cebir', 't1', 'Ogretmen 1'),
            cc('cc2', 'PISAGOR', 'Cebir', 't1', 'Ogretmen 1'),
          ],
        });
      }
      throw new Error(`beklenmeyen istek: ${method} ${url}`);
    });
  }

  it('modal atama sayısını gösterir ve hedefe devreder', async () => {
    const fetchMock = teachersFetch();
    vi.stubGlobal('fetch', fetchMock);

    render(
      <MemoryRouter>
        <TeachersPage />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText('Ogretmen 1')).toBeInTheDocument();
    });

    fireEvent.click(screen.getAllByRole('button', { name: /için işlemler/ })[0]);
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Atamaları devret' }));

    const dialog = await screen.findByRole('dialog');
    const submitBtn = within(dialog).getByRole('button', { name: 'Atamaları devret' });
    // Atama sayısı yüklenince (2 > 0) gönderim etkinleşir.
    await waitFor(() => {
      expect((submitBtn as HTMLButtonElement).disabled).toBe(false);
    });

    fireEvent.change(within(dialog).getByLabelText('Hedef öğretmen'), { target: { value: 't2' } });
    fireEvent.click(submitBtn);

    // Onay adımı: kim kimin yerine geçiyor + kaç atama; henüz çağrı yok
    const confirm = await screen.findByRole('dialog', { name: 'Atamaları devret' });
    expect(confirm).toHaveTextContent('Ogretmen 1');
    expect(confirm).toHaveTextContent('Ogretmen 2');
    expect(confirm).toHaveTextContent('Etkilenen atama: 2');
    expect(fetchMock.mock.calls.some(([u]) => String(u).includes('transfer-assignments'))).toBe(
      false,
    );
    fireEvent.click(within(confirm).getByRole('button', { name: 'Atamaları devret' }));

    await waitFor(() => {
      const transferCall = fetchMock.mock.calls.find(
        ([u, i]) =>
          String(u).includes('/admin/teachers/t1/transfer-assignments') && i?.method === 'POST',
      );
      expect(transferCall).toBeDefined();
      expect(JSON.parse(String(transferCall![1]!.body))).toEqual({ target_teacher_id: 't2' });
    });
  });
});

describe('TeachersPage — silme 409', () => {
  it('aktif atama varsa sunucu mesajı + "Atamaları devret" / "Atamalara git" çıkış yolları', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
        const method = (init?.method ?? 'GET').toUpperCase();
        if (method === 'DELETE') {
          return {
            ok: false,
            status: 409,
            json: async () => ({
              error: {
                code: 'CONFLICT',
                message: 'Bu öğretmenin aktif atamaları var, önce atamaları kaldırın.',
              },
            }),
            headers: { get: () => null },
          };
        }
        if (String(input).includes('/admin/class-courses')) return ok({ items: [] });
        return ok(TEACHERS);
      }),
    );
    render(
      <MemoryRouter>
        <TeachersPage />
      </MemoryRouter>,
    );
    await screen.findByText('Ogretmen 1');
    fireEvent.click(screen.getAllByRole('button', { name: /için işlemler/ })[0]);
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Sil' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Öğretmeni sil' }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Bu öğretmenin aktif atamaları var');
    expect(within(alert).getByRole('link', { name: 'Atamalara git' })).toHaveAttribute(
      'href',
      '/admin/class-courses',
    );
    expect(within(alert).getByRole('button', { name: 'Atamaları devret' })).toBeInTheDocument();
    expect(screen.getByText('Ogretmen 1')).toBeInTheDocument();
  });
});

describe('ClassCoursesPage — silme onayı', () => {
  it('menüden Sil → onay diyaloğu → DELETE', async () => {
    const base = classCoursesFetch([
      cc('cc1', 'OKLID', 'Cebir', 't1', 'Ogretmen 1'),
      cc('cc2', 'PISAGOR', 'Cebir', 't2', 'Ogretmen 2'),
    ]);
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) =>
      (init?.method ?? 'GET').toUpperCase() === 'DELETE' ? ok({}) : base(input, init),
    );
    vi.stubGlobal('fetch', fetchMock);
    render(
      <MemoryRouter>
        <ClassCoursesPage />
      </MemoryRouter>,
    );
    fireEvent.click(await screen.findByRole('button', { name: 'OKLID · Cebir için işlemler' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Sil' }));
    const dialog = await screen.findByRole('dialog', { name: 'Atamayı sil' });
    expect(dialog).toHaveTextContent('"OKLID · Cebir" ataması silinsin mi?');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Atamayı sil' }));
    await waitFor(() =>
      expect(fetchMock.mock.calls.some(([, i]) => i?.method === 'DELETE')).toBe(true),
    );
  });
});

/**
 * CSV toplu içe aktarma + filtreli dışa aktarma frontend testleri (spec §5.6/§5.7).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import StudentsPage from './pages/admin/StudentsPage';
import GuardiansPage from './pages/admin/GuardiansPage';
import AdminReportsPage from './pages/admin/AdminReportsPage';

function json(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    headers: { get: () => null },
  };
}

const STUDENTS = {
  items: [
    {
      id: 's1',
      student_id: 'st1',
      full_name: 'Ali Yılmaz',
      username: 'ogrenci1',
      guardian_id: 'g1',
      guardian_name: 'Örnek Kişi 5',
      class_id: 'c1',
      class_name: 'ÖKLİD',
      school_id: null,
      school_name: null,
      grade_level: '6',
    },
  ],
  total: 1,
  page: 1,
  pageSize: 20,
};

const WEEKS = [
  {
    id: 'w-past',
    academic_year_id: 'y',
    week_no: 1,
    start_date: '2000-01-01',
    end_date: '2000-01-07',
    label: '01.01 - 07.01.2000',
  },
  {
    id: 'w-future',
    academic_year_id: 'y',
    week_no: 2,
    start_date: '2099-01-01',
    end_date: '2099-01-07',
    label: '01.01 - 07.01.2099',
  },
];

const GUARDIAN = {
  id: 'g1',
  user_id: 'u1',
  full_name: 'Örnek Kişi 5',
  username: 'veli1',
  whatsapp_phone: '+905001112233',
  phone_secondary: null,
  consent_at: null,
  child_count: 1,
};

const EMPTY_SUMMARY = {
  new_students: 0,
  new_guardians: 0,
  new_schools: 0,
  matched_guardians: 0,
  matched_schools: 0,
};

let previewResponse: unknown;

function studentsFetch() {
  return vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = (init?.method ?? 'GET').toUpperCase();
    if (url.includes('/admin/academic-years')) return json({ items: [{ id: 'y', name: '2026-2027', is_active: 1 }] });
    if (url.includes('/admin/classes')) return json({ items: [{ id: 'c1', name: 'ÖKLİD', academic_year_id: 'y' }] });
    if (url.includes('/admin/weeks')) return json({ items: WEEKS });
    if (url.includes('/admin/schools')) return json({ items: [] });
    if (url.includes('/admin/guardians'))
      return json({ items: [GUARDIAN], total: 1, page: 1, pageSize: 10 });
    if (url.includes('/admin/students/import')) return json(previewResponse);
    if (url.includes('/admin/students/export')) {
      return Promise.resolve({
        ok: true,
        status: 200,
        blob: async () => new Blob(['a,b\r\n']),
        headers: { get: () => 'attachment; filename="ogrenciler.csv"' },
      });
    }
    if (url.includes('/admin/students')) return json(STUDENTS);
    throw new Error(`beklenmeyen istek: ${method} ${url}`);
  });
}

function stubUrl() {
  const OriginalURL = globalThis.URL;
  vi.stubGlobal(
    'URL',
    class extends OriginalURL {
      static createObjectURL = vi.fn(() => 'blob:fake');
      static revokeObjectURL = vi.fn();
    },
  );
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
}

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('ds_token', 'test-token');
  previewResponse = {
    dry_run: true,
    ok: true,
    committed: false,
    summary: { ...EMPTY_SUMMARY, new_students: 2, new_guardians: 1 },
    errors: [],
    warnings: [],
  };
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('StudentsPage — CSV ile toplu ekle', () => {
  it('hatalı önizlemede özet + hata listesi gösterir, kaydet kapalı kalır', async () => {
    previewResponse = {
      dry_run: true,
      ok: false,
      committed: false,
      summary: { ...EMPTY_SUMMARY, new_students: 1 },
      errors: [{ row: 3, field: 'dershane_sinifi', message: "Sınıf bulunamadı: 'OLMAYAN'." }],
      warnings: [],
    };
    vi.stubGlobal('fetch', studentsFetch());

    render(
      <MemoryRouter>
        <StudentsPage />
      </MemoryRouter>,
    );
    await waitFor(() => expect(screen.getByText('Ali Yılmaz')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'CSV ile toplu ekle' }));
    fireEvent.change(screen.getByLabelText('CSV dosyası'), {
      target: { files: [new File(['x'], 'x.csv', { type: 'text/csv' })] },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Önizle' }));

    expect(await screen.findByText(/Sınıf bulunamadı: 'OLMAYAN'/)).toBeInTheDocument();
    expect(screen.getByText('Hatalar (1)')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '1 kaydı oluştur' })).toBeDisabled();
  });

  it('geçerli önizlemede kaydeder ve başarı mesajı gösterir', async () => {
    previewResponse = {
      dry_run: true,
      ok: true,
      committed: false,
      summary: { ...EMPTY_SUMMARY, new_students: 2, new_guardians: 1 },
      errors: [],
      warnings: [],
    };
    const fetchMock = studentsFetch();
    vi.stubGlobal('fetch', fetchMock);

    render(
      <MemoryRouter>
        <StudentsPage />
      </MemoryRouter>,
    );
    await waitFor(() => expect(screen.getByText('Ali Yılmaz')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'CSV ile toplu ekle' }));
    fireEvent.change(screen.getByLabelText('CSV dosyası'), {
      target: { files: [new File(['x'], 'x.csv', { type: 'text/csv' })] },
    });
    fireEvent.change(screen.getByLabelText(/ortak başlangıç şifresi/i), {
      target: { value: 'ortak123' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Önizle' }));

    const commitBtn = await screen.findByRole('button', { name: '2 kaydı oluştur' });
    await waitFor(() => expect(commitBtn).toBeEnabled());

    previewResponse = {
      dry_run: false,
      ok: true,
      committed: true,
      summary: { ...EMPTY_SUMMARY, new_students: 2, new_guardians: 1 },
      errors: [],
      warnings: [],
      created: { created_students: 2, created_guardians: 1, created_schools: 0 },
    };
    fireEvent.click(commitBtn);

    expect(await screen.findByText('2 öğrenci oluşturuldu.')).toBeInTheDocument();
    const previewCall = fetchMock.mock.calls.find(
      ([u, i]) => String(u).includes('dry_run=true') && i?.method === 'POST',
    );
    expect((previewCall![1]!.body as FormData).get('week_id')).toBe('w-future');

    const commitCall = fetchMock.mock.calls.find(
      ([u, i]) => String(u).includes('dry_run=false') && i?.method === 'POST',
    );
    expect(commitCall).toBeDefined();
    const body = commitCall![1]!.body as FormData;
    expect(body.get('password')).toBe('ortak123');
    expect(body.get('week_id')).toBe('w-future');
  });

  it('başlangıç haftası seçici varsayılan aktif haftadır; geçmiş hafta devre dışı', async () => {
    vi.stubGlobal('fetch', studentsFetch());

    render(
      <MemoryRouter>
        <StudentsPage />
      </MemoryRouter>,
    );
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'CSV ile toplu ekle' })).toBeEnabled(),
    );

    fireEvent.click(screen.getByRole('button', { name: 'CSV ile toplu ekle' }));
    const select = screen.getByLabelText('Başlangıç haftası (tüm grup için)') as HTMLSelectElement;
    expect(select.value).toBe('w-future');
    const pastOption = screen.getByRole('option', {
      name: /01\.01 - 07\.01\.2000/,
    }) as HTMLOptionElement;
    expect(pastOption.disabled).toBe(true);
  });
});

describe('StudentsPage — yeni öğrenci başlangıç haftası', () => {
  it('varsayılan aktif haftadır ve oluşturmada week_id gönderilir', async () => {
    const fetchMock = studentsFetch();
    vi.stubGlobal('fetch', fetchMock);

    render(
      <MemoryRouter>
        <StudentsPage />
      </MemoryRouter>,
    );
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Yeni öğrenci' })).toBeEnabled(),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Yeni öğrenci' }));
    const weekSelect = screen.getByLabelText('Başlangıç haftası') as HTMLSelectElement;
    expect(weekSelect.value).toBe('w-future');

    fireEvent.change(screen.getByLabelText('Ad soyad'), {
      target: { value: 'Yeni Öğrenci' },
    });
    fireEvent.change(screen.getByLabelText('Veli (arayın ve seçin)'), {
      target: { value: 'Ayşe' },
    });
    fireEvent.click(await screen.findByRole('button', { name: /Örnek Kişi 5/ }));
    fireEvent.change(screen.getByLabelText(/Başlangıç şifresi/), {
      target: { value: 'sifre123' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Öğrenci oluştur' }));

    await waitFor(() => {
      const createCall = fetchMock.mock.calls.find(
        ([u, i]) => String(u).endsWith('/admin/students') && i?.method === 'POST',
      );
      expect(createCall).toBeDefined();
      const body = JSON.parse(createCall![1]!.body as string) as { week_id?: string };
      expect(body.week_id).toBe('w-future');
    });
  });
});

describe('Arama inputlarında autocomplete', () => {
  it('SearchBox ve veli arama kutuları autocomplete=off ve boş', async () => {
    vi.stubGlobal('fetch', studentsFetch());

    render(
      <MemoryRouter>
        <StudentsPage />
      </MemoryRouter>,
    );
    await waitFor(() => expect(screen.getByText('Ali Yılmaz')).toBeInTheDocument());

    const search = screen.getByPlaceholderText('Öğrenci veya veli ara…');
    expect(search).toHaveAttribute('autocomplete', 'off');
    expect((search as HTMLInputElement).value).toBe('');

    fireEvent.click(screen.getByRole('button', { name: 'Yeni öğrenci' }));
    const guardianSearch = screen.getByLabelText('Veli (arayın ve seçin)');
    expect(guardianSearch).toHaveAttribute('autocomplete', 'off');
    expect((guardianSearch as HTMLInputElement).value).toBe('');
    fireEvent.click(screen.getByRole('button', { name: 'İptal' }));

    // Parola alanı autofill'i tetiklemesin → new-password (standart değer).
    fireEvent.click(screen.getByRole('button', { name: 'CSV ile toplu ekle' }));
    const importPass = screen.getByLabelText(/ortak başlangıç şifresi/i);
    expect(importPass).toHaveAttribute('autocomplete', 'new-password');
    expect((importPass as HTMLInputElement).value).toBe('');
  });
});

describe('Dışa aktarma butonları', () => {
  it('StudentsPage aktif arama ile /admin/students/export çağırır', async () => {
    const fetchMock = studentsFetch();
    vi.stubGlobal('fetch', fetchMock);
    stubUrl();

    render(
      <MemoryRouter>
        <StudentsPage />
      </MemoryRouter>,
    );
    await waitFor(() => expect(screen.getByText('Ali Yılmaz')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'CSV indir' }));
    await waitFor(() => {
      expect(fetchMock.mock.calls.some(([u]) => String(u).includes('/admin/students/export'))).toBe(true);
    });
    const [url, init] = fetchMock.mock.calls.find(([u]) =>
      String(u).includes('/admin/students/export'),
    )!;
    expect(String(url)).toContain('/admin/students/export');
    expect((init?.headers as Record<string, string>).Authorization).toContain('Bearer');
  });

  it('GuardiansPage /admin/guardians/export çağırır', async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/admin/guardians/export')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          blob: async () => new Blob(['a,b\r\n']),
          headers: { get: () => null },
        });
      }
      if (url.includes('/admin/guardians')) {
        return json({ items: [
          { id: 'g1', user_id: 'u1', full_name: 'Örnek Kişi 5', username: 'veli1', whatsapp_phone: '+905001112233', phone_secondary: null, consent_at: null, child_count: 1 },
        ], total: 1, page: 1, pageSize: 20 });
      }
      throw new Error(`beklenmeyen istek: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    stubUrl();

    render(
      <MemoryRouter>
        <GuardiansPage />
      </MemoryRouter>,
    );
    await waitFor(() => expect(screen.getByText('Örnek Kişi 5')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'CSV indir' }));
    await waitFor(() => {
      expect(fetchMock.mock.calls.some(([u]) => String(u).includes('/admin/guardians/export'))).toBe(true);
    });
  });

  it('AdminReportsPage aktif filtre ile /admin/reports/export çağırır', async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/admin/reports/export')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          blob: async () => new Blob(['a,b\r\n']),
          headers: { get: () => null },
        });
      }
      if (url.includes('/admin/academic-years')) return json({ items: [{ id: 'y', name: '2026-2027', is_active: 1 }] });
      if (url.includes('/admin/classes')) return json({ items: [] });
      if (url.includes('/admin/weeks')) return json({ items: [] });
      if (url.includes('/teacher/reports/filters')) return json({ classes: [], weeks: [] });
      if (url.includes('/teacher/reports')) return json({ items: [], total: 0, page: 1, pageSize: 20 });
      throw new Error(`beklenmeyen istek: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    stubUrl();

    render(
      <MemoryRouter>
        <AdminReportsPage />
      </MemoryRouter>,
    );
    await waitFor(() =>
      expect(screen.getByText('Bu filtrelerle rapor bulunamadı.')).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByRole('button', { name: 'CSV indir' }));
    await waitFor(() => {
      expect(fetchMock.mock.calls.some(([u]) => String(u).includes('/admin/reports/export'))).toBe(true);
    });
  });
});

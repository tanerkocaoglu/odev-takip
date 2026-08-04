/**
 * Öğrenci ödev frontend testleri — Aşama 4.
 * studentApi istemcisi (birim) + HomeworkListPage (liste, rozetler, yükleme).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { studentApi } from './services/api';
import HomeworkListPage from './pages/student/HomeworkListPage';

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

describe('studentApi', () => {
  it('homeworks doğru endpoint\'i çağırır', async () => {
    const fetchMock = mockFetch(200, { items: [] });
    vi.stubGlobal('fetch', fetchMock);
    await studentApi.homeworks();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${BASE_URL}/student/homeworks`);
    expect(init.method ?? 'GET').toBe('GET');
  });

  it('submit, FormData ile POST atar ve Content-Type belirlemez', async () => {
    const fetchMock = mockFetch(200, { item: {} });
    vi.stubGlobal('fetch', fetchMock);
    const file = new File(['x'], 'odev.png', { type: 'image/png' });
    await studentApi.submit('h1', [file], 'not');

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${BASE_URL}/student/homeworks/h1/submit`);
    expect(init.method).toBe('POST');
    expect(init.body).toBeInstanceOf(FormData);
    // FormData iken Content-Type header'ı set edilmez (boundary bozulmasın).
    const headers = init.headers as Record<string, string>;
    expect(headers['Content-Type']).toBeUndefined();
  });
});

const HOMEWORKS = {
  items: [
    {
      id: 'h1',
      description: 'Problemler çözülecek.',
      due_date: '2026-01-12',
      course_name: 'Matematik',
      teacher_name: 'Örnek Kişi 5',
      class_name: 'ÖKLİD',
      week: { week_no: 5, start_date: '2026-01-05', end_date: '2026-01-11', label: '05 - 11 Ocak' },
      submission: null,
    },
    {
      id: 'h2',
      description: 'Fizik deney raporu.',
      due_date: '2026-01-10',
      course_name: 'Fizik',
      teacher_name: 'Örnek Kişi 4',
      class_name: 'SEVA',
      week: { week_no: 4, start_date: '2025-12-29', end_date: '2026-01-04', label: '29 Ara - 04 Oca' },
      submission: {
        id: 'sub2',
        submitted_at: '2026-01-09T18:00:00.000Z',
        is_late: false,
        status: 'submitted',
        files: [{ key: '1234567890-0123456789abcdef.jpg', filename: 'rapor.jpg', size: 1024, mime: 'image/jpeg', ext: 'jpg' }],
      },
    },
  ],
};

describe('HomeworkListPage', () => {
  it('ödevleri listeler; teslim rozetleri ve dosya linki gösterilir; puan yok', async () => {
    vi.stubGlobal('fetch', mockFetch(200, HOMEWORKS));
    render(
      <MemoryRouter>
        <HomeworkListPage />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText('Problemler çözülecek.')).toBeInTheDocument();
    });
    expect(screen.getByText('Fizik deney raporu.')).toBeInTheDocument();
    expect(screen.getByText('Yüklenmedi')).toBeInTheDocument();
    expect(screen.getByText('Yüklendi')).toBeInTheDocument();
    expect(screen.getByText('Matematik · Örnek Kişi 5')).toBeInTheDocument();
    expect(screen.getByText('Fizik · Örnek Kişi 4')).toBeInTheDocument();

    const fileLink = screen.getByRole('link', { name: /rapor\.jpg/ });
    expect(fileLink).toHaveAttribute(
      'href',
      `${BASE_URL}/files/1234567890-0123456789abcdef.jpg`,
    );

    // Öğrenci ekranında puan/not asla görünmez.
    expect(screen.queryByText(/puan/i)).not.toBeInTheDocument();
  });

  it('boş listede boş durum gösterilir', async () => {
    vi.stubGlobal('fetch', mockFetch(200, { items: [] }));
    render(
      <MemoryRouter>
        <HomeworkListPage />
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(screen.getByText('Sana verilmiş ödev yok.')).toBeInTheDocument();
    });
  });

  it('geç yüklendi rozeti ayrı gösterilir', async () => {
    const data = {
      items: [
        {
          ...HOMEWORKS.items[0],
          submission: {
            id: 'sub-late',
            submitted_at: '2026-01-13T18:00:00.000Z',
            is_late: true,
            status: 'submitted',
            files: [{ key: '1234567890-0123456789abcdef.jpg', filename: 'gec.jpg', size: 500, mime: 'image/jpeg', ext: 'jpg' }],
          },
        },
      ],
    };
    vi.stubGlobal('fetch', mockFetch(200, data));
    render(
      <MemoryRouter>
        <HomeworkListPage />
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(screen.getByText('Geç yüklendi')).toBeInTheDocument();
    });
  });

  it('dosya seçip Gönder\'e basınca submit atılır ve liste yenilenir', async () => {
    const submitted = {
      item: {
        ...HOMEWORKS.items[0],
        submission: {
          id: 'sub-new',
          submitted_at: '2026-01-14T10:00:00.000Z',
          is_late: false,
          status: 'submitted',
          files: [{ key: '1234567890-0123456789abcdef.jpg', filename: 'odev.png', size: 2048, mime: 'image/jpeg', ext: 'jpg' }],
        },
      },
    };
    const updatedList = { items: [submitted.item, HOMEWORKS.items[1]] };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => HOMEWORKS })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => submitted })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => updatedList });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <MemoryRouter>
        <HomeworkListPage />
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(screen.getByText('Problemler çözülecek.')).toBeInTheDocument();
    });

    const fileInput = screen.getAllByLabelText('Ödev dosyalarını seç')[0] as HTMLInputElement;
    const file = new File(['img'], 'odev.png', { type: 'image/png' });
    fireEvent.change(fileInput, { target: { files: [file] } });

    // h1'in Gönder butonu etkinleşir (h2'nin hâlâ kapalıdır) — ilki h1'e ait.
    const submitButton = (await screen.findAllByRole('button', { name: 'Gönder' }))[0];
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText('Yüklendi')).toBeInTheDocument();
    });

    // GET (liste) + POST (submit) + GET (yeniden yükleme)
    expect(fetchMock.mock.calls[1][1].method).toBe('POST');
    const body = fetchMock.mock.calls[1][1].body as FormData;
    expect(body.getAll('files')).toHaveLength(1);
  });
});

/**
 * Öğrenci ödev frontend testleri — Aşama 4.
 * studentApi istemcisi (birim) + HomeworkListPage (liste, rozetler, yükleme).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { studentApi, openProtectedFile, fetchProtectedFileUrl, fetchProtectedThumbUrl, releaseProtectedFileUrl } from './services/api';
import HomeworkListPage from './pages/student/HomeworkListPage';

const BASE_URL = '/api/v1';

// Dosya açma davranışı openProtectedFile'ın kendi birim testlerinde kapsanır;
// sayfa testinde görsellerin lightbox'ı, PDF'lerin yeni sekmeyi kullandığını
// doğruluyoruz.
vi.mock('./services/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./services/api')>();
  return {
    ...actual,
    openProtectedFile: vi.fn().mockResolvedValue(undefined),
    fetchProtectedFileUrl: vi.fn(),
    fetchProtectedThumbUrl: vi.fn(),
    releaseProtectedFileUrl: vi.fn(),
  };
});

function mockFetch(status: number, body: unknown) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  });
}

beforeEach(() => {
  localStorage.clear();
  vi.mocked(fetchProtectedFileUrl).mockImplementation(async (key) => `blob:${key}`);
  vi.mocked(fetchProtectedThumbUrl).mockImplementation(async (key) => `blob:thumb-${key}`);
  vi.mocked(releaseProtectedFileUrl).mockClear();
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
  it('ödevleri listeler; teslim rozetleri ve dosya butonu gösterilir; puan yok', async () => {
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

    // Dosya korumalı olduğu için `<a href>` Authorization header gönderemezdi;
    // artık Bearer token'lı fetch'i çağıran butonla açılır (bkz. openProtectedFile).
    expect(
      screen.getByRole('button', { name: /rapor\.jpg/ }),
    ).toBeInTheDocument();

    // Öğrenci ekranında puan/değerlendirme süreci asla görünmez.
    expect(screen.queryByText(/puan/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/inceleme|değerlendir|sırada/i)).not.toBeInTheDocument();
  });

  it('görsele tıklayınca lightbox açılır, openProtectedFile çağrılmaz', async () => {
    const openMock = vi.mocked(openProtectedFile);
    openMock.mockReset();
    openMock.mockResolvedValue(undefined);
    vi.stubGlobal('fetch', mockFetch(200, HOMEWORKS));
    render(
      <MemoryRouter>
        <HomeworkListPage />
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(screen.getByText('Problemler çözülecek.')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /rapor\.jpg/ }));
    expect(await screen.findByAltText('rapor.jpg')).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(openMock).not.toHaveBeenCalled();
  });

  it('PDF butonuna basınca openProtectedFile çağrılır (lightbox değil)', async () => {
    const openMock = vi.mocked(openProtectedFile);
    openMock.mockReset();
    openMock.mockResolvedValue(undefined);
    const data = {
      items: [
        {
          ...HOMEWORKS.items[0],
          submission: {
            id: 'sub-pdf',
            submitted_at: '2026-01-09T18:00:00.000Z',
            is_late: false,
            status: 'submitted',
            files: [
              {
                key: '1234567890-ffffffffffffffff.pdf',
                filename: 'cozum.pdf',
                size: 2048,
                mime: 'application/pdf',
                ext: 'pdf',
              },
            ],
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

    fireEvent.click(await screen.findByRole('button', { name: /cozum\.pdf/ }));
    expect(openMock).toHaveBeenCalledWith('1234567890-ffffffffffffffff.pdf');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
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

  it('hafta + ders filtreleri birlikte süzer; sonuç boşsa boş durum gösterir', async () => {
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

    // Hafta seçenekleri en yakından geriye (azalan) sıralanır.
    const weekSelect = screen.getByLabelText('Hafta') as HTMLSelectElement;
    expect([...weekSelect.options].map((o) => o.textContent)).toEqual([
      'Tümü',
      'Hafta 5',
      'Hafta 4',
    ]);

    // Hafta 5 → yalnızca Matematik (h1).
    fireEvent.change(screen.getByLabelText('Hafta'), { target: { value: '5' } });
    expect(screen.getByText('Problemler çözülecek.')).toBeInTheDocument();
    expect(screen.queryByText('Fizik deney raporu.')).not.toBeInTheDocument();

    // Hafta Tümü + Ders Fizik → yalnızca Fizik (h2).
    fireEvent.change(screen.getByLabelText('Hafta'), { target: { value: '' } });
    fireEvent.change(screen.getByLabelText('Ders'), { target: { value: 'Fizik' } });
    expect(screen.getByText('Fizik deney raporu.')).toBeInTheDocument();
    expect(screen.queryByText('Problemler çözülecek.')).not.toBeInTheDocument();

    // Kombinasyon: Hafta 5 + Ders Fizik → kesişim boş.
    fireEvent.change(screen.getByLabelText('Hafta'), { target: { value: '5' } });
    expect(screen.getByText('Bu filtrelerle ödev bulunamadı.')).toBeInTheDocument();
    expect(screen.queryByText('Problemler çözülecek.')).not.toBeInTheDocument();
    expect(screen.queryByText('Fizik deney raporu.')).not.toBeInTheDocument();

    // Tümü'ye dönünce liste geri gelir.
    fireEvent.change(screen.getByLabelText('Ders'), { target: { value: '' } });
    fireEvent.change(screen.getByLabelText('Hafta'), { target: { value: '' } });
    expect(screen.getByText('Problemler çözülecek.')).toBeInTheDocument();
    expect(screen.getByText('Fizik deney raporu.')).toBeInTheDocument();
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

  it('teslim durumuna göre kart durumu (data-status) doğru türetilir', async () => {
    const base = HOMEWORKS.items[0];
    const data = {
      items: [
        { ...base, id: 'p1', due_date: '2999-01-01', submission: null },
        { ...base, id: 'p2', due_date: '2000-01-01', submission: null },
        {
          ...base,
          id: 'p3',
          due_date: '2000-01-01',
          submission: {
            id: 's3',
            submitted_at: '2000-01-02T10:00:00.000Z',
            is_late: false,
            status: 'submitted',
            files: [],
          },
        },
        {
          ...base,
          id: 'p4',
          due_date: '2000-01-01',
          submission: {
            id: 's4',
            submitted_at: '2000-01-03T10:00:00.000Z',
            is_late: true,
            status: 'submitted',
            files: [],
          },
        },
      ],
    };
    vi.stubGlobal('fetch', mockFetch(200, data));
    const { container } = render(
      <MemoryRouter>
        <HomeworkListPage />
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(container.querySelectorAll('[data-status]')).toHaveLength(4);
    });
    const statuses = Array.from(container.querySelectorAll('[data-status]')).map((el) =>
      el.getAttribute('data-status'),
    );
    expect(statuses).toEqual(['pending', 'overdue', 'submitted', 'late']);
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

  it('30 dosyadan fazlası seçilince "30" hatası gösterilir', async () => {
    vi.stubGlobal('fetch', mockFetch(200, HOMEWORKS));
    render(
      <MemoryRouter>
        <HomeworkListPage />
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(screen.getByText('Problemler çözülecek.')).toBeInTheDocument();
    });

    const fileInput = screen.getAllByLabelText('Ödev dosyalarını seç')[0] as HTMLInputElement;
    const files = Array.from(
      { length: 31 },
      (_, i) => new File(['x'], `sayfa-${i + 1}.png`, { type: 'image/png' }),
    );
    fireEvent.change(fileInput, { target: { files } });

    expect(screen.getByText('En fazla 30 dosya seçebilirsiniz.')).toBeInTheDocument();
  });

  it('seçilen dosya gönder öncesi tek tek kaldırılabilir', async () => {
    vi.stubGlobal('fetch', mockFetch(200, HOMEWORKS));
    render(
      <MemoryRouter>
        <HomeworkListPage />
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(screen.getByText('Problemler çözülecek.')).toBeInTheDocument();
    });

    const fileInput = screen.getAllByLabelText('Ödev dosyalarını seç')[0] as HTMLInputElement;
    const files = [
      new File(['a'], 'sayfa-a.png', { type: 'image/png' }),
      new File(['b'], 'sayfa-b.png', { type: 'image/png' }),
    ];
    fireEvent.change(fileInput, { target: { files } });

    expect(await screen.findAllByRole('button', { name: /dosyasını kaldır/ })).toHaveLength(2);

    fireEvent.click(screen.getByRole('button', { name: /sayfa-a\.png dosyasını kaldır/ }));
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /sayfa-a\.png dosyasını kaldır/ })).not.toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: /sayfa-b\.png dosyasını kaldır/ })).toBeInTheDocument();
  });

  it('Kamerayla çek arka kamera inputunu tetikler; fotoğraf aynı listeye eklenir', async () => {
    vi.stubGlobal('fetch', mockFetch(200, HOMEWORKS));
    render(
      <MemoryRouter>
        <HomeworkListPage />
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(screen.getByText('Problemler çözülecek.')).toBeInTheDocument();
    });

    const cameraInput = screen.getAllByLabelText('Kamerayla fotoğraf çek')[0] as HTMLInputElement;
    expect(cameraInput).toHaveAttribute('accept', 'image/*');
    expect(cameraInput).toHaveAttribute('capture', 'environment');

    const clickSpy = vi.spyOn(cameraInput, 'click');
    fireEvent.click(screen.getAllByRole('button', { name: 'Kamerayla çek' })[0]);
    expect(clickSpy).toHaveBeenCalledTimes(1);

    // Çekilen fotoğraf mevcut grid'e/kaldır akışına girer.
    fireEvent.change(cameraInput, {
      target: { files: [new File(['img'], 'ekran.jpg', { type: 'image/jpeg' })] },
    });
    expect(
      await screen.findByRole('button', { name: /ekran\.jpg dosyasını kaldır/ }),
    ).toBeInTheDocument();
  });

  it('kamera girişi de 10 MB ve 30 dosya sınırına tabidir', async () => {
    vi.stubGlobal('fetch', mockFetch(200, HOMEWORKS));
    render(
      <MemoryRouter>
        <HomeworkListPage />
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(screen.getByText('Problemler çözülecek.')).toBeInTheDocument();
    });

    const fileInput = screen.getAllByLabelText('Ödev dosyalarını seç')[0] as HTMLInputElement;
    const cameraInput = screen.getAllByLabelText('Kamerayla fotoğraf çek')[0] as HTMLInputElement;

    // Önce boyut: 10 MB üstü fotoğraf reddedilir.
    const big = new File([new Uint8Array(11 * 1024 * 1024)], 'buyuk.jpg', { type: 'image/jpeg' });
    fireEvent.change(cameraInput, { target: { files: [big] } });
    expect(screen.getByText('Her dosya en fazla 10 MB olabilir.')).toBeInTheDocument();

    // Sonra toplam sayı: dosya seçici 30 ekledikten sonra kamera 1 daha ekleyemez.
    fireEvent.change(fileInput, {
      target: {
        files: Array.from({ length: 30 }, (_, i) => new File(['x'], `s-${i}.png`, { type: 'image/png' })),
      },
    });
    fireEvent.change(cameraInput, {
      target: { files: [new File(['x'], 'fazla.png', { type: 'image/png' })] },
    });
    expect(screen.getByText('En fazla 30 dosya seçebilirsiniz.')).toBeInTheDocument();
  });
});

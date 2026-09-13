/**
 * Veli paneli frontend testleri — Aşama 5 (GuardianHomePage redesign sonrası).
 * GuardianHomePage: çocuk çipleri, hafta filtresi, zaman çizelgesi. Rapor
 * detayı (snapshot + teslim geçmişi) ayrı testte.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { guardianApi } from './services/api';
import GuardianHomePage from './pages/guardian/GuardianHomePage';
import GuardianReportDetailPage from './pages/guardian/GuardianReportDetailPage';

function mockFetch(status: number, body: unknown) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    // Korumalı dosya istekleri (thumbnail/lightbox) blob okur.
    blob: async () => new Blob(['x'], { type: 'image/jpeg' }),
  });
}

const STUDENTS = {
  items: [
    { student_id: 's1', student_name: 'Örnek Kişi 6', username: 'ogrenci1', class_name: 'ÖKLİD' },
    { student_id: 's2', student_name: 'Zeynep Örnek', username: 'ogrenci2', class_name: 'SEVA' },
  ],
};

const REPORTS = {
  items: [
    {
      id: 'd1',
      week: { id: 'w1', week_no: 5, start_date: '2026-01-05', end_date: '2026-01-11', label: '05 - 11 Ocak' },
      relative_week_no: 3,
      class_id: 'c1',
      class_name: 'ÖKLİD',
      courses: ['Cebir', 'Geometri'],
      sent_at: '2026-01-12T10:00:00.000Z',
      send_count: 1,
      course_count: 2,
    },
  ],
};

function reportFixture(overrides: Record<string, unknown>) {
  return {
    id: 'r',
    week: { id: 'w', week_no: 5, start_date: '2026-01-05', end_date: '2026-01-11', label: '05 - 11 Ocak' },
    relative_week_no: 1,
    class_id: 'c1',
    class_name: 'ÖKLİD',
    courses: ['Cebir'],
    sent_at: '2026-01-12T10:00:00.000Z',
    send_count: 1,
    course_count: 1,
    ...overrides,
  };
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('guardianApi', () => {
  it('students doğru endpoint\'i çağırır', async () => {
    const fetchMock = mockFetch(200, { items: [] });
    vi.stubGlobal('fetch', fetchMock);
    await guardianApi.students();
    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toBe('/api/v1/guardian/students');
  });

  it('reports, öğrenci id\'sini sorguya ekler', async () => {
    const fetchMock = mockFetch(200, { items: [] });
    vi.stubGlobal('fetch', fetchMock);
    await guardianApi.reports('s1');
    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toBe('/api/v1/guardian/reports?student_id=s1');
  });
});

describe('GuardianHomePage', () => {
  it('birden çok çocukta çocuk çipleri gösterilir; seçince zaman çizelgesi gelir', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => STUDENTS })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => REPORTS });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <MemoryRouter>
        <GuardianHomePage />
      </MemoryRouter>,
    );

    const child = await screen.findByRole('button', { name: 'Örnek Kişi 6' });
    fireEvent.click(child);

    await waitFor(() => {
      expect(screen.getByText('05 - 11 Ocak')).toBeInTheDocument();
    });
    expect(screen.getByText('ÖKLİD')).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: '3. hafta raporunu aç' }),
    ).toHaveAttribute('href', '/guardian/reports/d1');
  });

  it('tek çocukta otomatik seçilir; çocuk çipi gösterilmez', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ items: [STUDENTS.items[0]] }) })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => REPORTS });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <MemoryRouter>
        <GuardianHomePage />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText('05 - 11 Ocak')).toBeInTheDocument();
    });
    expect(screen.queryByRole('button', { name: 'Örnek Kişi 6' })).not.toBeInTheDocument();
  });

  it('gönderilmiş rapor yoksa boş durum gösterilir', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ items: [STUDENTS.items[0]] }) })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ items: [] }) });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <MemoryRouter>
        <GuardianHomePage />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(
        screen.getByText('Bu öğrenci için henüz gönderilmiş rapor yok.'),
      ).toBeInTheDocument();
    });
  });

  it('hafta filtresi tüm haftaları listeler ve listeyi süzer', async () => {
    const three = {
      items: [
        reportFixture({ id: 'r1', relative_week_no: 1, week: { id: 'w1', week_no: 5, start_date: '2026-01-05', end_date: '2026-01-11', label: '05 - 11 Ocak' } }),
        reportFixture({ id: 'r2', relative_week_no: 2, week: { id: 'w2', week_no: 6, start_date: '2026-01-12', end_date: '2026-01-18', label: '12 - 18 Ocak' } }),
        reportFixture({ id: 'r3', relative_week_no: 3, week: { id: 'w3', week_no: 7, start_date: '2026-01-19', end_date: '2026-01-25', label: '19 - 25 Ocak' } }),
      ],
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ items: [STUDENTS.items[0]] }) })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => three });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <MemoryRouter>
        <GuardianHomePage />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByRole('link', { name: '3. hafta raporunu aç' })).toBeInTheDocument();
    });

    // Tüm haftalar seçicide listelenir (en yeniden eskiye).
    const select = screen.getByLabelText('Hafta') as HTMLSelectElement;
    expect([...select.options].map((o) => o.textContent)).toEqual([
      'Tüm haftalar',
      '3. hafta · 19 - 25 Ocak',
      '2. hafta · 12 - 18 Ocak',
      '1. hafta · 05 - 11 Ocak',
    ]);

    // Hafta 2 → yalnızca o haftanın raporu.
    fireEvent.change(select, { target: { value: 'w2' } });
    expect(screen.getByRole('link', { name: '2. hafta raporunu aç' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: '3. hafta raporunu aç' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: '1. hafta raporunu aç' })).not.toBeInTheDocument();

    // Tüm haftalar → liste geri gelir.
    fireEvent.change(select, { target: { value: '' } });
    expect(screen.getByRole('link', { name: '3. hafta raporunu aç' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '1. hafta raporunu aç' })).toBeInTheDocument();
  });

  function renderWithDetail() {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ items: [STUDENTS.items[0]] }),
      })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => REPORTS });
    vi.stubGlobal('fetch', fetchMock);
    return render(
      <MemoryRouter initialEntries={['/guardian']}>
        <Routes>
          <Route path="/guardian" element={<GuardianHomePage />} />
          <Route path="/guardian/reports/:id" element={<div>DETAY-SAYFASI</div>} />
        </Routes>
      </MemoryRouter>,
    );
  }

  it('rapor satırı tıklanınca detaya gider', async () => {
    renderWithDetail();
    await waitFor(() => {
      expect(screen.getByText('05 - 11 Ocak')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('link', { name: /hafta raporunu aç/i }));
    await waitFor(() => {
      expect(screen.getByText('DETAY-SAYFASI')).toBeInTheDocument();
    });
  });
});

const DETAIL = {
  digest: {
    id: 'd1',
    week: { week_no: 5, start_date: '2026-01-05', end_date: '2026-01-11', label: '05 - 11 Ocak' },
    sent_at: '2026-01-12T10:00:00.000Z',
    send_count: 1,
  },
  snapshot: {
    week: { id: 'w1', week_no: 5, start_date: '2026-01-05', end_date: '2026-01-11', label: '05 - 11 Ocak' },
    class: { id: 'c1', name: 'ÖKLİD' },
    student: { id: 's1', name: 'Örnek Kişi 6' },
    guardian_name: 'Ayşe Örnek',
    courses: [
      {
        class_course_id: 'cc1',
        course_name: 'Matematik',
        teacher_name: 'Örnek Kişi 5',
        day_of_week: 1,
        lesson_time: '09:00',
        status: 'completed',
        topic_covered: 'Denklemler',
        prev_homework_text: null,
        homework: { description: 'Sayfa 12', due_date: '2026-01-12' },
        entry: {
          student_id: 's1',
          student_name: 'Örnek Kişi 6',
          attendance: 'present',
          homework_score: 8,
          interest_score: 9,
          teacher_note: null,
        },
      },
    ],
  },
  submissions: [
    {
      course_name: 'Matematik',
      description: 'Sayfa 12',
      due_date: '2026-01-12',
      submission: {
        id: 'sub1',
        note: null,
        submitted_at: '2026-01-11T18:00:00.000Z',
        is_late: false,
        status: 'submitted',
        reviewed_at: null,
        files: [{ key: '1234567890-0123456789abcdef.jpg', filename: 'odev.jpg', size: 1024, mime: 'image/jpeg', ext: 'jpg' }],
      },
    },
  ],
};

describe('GuardianReportDetailPage', () => {
  it('görsel thumbnail lightbox açar, PDF yeni sekmede açılır, kaldır butonu yok', async () => {
    const detail = {
      ...DETAIL,
      submissions: [
        {
          ...DETAIL.submissions[0],
          submission: {
            ...DETAIL.submissions[0].submission,
            files: [
              {
                key: '1234567890-0123456789abcdef.jpg',
                filename: 'odev.jpg',
                size: 1024,
                mime: 'image/jpeg',
                ext: 'jpg',
              },
              {
                key: '2234567890-0123456789abcdef.pdf',
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
    localStorage.setItem('ds_token', 'test-token');
    vi.stubGlobal('fetch', mockFetch(200, detail));
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);

    const { container } = render(
      <MemoryRouter initialEntries={['/guardian/reports/d1']}>
        <Routes>
          <Route path="/guardian/reports/:id" element={<GuardianReportDetailPage />} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(
        screen.getByRole('heading', { level: 1, name: 'Örnek Kişi 6' }),
      ).toBeInTheDocument();
    });
    expect(screen.getAllByText('Matematik').length).toBeGreaterThan(0);
    // Puan ham: 8 ve 9 (homework_score / interest_score) aynen.
    expect(screen.getByText('8')).toBeInTheDocument();
    expect(screen.getByText('9')).toBeInTheDocument();
    expect(screen.getByText('Yüklendi')).toBeInTheDocument();
    // Teslim kartı durum şeridi: zamanında yüklendi.
    expect(container.querySelector('[data-status="uploaded"]')).not.toBeNull();

    // Görsel: thumbnail grid üzerinden lightbox açılır (mevcut desen).
    fireEvent.click(
      await screen.findByRole('button', { name: /odev\.jpg görselini aç/ }),
    );
    expect(await screen.findByAltText('odev.jpg')).toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByAltText('odev.jpg')).not.toBeInTheDocument());

    // PDF: ikon + ad, yeni sekmede açılır.
    fireEvent.click(screen.getByRole('button', { name: /cozum\.pdf PDF dosyasını aç/ }));
    await waitFor(() =>
      expect(open).toHaveBeenCalledWith(expect.any(String), '_blank', 'noreferrer'),
    );

    // Veli salt-okunur: kaldırma butonu hiçbir yerde olmamalı.
    expect(screen.queryByRole('button', { name: /dosyasını kaldır/ })).not.toBeInTheDocument();
  });

  it('yapılacak ödevin değerlendirme haftası notunu ve önceki ödevin teslim dosyalarını gösterir', async () => {
    const detail = {
      ...DETAIL,
      snapshot: {
        ...DETAIL.snapshot,
        courses: [
          {
            ...DETAIL.snapshot.courses[0],
            prev_homework_id: 'hw0',
            prev_homework_text: 'Önceki haftanın ödevi',
            homework: {
              ...DETAIL.snapshot.courses[0].homework,
              id: 'hw1',
              graded_in_week: { week_no: 6, label: '12 - 18 Ocak', relative_week_no: 6 },
            },
          },
        ],
      },
      prev_submissions: [
        {
          class_course_id: 'cc1',
          homework_id: 'hw0',
          course_name: 'Matematik',
          description: 'Önceki haftanın ödevi',
          due_date: '2026-01-05',
          submission: {
            id: 'sub0',
            note: null,
            submitted_at: '2026-01-04T18:00:00.000Z',
            is_late: false,
            status: 'submitted',
            reviewed_at: null,
            files: [
              {
                key: '3234567890-0123456789abcdef.jpg',
                filename: 'onceki.jpg',
                size: 1024,
                mime: 'image/jpeg',
                ext: 'jpg',
              },
            ],
          },
        },
      ],
    };
    localStorage.setItem('ds_token', 'test-token');
    vi.stubGlobal('fetch', mockFetch(200, detail));

    render(
      <MemoryRouter initialEntries={['/guardian/reports/d1']}>
        <Routes>
          <Route path="/guardian/reports/:id" element={<GuardianReportDetailPage />} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(
        screen.getByRole('heading', { level: 1, name: 'Örnek Kişi 6' }),
      ).toBeInTheDocument();
    });

    // "Yapılacak ödev" altındaki bilgi notu: görece hafta + tarih etiketi.
    expect(screen.getByText(/Bu ödevin değerlendirmesi/)).toHaveTextContent(
      'Bu ödevin değerlendirmesi 6. hafta (12 - 18 Ocak) raporunda görünecek.',
    );

    // "Verilmiş ödev" (bu haftanın puanladığı ödev) altında teslim dosyaları.
    expect(screen.getByText('Öğrencinin bu ödeve yüklediği dosyalar')).toBeInTheDocument();
    expect(
      await screen.findByRole('button', { name: /onceki\.jpg görselini aç/ }),
    ).toBeInTheDocument();
  });
});

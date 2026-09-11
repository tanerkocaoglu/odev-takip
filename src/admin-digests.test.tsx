/**
 * Admin gönderim ekranı frontend testleri — revoke → yeniden gönder akışı
 * (spec.md §5.4): is_revoked=1 digest "İptal edildi" olarak görünür ve
 * "Yeniden gönder" eylemi mevcuttur; send, yeni token üretir ve popup
 * engelleme deseniyle wa.me linkini açar.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import DigestSendPage from './pages/admin/DigestSendPage';

function ok(body: unknown) {
  return { ok: true, status: 200, json: async () => body };
}

function makeDigest(
  overrides: Partial<{
    status: string;
    is_revoked: boolean;
    send_count: number;
    sent_at: string | null;
    first_viewed_at: string | null;
    last_viewed_at: string | null;
  }>,
) {
  return {
    id: 'd1',
    student_id: 's1',
    student_name: 'Öğrenci 1',
    guardian_name: 'Veli 1',
    week: { id: 'w1', week_no: 20, start_date: '2026-08-03', label: 'Hafta 20' },
    class: { id: 'c1', name: 'EURİST' },
    status: 'pending',
    send_count: 0,
    sent_at: null,
    is_revoked: false,
    first_viewed_at: null,
    last_viewed_at: null,
    missing_course_count: 3,
    total_courses: 4,
    ...overrides,
  };
}

const SEND_RES = {
  id: 'd1',
  status: 'sent',
  send_count: 2,
  sent_at: '2026-08-05T10:00:00.000Z',
  token: 'NEW-TOKEN-ABC',
  snapshot: {},
  message: 'mesaj',
  wa_me_url: 'https://wa.me/905009990003?text=merhaba',
};

/** URL + method'a göre yanıt üreten fetch mock'u. */
function makeFetch(items: unknown[]) {
  return vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = (init?.method ?? 'GET').toUpperCase();
    if (url.endsWith('/admin/academic-years')) return ok({ items: [] });
    if (url.includes('/admin/digests') && method === 'POST') return ok(SEND_RES);
    if (url.includes('/admin/digests')) return ok({ week_id: null, items });
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

function renderPage() {
  return render(
    <MemoryRouter>
      <DigestSendPage />
    </MemoryRouter>,
  );
}

describe('DigestSendPage — durum ve eylem butonları', () => {
  it('pending digest → "Gönder" butonu; "Yeniden gönder"/"İptal" yok', async () => {
    vi.stubGlobal('fetch', makeFetch([makeDigest({ status: 'pending' })]));
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Öğrenci 1')).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: 'Gönder' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Yeniden gönder' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'İptal' })).not.toBeInTheDocument();
  });

  it('sent (iptal edilmemiş) digest → "Yeniden gönder" + "İptal"', async () => {
    vi.stubGlobal(
      'fetch',
      makeFetch([
        makeDigest({ status: 'sent', is_revoked: false, send_count: 1, sent_at: '2026-08-04T09:00:00.000Z' }),
      ]),
    );
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Öğrenci 1')).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: 'Yeniden gönder' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'İptal' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Gönder' })).not.toBeInTheDocument();
    expect(screen.getByText('Gönderildi')).toBeInTheDocument();
  });

  it('iptal edilmiş digest listede "İptal edildi" olarak görünür ve "Yeniden gönder" içerir', async () => {
    vi.stubGlobal(
      'fetch',
      makeFetch([
        makeDigest({ status: 'sent', is_revoked: true, send_count: 1, sent_at: '2026-08-04T09:00:00.000Z' }),
      ]),
    );
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('İptal edildi')).toBeInTheDocument();
    });
    // İptal edilmiş digest yeniden gönderilebilir; tekrar "İptal" sunulmaz.
    expect(screen.getByRole('button', { name: 'Yeniden gönder' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'İptal' })).not.toBeInTheDocument();
  });
});

describe('DigestSendPage — yeniden gönderim (popup engelleme deseni)', () => {
  it('"Yeniden gönder" send çağırır, boş sekme açılır ve wa.me linki atanır', async () => {
    const openMock = vi
      .spyOn(window, 'open')
      .mockReturnValue({ location: {} } as unknown as Window);
    vi.stubGlobal(
      'fetch',
      makeFetch([
        makeDigest({ status: 'sent', is_revoked: true, send_count: 1, sent_at: '2026-08-04T09:00:00.000Z' }),
      ]),
    );
    renderPage();

    await waitFor(() => {
      expect(screen.getByText('İptal edildi')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Yeniden gönder' }));

    await waitFor(() => {
      expect(openMock).toHaveBeenCalledWith('', '_blank');
    });

    const fakeWin = openMock.mock.results[0].value as { location: { href?: string } };
    await waitFor(() => {
      expect(fakeWin.location.href).toBe(SEND_RES.wa_me_url);
    });

    const sendCall = vi
      .mocked(fetch)
      .mock.calls.find(([u, i]) => String(u).includes('/admin/digests/') && i?.method === 'POST');
    expect(sendCall).toBeDefined();
  });

  it('popup engellendiğinde kopyalanabilir link sunulur', async () => {
    vi.spyOn(window, 'open').mockReturnValue(null);
    vi.stubGlobal(
      'fetch',
      makeFetch([
        makeDigest({ status: 'sent', is_revoked: true, send_count: 1, sent_at: '2026-08-04T09:00:00.000Z' }),
      ]),
    );
    renderPage();

    await waitFor(() => {
      expect(screen.getByText('İptal edildi')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Yeniden gönder' }));

    await waitFor(() => {
      expect(screen.getByText(/kopyalayıp elle açabilirsiniz/i)).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: 'Kopyala' })).toBeInTheDocument();
  });

  it('görüntülenme sütunu: null → "Henüz görüntülenmedi", dolu → "Görüntülendi"', async () => {
    vi.stubGlobal(
      'fetch',
      makeFetch([
        makeDigest({ status: 'sent', send_count: 1, sent_at: '2026-08-04T09:00:00.000Z' }),
        {
          ...makeDigest({ status: 'sent', send_count: 1, sent_at: '2026-08-04T09:00:00.000Z' }),
          id: 'd2',
          student_name: 'Öğrenci 2',
          last_viewed_at: '2026-08-05T09:00:00.000Z',
        },
      ]),
    );
    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Henüz görüntülenmedi')).toBeInTheDocument();
    });
    expect(screen.getByText(/Görüntülendi:/)).toBeInTheDocument();
  });
});

const SNAPSHOT = {
  week: { id: 'w1', week_no: 20, start_date: '2026-08-03', end_date: '2026-08-09', label: 'Hafta 20' },
  class: { id: 'c1', name: 'EURİST' },
  student: { id: 's1', name: 'Öğrenci 1' },
  guardian_name: 'Veli 1',
  courses: [
    {
      class_course_id: 'cc1',
      course_name: 'Cebir',
      teacher_name: 'Hoca',
      day_of_week: 1,
      lesson_time: '10:00',
      status: 'completed',
      topic_covered: 'Konu',
      prev_homework_text: null,
      homework: { description: 'Ödev', due_date: '2026-08-10' },
      entry: {
        student_id: 's1',
        student_name: 'Öğrenci 1',
        attendance: 'present',
        homework_score: 8,
        interest_score: 7,
        teacher_note: 'not',
      },
    },
    {
      class_course_id: 'cc2',
      course_name: 'Geometri',
      teacher_name: 'Hoca',
      day_of_week: 2,
      lesson_time: '11:00',
      status: 'missing',
      topic_covered: null,
      prev_homework_text: null,
      homework: null,
      entry: null,
    },
  ],
};

function previewFetch(status: string, is_revoked = false) {
  const items = [makeDigest({ status, is_revoked })];
  return vi.fn((input: RequestInfo | URL) => {
    const url = String(input);
    if (url.endsWith('/admin/academic-years')) return ok({ items: [] });
    if (url.includes('/preview')) return ok({ preview: SNAPSHOT });
    if (url.includes('/admin/digests')) return ok({ week_id: null, items });
    throw new Error(`beklenmeyen istek: ${url}`);
  });
}

describe('DigestSendPage — gönderim öncesi düzenleme', () => {
  it('gönderilmemiş önizlemede completed derste "Düzenle" var, missing derste yok', async () => {
    vi.stubGlobal('fetch', previewFetch('ready'));
    renderPage();

    await waitFor(() => expect(screen.getByText('Öğrenci 1')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Önizle' }));

    const links = await screen.findAllByRole('link', { name: 'Düzenle' });
    expect(links).toHaveLength(1);
    expect(links[0].getAttribute('href')).toMatch(
      /^\/teacher\/reports\/cc1\/w1\?returnTo=/,
    );
  });

  it('sent digest önizlemesinde "Düzenle" hiç görünmez', async () => {
    vi.stubGlobal(
      'fetch',
      previewFetch('sent', false),
    );
    renderPage();

    await waitFor(() => expect(screen.getByText('Öğrenci 1')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Önizle' }));

    await screen.findByText('Cebir');
    expect(screen.queryByRole('link', { name: 'Düzenle' })).not.toBeInTheDocument();
  });
});

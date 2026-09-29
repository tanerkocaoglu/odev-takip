/**
 * Admin gönderim ekranı frontend testleri — revoke → yeniden gönder akışı
 * (spec.md §5.4): is_revoked=1 digest "İptal edildi" olarak görünür ve
 * "Yeniden gönder" eylemi mevcuttur; send, yeni token üretir ve popup
 * engelleme deseniyle wa.me linkini açar.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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
    id: string;
    student_name: string;
    missing_course_count: number;
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
    expect(
      screen.queryByRole('button', { name: 'Öğrenci 1 için işlemler' }),
    ).not.toBeInTheDocument();
  });

  it('sent (iptal edilmemiş) digest → "Yeniden gönder" + menüde "Bağlantıyı iptal et"', async () => {
    vi.stubGlobal(
      'fetch',
      makeFetch([
        makeDigest({
          status: 'sent',
          is_revoked: false,
          send_count: 1,
          sent_at: '2026-08-04T09:00:00.000Z',
        }),
      ]),
    );
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Öğrenci 1')).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: 'Yeniden gönder' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Öğrenci 1 için işlemler' }));
    expect(
      await screen.findByRole('menuitem', { name: 'Bağlantıyı iptal et' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Gönder' })).not.toBeInTheDocument();
    expect(screen.getByText('Gönderildi')).toBeInTheDocument();
  });

  it('iptal edilmiş digest listede "İptal edildi" olarak görünür ve "Yeniden gönder" içerir', async () => {
    vi.stubGlobal(
      'fetch',
      makeFetch([
        makeDigest({
          status: 'sent',
          is_revoked: true,
          send_count: 1,
          sent_at: '2026-08-04T09:00:00.000Z',
        }),
      ]),
    );
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('İptal edildi')).toBeInTheDocument();
    });
    // İptal edilmiş digest yeniden gönderilebilir; tekrar "İptal" sunulmaz.
    expect(screen.getByRole('button', { name: 'Yeniden gönder' })).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Öğrenci 1 için işlemler' }),
    ).not.toBeInTheDocument();
  });

  it('pending ve ready satırları ayrışır: Eksikli uyarısı + Hazır rozeti + özet sayaçları', async () => {
    vi.stubGlobal(
      'fetch',
      makeFetch([
        makeDigest({ id: 'p', student_name: 'Eksikli Öğrenci', status: 'pending' }),
        makeDigest({
          id: 'r',
          student_name: 'Hazır Öğrenci',
          status: 'ready',
          missing_course_count: 0,
        }),
      ]),
    );
    renderPage();
    await screen.findByText('Eksikli Öğrenci');
    expect(screen.getByText('1 / 4 dersin raporu var')).toBeInTheDocument();
    expect(screen.getByText('Hazır', { selector: 'span.rounded-full' })).toBeInTheDocument();
    expect(screen.getByText('Eksikli', { selector: 'span.rounded-full' })).toBeInTheDocument();
    expect(screen.getByLabelText('Gönderim özeti')).toHaveTextContent('1 hazır');
    expect(screen.getByLabelText('Gönderim özeti')).toHaveTextContent('1 eksikli');
  });
});

describe('DigestSendPage — bağlantı iptali onayı', () => {
  function sentFetch() {
    const base = makeFetch([
      makeDigest({
        status: 'sent',
        is_revoked: false,
        send_count: 1,
        sent_at: '2026-08-04T09:00:00.000Z',
      }),
    ]);
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) =>
      String(input).includes('/revoke') ? ok({ ok: true }) : base(input, init),
    );
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
  }
  const openDialog = async () => {
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Öğrenci 1 için işlemler' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Bağlantıyı iptal et' }));
    return screen.findByRole('dialog', { name: 'Bağlantıyı iptal et' });
  };

  it('onay metni kim/hangi hafta/sınıf + kalıcı geçersizlik + 410 söyler; Vazgeç çağrı atmaz', async () => {
    const fetchMock = sentFetch();
    const dialog = await openDialog();
    expect(dialog).toHaveTextContent('Öğrenci 1');
    expect(dialog).toHaveTextContent('Veli 1');
    expect(dialog).toHaveTextContent('20. hafta');
    expect(dialog).toHaveTextContent('EURİST');
    expect(dialog).toHaveTextContent('kalıcı olarak geçersiz');
    expect(dialog).toHaveTextContent('410');
    fireEvent.click(screen.getByRole('button', { name: 'Vazgeç' }));
    expect(fetchMock.mock.calls.some(([u]) => String(u).includes('/revoke'))).toBe(false);
  });

  it('"Bağlantıyı iptal et" onayı revoke çağırır', async () => {
    const fetchMock = sentFetch();
    const dialog = await openDialog();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Bağlantıyı iptal et' }));
    await waitFor(() =>
      expect(fetchMock.mock.calls.some(([u]) => String(u).includes('/revoke'))).toBe(true),
    );
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
        makeDigest({
          status: 'sent',
          is_revoked: true,
          send_count: 1,
          sent_at: '2026-08-04T09:00:00.000Z',
        }),
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
        makeDigest({
          status: 'sent',
          is_revoked: true,
          send_count: 1,
          sent_at: '2026-08-04T09:00:00.000Z',
        }),
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
  week: {
    id: 'w1',
    week_no: 20,
    start_date: '2026-08-03',
    end_date: '2026-08-09',
    label: 'Hafta 20',
  },
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

function previewFetch(status: string, is_revoked = false, snapshot: unknown = SNAPSHOT) {
  const items = [makeDigest({ status, is_revoked })];
  return vi.fn((input: RequestInfo | URL) => {
    const url = String(input);
    if (url.endsWith('/admin/academic-years')) return ok({ items: [] });
    if (url.includes('/preview')) return ok({ preview: snapshot });
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

    // Son tarih gg.aa.yyyy gösterilir (ham ISO değil).
    expect(await screen.findByText(/Son tarih: 10\.08\.2026/)).toBeInTheDocument();

    const links = await screen.findAllByRole('link', { name: 'Düzenle' });
    expect(links).toHaveLength(1);
    expect(links[0].getAttribute('href')).toMatch(/^\/teacher\/reports\/cc1\/w1\?returnTo=/);
  });

  it('sent digest önizlemesinde "Düzenle" hiç görünmez', async () => {
    vi.stubGlobal('fetch', previewFetch('sent', false));
    renderPage();

    await waitFor(() => expect(screen.getByText('Öğrenci 1')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Önizle' }));

    await screen.findByText('Cebir');
    expect(screen.queryByRole('link', { name: 'Düzenle' })).not.toBeInTheDocument();
  });

  it('geri çekilmiş (is_revoked) sent digest önizlemesinde sent derste "Düzenle" görünür', async () => {
    // Kaskad sonrası raporlar 'sent'; iptal edilen digest yeniden gönderilebilmesi
    // için admin düzenleyebilmeli (spec §5.4). Ders durumu 'sent' olsa da görünür.
    const sentSnapshot = {
      ...SNAPSHOT,
      courses: SNAPSHOT.courses.map((c, i) => (i === 0 ? { ...c, status: 'sent' } : c)),
    };
    vi.stubGlobal('fetch', previewFetch('sent', true, sentSnapshot));
    renderPage();

    await waitFor(() => expect(screen.getByText('İptal edildi')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Önizle' }));

    await screen.findByText('Cebir');
    const links = await screen.findAllByRole('link', { name: 'Düzenle' });
    expect(links).toHaveLength(1);
    expect(links[0].getAttribute('href')).toMatch(/^\/teacher\/reports\/cc1\/w1\?returnTo=/);
  });
});

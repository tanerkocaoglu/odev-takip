/**
 * Public veli rapor sayfası frontend testleri — Aşama 5.
 * `/r/{token}`: geçerli snapshot render edilir; iptal/bilinmeyen token
 * "Bu rapor artık geçerli değil." gösterir (410).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import TokenReportPage from './pages/TokenReportPage';

/** Gerçek token biçimi: 43 karakterlik base64url (kısa değerler "bağlantı geçersiz" sayılır). */
const TOKEN = 'kR3x9Lw2QpVb7NfHs1TzYcMd4EjAuGo8XiWq5BnUyZ0';

function renderTokenPage(token: string) {
  return render(
    <MemoryRouter initialEntries={[`/r/${token}`]}>
      <Routes>
        <Route path="/r/:token" element={<TokenReportPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

function mockFetch(status: number, body: unknown) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  });
}

const SNAPSHOT = {
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
      prev_homework_text: 'Sayfa 10',
      homework: { description: 'Sayfa 12, 1-8', due_date: '2026-01-12' },
      entry: {
        student_id: 's1',
        student_name: 'Örnek Kişi 6',
        attendance: 'present',
        homework_score: 8,
        interest_score: 9,
        teacher_note: 'Gayretli.',
      },
    },
    {
      class_course_id: 'cc2',
      course_name: 'Fizik',
      teacher_name: 'Örnek Kişi 4',
      day_of_week: 3,
      lesson_time: null,
      status: 'missing',
      topic_covered: null,
      prev_homework_text: null,
      homework: null,
      entry: null,
    },
  ],
};

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('TokenReportPage', () => {
  it('geçerli snapshot içeriğini gösterir (dersler + puanlar + eksik ders)', async () => {
    vi.stubGlobal('fetch', mockFetch(200, { snapshot: SNAPSHOT, sent_at: null }));
    const { container } = renderTokenPage(TOKEN);

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1, name: 'Örnek Kişi 6' })).toBeInTheDocument();
    });
    // Marka logosu public sayfada görünür.
    expect(
      screen.getByRole('img', { name: 'Ödev Takip' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Örnek Kişi 6')).toBeInTheDocument();
    // Ders adı hem hızlı-atlama çipinde hem kart başlığında geçer.
    expect(screen.getAllByText('Matematik').length).toBeGreaterThan(0);
    expect(screen.getByText('ÖKLİD')).toBeInTheDocument();
    // Puanlar ham 1–10: 8 ve 9 aynen basılır, özet/yüzdelik yok.
    expect(screen.getByText('8')).toBeInTheDocument();
    expect(screen.getByText('9')).toBeInTheDocument();
    expect(screen.getByText('Gayretli.')).toBeInTheDocument();
    expect(screen.getByText('Bu hafta rapor girilmedi')).toBeInTheDocument();
    expect(screen.getAllByText('Fizik').length).toBeGreaterThan(0);
    // Durum şeritleri: entry present → "present", rapor girilmemiş → "missing".
    const statuses = Array.from(container.querySelectorAll('[data-status]')).map((el) =>
      el.getAttribute('data-status'),
    );
    expect(statuses).toEqual(['present', 'missing']);
  });

  it('snapshot ek alanı taşısa bile public sayfa ek dosya göstermez', async () => {
    const leaked = {
      ...SNAPSHOT,
      courses: SNAPSHOT.courses.map((c) =>
        c.class_course_id === 'cc1'
          ? {
              ...c,
              homework_attachments: [
                { id: 'a1', key: 'k1.pdf', filename: 'gizli-odev-eki.pdf', size: 1, mime: 'application/pdf', ext: 'pdf' },
              ],
              prev_homework_attachments: [
                { id: 'a2', key: 'k2.pdf', filename: 'gizli-gecen-ek.pdf', size: 1, mime: 'application/pdf', ext: 'pdf' },
              ],
            }
          : c,
      ),
    };
    vi.stubGlobal('fetch', mockFetch(200, { snapshot: leaked, sent_at: null }));
    renderTokenPage(TOKEN);

    await waitFor(() => {
      expect(screen.getByText('ÖKLİD')).toBeInTheDocument();
    });
    expect(screen.queryByText('gizli-odev-eki.pdf')).not.toBeInTheDocument();
    expect(screen.queryByText('gizli-gecen-ek.pdf')).not.toBeInTheDocument();
    expect(screen.queryByText('Ekler')).not.toBeInTheDocument();
  });

  it('iptal edilmiş token 410 gösterir', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetch(410, {
        error: { code: 'GONE', message: 'Bu rapor artık geçerli değil.' },
      }),
    );
    renderTokenPage(TOKEN);

    await waitFor(() => {
      expect(screen.getByText('Bu rapor artık geçerli değil.')).toBeInTheDocument();
    });
  });

  it('hata durumunda mesaj gösterilir', async () => {
    vi.stubGlobal('fetch', mockFetch(500, { error: { code: 'INTERNAL', message: 'Bir hata oluştu.' } }));
    renderTokenPage(TOKEN);

    await waitFor(() => {
      expect(screen.getByText('Bir hata oluştu.')).toBeInTheDocument();
    });
  });

  it('altbilgide aydınlatma metni linki vardır (/gizlilik)', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetch(410, { error: { code: 'GONE', message: 'Bu rapor artık geçerli değil.' } }),
    );
    renderTokenPage(TOKEN);

    const link = await screen.findByRole('link', { name: 'Gizlilik ve Aydınlatma Metni' });
    expect(link).toHaveAttribute('href', '/gizlilik');
  });

  it('biçimi bozuk (eksik kopyalanmış) bağlantı: istek atılmadan "Bağlantı geçersiz" gösterilir', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    renderTokenPage('abc');
    expect(await screen.findByRole('heading', { name: 'Bağlantı geçersiz' })).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByRole('link', { name: 'Gizlilik ve Aydınlatma Metni' })).toBeInTheDocument();
  });

  it('410: iptal edildiğini ve ne yapılacağını söyler; veli paneline giriş bağlantısı verir', async () => {
    vi.stubGlobal('fetch', mockFetch(410, { error: { code: 'GONE', message: 'Bu rapor artık geçerli değil.' } }));
    renderTokenPage(TOKEN);
    expect(await screen.findByRole('heading', { name: 'Bu rapor artık geçerli değil.' })).toBeInTheDocument();
    expect(screen.getByText(/iptal edilmiş ya da yeni bir bağlantıyla değiştirilmiş/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Veli paneline giriş yap' })).toHaveAttribute('href', '/login');
  });

  it('hata durumunda "Yeniden dene" isteği tekrarlar', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({ error: { code: 'INTERNAL', message: 'Bir hata oluştu.' } }) })
      .mockResolvedValue({ ok: true, status: 200, json: async () => ({ snapshot: SNAPSHOT, sent_at: '2026-01-12T10:00:00.000Z' }) });
    vi.stubGlobal('fetch', fetchMock);
    renderTokenPage(TOKEN);
    fireEvent.click(await screen.findByRole('button', { name: 'Yeniden dene' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Örnek Kişi 6' })).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

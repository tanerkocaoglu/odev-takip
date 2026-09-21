/**
 * Öğretmen rapor frontend testleri — Aşama 3.
 * teacherApi istemcisi (birim) + TeacherDashboardPage + ReportEntryPage.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { teacherApi } from './services/api';
import TeacherDashboardPage from './pages/teacher/TeacherDashboardPage';
import ReportEntryPage from './pages/teacher/ReportEntryPage';

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

describe('teacherApi', () => {
  it('dashboard doğru endpoint\'i çağırır', async () => {
    const fetchMock = mockFetch(200, { week: null, items: [] });
    vi.stubGlobal('fetch', fetchMock);
    await teacherApi.dashboard();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${BASE_URL}/teacher/dashboard`);
    expect(init.method ?? 'GET').toBe('GET');
  });

  it('openReportEntry, class_course_id + week_id ile GET atar', async () => {
    const fetchMock = mockFetch(200, { report: {}, read_only: true, entries: [] });
    vi.stubGlobal('fetch', fetchMock);
    await teacherApi.openReportEntry('cc1', 'w1');
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      `${BASE_URL}/teacher/reports/entry?class_course_id=cc1&week_id=w1`,
    );
    expect(init.method ?? 'GET').toBe('GET');
  });

  it('openReport, class_course_id + week_id ile POST atar', async () => {
    const fetchMock = mockFetch(201, { report: {}, entries: [] });
    vi.stubGlobal('fetch', fetchMock);
    await teacherApi.openReport('cc1', 'w1');
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${BASE_URL}/teacher/reports`);
    expect(init.method).toBe('POST');
    expect(JSON.parse(String(init.body))).toEqual({
      class_course_id: 'cc1',
      week_id: 'w1',
    });
  });

  it('saveReport PUT, completeReport POST gönderir', async () => {
    const fetchMock = mockFetch(200, { report: {}, entries: [] });
    vi.stubGlobal('fetch', fetchMock);

    await teacherApi.saveReport('r1', { topic_covered: 'Konu' });
    const [putUrl, putInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(putUrl).toBe(`${BASE_URL}/teacher/reports/r1`);
    expect(putInit.method).toBe('PUT');
    expect(JSON.parse(String(putInit.body))).toEqual({ topic_covered: 'Konu' });

    await teacherApi.completeReport('r1');
    const [postUrl, postInit] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(postUrl).toBe(`${BASE_URL}/teacher/reports/r1/complete`);
    expect(postInit.method).toBe('POST');
  });
});

const DASHBOARD = {
  week: {
    id: 'w1',
    week_no: 5,
    start_date: '2026-01-05',
    end_date: '2026-01-11',
    label: '05 - 11 Ocak',
  },
  items: [
    {
      class_course_id: 'cc1',
      class_name: 'ÖKLİD',
      course_name: 'Matematik',
      day_of_week: 1,
      lesson_time: '09:00',
      report_id: null,
      status: null,
      is_overdue: true,
      week_range_invalid: false,
    },
    {
      class_course_id: 'cc2',
      class_name: 'SEVA',
      course_name: 'Fizik',
      day_of_week: 5,
      lesson_time: '10:00',
      report_id: 'r2',
      status: 'draft',
      is_overdue: false,
      week_range_invalid: false,
    },
  ],
  overdue_count: 1,
};

describe('TeacherDashboardPage', () => {
  it('bu hafta doldurulacakları listeler; günü geçmiş vurgulanır', async () => {
    vi.stubGlobal('fetch', mockFetch(200, DASHBOARD));
    render(
      <MemoryRouter>
        <TeacherDashboardPage />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText('ÖKLİD · Matematik')).toBeInTheDocument();
    });
    expect(screen.getByText('SEVA · Fizik')).toBeInTheDocument();
    expect(screen.getByText('Günü geçti')).toBeInTheDocument();
    expect(screen.getByText('Taslak')).toBeInTheDocument();

    // İç hatırlatma banner'ı (Aşama 6).
    expect(screen.getByText('Bu hafta 1 raporunuz gecikti')).toBeInTheDocument();

    const link = screen.getByRole('link', { name: /ÖKLİD · Matematik/ });
    expect(link).toHaveAttribute('href', '/teacher/reports/cc1/w1');
  });

  it('gecikme yokken banner gösterilmez', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetch(200, { week: DASHBOARD.week, items: DASHBOARD.items, overdue_count: 0 }),
    );
    render(
      <MemoryRouter>
        <TeacherDashboardPage />
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(screen.getByText('ÖKLİD · Matematik')).toBeInTheDocument();
    });
    expect(screen.queryByText(/raporunuz gecikti/)).not.toBeInTheDocument();
  });

  it('boş haftada boş durum gösterilir', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetch(200, { week: DASHBOARD.week, items: [] }),
    );
    render(
      <MemoryRouter>
        <TeacherDashboardPage />
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(
        screen.getByText('Bu hafta doldurulacak rapor yok.'),
      ).toBeInTheDocument();
    });
  });

  it('hafta henüz başlamadıysa önizleme banner\'ı ve "Önizleme" rozeti gösterilir', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetch(200, { ...DASHBOARD, week_not_started: true }),
    );
    render(
      <MemoryRouter>
        <TeacherDashboardPage />
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(screen.getByText('ÖKLİD · Matematik')).toBeInTheDocument();
    });
    expect(screen.getByText(/Bu hafta henüz başlamadı/)).toBeInTheDocument();
    expect(screen.getAllByText('Önizleme').length).toBeGreaterThan(0);
  });

  it('hafta tanımı hatalı satırda "Hafta tanımı hatalı" rozeti; gecikme/statü gösterilmez', async () => {
    const bad = {
      week: DASHBOARD.week,
      items: [
        {
          class_course_id: 'cc-bad',
          class_name: 'BOZUK',
          course_name: 'Pazar Dersi',
          day_of_week: 7,
          lesson_time: '09:00',
          report_id: null,
          status: null,
          is_overdue: false,
          week_range_invalid: true,
        },
      ],
      overdue_count: 0,
      week_not_started: false,
    };
    vi.stubGlobal('fetch', mockFetch(200, bad));
    render(
      <MemoryRouter>
        <TeacherDashboardPage />
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(screen.getByText('BOZUK · Pazar Dersi')).toBeInTheDocument();
    });
    expect(screen.getByText('Hafta tanımı hatalı')).toBeInTheDocument();
    expect(screen.queryByText('Günü geçti')).not.toBeInTheDocument();
    expect(screen.queryByText('Açılmadı')).not.toBeInTheDocument();
  });
});

const REPORT = {
  report: {
    id: 'r1',
    class_course_id: 'cc1',
    week_id: 'w1',
    status: 'draft',
    completed_at: null,
    updated_at: '2026-01-05T10:00:00.000Z',
    topic_covered: 'İşlenen konu',
    prev_homework_text: 'Geçen haftanın ödevi',
    homework: { description: '', due_date: '2026-01-12' },
    week: {
      week_no: 5,
      start_date: '2026-01-05',
      end_date: '2026-01-11',
      label: '05 - 11 Ocak',
    },
    class_name: 'ÖKLİD',
    course_name: 'Matematik',
    teacher_name: 'Örnek Kişi 5',
    day_of_week: 1,
    lesson_time: '09:00',
  },
  entries: [
    {
      student_id: 's1',
      student_name: 'Öğrenci A',
      attendance: 'present',
      homework_score: null,
      interest_score: null,
      teacher_note: null,
    },
    {
      student_id: 's2',
      student_name: 'Öğrenci B',
      attendance: 'present',
      homework_score: 7,
      interest_score: 8,
      teacher_note: null,
    },
  ],
  week_range_invalid: false,
};

function renderEntryPage() {
  return render(
    <MemoryRouter initialEntries={['/teacher/reports/cc1/w1']}>
      <Routes>
        <Route path="/teacher/reports/:classCourseId/:weekId" element={<ReportEntryPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('ReportEntryPage', () => {
  it('raporu yükler; üst alanlar ve öğrenci satırları görünür', async () => {
    vi.stubGlobal('fetch', mockFetch(200, REPORT));
    renderEntryPage();

    await waitFor(() => {
      expect(screen.getAllByText('Öğrenci A').length).toBeGreaterThan(0);
    });
    expect(screen.getAllByText('Öğrenci B').length).toBeGreaterThan(0);

    const prev = screen.getByLabelText('Verilmiş olan ödev') as HTMLInputElement;
    expect(prev.value).toBe('Geçen haftanın ödevi');
    const topic = screen.getByLabelText('İşlenen konu') as HTMLInputElement;
    expect(topic.value).toBe('İşlenen konu');

    expect(
      screen.getByRole('button', { name: 'Raporu tamamla' }),
    ).toBeInTheDocument();
  });

  it('ödev ekleri: "PDF ekle" yükler; geçen hafta ekleri salt-okunur görünür', async () => {
    const ATT = (id: string, filename: string) => ({
      id,
      key: `${id}-aaaaaaaaaaaaaaaa.pdf`,
      filename,
      size: 10,
      mime: 'application/pdf',
      ext: 'pdf',
    });
    const withAtt = {
      ...REPORT,
      report: {
        ...REPORT.report,
        prev_homework_id: 'h0',
        prev_homework_attachments: [ATT('pa1', 'gecen.pdf')],
        homework_attachments: [ATT('a1', 'odev.pdf')],
        homework: { id: 'h1', description: 'Ödev', due_date: '2026-01-12' },
      },
    };
    const fetchMock = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
      const method = (init?.method ?? 'GET').toUpperCase();
      if (method === 'POST') {
        return Promise.resolve({
          ok: true,
          status: 201,
          json: async () => ({
            attachments: [...withAtt.report.homework_attachments, ATT('a2', 'yeni.pdf')],
          }),
        });
      }
      return Promise.resolve({ ok: true, status: 200, json: async () => withAtt });
    });
    vi.stubGlobal('fetch', fetchMock);
    renderEntryPage();

    await waitFor(() => {
      expect(screen.getAllByText('Öğrenci A').length).toBeGreaterThan(0);
    });

    // Bu haftanın eki + geçen haftanın eki görünür; "PDF ekle" butonu var.
    expect(screen.getByText('odev.pdf')).toBeInTheDocument();
    expect(screen.getByText('gecen.pdf')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /PDF ekle/ })).toBeInTheDocument();

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    expect(input).toBeTruthy();
    const file = new File([new Uint8Array([0x25, 0x50, 0x44, 0x46])], 'yeni.pdf', {
      type: 'application/pdf',
    });
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => expect(screen.getByText('yeni.pdf')).toBeInTheDocument());
  });

  it('hafta henüz başlamadıysa salt-okunur önizleme: alanlar kapalı, aksiyon yok', async () => {
    const preview = {
      ...REPORT,
      report: { ...REPORT.report, id: null },
      read_only: true,
    };
    vi.stubGlobal('fetch', mockFetch(200, preview));
    renderEntryPage();

    await waitFor(() => {
      expect(screen.getAllByText('Öğrenci A').length).toBeGreaterThan(0);
    });

    expect(screen.getByText(/Bu hafta henüz başlamadı/)).toBeInTheDocument();
    expect(screen.getByLabelText('İşlenen konu')).toBeDisabled();
    expect(screen.getByLabelText('Yapılacak ödev')).toBeDisabled();
    expect(screen.getByLabelText('Teslim tarihi')).toBeDisabled();
    expect(screen.getByLabelText('Verilmiş olan ödev')).toBeDisabled();
    expect(screen.getByLabelText('Devamsızlık')).toBeDisabled();
    expect(screen.getByLabelText('Ödev puanı')).toBeDisabled();
    expect(
      screen.queryByRole('button', { name: 'Raporu tamamla' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText('Tümünü geldi yap')).not.toBeInTheDocument();
  });

  it('hafta tanımı hatalıysa uyarı gösterilir, yazma kapalı', async () => {
    const rangeInvalid = { ...REPORT, read_only: true, week_range_invalid: true };
    vi.stubGlobal('fetch', mockFetch(200, rangeInvalid));
    renderEntryPage();

    await waitFor(() => {
      expect(screen.getAllByText('Öğrenci A').length).toBeGreaterThan(0);
    });

    expect(screen.getByText(/Hafta tanımı hatalı/)).toBeInTheDocument();
    expect(screen.queryByText(/Bu hafta henüz başlamadı/)).not.toBeInTheDocument();
    expect(screen.getByLabelText('İşlenen konu')).toBeDisabled();
    expect(
      screen.queryByRole('button', { name: 'Raporu tamamla' }),
    ).not.toBeInTheDocument();
  });

  it('teslim rozeti tıklanabilir değildir (yalnızca metin)', async () => {    const withSubmission = {
      ...REPORT,
      entries: REPORT.entries.map((e, i) => ({
        ...e,
        submission:
          i === 0
            ? { is_late: 1, status: 'submitted', files: [{ key: 'k.jpg', filename: 'a.jpg' }] }
            : null,
      })),
    };
    vi.stubGlobal('fetch', mockFetch(200, withSubmission));
    renderEntryPage();

    await waitFor(() => {
      expect(screen.getAllByText('Öğrenci A').length).toBeGreaterThan(0);
    });

    expect(screen.getAllByText('Geç yüklendi').length).toBeGreaterThan(0);
    // Rozet artık tıklanabilir değil — buton rolüyle bulunmamalı.
    expect(screen.queryByRole('button', { name: /Geç yüklendi/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /ödevi aç/ })).not.toBeInTheDocument();
  });

  it('devamsızlık seçilince yalnızca performans kapanır; ödev puanı açık kalır', async () => {
    vi.stubGlobal('fetch', mockFetch(200, REPORT));
    renderEntryPage();

    await waitFor(() => {
      expect(screen.getAllByText('Öğrenci A').length).toBeGreaterThan(0);
    });

    const attendance = screen.getByLabelText('Devamsızlık');
    fireEvent.change(attendance, { target: { value: 'absent' } });

    // Ödev puanı devamsızlıktan bağımsız — açık (spec §4).
    expect(screen.getByLabelText('Ödev puanı')).not.toBeDisabled();
    // Ders içi performans derse katılım ölçüsü — devamsızda kapalı.
    expect(screen.getByLabelText('Ders içi performans puanı')).toBeDisabled();

    // Devamsız öğrenciye de önceki haftanın ödev puanı girilebilir.
    fireEvent.change(screen.getByLabelText('Ödev puanı'), { target: { value: '5' } });
    expect((screen.getByLabelText('Ödev puanı') as HTMLInputElement).value).toBe('5');
  });

  it('toplu ödev puanı devamsız satıra da uygulanır; toplu performans devamsızı atlar', async () => {
    vi.stubGlobal('fetch', mockFetch(200, REPORT));
    renderEntryPage();

    await waitFor(() => {
      expect(screen.getAllByText('Öğrenci A').length).toBeGreaterThan(0);
    });

    const attendance = screen.getByLabelText('Devamsızlık');
    const homework = screen.getByLabelText('Ödev puanı') as HTMLInputElement;
    const interest = screen.getByLabelText('Ders içi performans puanı') as HTMLInputElement;
    const applyButtons = () => screen.getAllByRole('button', { name: 'Uygula' });

    fireEvent.change(attendance, { target: { value: 'absent' } });

    // "Tümü ödev puanı" devamsız satıra da UYGULANIR (ödev devamsızlıktan bağımsız).
    fireEvent.change(screen.getByLabelText('Tümü ödev puanı'), {
      target: { value: '9' },
    });
    fireEvent.click(applyButtons()[0]);
    expect(homework.value).toBe('9');

    // "Tümü performans puanı" devamsız satırı ATLAR (spec §4).
    fireEvent.change(screen.getByLabelText('Tümü performans puanı'), {
      target: { value: '6' },
    });
    fireEvent.click(applyButtons()[1]);
    expect(interest.value).toBe('');
    expect(homework.value).toBe('9');

    // Geldi yapılınca performans toplu doldurulur; ödev puanı korunur.
    fireEvent.change(attendance, { target: { value: 'present' } });
    fireEvent.click(applyButtons()[1]);
    expect(interest.value).toBe('6');
    expect(homework.value).toBe('9');
  });

  it('yeni raporda varsayılan "absent"; ödev açık, performans kapalı; Tümünü geldi yap ikisini açar', async () => {
    const absentReport = {
      ...REPORT,
      entries: REPORT.entries.map((e) => ({
        ...e,
        attendance: 'absent',
        homework_score: null,
        interest_score: null,
      })),
    };
    vi.stubGlobal('fetch', mockFetch(200, absentReport));
    renderEntryPage();

    await waitFor(() => {
      expect(screen.getAllByText('Öğrenci A').length).toBeGreaterThan(0);
    });

    // Sunucudan 'absent' geldiğinde yalnızca performans devre dışı.
    expect(screen.getByLabelText('Ödev puanı')).not.toBeDisabled();
    expect(screen.getByLabelText('Ders içi performans puanı')).toBeDisabled();

    // "Tümünü geldi yap" gerçekten durumu değiştirir → puan alanları açılır.
    fireEvent.click(screen.getByRole('button', { name: 'Tümünü geldi yap' }));
    expect(screen.getByLabelText('Ödev puanı')).not.toBeDisabled();
    expect(screen.getByLabelText('Ders içi performans puanı')).not.toBeDisabled();
  });

  it('son hafta (homework yok) uyarısı gösterilir', async () => {
    const lastWeekReport = {
      ...REPORT,
      report: { ...REPORT.report, homework: null },
    };
    vi.stubGlobal('fetch', mockFetch(200, lastWeekReport));
    renderEntryPage();

    await waitFor(() => {
      expect(
        screen.getByText(/Yılın son haftası — teslim tarihini siz belirleyin/),
      ).toBeInTheDocument();
    });
  });

  it('varsayılan dönüş "Geri dön" (öğretmen)', async () => {
    vi.stubGlobal('fetch', mockFetch(200, REPORT));
    renderEntryPage();
    await waitFor(() => {
      expect(screen.getAllByText('Öğrenci A').length).toBeGreaterThan(0);
    });
    expect(screen.getByRole('button', { name: 'Geri dön' })).toBeInTheDocument();
  });

  it('returnTo=/admin/digests ise "Gönderim ekranına dön" ve hedefe gider', async () => {
    vi.stubGlobal('fetch', mockFetch(200, REPORT));
    render(
      <MemoryRouter
        initialEntries={['/teacher/reports/cc1/w1?returnTo=%2Fadmin%2Fdigests']}
      >
        <Routes>
          <Route path="/teacher/reports/:classCourseId/:weekId" element={<ReportEntryPage />} />
          <Route path="/admin/digests" element={<div>Gönderim Sayfası</div>} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getAllByText('Öğrenci A').length).toBeGreaterThan(0);
    });
    fireEvent.click(screen.getByRole('button', { name: 'Gönderim ekranına dön' }));
    await waitFor(() => {
      expect(screen.getByText('Gönderim Sayfası')).toBeInTheDocument();
    });
  });

  // Open redirect koruması: yalnızca aynı origin'in dahili path'leri kabul
  // edilir. `/\evil.com` (tek ters bölü), `//evil.com` ve tam URL reddedilip
  // `/teacher`'a düşülür (bkz. `resolveReturnTo`).
  function renderWithReturnTo(returnTo: string) {
    return render(
      <MemoryRouter
        initialEntries={[`/teacher/reports/cc1/w1?returnTo=${returnTo}`]}
      >
        <Routes>
          <Route
            path="/teacher/reports/:classCourseId/:weekId"
            element={<ReportEntryPage />}
          />
          <Route path="/teacher" element={<div>Öğretmen Paneli</div>} />
          <Route path="/evil.com" element={<div>HARİCİ HEDEF</div>} />
          <Route path="/admin/digests" element={<div>Gönderim Sayfası</div>} />
        </Routes>
      </MemoryRouter>,
    );
  }

  it.each([
    ['%2F%5Cevil.com', '/\\evil.com (tek ters bölü)'],
    ['%2F%2Fevil.com', '//evil.com (protocol-relative)'],
    ['https%3A%2F%2Fevil.com', 'https://evil.com (mutlak URL)'],
  ])('güvensiz returnTo=%s reddedilir → "Geri dön" + /teacher', async (encoded, _label) => {
    vi.stubGlobal('fetch', mockFetch(200, REPORT));
    renderWithReturnTo(encoded);

    await waitFor(() => {
      expect(screen.getAllByText('Öğrenci A').length).toBeGreaterThan(0);
    });
    fireEvent.click(screen.getByRole('button', { name: 'Geri dön' }));
    await waitFor(() => {
      expect(screen.getByText('Öğretmen Paneli')).toBeInTheDocument();
    });
    expect(screen.queryByText('HARİCİ HEDEF')).not.toBeInTheDocument();
  });

  it('aynı origin mutlak URL dahili kabul edilir', async () => {
    vi.stubGlobal('fetch', mockFetch(200, REPORT));
    renderWithReturnTo(
      encodeURIComponent(`${window.location.origin}/admin/digests`),
    );

    await waitFor(() => {
      expect(screen.getAllByText('Öğrenci A').length).toBeGreaterThan(0);
    });
    fireEvent.click(screen.getByRole('button', { name: 'Gönderim ekranına dön' }));
    await waitFor(() => {
      expect(screen.getByText('Gönderim Sayfası')).toBeInTheDocument();
    });
  });
});

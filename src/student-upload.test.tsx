/**
 * Öğrenci yükleme akışı — seçim doğrulaması gösterimi, dosya başına durum/yeniden deneme,
 * toplam ilerleme; ekranda puan/not sızıntısı olmaması.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import HomeworkListPage from './pages/student/HomeworkListPage';

const PENDING = {
  id: 'h1',
  description: 'Problemler çözülecek.',
  due_date: '2999-01-12',
  course_name: 'Matematik',
  teacher_name: 'Örnek Kişi 5',
  class_name: 'ÖKLİD',
  attachments: [],
  week: { week_no: 5, start_date: '2026-01-05', end_date: '2026-01-11', label: '05 - 11 Ocak' },
  submission: null,
};

const png = (name: string, size = 1) =>
  new File([new Uint8Array(size)], name, { type: 'image/png' });

interface Call {
  url: string;
  method: string;
  files: File[];
  note: string | null;
}
let calls: Call[];
/** Yükleme yanıtları sırayla tüketilir: 'ok' | hata mesajı */
let submitPlan: Array<'ok' | string>;
let homeworksAfter: unknown;

function installFetch(list: unknown = { items: [PENDING] }) {
  calls = [];
  submitPlan = [];
  homeworksAfter = {
    items: [
      {
        ...PENDING,
        submission: {
          id: 's1',
          submitted_at: '2026-01-10T10:00:00.000Z',
          is_late: false,
          status: 'submitted',
          files: [],
        },
      },
    ],
  };
  let listCalls = 0;
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string, init?: RequestInit) => {
      const method = (init?.method ?? 'GET').toUpperCase();
      if (method === 'POST') {
        const fd = init!.body as FormData;
        calls.push({
          url,
          method,
          files: fd.getAll('files') as File[],
          note: (fd.get('note') as string | null) ?? null,
        });
        const plan = submitPlan.shift() ?? 'ok';
        if (plan === 'ok') {
          return Promise.resolve({ ok: true, status: 200, json: async () => ({ item: PENDING }) });
        }
        return Promise.resolve({
          ok: false,
          status: 400,
          json: async () => ({ error: { code: 'VALIDATION_ERROR', message: plan } }),
        });
      }
      listCalls += 1;
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => (listCalls === 1 ? list : homeworksAfter),
      });
    }),
  );
}

function renderPage() {
  return render(
    <MemoryRouter>
      <HomeworkListPage />
    </MemoryRouter>,
  );
}

const fileInput = () => screen.getAllByLabelText('Ödev dosyalarını seç')[0] as HTMLInputElement;
const pick = (files: File[]) => fireEvent.change(fileInput(), { target: { files } });

beforeEach(() => {
  localStorage.clear();
  installFetch();
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function ready() {
  await waitFor(() => expect(screen.getByText('Problemler çözülecek.')).toBeInTheDocument());
}

describe('seçim doğrulaması gösterimi (kurallar değişmez)', () => {
  it('30 dosyadan fazlası: sabit cümle + kalan kontenjan; hiçbiri eklenmez', async () => {
    renderPage();
    await ready();
    pick(Array.from({ length: 31 }, (_, i) => png(`s-${i}.png`)));
    const alert = screen.getByRole('alert');
    expect(within(alert).getByText('En fazla 30 dosya seçebilirsiniz.')).toBeInTheDocument();
    expect(within(alert).getByText('Şu an en fazla 30 dosya daha ekleyebilirsiniz.')).toBeInTheDocument();
    expect(screen.queryAllByRole('button', { name: /dosyasını kaldır/ })).toHaveLength(0);
  });

  it('10 MB üstü dosya: cümle + dosya adı/boyutu listelenir; geçerli dosyalar yine eklenir', async () => {
    renderPage();
    await ready();
    pick([png('kucuk.png'), png('buyuk.png', 11 * 1024 * 1024)]);
    const alert = screen.getByRole('alert');
    expect(within(alert).getByText('Her dosya en fazla 10 MB olabilir.')).toBeInTheDocument();
    expect(within(alert).getByText(/buyuk\.png — 11,0 MB/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /kucuk\.png dosyasını kaldır/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /buyuk\.png dosyasını kaldır/ })).toBeNull();
  });

  it('desteklenmeyen tür: sabit cümle + dosya adı', async () => {
    renderPage();
    await ready();
    pick([new File(['x'], 'ders.docx', { type: 'application/msword' })]);
    const alert = screen.getByRole('alert');
    expect(
      within(alert).getByText('Yalnızca JPEG, PNG, HEIC veya PDF dosyası yükleyebilirsiniz.'),
    ).toBeInTheDocument();
    expect(within(alert).getByText(/ders\.docx/)).toBeInTheDocument();
  });

  it('HEIC ve PDF uzantıları kabul edilir', async () => {
    renderPage();
    await ready();
    pick([new File(['x'], 'IMG_0001.HEIC', { type: 'image/heic' }), new File(['x'], 'cozum.pdf')]);
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getAllByRole('button', { name: /dosyasını kaldır/ })).toHaveLength(2);
  });
});

describe('dosya başına yükleme durumu ve yeniden deneme', () => {
  it('her dosya kendi isteğiyle SIRAYLA gider; not her isteğe eklenir', async () => {
    renderPage();
    await ready();
    pick([png('a.png'), png('b.png')]);
    fireEvent.change(screen.getByLabelText('Not (isteğe bağlı)'), { target: { value: 'kısa not' } });
    fireEvent.click(screen.getByRole('button', { name: 'Gönder' }));
    await waitFor(() => expect(calls).toHaveLength(2));
    expect(calls.map((c) => c.files.map((f) => f.name))).toEqual([['a.png'], ['b.png']]);
    expect(calls.every((c) => c.note === 'kısa not')).toBe(true);
    expect(calls.every((c) => c.url.endsWith('/student/homeworks/h1/submit'))).toBe(true);
  });

  it('başarısız dosya "Yüklenemedi" + sunucu mesajıyla kalır; diğerleri yüklenir; toplam ilerleme gösterilir', async () => {
    const HEIC_ERR = 'Bu fotoğraf formatı işlenemedi, lütfen JPEG olarak yükleyin.';
    submitPlan = ['ok', HEIC_ERR, 'ok'];
    renderPage();
    await ready();
    pick([png('a.png'), png('bozuk.heic'), png('c.png')]);
    fireEvent.click(screen.getByRole('button', { name: 'Gönder' }));

    await waitFor(() => expect(screen.getByText(HEIC_ERR)).toBeInTheDocument());
    expect(screen.getByText(/2 \/ 3 dosya yüklendi · 1 hata/)).toBeInTheDocument();
    const bar = screen.getByRole('progressbar', { name: 'Yükleme ilerlemesi' });
    expect(bar).toHaveAttribute('aria-valuenow', '2');
    expect(bar).toHaveAttribute('aria-valuemax', '3');
    expect(screen.getAllByText('Yüklendi')).toHaveLength(2);
    expect(screen.getByText('Yüklenemedi')).toBeInTheDocument();
    // Liste henüz yenilenmedi: kart hâlâ bekleyen sekmesinde ve hatalı dosya orada
    expect(screen.getByRole('button', { name: /bozuk\.heic için yeniden dene/ })).toBeInTheDocument();
  });

  it('yalnızca hatalı dosya yeniden denenir; hepsi yüklenince liste yenilenir ve Tamamlanan\'a geçilir', async () => {
    submitPlan = ['ok', 'Geçici hata', 'ok'];
    renderPage();
    await ready();
    pick([png('a.png'), png('b.png')]);
    fireEvent.click(screen.getByRole('button', { name: 'Gönder' }));
    await waitFor(() => expect(screen.getByText('Geçici hata')).toBeInTheDocument());
    expect(calls).toHaveLength(2);

    fireEvent.click(screen.getByRole('button', { name: /b\.png için yeniden dene/ }));
    await waitFor(() => expect(calls).toHaveLength(3));
    expect(calls[2].files.map((f) => f.name)).toEqual(['b.png']); // a.png tekrar gönderilmedi
    // Tümü yüklendi → liste yenilendi → Tamamlanan sekmesi
    await waitFor(() =>
      expect(screen.getByRole('tab', { name: /Tamamlanan/ })).toHaveAttribute('aria-selected', 'true'),
    );
  });

  it('hatalı dosya kaldırılırsa kalan dosyalar tamamsa akış tamamlanmış sayılmaz (kullanıcı yeniden gönderir)', async () => {
    submitPlan = ['ok', 'Hata'];
    renderPage();
    await ready();
    pick([png('a.png'), png('b.png')]);
    fireEvent.click(screen.getByRole('button', { name: 'Gönder' }));
    await waitFor(() => expect(screen.getByText('Hata')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /b\.png dosyasını kaldır/ }));
    expect(screen.queryByText('Yüklenemedi')).toBeNull();
    expect(screen.getByText('Yüklendi')).toBeInTheDocument();
  });
});

describe('spec §6: puan, öğretmen notu ve rapor içeriği ASLA gösterilmez', () => {
  it('API yanıtı bu alanları taşısa bile ekranda görünmez', async () => {
    const leaky = {
      ...PENDING,
      homework_score: 9,
      interest_score: 8,
      teacher_note: 'GİZLİ ÖĞRETMEN NOTU',
      report: { topic_covered: 'GİZLİ RAPOR KONUSU' },
      submission: null,
    };
    installFetch({ items: [leaky] });
    renderPage();
    await ready();
    const text = document.body.textContent ?? '';
    expect(text).not.toContain('GİZLİ');
    expect(text).not.toMatch(/puan|performans|değerlendirme/i);
  });

  it('kaynak taraması: öğrenci sayfa/bileşenleri puan/not/rapor alanlarına hiç başvurmaz', () => {
    const files = import.meta.glob('./pages/student/*.{ts,tsx}', {
      query: '?raw',
      import: 'default',
      eager: true,
    }) as Record<string, string>;
    expect(Object.keys(files).length).toBeGreaterThan(3);
    for (const [name, src] of Object.entries(files)) {
      const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
      expect(code, name).not.toMatch(/homework_score|interest_score|teacher_note|topic_covered|\.snapshot|attendance/);
    }
  });
});

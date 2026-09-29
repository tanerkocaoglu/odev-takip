/**
 * Rapor giriş ekranı — klavye modeli, devamsızlık mantığı, otomatik kaydetme
 * durumları ve bekleyen kaydın flush edilmesi.
 * (jsdom'da hem masaüstü tablo hem mobil kart DOM'dadır; tablo hücreleri
 * `"<alan> — <öğrenci>"` erişilebilir adıyla bulunur.)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import ReportEntryPage from './pages/teacher/ReportEntryPage';

const REPORT = {
  report: {
    id: 'r1',
    class_course_id: 'cc1',
    week_id: 'w1',
    status: 'draft',
    completed_at: null,
    updated_at: '2026-01-05T10:00:00.000Z',
    topic_covered: 'Konu',
    prev_homework_text: 'Geçen ödev',
    homework: { description: 'Ödev', due_date: '2026-01-12' },
    week: { week_no: 5, start_date: '2026-01-05', end_date: '2026-01-11', label: '05 - 11 Ocak' },
    class_name: 'ÖKLİD',
    course_name: 'Matematik',
    teacher_name: 'Öğretmen',
    day_of_week: 1,
    lesson_time: '09:00',
  },
  entries: [
    { student_id: 's1', student_name: 'Ali', attendance: 'present', homework_score: null, interest_score: null, teacher_note: null },
    { student_id: 's2', student_name: 'Veli', attendance: 'present', homework_score: 7, interest_score: 8, teacher_note: null },
  ],
  locked_for_teacher: false,
  week_range_invalid: false,
};

let putBodies: Array<Record<string, unknown>>;
let putShouldFail: boolean;

function installFetch() {
  putBodies = [];
  putShouldFail = false;
  vi.stubGlobal(
    'fetch',
    vi.fn((_url: string, init?: RequestInit) => {
      const method = (init?.method ?? 'GET').toUpperCase();
      if (method === 'PUT') {
        if (putShouldFail) {
          return Promise.resolve({
            ok: false,
            status: 500,
            json: async () => ({ error: { code: 'INTERNAL', message: 'Sunucu hatası' } }),
          });
        }
        putBodies.push(JSON.parse(String(init?.body)));
      }
      return Promise.resolve({ ok: true, status: 200, json: async () => REPORT });
    }),
  );
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/teacher/reports/cc1/w1']}>
      <Routes>
        <Route path="/teacher/reports/:classCourseId/:weekId" element={<ReportEntryPage />} />
        <Route path="/teacher" element={<div>Öğretmen Paneli</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

async function loaded() {
  await waitFor(() => expect(screen.getByLabelText('Ödev puanı — Ali')).toBeInTheDocument());
}

const cell = (field: string, name: string) => screen.getByLabelText(`${field} — ${name}`);

beforeEach(() => {
  localStorage.clear();
  installFetch();
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('klavye modeli (masaüstü tablo)', () => {
  it('Enter aynı sütunda bir satır aşağı iner', async () => {
    renderPage();
    await loaded();
    const hw = cell('Ödev puanı', 'Ali');
    hw.focus();
    fireEvent.keyDown(hw, { key: 'Enter' });
    expect(document.activeElement).toBe(cell('Ödev puanı', 'Veli'));
  });

  it('ok tuşları hücreler arasında gezer (sağ/sol/yukarı/aşağı)', async () => {
    renderPage();
    await loaded();
    const hw = cell('Ödev puanı', 'Ali');
    hw.focus();
    fireEvent.keyDown(hw, { key: 'ArrowRight' });
    expect(document.activeElement).toBe(cell('Ders içi performans puanı', 'Ali'));
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(cell('Ders içi performans puanı', 'Veli'));
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowLeft' });
    expect(document.activeElement).toBe(cell('Ödev puanı', 'Veli'));
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowUp' });
    expect(document.activeElement).toBe(hw);
  });

  it('select içinde ok tuşları hücre gezinmesini almaz; Enter yine aşağı iner', async () => {
    renderPage();
    await loaded();
    const sel = cell('Devamsızlık', 'Ali');
    sel.focus();
    fireEvent.keyDown(sel, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(sel);
    fireEvent.keyDown(sel, { key: 'Enter' });
    expect(document.activeElement).toBe(cell('Devamsızlık', 'Veli'));
  });
});

describe('puan girişi (mevcut davranış korunur)', () => {
  it('rakamla girilir; 10 yazılabilir; aralık dışı değerler 1–10\'a kırpılır', async () => {
    renderPage();
    await loaded();
    const hw = cell('Ödev puanı', 'Ali') as HTMLInputElement;
    fireEvent.change(hw, { target: { value: '1' } });
    expect(hw.value).toBe('1');
    fireEvent.change(hw, { target: { value: '10' } });
    expect(hw.value).toBe('10');
    fireEvent.change(hw, { target: { value: '15' } });
    expect(hw.value).toBe('10');
    fireEvent.change(hw, { target: { value: '0' } });
    expect(hw.value).toBe('1');
    fireEvent.change(hw, { target: { value: '' } });
    expect(hw.value).toBe('');
  });
});

describe('devamsızlık (masaüstü)', () => {
  it('devamsız satırda performans kapanır ve null olur; ödev puanı açık kalır', async () => {
    renderPage();
    await loaded();
    fireEvent.change(cell('Ders içi performans puanı', 'Veli'), { target: { value: '9' } });
    fireEvent.change(cell('Devamsızlık', 'Veli'), { target: { value: 'absent' } });
    const interest = cell('Ders içi performans puanı', 'Veli') as HTMLInputElement;
    expect(interest).toBeDisabled();
    expect(interest.value).toBe('');
    expect(cell('Ödev puanı', 'Veli')).not.toBeDisabled();
    expect((cell('Ödev puanı', 'Veli') as HTMLInputElement).value).toBe('7');
    // Diğer satır etkilenmez
    expect(cell('Ders içi performans puanı', 'Ali')).not.toBeDisabled();
  });
});

describe('kaydetme durumu', () => {
  it('Kaydediliyor… → Kaydedildi HH:mm (aria-live bölgesinde)', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    renderPage();
    await loaded();
    const live = screen.getAllByRole('status')[0];
    expect(live).toHaveAttribute('aria-live', 'polite');

    fireEvent.change(cell('Ödev puanı', 'Ali'), { target: { value: '6' } });
    expect(live).toHaveTextContent('Kaydediliyor…');
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2100);
    });
    await waitFor(() => expect(live).toHaveTextContent(/Kaydedildi \d{2}:\d{2}/));
    expect(putBodies.length).toBeGreaterThan(0);
  });

  it('kayıt başarısızsa "Kaydedilemedi" + "Yeniden dene"; yeniden deneme kaydeder', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    renderPage();
    await loaded();
    putShouldFail = true;
    fireEvent.change(cell('Ödev puanı', 'Ali'), { target: { value: '6' } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2100);
    });
    const live = screen.getAllByRole('status')[0];
    await waitFor(() => expect(live).toHaveTextContent('Kaydedilemedi'));

    putShouldFail = false;
    fireEvent.click(screen.getByRole('button', { name: 'Yeniden dene' }));
    await waitFor(() => expect(live).toHaveTextContent(/Kaydedildi/));
    expect(putBodies.at(-1)).toMatchObject({
      entries: expect.arrayContaining([
        expect.objectContaining({ student_id: 's1', homework_score: 6 }),
      ]),
    });
  });
});

describe('bekleyen kaydın flush edilmesi', () => {
  it('"Geri dön" 2 sn beklemeden bekleyen değişikliği kaydeder, sonra çıkar', async () => {
    renderPage();
    await loaded();
    fireEvent.change(cell('Ödev puanı', 'Ali'), { target: { value: '9' } });
    expect(putBodies).toHaveLength(0); // debounce henüz dolmadı

    fireEvent.click(screen.getByRole('button', { name: /Geri dön/ }));
    await waitFor(() => expect(screen.getByText('Öğretmen Paneli')).toBeInTheDocument());
    expect(putBodies).toHaveLength(1);
    expect(putBodies[0]).toMatchObject({
      entries: expect.arrayContaining([
        expect.objectContaining({ student_id: 's1', homework_score: 9 }),
      ]),
    });
  });

  it('sayfadan ayrılırken (unmount) bekleyen değişiklik gönderilir', async () => {
    const { unmount } = renderPage();
    await loaded();
    fireEvent.change(cell('Ödev puanı', 'Ali'), { target: { value: '4' } });
    expect(putBodies).toHaveLength(0);
    unmount();
    await waitFor(() => expect(putBodies).toHaveLength(1));
  });
});

describe('mobil kart: puan radiogroup', () => {
  const hwGroup = () => screen.getByRole('radiogroup', { name: 'Ödev puanı için hızlı seçim' });
  const intGroup = () =>
    screen.getByRole('radiogroup', { name: 'Ders içi performans puanı için hızlı seçim' });
  const radios = (group: HTMLElement) =>
    Array.from(group.querySelectorAll<HTMLButtonElement>('[role="radio"]'));

  it('her grup 10 radio içerir ve tek Tab durağı vardır (roving tabindex)', async () => {
    renderPage();
    await loaded();
    for (const g of [hwGroup(), intGroup()]) {
      const rs = radios(g);
      expect(rs).toHaveLength(10);
      expect(rs.filter((r) => r.tabIndex === 0)).toHaveLength(1);
    }
    // Seçim yoksa Tab durağı "1"; seçim varsa seçili düğüm
    expect(radios(hwGroup()).find((r) => r.tabIndex === 0)).toHaveTextContent('1');
    fireEvent.click(radios(hwGroup())[6]); // 7
    expect(radios(hwGroup()).find((r) => r.tabIndex === 0)).toHaveTextContent('7');
    expect(radios(hwGroup())[6]).toHaveAttribute('aria-checked', 'true');
    expect((screen.getByLabelText('Ödev puanı') as HTMLInputElement).value).toBe('7');
  });

  it('ok tuşları grup içinde gezer ve seçer; sonda başa sarar; Home/End; rakam tuşu', async () => {
    renderPage();
    await loaded();
    fireEvent.click(radios(hwGroup())[4]); // 5
    const g = hwGroup();
    fireEvent.keyDown(radios(g)[4], { key: 'ArrowRight' });
    expect(radios(g)[5]).toHaveAttribute('aria-checked', 'true');
    expect(document.activeElement).toBe(radios(g)[5]);
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowLeft' });
    expect(radios(g)[4]).toHaveAttribute('aria-checked', 'true');
    fireEvent.keyDown(document.activeElement!, { key: 'End' });
    expect(radios(g)[9]).toHaveAttribute('aria-checked', 'true');
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowRight' }); // 10 → 1
    expect(radios(g)[0]).toHaveAttribute('aria-checked', 'true');
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowLeft' }); // 1 → 10
    expect(radios(g)[9]).toHaveAttribute('aria-checked', 'true');
    fireEvent.keyDown(document.activeElement!, { key: '3' });
    expect(radios(g)[2]).toHaveAttribute('aria-checked', 'true');
    fireEvent.keyDown(document.activeElement!, { key: '0' });
    expect(radios(g)[9]).toHaveAttribute('aria-checked', 'true');
    expect((screen.getByLabelText('Ödev puanı') as HTMLInputElement).value).toBe('10');
  });

  it('devamsız seçilince performans grubu kapanır ve değer null olur; ödev grubu açık kalır', async () => {
    renderPage();
    await loaded();
    fireEvent.click(radios(intGroup())[7]); // 8
    fireEvent.change(screen.getByLabelText('Devamsızlık'), { target: { value: 'absent' } });
    expect(radios(intGroup()).every((r) => r.disabled)).toBe(true);
    expect(radios(intGroup()).every((r) => r.getAttribute('aria-checked') === 'false')).toBe(true);
    expect(radios(hwGroup()).every((r) => !r.disabled)).toBe(true);
    expect(screen.getByText(/Devamsız\/izinli öğrencide ders içi performans girilmez\./)).toBeInTheDocument();
  });

  it('Önceki/Sonraki bekleyen kaydı 2 sn beklemeden flush eder ve kartı değiştirir', async () => {
    renderPage();
    await loaded();
    fireEvent.click(radios(hwGroup())[8]); // Ali: 9
    expect(putBodies).toHaveLength(0);

    fireEvent.click(screen.getByRole('button', { name: 'Sonraki' }));
    await waitFor(() => expect(putBodies).toHaveLength(1));
    expect(putBodies[0]).toMatchObject({
      entries: expect.arrayContaining([
        expect.objectContaining({ student_id: 's1', homework_score: 9 }),
      ]),
    });
    // Yeni kart: Veli (7 / 8 önceden dolu)
    expect(screen.getByRole('group', { name: 'Veli, 2 / 2' })).toBeInTheDocument();
    expect((screen.getByLabelText('Ödev puanı') as HTMLInputElement).value).toBe('7');

    // Geri dönünce Ali'nin puanı korunur
    fireEvent.click(screen.getByRole('button', { name: 'Önceki' }));
    expect((screen.getByLabelText('Ödev puanı') as HTMLInputElement).value).toBe('9');
  });

  it('bekleyen kayıt yokken kart değiştirmek fazladan PUT üretmez', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    renderPage();
    await loaded();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2100); // açılıştaki otomatik kayıt biter
    });
    const before = putBodies.length;
    fireEvent.click(screen.getByRole('button', { name: 'Sonraki' }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(50);
    });
    expect(putBodies).toHaveLength(before);
  });
});

describe('mobil: ders bilgileri katlanır', () => {
  it('varsayılan kapalı (aria-expanded=false); tıklayınca açılır; alanlar DOM\'da tektir', async () => {
    renderPage();
    await loaded();
    const toggle = screen.getByRole('button', { name: /Ders bilgileri/ });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getAllByLabelText('İşlenen konu')).toHaveLength(1);
    expect(toggle).toHaveTextContent('Konu: Konu');
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
  });
});

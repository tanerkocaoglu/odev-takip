/**
 * WeeksPage — hafta tarihi düzenleme (yalnızca frontend).
 * Her satırda "Düzenle" aksiyonu; tıklayınca mevcut tarihlerle önceden
 * doldurulmuş modal açılır. Kaydet → PATCH /admin/weeks/:id; backend'in
 * doğrulama hataları (7 gün değil / tarihler ters) forma yansır. Başarılı
 * düzenlemeden sonra tablo tazelenir ve yeni etiket görünür.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import WeeksPage from './pages/admin/WeeksPage';

function ok(body: unknown) {
  return { ok: true, status: 200, json: async () => body };
}

function fail(status: number, body: unknown) {
  return { ok: false, status, json: async () => body };
}

const YEAR = {
  id: 'y',
  name: '2026-2027',
  start_date: '2026-09-01',
  end_date: '2027-06-30',
  is_active: 1,
};

function week(no: number, start: string, end: string, label: string) {
  return {
    id: `w${no}`,
    academic_year_id: 'y',
    week_no: no,
    start_date: start,
    end_date: end,
    label,
  };
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('WeeksPage — hafta düzenleme', () => {
  it('her satırda Düzenle ve Sil vardır; Düzenle mevcut tarihlerle dolu modal açar', async () => {
    const weeks = [week(5, '2026-09-21', '2026-09-27', '21.09 - 27.09.2026')];
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        const method = (init?.method ?? 'GET').toUpperCase();
        if (url.includes('/admin/academic-years')) return ok({ items: [YEAR] });
        if (url.includes('/admin/weeks') && method === 'GET') return ok({ items: weeks });
        throw new Error(`beklenmeyen istek: ${method} ${url}`);
      }),
    );

    render(
      <MemoryRouter>
        <WeeksPage />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText('21.09 - 27.09.2026')).toBeInTheDocument();
    });
    // Satır eylemleri "⋯" menüsünde: Düzenle + Sil
    fireEvent.click(screen.getByRole('button', { name: 'Hafta 5 için işlemler' }));
    expect(await screen.findByRole('menuitem', { name: 'Düzenle' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Sil' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('menuitem', { name: 'Düzenle' }));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Hafta 5 düzenle')).toBeInTheDocument();
    expect((within(dialog).getByLabelText('Başlangıç') as HTMLInputElement).value).toBe(
      '2026-09-21',
    );
    expect((within(dialog).getByLabelText('Bitiş') as HTMLInputElement).value).toBe('2026-09-27');
    expect(within(dialog).getByText('21.09 - 27.09.2026')).toBeInTheDocument();
  });

  it('6 güne çekilince backend doğrulama hatası formda gösterilir (modal açık kalır)', async () => {
    const weeks = [week(5, '2026-09-21', '2026-09-27', '21.09 - 27.09.2026')];
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = (init?.method ?? 'GET').toUpperCase();
      if (url.includes('/admin/academic-years')) return ok({ items: [YEAR] });
      if (url.includes('/admin/weeks/w5') && method === 'PATCH') {
        return fail(400, {
          error: {
            code: 'VALIDATION_ERROR',
            message:
              'Hafta tam 7 gün olmalı; girilen aralık 6 gün. Bitiş tarihi başlangıçtan 6 gün sonrası olmalı.',
            fields: {
              end_date:
                'Hafta tam 7 gün olmalı; girilen aralık 6 gün. Bitiş tarihi başlangıçtan 6 gün sonrası olmalı.',
            },
          },
        });
      }
      if (url.includes('/admin/weeks') && method === 'GET') return ok({ items: weeks });
      throw new Error(`beklenmeyen istek: ${method} ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <MemoryRouter>
        <WeeksPage />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText('21.09 - 27.09.2026')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('button', { name: 'Hafta 5 için işlemler' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Düzenle' }));

    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('Bitiş'), { target: { value: '2026-09-26' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Haftayı kaydet' }));

    expect(await screen.findByText(/Hafta tam 7 gün olmalı/)).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    const patchCall = fetchMock.mock.calls.find(
      ([u, i]) => String(u).includes('/admin/weeks/w5') && i?.method === 'PATCH',
    );
    expect(patchCall).toBeDefined();
    expect(JSON.parse(String(patchCall![1]!.body))).toEqual({
      start_date: '2026-09-21',
      end_date: '2026-09-26',
    });
  });

  it('geçerli 7 günlük aralıkta Kaydet başarılı olur; tablo tazelenir ve yeni etiket görünür', async () => {
    let weeks = [week(5, '2026-09-21', '2026-09-27', '21.09 - 27.09.2026')];
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = (init?.method ?? 'GET').toUpperCase();
      if (url.includes('/admin/academic-years')) return ok({ items: [YEAR] });
      if (url.includes('/admin/weeks/w5') && method === 'PATCH') {
        const body = JSON.parse(String(init?.body)) as { start_date: string; end_date: string };
        weeks = [week(5, body.start_date, body.end_date, '22.09 - 28.09.2026')];
        return ok(weeks[0]);
      }
      if (url.includes('/admin/weeks') && method === 'GET') return ok({ items: weeks });
      throw new Error(`beklenmeyen istek: ${method} ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <MemoryRouter>
        <WeeksPage />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText('21.09 - 27.09.2026')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('button', { name: 'Hafta 5 için işlemler' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Düzenle' }));

    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('Başlangıç'), {
      target: { value: '2026-09-22' },
    });
    fireEvent.change(within(dialog).getByLabelText('Bitiş'), { target: { value: '2026-09-28' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Haftayı kaydet' }));

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
    expect(await screen.findByText('22.09 - 28.09.2026')).toBeInTheDocument();
  });
});

describe('WeeksPage — sunum', () => {
  const weeks = [week(5, '2026-09-21', '2026-09-27', '21.09 - 27.09.2026')];

  function stub(extra?: (url: string, method: string) => unknown) {
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = (init?.method ?? 'GET').toUpperCase();
      const r = extra?.(url, method);
      if (r) return r;
      if (url.includes('/admin/academic-years')) return ok({ items: [YEAR] });
      if (url.includes('/admin/weeks') && method === 'GET') return ok({ items: weeks });
      throw new Error(`beklenmeyen istek: ${method} ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
  }

  it('tarihler gg.aa.yyyy; etiket sunucudan olduğu gibi', async () => {
    stub();
    render(
      <MemoryRouter>
        <WeeksPage />
      </MemoryRouter>,
    );
    expect(await screen.findByText('21.09.2026')).toBeInTheDocument();
    expect(screen.getByText('27.09.2026')).toBeInTheDocument();
    expect(screen.getByText('21.09 - 27.09.2026')).toBeInTheDocument();
  });

  it('Sil onay ister (Hafta 5 silinsin mi?) ve onayla DELETE gider', async () => {
    const fetchMock = stub((url, method) =>
      url.includes('/admin/weeks/w5') && method === 'DELETE' ? ok({}) : undefined,
    );
    render(
      <MemoryRouter>
        <WeeksPage />
      </MemoryRouter>,
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Hafta 5 için işlemler' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Sil' }));
    expect(await screen.findByRole('dialog', { name: 'Haftayı sil' })).toHaveTextContent(
      'Hafta 5 silinsin mi?',
    );
    expect(fetchMock.mock.calls.some(([, i]) => i?.method === 'DELETE')).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Haftayı sil' }));
    await waitFor(() =>
      expect(fetchMock.mock.calls.some(([, i]) => i?.method === 'DELETE')).toBe(true),
    );
  });

  it('yeni hafta: 7 gün dışı aralık 400 → hata bitiş alanının altında, modal açık', async () => {
    const msg = 'Hafta tam 7 gün olmalı; girilen aralık 5 gün.';
    stub((url, method) =>
      url.includes('/admin/weeks') && method === 'POST'
        ? fail(400, {
            error: { code: 'VALIDATION_ERROR', message: msg, fields: { end_date: msg } },
          })
        : undefined,
    );
    render(
      <MemoryRouter>
        <WeeksPage />
      </MemoryRouter>,
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Yeni hafta' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('Başlangıç'), {
      target: { value: '2026-10-05' },
    });
    fireEvent.change(within(dialog).getByLabelText('Bitiş'), { target: { value: '2026-10-09' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Haftayı ekle' }));
    expect(await within(dialog).findByText(msg)).toBeInTheDocument();
    expect(within(dialog).getAllByText(msg)).toHaveLength(1);
  });
});

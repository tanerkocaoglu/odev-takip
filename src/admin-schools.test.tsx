/**
 * Okullar: liste, silme onayı, 409 hatası (liste yerinde kalır), form hatası alanın altında.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import SchoolsPage from './pages/admin/SchoolsPage';

function json(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    headers: { get: () => null },
  };
}

const SCHOOL = { id: 'sc1', name: 'Şişli Ğazi İlkokulu' };
let calls: string[];
let deleteResponse: ReturnType<typeof json>;
let postResponse: ReturnType<typeof json>;

beforeEach(() => {
  calls = [];
  localStorage.setItem('ds_token', 'test-token');
  deleteResponse = json({}, 204);
  postResponse = json(SCHOOL);
  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = (init?.method ?? 'GET').toUpperCase();
      calls.push(`${method} ${url}`);
      if (method === 'DELETE') return deleteResponse;
      if (method === 'POST') return postResponse;
      return json({ items: [SCHOOL] });
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

const renderPage = () =>
  render(
    <MemoryRouter>
      <SchoolsPage />
    </MemoryRouter>,
  );

async function openDelete() {
  fireEvent.click(await screen.findByRole('button', { name: 'Şişli Ğazi İlkokulu için işlemler' }));
  fireEvent.click(await screen.findByRole('menuitem', { name: 'Sil' }));
}

describe('SchoolsPage', () => {
  it('silme onay ister; onaylanınca DELETE gider', async () => {
    renderPage();
    await openDelete();
    expect(await screen.findByRole('dialog', { name: 'Okulu sil' })).toHaveTextContent(
      'Şişli Ğazi İlkokulu silinsin mi?',
    );
    expect(calls.some((c) => c.startsWith('DELETE'))).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Okulu sil' }));
    await waitFor(() => expect(calls.some((c) => c.startsWith('DELETE'))).toBe(true));
  });

  it('409: sunucu mesajı gösterilir, liste yerinde kalır, kapatılabilir', async () => {
    deleteResponse = json(
      {
        error: { code: 'CONFLICT', message: 'Bu okula öğrenci bağlı, önce öğrenciyi düzenleyin.' },
      },
      409,
    );
    renderPage();
    await openDelete();
    fireEvent.click(await screen.findByRole('button', { name: 'Okulu sil' }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Bu okula öğrenci bağlı, önce öğrenciyi düzenleyin.');
    expect(screen.getByText('Şişli Ğazi İlkokulu')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Hatayı kapat' }));
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('form hatası (409 aynı ad) alanın altında gösterilir', async () => {
    postResponse = json({ error: { code: 'CONFLICT', message: 'Bu okul adı zaten var.' } }, 409);
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Yeni okul' }));
    fireEvent.change(await screen.findByLabelText('Okul adı'), { target: { value: 'X' } });
    fireEvent.click(screen.getByRole('button', { name: 'Okulu ekle' }));
    expect(await screen.findByText('Bu okul adı zaten var.')).toBeInTheDocument();
  });

  it('yükleme hatasında ErrorState + Yeniden dene', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => json({ error: { code: 'INTERNAL', message: 'Sunucu hatası.' } }, 500)),
    );
    renderPage();
    expect(await screen.findByText('Sunucu hatası.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /yeniden dene/i })).toBeInTheDocument();
  });
});

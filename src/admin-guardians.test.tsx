/**
 * Veliler: WhatsApp zorunlu (alan altı hata), oluşturma sonrası kullanıcı adı, silme onayı, KVKK rozeti.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import GuardiansPage from './pages/admin/GuardiansPage';

function json(body: unknown, status = 200) {
  return { ok: status < 400, status, json: async () => body, headers: { get: () => null } };
}

const G = {
  id: 'g1',
  user_id: 'u1',
  full_name: 'İşıl Öztürk Ğüneş',
  username: 'isiloztürkgunes1',
  whatsapp_phone: '+905001112233',
  phone_secondary: null,
  consent_at: null as string | null,
  child_count: 2,
};
let calls: string[];
let consent: string | null;

beforeEach(() => {
  calls = [];
  consent = null;
  localStorage.setItem('ds_token', 'test-token');
  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = (init?.method ?? 'GET').toUpperCase();
      calls.push(`${method} ${url}`);
      if (method === 'POST')
        return json({ ...G, id: 'g2', full_name: 'Yeni Veli', username: 'yeniveli1' }, 201);
      if (method === 'DELETE') return json({}, 204);
      if (method === 'PATCH') {
        consent = JSON.parse(String(init?.body)).consent_at ? '2026-09-01T00:00:00Z' : null;
        return json({ ...G, consent_at: consent });
      }
      return json({ items: [{ ...G, consent_at: consent }], total: 1, page: 1, pageSize: 20 });
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
      <GuardiansPage />
    </MemoryRouter>,
  );
const posts = () => calls.filter((c) => c.startsWith('POST'));

describe('GuardiansPage', () => {
  it('WhatsApp boşsa istek atılmaz; hata alanın altında', async () => {
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Yeni veli' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('Ad soyad'), { target: { value: 'Yeni Veli' } });
    fireEvent.change(within(dialog).getByLabelText('Başlangıç şifresi (veliye iletin)'), {
      target: { value: 'abcdef' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Veliyi ekle' }));
    expect(await within(dialog).findByText(/WhatsApp numarası zorunlu/)).toBeInTheDocument();
    expect(posts()).toHaveLength(0);
  });

  it('oluşturma sonrası üretilen kullanıcı adı gösterilir', async () => {
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Yeni veli' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('Ad soyad'), { target: { value: 'Yeni Veli' } });
    fireEvent.change(within(dialog).getByLabelText('WhatsApp numarası (zorunlu)'), {
      target: { value: '+905551112233' },
    });
    fireEvent.change(within(dialog).getByLabelText('Başlangıç şifresi (veliye iletin)'), {
      target: { value: 'abcdef' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Veliyi ekle' }));
    expect(await screen.findByText(/Kullanıcı adı: yeniveli1/)).toBeInTheDocument();
    expect(posts()).toHaveLength(1);
  });

  it('Sil onay ister; onaylanınca DELETE', async () => {
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'İşıl Öztürk Ğüneş için işlemler' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Sil' }));
    const dialog = await screen.findByRole('dialog', { name: 'Veliyi sil' });
    expect(calls.some((c) => c.startsWith('DELETE'))).toBe(false);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Veliyi sil' }));
    await waitFor(() => expect(calls.some((c) => c.startsWith('DELETE'))).toBe(true));
  });

  it('KVKK rozeti ikon + metin; tıklayınca onay verilir', async () => {
    renderPage();
    const badge = await screen.findByRole('button', { name: /KVKK onayı yok/ });
    expect(badge).toHaveTextContent('Onaysız');
    fireEvent.click(badge);
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /KVKK onayı verildi/ })).toHaveTextContent(
        'Onaylı',
      ),
    );
  });

  it('şifre sıfırlama modalı kullanıcı adını gösterir', async () => {
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'İşıl Öztürk Ğüneş için işlemler' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Şifre sıfırla' }));
    expect(await screen.findByRole('dialog')).toHaveTextContent(G.username);
  });
});

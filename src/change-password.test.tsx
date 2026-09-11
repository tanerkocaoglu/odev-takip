/**
 * İlk girişte zorunlu şifre değiştirme frontend testleri (spec.md §2.1):
 * ProtectedRoute yönlendirmesi + ChangePasswordPage doğrulama/başarı.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import App from './App';
import { AuthProvider } from './context/AuthContext';

function user(mustChange: boolean) {
  return {
    id: 'u1',
    full_name: 'Ogrenci Bir',
    role: 'student' as const,
    username: 'ogrencibir1',
    email: null,
    must_change_password: mustChange,
  };
}

function resp(body: unknown) {
  return { ok: true, status: 200, json: async () => body, headers: { get: () => null } };
}

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider>
        <App />
      </AuthProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('ds_token', 'old-token');
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('ProtectedRoute — zorunlu şifre değiştirme', () => {
  it('bayraklı kullanıcı başka sayfaya giremez, şifre ekranına atılır', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL) => {
        if (String(input).includes('/auth/me')) return Promise.resolve(resp({ user: user(true) }));
        return Promise.resolve(resp({ items: [] }));
      }),
    );

    renderAt('/student');

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Yeni şifre belirle' })).toBeInTheDocument();
    });
  });

  it('bayrağı olmayan kullanıcı şifre ekranından çıkarılır', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL) => {
        if (String(input).includes('/auth/me')) return Promise.resolve(resp({ user: user(false) }));
        return Promise.resolve(resp({ items: [] }));
      }),
    );

    renderAt('/sifre-yenile');

    await waitFor(() => {
      expect(screen.queryByRole('heading', { name: 'Yeni şifre belirle' })).not.toBeInTheDocument();
    });
  });
});

describe('ChangePasswordPage', () => {
  function stubFetch(onChange?: (body: unknown) => void) {
    return vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/auth/me')) return Promise.resolve(resp({ user: user(true) }));
      if (url.includes('/auth/change-password')) {
        onChange?.(JSON.parse(String(init?.body)));
        return Promise.resolve(resp({ token: 'new-token', user: user(false) }));
      }
      return Promise.resolve(resp({ items: [] }));
    });
  }

  it('zayıf yeni şifreyi reddeder, istek atmaz', async () => {
    const fetchMock = stubFetch();
    vi.stubGlobal('fetch', fetchMock);
    renderAt('/sifre-yenile');

    await screen.findByRole('heading', { name: 'Yeni şifre belirle' });
    fireEvent.change(screen.getByLabelText('Mevcut şifre'), { target: { value: 'Baslangic1' } });
    fireEvent.change(screen.getByLabelText('Yeni şifre'), { target: { value: 'zayif' } });
    fireEvent.change(screen.getByLabelText('Yeni şifre (tekrar)'), { target: { value: 'zayif' } });
    fireEvent.click(screen.getByRole('button', { name: 'Şifreyi değiştir' }));

    expect(await screen.findByText('Şifre en az 8 karakter olmalı.')).toBeInTheDocument();
    expect(
      fetchMock.mock.calls.some(([u]) => String(u).includes('/auth/change-password')),
    ).toBe(false);
  });

  it('şifreler eşleşmezse uyarır', async () => {
    vi.stubGlobal('fetch', stubFetch());
    renderAt('/sifre-yenile');

    await screen.findByRole('heading', { name: 'Yeni şifre belirle' });
    fireEvent.change(screen.getByLabelText('Mevcut şifre'), { target: { value: 'Baslangic1' } });
    fireEvent.change(screen.getByLabelText('Yeni şifre'), { target: { value: 'YeniSifre1' } });
    fireEvent.change(screen.getByLabelText('Yeni şifre (tekrar)'), {
      target: { value: 'YeniSifre2' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Şifreyi değiştir' }));

    expect(await screen.findByText('Şifreler eşleşmiyor.')).toBeInTheDocument();
  });

  it('geçerli şifrede isteği atar, yeni token uygular ve ekrandan çıkar', async () => {
    let body: unknown;
    vi.stubGlobal('fetch', stubFetch((b) => (body = b)));
    renderAt('/sifre-yenile');

    await screen.findByRole('heading', { name: 'Yeni şifre belirle' });
    fireEvent.change(screen.getByLabelText('Mevcut şifre'), { target: { value: 'Baslangic1' } });
    fireEvent.change(screen.getByLabelText('Yeni şifre'), { target: { value: 'YeniSifre1' } });
    fireEvent.change(screen.getByLabelText('Yeni şifre (tekrar)'), {
      target: { value: 'YeniSifre1' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Şifreyi değiştir' }));

    await waitFor(() => {
      expect(body).toEqual({ current_password: 'Baslangic1', new_password: 'YeniSifre1' });
    });
    await waitFor(() => {
      expect(localStorage.getItem('ds_token')).toBe('new-token');
    });
    await waitFor(() => {
      expect(screen.queryByRole('heading', { name: 'Yeni şifre belirle' })).not.toBeInTheDocument();
    });
  });
});

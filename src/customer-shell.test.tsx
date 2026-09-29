/**
 * Müşteri yüzü kabuğu (öğrenci/veli) — alt dock, kaydırınca beliren üst şerit
 * ve hesap paneli. Admin/öğretmen AppLayout'undan ayrı bir mimari.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import CustomerShell from './components/layout/CustomerShell';
import { AuthProvider } from './context/AuthContext';

function stubUser() {
  localStorage.setItem('ds_token', 'test-token');
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        user: {
          id: 'u1',
          full_name: 'Örnek Kişi 8',
          role: 'student',
          username: 'ornekkisi81',
          email: null,
          must_change_password: false,
        },
      }),
    }),
  );
}

function renderShell() {
  return render(
    <MemoryRouter initialEntries={['/student']}>
      <AuthProvider>
        <Routes>
          <Route path="/student" element={<CustomerShell />}>
            <Route index element={<div>Ödev içeriği</div>} />
          </Route>
          <Route path="/login" element={<div>Giriş ekranı</div>} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('CustomerShell', () => {
  it('alt dock gezinmesini ve içeriği gösterir', async () => {
    stubUser();
    renderShell();

    await waitFor(() => {
      expect(screen.getByRole('link', { name: 'Ödevlerim' })).toHaveAttribute(
        'href',
        '/student',
      );
    });
    expect(screen.getByRole('button', { name: 'Hesap' })).toBeInTheDocument();
    expect(screen.getByText('Ödev içeriği')).toBeInTheDocument();
    // Üst şeritte isim/çıkış YOK (hesap panelinin arkasında).
    expect(screen.queryByText('Çıkış')).not.toBeInTheDocument();
  });

  it('Hesap paneli kullanıcıyı gösterir; Escape kapatır', async () => {
    stubUser();
    renderShell();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Hesap' })).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('button', { name: 'Hesap' }));

    expect(screen.getByRole('dialog', { name: 'Hesap' })).toBeInTheDocument();
    expect(screen.getByText('Örnek Kişi 8')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Çıkış yap' })).toBeInTheDocument();

    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Hesap' })).not.toBeInTheDocument();
    });
  });

  it('Çıkış yap token\'ı temizler ve /login\'e yönlendirir', async () => {
    stubUser();
    renderShell();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Hesap' })).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('button', { name: 'Hesap' }));
    fireEvent.click(screen.getByRole('button', { name: 'Çıkış yap' }));

    await waitFor(() => {
      expect(screen.getByText('Giriş ekranı')).toBeInTheDocument();
    });
    expect(localStorage.getItem('ds_token')).toBeNull();
  });

  it('aşağı kaydırınca gizlenir; yalnızca en üste yaklaşınca geri gelir', async () => {
    stubUser();
    renderShell();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Hesap' })).toBeInTheDocument();
    });
    expect(screen.getByTestId('customer-topbar').className).not.toContain('-translate-y-full');

    // Aşağı kaydır → gizlenir.
    Object.defineProperty(window, 'scrollY', { value: 500, configurable: true });
    fireEvent.scroll(window);
    await waitFor(() => {
      expect(screen.getByTestId('customer-topbar').className).toContain('-translate-y-full');
    });

    // Yukarı ama hâlâ üstten uzakta → gizli kalır.
    Object.defineProperty(window, 'scrollY', { value: 220, configurable: true });
    fireEvent.scroll(window);
    expect(screen.getByTestId('customer-topbar').className).toContain('-translate-y-full');

    // Üste yaklaş → geri gelir.
    Object.defineProperty(window, 'scrollY', { value: 40, configurable: true });
    fireEvent.scroll(window);
    await waitFor(() => {
      expect(screen.getByTestId('customer-topbar').className).not.toContain('-translate-y-full');
    });
  });

  it('içerik alt boşluğu gezinme çubuğu + güvenli alan kadar ayrılır; çubuk sabit ve güvenli alan payı taşır', async () => {
    stubUser();
    renderShell();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Hesap' })).toBeInTheDocument();
    });
    const main = screen.getByRole('main');
    expect(main.className).toContain('pb-[calc(5rem+env(safe-area-inset-bottom))]');
    const nav = screen.getByRole('navigation', { name: 'Ana gezinme' });
    expect(nav.className).toContain('fixed');
    expect(nav.className).toContain('env(safe-area-inset-bottom)');
  });

  it('Hesap diyaloğu: odak diyaloğa girer, kapanınca "Hesap" düğmesine döner', async () => {
    stubUser();
    renderShell();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Hesap' })).toBeInTheDocument();
    });
    const opener = screen.getByRole('button', { name: 'Hesap' });
    opener.focus();
    fireEvent.click(opener);
    const dialog = screen.getByRole('dialog', { name: 'Hesap' });
    expect(dialog.contains(document.activeElement)).toBe(true);
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(document.activeElement).toBe(opener);
  });

  it('ekran klavyesi açıkken (metin alanı odakta, görünür yükseklik küçük) gezinme çubuğu kalkar', async () => {
    stubUser();
    const listeners = new Set<() => void>();
    const vv = {
      height: 800,
      offsetTop: 0,
      addEventListener: (_: string, cb: () => void) => listeners.add(cb),
      removeEventListener: (_: string, cb: () => void) => listeners.delete(cb),
    };
    Object.defineProperty(window, 'visualViewport', { value: vv, configurable: true });
    Object.defineProperty(window, 'innerHeight', { value: 800, configurable: true });
    const input = document.createElement('textarea');
    document.body.appendChild(input);
    renderShell();
    await waitFor(() => {
      expect(screen.getByRole('navigation', { name: 'Ana gezinme' })).toBeInTheDocument();
    });
    input.focus();
    vv.height = 400;
    act(() => listeners.forEach((cb) => cb()));
    await waitFor(() => {
      expect(screen.queryByRole('navigation', { name: 'Ana gezinme' })).not.toBeInTheDocument();
    });
    input.remove();
    Object.defineProperty(window, 'visualViewport', { value: undefined, configurable: true });
  });
});

/**
 * Gizlilik/Aydınlatma metni — sayfa içeriği, public route ve iki bağlantı
 * noktası (giriş ekranı + public rapor). spec.md §9.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import App from './App';
import PrivacyNoticePage from './pages/PrivacyNoticePage';
import { AuthProvider } from './context/AuthContext';

function renderNotice() {
  return render(
    <MemoryRouter initialEntries={['/gizlilik']}>
      <Routes>
        <Route path="/gizlilik" element={<PrivacyNoticePage />} />
      </Routes>
    </MemoryRouter>,
  );
}

function renderApp(path: string) {
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
});

afterEach(() => {
  localStorage.clear();
});

describe('PrivacyNoticePage', () => {
  it('başlık ve bilgilendirme bölümlerini render eder', () => {
    renderNotice();
    expect(
      screen.getByRole('heading', { level: 1, name: 'Gizlilik ve Aydınlatma Metni' }),
    ).toBeInTheDocument();
    for (const section of [
      'İşlenen veriler',
      'İşleme amaçları ve hukuki dayanak',
      'Saklama süresi',
      'Haklarınız',
      'Sorumlu ve iletişim',
    ]) {
      expect(screen.getByRole('heading', { level: 2, name: section })).toBeInTheDocument();
    }
    expect(screen.getByRole('button', { name: 'Geri' })).toBeInTheDocument();
  });

  it('saklama metni "otomatik" değil, manuel olduğunu söyler', () => {
    const { container } = renderNotice();
    const text = container.textContent ?? '';
    expect(text).toContain('otomatik değildir');
    expect(text).toContain('manuel');
    expect(text).not.toContain('otomatik silinir');
  });

  it('public route: girişsiz doğrudan açılır (login\'e yönlenmez)', () => {
    renderApp('/gizlilik');
    expect(
      screen.getByRole('heading', { level: 1, name: 'Gizlilik ve Aydınlatma Metni' }),
    ).toBeInTheDocument();
  });
});

describe('Aydınlatma metni bağlantıları', () => {
  it('giriş ekranında /gizlilik linki vardır', () => {
    renderApp('/login');
    expect(
      screen.getByRole('link', { name: 'Gizlilik ve Aydınlatma Metni' }),
    ).toHaveAttribute('href', '/gizlilik');
  });
});

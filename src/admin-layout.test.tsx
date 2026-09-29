/**
 * Admin sol menü kabuğu — 12 link, doğru href, aktif içerik ve "Yönetim"
 * başlığı (App.test.tsx ile uyum). Rotalar/URL'ler değişmez.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import AdminLayout from './components/admin/AdminLayout';
import { AuthProvider } from './context/AuthContext';

// Kurulum süreci sırası (AdminLayout TABS ile birebir): yapı → kişiler → döngü.
const NAV: ReadonlyArray<[string, string]> = [
  ['Panel', '/admin'],
  ['Eğitim yılı', '/admin/academic-years'],
  ['Haftalar', '/admin/weeks'],
  ['Sınıflar', '/admin/classes'],
  ['Dersler', '/admin/courses'],
  ['Öğretmenler', '/admin/teachers'],
  ['Atamalar', '/admin/class-courses'],
  ['Okullar', '/admin/schools'],
  ['Veliler', '/admin/guardians'],
  ['Öğrenciler', '/admin/students'],
  ['Raporlar', '/admin/reports'],
  ['Gönderim', '/admin/digests'],
];

function renderShell(initial = '/admin') {
  return render(
    <MemoryRouter initialEntries={[initial]}>
      <AuthProvider>
        <Routes>
          <Route element={<AdminLayout />}>
            <Route path="/admin" element={<div>Panel içeriği</div>} />
            <Route path="/admin/weeks" element={<div>Haftalar içeriği</div>} />
          </Route>
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  );
}

describe('AdminLayout — sol menü', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('12 menü linkini doğru href ile render eder', () => {
    renderShell();
    for (const [label, href] of NAV) {
      expect(screen.getByRole('link', { name: label })).toHaveAttribute('href', href);
    }
  });

  it('"Yönetim" başlığını içerir', () => {
    renderShell();
    expect(screen.getByRole('heading', { name: 'Yönetim' })).toBeInTheDocument();
  });

  it('marka logosunu erişilebilir adıyla gösterir', () => {
    renderShell();
    // Kenar çubuğu + dar ekran çubuğu (CSS ile biri gizlenir)
    expect(screen.getAllByRole('img', { name: 'Ödev Takip' }).length).toBeGreaterThan(0);
  });

  it('menü linkleri üç gruba ayrılır', () => {
    renderShell();
    for (const g of ['Kurulum', 'Kişiler', 'Haftalık döngü']) {
      expect(screen.getByText(g)).toBeInTheDocument();
    }
  });

  it('hamburger çekmeceyi açar; link tıklayınca ve Escape ile kapanır', () => {
    renderShell();
    const opener = screen.getByRole('button', { name: 'Menüyü aç' });
    expect(opener).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('dialog')).toBeNull();

    fireEvent.click(opener);
    const dialog = screen.getByRole('dialog', { name: 'Yönetim menüsü' });
    expect(opener).toHaveAttribute('aria-expanded', 'true');
    // Çekmece içinde de 13 link var (kenar çubuğuyla birlikte iki kopya)
    expect(within(dialog).getByRole('link', { name: 'Haftalar' })).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole('link', { name: 'Haftalar' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByText('Haftalar içeriği')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Menüyü aç' }));
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('aktif sekmenin içeriğini gösterir', () => {
    renderShell('/admin/weeks');
    expect(screen.getByText('Haftalar içeriği')).toBeInTheDocument();
  });
});

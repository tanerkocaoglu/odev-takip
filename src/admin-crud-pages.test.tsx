/**
 * Sınıflar, Dersler, Eğitim yılı: ortak liste deseni, silme onayı, alan altı hata, tarih biçimi.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import ClassesPage from './pages/admin/ClassesPage';
import CoursesPage from './pages/admin/CoursesPage';
import AcademicYearsPage from './pages/admin/AcademicYearsPage';

function json(body: unknown, status = 200) {
  return { ok: status < 400, status, json: async () => body, headers: { get: () => null } };
}

const YEARS = [
  { id: 'y1', name: '2026-2027', start_date: '2026-09-07', end_date: '2027-06-18', is_active: 1 },
  { id: 'y2', name: '2025-2026', start_date: '2025-09-08', end_date: '2026-06-19', is_active: 0 },
];
let calls: string[];
let overrides: Record<string, ReturnType<typeof json>>;

beforeEach(() => {
  calls = [];
  overrides = {};
  localStorage.setItem('ds_token', 'test-token');
  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = (init?.method ?? 'GET').toUpperCase();
      calls.push(`${method} ${url}`);
      const key = Object.keys(overrides).find((k) => `${method} ${url}`.includes(k));
      if (key) return overrides[key];
      if (url.includes('/admin/academic-years')) {
        return json(method === 'GET' ? { items: YEARS } : YEARS[0]);
      }
      if (url.includes('/admin/classes'))
        return json({
          items: [
            {
              id: 'c1',
              name: 'ÖKLİD İleri',
              academic_year_id: 'y1',
              academic_year_name: '2026-2027',
            },
          ],
        });
      if (url.includes('/admin/courses'))
        return json({ items: [{ id: 'k1', name: 'Fen Bilimleri' }] });
      throw new Error(`beklenmeyen istek: ${method} ${url}`);
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

const wrap = (ui: React.ReactElement) => render(<MemoryRouter>{ui}</MemoryRouter>);
const deletes = () => calls.filter((c) => c.startsWith('DELETE'));

describe('Sınıflar', () => {
  it('menüden Sil → onay → DELETE; hata listeyi bozmaz', async () => {
    overrides['DELETE'] = json(
      { error: { code: 'CONFLICT', message: 'Sınıfta öğrenci var, önce öğrencileri taşıyın.' } },
      409,
    );
    wrap(<ClassesPage />);
    // yıl seçimi yerleşince liste ikinci kez yüklenir; menü ondan sonra açılmalı
    await waitFor(() =>
      expect(calls.filter((c) => c.startsWith('GET') && c.includes('/admin/classes'))).toHaveLength(
        2,
      ),
    );
    fireEvent.click(await screen.findByRole('button', { name: 'ÖKLİD İleri için işlemler' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Sil' }));
    expect(await screen.findByRole('dialog', { name: 'Sınıfı sil' })).toBeInTheDocument();
    expect(deletes()).toHaveLength(0);
    fireEvent.click(screen.getByRole('button', { name: 'Sınıfı sil' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Sınıfta öğrenci var');
    expect(screen.getByText('ÖKLİD İleri')).toBeInTheDocument();
  });

  it('form hatası alanın altında', async () => {
    overrides['POST'] = json(
      { error: { code: 'CONFLICT', message: 'Bu sınıf adı zaten var.' } },
      409,
    );
    wrap(<ClassesPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Yeni sınıf' }));
    fireEvent.change(await screen.findByLabelText('Sınıf adı'), { target: { value: 'X' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sınıfı ekle' }));
    expect(await screen.findByText('Bu sınıf adı zaten var.')).toBeInTheDocument();
  });
});

describe('Dersler', () => {
  it('Sil onay ister ve onayla DELETE gider', async () => {
    overrides['DELETE'] = json({}, 204);
    wrap(<CoursesPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Fen Bilimleri için işlemler' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Sil' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Dersi sil' }));
    await waitFor(() => expect(deletes()).toHaveLength(1));
  });
});

describe('Eğitim yılı', () => {
  it('tarihler gg.aa.yyyy; aktif rozeti + pasif rozeti; pasif yıl için "Aktif yap"', async () => {
    wrap(<AcademicYearsPage />);
    expect(await screen.findByText('07.09.2026')).toBeInTheDocument();
    expect(screen.getByText('18.06.2027')).toBeInTheDocument();
    expect(screen.getByText('Aktif')).toBeInTheDocument();
    expect(screen.getByText('Pasif')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '2025-2026 için işlemler' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Aktif yap' }));
    await waitFor(() =>
      expect(calls.some((c) => c.startsWith('PATCH') && c.includes('/academic-years/y2'))).toBe(
        true,
      ),
    );
  });
});

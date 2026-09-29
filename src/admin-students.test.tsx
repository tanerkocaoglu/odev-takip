/**
 * Öğrenciler listesi: satır eylem menüsü ve silme onayı (ConfirmDialog).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import StudentsPage from './pages/admin/StudentsPage';

function json(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    headers: { get: () => null },
  };
}

const STUDENT = {
  id: 's1',
  student_id: 'st1',
  full_name: 'İbrahim Şükrü Ğüneş',
  username: 'ibrahimsukrugunes1',
  guardian_id: 'g1',
  guardian_name: 'Işıl Öztürk',
  class_id: 'c1',
  class_name: 'ÖKLİD',
  school_id: null,
  school_name: null,
  grade_level: '6',
};

let calls: string[];
let students: unknown;

function stubFetch() {
  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = (init?.method ?? 'GET').toUpperCase();
      calls.push(`${method} ${url}`);
      if (url.includes('/admin/academic-years'))
        return json({ items: [{ id: 'y', name: '2026-2027', is_active: 1 }] });
      if (url.includes('/admin/classes'))
        return json({ items: [{ id: 'c1', name: 'ÖKLİD', academic_year_id: 'y' }] });
      if (url.includes('/admin/weeks')) return json({ items: [] });
      if (url.includes('/admin/schools')) return json({ items: [] });
      if (url.includes('/admin/guardians'))
        return json({ items: [], total: 0, page: 1, pageSize: 10 });
      if (url.includes('/admin/students/s1') && method === 'DELETE') return json({ ok: true });
      if (url.includes('/admin/students')) return json(students);
      throw new Error(`beklenmeyen istek: ${method} ${url}`);
    }),
  );
}

beforeEach(() => {
  calls = [];
  students = { items: [STUDENT], total: 1, page: 1, pageSize: 20 };
  localStorage.setItem('ds_token', 'test-token');
  stubFetch();
});

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

function renderPage() {
  return render(
    <MemoryRouter>
      <StudentsPage />
    </MemoryRouter>,
  );
}

const deleteCalls = () => calls.filter((c) => c.startsWith('DELETE'));

describe('StudentsPage — satır menüsü ve silme onayı', () => {
  it('eylemler tek menüdedir; Sil doğrudan silmez, onay diyaloğu sorar', async () => {
    renderPage();
    const trigger = await screen.findByRole('button', {
      name: 'İbrahim Şükrü Ğüneş için işlemler',
    });
    // satırda serbest "Düzenle/Sil" düğmesi yok
    expect(screen.queryByRole('button', { name: 'Sil' })).toBeNull();
    fireEvent.click(trigger);
    const items = await screen.findAllByRole('menuitem');
    expect(items.map((i) => i.textContent)).toEqual([
      'Düzenle',
      'Şifre sıfırla',
      'Sınıf değiştir',
      'Sil',
    ]);
    fireEvent.click(screen.getByRole('menuitem', { name: 'Sil' }));
    const dialog = await screen.findByRole('dialog', { name: 'Öğrenciyi sil' });
    expect(dialog).toHaveTextContent('İbrahim Şükrü Ğüneş silinsin mi?');
    expect(deleteCalls()).toHaveLength(0);
  });

  it('Vazgeç silmez; "Öğrenciyi sil" onayı DELETE gönderir ve listeyi yeniler', async () => {
    renderPage();
    fireEvent.click(
      await screen.findByRole('button', { name: 'İbrahim Şükrü Ğüneş için işlemler' }),
    );
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Sil' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Vazgeç' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(deleteCalls()).toHaveLength(0);

    fireEvent.click(screen.getByRole('button', { name: 'İbrahim Şükrü Ğüneş için işlemler' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Sil' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Öğrenciyi sil' }));
    await waitFor(() => expect(deleteCalls()).toHaveLength(1));
    expect(deleteCalls()[0]).toContain('/admin/students/s1');
  });

  it('boş liste davetkâr metin gösterir', async () => {
    students = { items: [], total: 0, page: 1, pageSize: 20 };
    renderPage();
    expect(await screen.findByText('Öğrenci bulunamadı.')).toBeInTheDocument();
  });

  it('düzenle menüden formu açar', async () => {
    renderPage();
    fireEvent.click(
      await screen.findByRole('button', { name: 'İbrahim Şükrü Ğüneş için işlemler' }),
    );
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Düzenle' }));
    expect(await screen.findByRole('dialog', { name: /düzenle/ })).toBeInTheDocument();
  });
});

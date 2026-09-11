import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import App from './App';
import { AuthProvider } from './context/AuthContext';

function userResponse(role: 'admin' | 'teacher') {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      user: {
        id: 'test-user',
        full_name: role === 'admin' ? 'Yönetici' : 'Öğretmen',
        role,
        username: null,
        email: 'x@test.local',
      },
    }),
  };
}

// Token yoksa '/' /login'e yönlendirir (ProtectedRoute).
describe('App — girişsiz', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('ana sayfa girişsiz /login e yönlendirir', async () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <AuthProvider>
          <App />
        </AuthProvider>
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(
        screen.getByRole('img', { name: 'Ödev Takip' }),
      ).toBeInTheDocument();
    });
  });

  it('giriş sayfasını render eder', () => {
    render(
      <MemoryRouter initialEntries={['/login']}>
        <AuthProvider>
          <App />
        </AuthProvider>
      </MemoryRouter>,
    );
    expect(
      screen.getByRole('img', { name: 'Ödev Takip' }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('E-posta veya kullanıcı adı')).toBeInTheDocument();
    expect(screen.getByLabelText('Şifre')).toBeInTheDocument();
  });
});

describe('App — admin erişimi', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it('öğretmen /admin e erişemez, kendi paneline yönlendirilir', async () => {
    localStorage.setItem('ds_token', 'teacher-token');
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(userResponse('teacher'))
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({ week: null, items: [] }),
        }),
    );

    render(
      <MemoryRouter initialEntries={['/admin']}>
        <AuthProvider>
          <App />
        </AuthProvider>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(
        screen.getByRole('heading', { name: 'Bu hafta doldurulacaklar' }),
      ).toBeInTheDocument();
    });
  });

  it('admin /admin de panel sayfasını görür', async () => {
    localStorage.setItem('ds_token', 'admin-token');
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(userResponse('admin'))
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({
            week: null,
            summary: { total: 0, completed: 0 },
            missing: [],
            matrix: [],
            digests: { pending: 0, ready: 0, sent: 0 },
          }),
        }),
    );

    render(
      <MemoryRouter initialEntries={['/admin']}>
        <AuthProvider>
          <App />
        </AuthProvider>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Yönetim' })).toBeInTheDocument();
    });
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Panel' })).toBeInTheDocument();
    });
  });
});

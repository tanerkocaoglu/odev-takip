import { describe, it, expect, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import App from './App';
import { AuthProvider } from './context/AuthContext';

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
        screen.getByRole('heading', { name: 'Dershane Ödev Takip' }),
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
      screen.getByRole('heading', { name: 'Dershane Ödev Takip' }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('E-posta')).toBeInTheDocument();
    expect(screen.getByLabelText('Şifre')).toBeInTheDocument();
  });

  it('rol seçimi veliye geçince telefon + OTP formu görünür', () => {
    render(
      <MemoryRouter initialEntries={['/login']}>
        <AuthProvider>
          <App />
        </AuthProvider>
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Veli' }));
    expect(screen.getByLabelText('Telefon numarası')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Kod gönder' }),
    ).toBeInTheDocument();
  });
});

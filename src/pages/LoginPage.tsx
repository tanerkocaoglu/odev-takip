/**
 * Giriş ekranı — Aşama 2a.
 * - Admin/öğretmen: e-posta + şifre
 * - Veli/öğrenci: telefon + OTP (iki aşama: kod iste → kodu gir)
 * Tasarım kuralları: comfortable yoğunluk, alan altında kırmızı + metin
 * hata, yükleniyor durumu, buton ne yaptığını söyler.
 */

import { useState, type FormEvent } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import type { Role } from '../types';
import { useAuth } from '../context/AuthContext';
import { authApi, ApiClientError } from '../services/api';

type LoginMode = 'password' | 'otp';

const ROLE_OPTIONS: Array<{ role: Role; label: string; mode: LoginMode }> = [
  { role: 'admin', label: 'Yönetici', mode: 'password' },
  { role: 'teacher', label: 'Öğretmen', mode: 'password' },
  { role: 'guardian', label: 'Veli', mode: 'otp' },
  { role: 'student', label: 'Öğrenci', mode: 'otp' },
];

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p className="mt-1 text-xs font-medium text-att-absent">{message}</p>
  );
}

export default function LoginPage() {
  const { login, loginWithOtp } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [role, setRole] = useState<Role>('admin');
  const mode: LoginMode = role === 'admin' || role === 'teacher' ? 'password' : 'otp';

  // e-posta + şifre
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  // telefon + OTP
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [countdown, setCountdown] = useState(0);

  // durum
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const from = (location.state as { from?: string } | null)?.from ?? '/';

  function startCountdown(seconds: number) {
    setCountdown(seconds);
    const timer = window.setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          window.clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }

  async function handlePasswordSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setFormError(null);
    setFieldErrors({});
    try {
      await login(email.trim(), password);
      navigate(from, { replace: true });
    } catch (err) {
      if (err instanceof ApiClientError) {
        setFormError(err.message);
        setFieldErrors(err.fields ?? {});
      } else {
        setFormError('Bir hata oluştu, lütfen tekrar deneyin.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function handleOtpRequest(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setFormError(null);
    setFieldErrors({});
    try {
      await authApi.requestOtp({ phone: phone.trim() });
      setCodeSent(true);
      startCountdown(120);
    } catch (err) {
      if (err instanceof ApiClientError) {
        setFormError(err.message);
        setFieldErrors(err.fields ?? {});
      } else {
        setFormError('Bir hata oluştu, lütfen tekrar deneyin.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function handleOtpVerify(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setFormError(null);
    setFieldErrors({});
    try {
      await loginWithOtp(phone.trim(), code.trim());
      navigate(from, { replace: true });
    } catch (err) {
      if (err instanceof ApiClientError) {
        setFormError(err.message);
        setFieldErrors(err.fields ?? {});
      } else {
        setFormError('Bir hata oluştu, lütfen tekrar deneyin.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg px-4">
      <div className="w-full max-w-sm">
        <h1 className="text-center text-xl font-semibold text-text">
          Dershane Ödev Takip
        </h1>
        <p className="mt-1 text-center text-sm text-muted">
          Giriş yapmak için hesabınızın türünü seçin
        </p>

        {/* Rol seçimi */}
        <div className="mt-6 grid grid-cols-2 gap-2">
          {ROLE_OPTIONS.map((option) => (
            <button
              key={option.role}
              type="button"
              onClick={() => {
                setRole(option.role);
                setFormError(null);
                setFieldErrors({});
                setCodeSent(false);
                setCode('');
              }}
              aria-pressed={role === option.role}
              className={
                'rounded-md border px-4 py-2 text-sm font-medium transition-colors ' +
                (role === option.role
                  ? 'border-accent bg-accent text-accent-fg'
                  : 'border-border bg-surface text-text hover:bg-bg')
              }
            >
              {option.label}
            </button>
          ))}
        </div>

        <div className="mt-4 rounded-md border border-border bg-surface p-6">
          {mode === 'password' ? (
            <form onSubmit={handlePasswordSubmit} className="space-y-4">
              <div>
                <label
                  htmlFor="login-email"
                  className="mb-1 block text-sm font-medium text-muted"
                >
                  E-posta
                </label>
                <input
                  id="login-email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="h-10 w-full rounded-md border border-border bg-surface px-3 text-sm text-text placeholder:text-muted focus:border-accent"
                />
                <FieldError message={fieldErrors.email} />
              </div>

              <div>
                <label
                  htmlFor="login-password"
                  className="mb-1 block text-sm font-medium text-muted"
                >
                  Şifre
                </label>
                <input
                  id="login-password"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="h-10 w-full rounded-md border border-border bg-surface px-3 text-sm text-text placeholder:text-muted focus:border-accent"
                />
                <FieldError message={fieldErrors.password} />
              </div>

              {formError && (
                <p
                  role="alert"
                  className="text-sm font-medium text-att-absent"
                >
                  {formError}
                </p>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="w-full rounded-md bg-accent px-4 py-2.5 text-sm font-medium text-accent-fg transition-colors hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {submitting ? 'Giriş yapılıyor…' : 'Giriş yap'}
              </button>
            </form>
          ) : codeSent ? (
            <form onSubmit={handleOtpVerify} className="space-y-4">
              <div>
                <label
                  htmlFor="otp-code"
                  className="mb-1 block text-sm font-medium text-muted"
                >
                  Telefonunuza gelen 6 haneli kod
                </label>
                <input
                  id="otp-code"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                  className="h-10 w-full rounded-md border border-border bg-surface px-3 text-center text-base tabular tracking-widest text-text placeholder:text-muted focus:border-accent"
                  placeholder="000000"
                />
                <FieldError message={fieldErrors.code} />
              </div>

              {formError && (
                <p
                  role="alert"
                  className="text-sm font-medium text-att-absent"
                >
                  {formError}
                </p>
              )}

              <button
                type="submit"
                disabled={submitting || code.length !== 6}
                className="w-full rounded-md bg-accent px-4 py-2.5 text-sm font-medium text-accent-fg transition-colors hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {submitting ? 'Doğrulanıyor…' : 'Kodu doğrula ve giriş yap'}
              </button>

              <p className="text-center text-xs text-muted">
                {countdown > 0 ? (
                  <>Yeni kod için {countdown} saniye bekleyin.</>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setCodeSent(false);
                      setCode('');
                      setFormError(null);
                    }}
                    className="font-medium text-accent underline-offset-2 hover:underline"
                  >
                    Telefon numarasını değiştir
                  </button>
                )}
              </p>
            </form>
          ) : (
            <form onSubmit={handleOtpRequest} className="space-y-4">
              <div>
                <label
                  htmlFor="otp-phone"
                  className="mb-1 block text-sm font-medium text-muted"
                >
                  Telefon numarası
                </label>
                <input
                  id="otp-phone"
                  type="tel"
                  autoComplete="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="h-10 w-full rounded-md border border-border bg-surface px-3 text-sm text-text placeholder:text-muted focus:border-accent"
                  placeholder="05XX XXX XX XX"
                />
                <FieldError message={fieldErrors.phone} />
              </div>

              {formError && (
                <p
                  role="alert"
                  className="text-sm font-medium text-att-absent"
                >
                  {formError}
                </p>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="w-full rounded-md bg-accent px-4 py-2.5 text-sm font-medium text-accent-fg transition-colors hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {submitting ? 'Kod gönderiliyor…' : 'Kod gönder'}
              </button>
              <p className="text-xs text-muted">
                Telefonunuza 6 haneli bir giriş kodu gönderilir. Kod 10 dakika
                geçerlidir.
              </p>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

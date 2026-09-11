/**
 * Giriş ekranı — Aşama 2a retrofit sonrası.
 * Tek form: "E-posta veya kullanıcı adı" + "Şifre". Sunucu identifier'ın
 * email mi username mi olduğunu çözüp rolü belirler (spec.md §2.1):
 * - Admin/öğretmen: e-posta + şifre
 * - Veli/öğrenci: username + şifre (OTP kaldırıldı)
 * Tasarım kuralları: comfortable yoğunluk, alan altında kırmızı + metin
 * hata, yükleniyor durumu, buton ne yaptığını söyler.
 */

import { useState, type FormEvent } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import BrandLogo from '../components/BrandLogo';
import { useAuth } from '../context/AuthContext';
import { ApiClientError } from '../services/api';

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p className="mt-1 text-xs font-medium text-att-absent">{message}</p>
  );
}

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const from = (location.state as { from?: string } | null)?.from ?? '/';

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setFormError(null);
    setFieldErrors({});
    try {
      await login(identifier.trim(), password);

      // Kullanıcı başka birinin hesabından çıkmışsa ve "from" sadece kök bir dizinse
      // kendi rolüne ait dashboard'a gidebilmesi için / dizinine gönderiyoruz.
      // Özel bir alt link (örn. /teacher/reports/...) varsa dokunmuyoruz.
      const isRootPath = ['/', '/admin', '/teacher', '/student', '/guardian'].includes(from);
      navigate(isRootPath ? '/' : from, { replace: true });
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
        <div className="flex justify-center">
          <BrandLogo className="h-16 w-auto object-contain" />
        </div>

        <div className="mt-6 rounded-md border border-border bg-surface p-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label
                htmlFor="login-identifier"
                className="mb-1 block text-sm font-medium text-muted"
              >
                E-posta veya kullanıcı adı
              </label>
              <input
                id="login-identifier"
                type="text"
                autoComplete="username"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                className="h-10 w-full rounded-md border border-border bg-surface px-3 text-sm text-text placeholder:text-muted focus:border-accent"
              />
              <FieldError message={fieldErrors.identifier} />
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
              <p role="alert" className="text-sm font-medium text-att-absent">
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
        </div>
      </div>
    </div>
  );
}

/**
 * Giriş ekranı — Aşama 2a retrofit sonrası.
 * Tek form: "E-posta veya kullanıcı adı" + "Şifre". Sunucu identifier'ın
 * email mi username mi olduğunu çözüp rolü belirler (spec.md §2.1):
 * - Admin/öğretmen: e-posta + şifre
 * - Veli/öğrenci: username + şifre (OTP kaldırıldı)
 * Tasarım kuralları: comfortable yoğunluk, alan altında kırmızı + metin
 * hata, yükleniyor durumu, buton ne yaptığını söyler.
 *
 * Görsel katman: rol-nötr marka kimliği (`.brand-scope` → marka mavisi accent
 * ve odak halkası). Mobilde marka tam ekran; logo üstte, form kartı alt-ortada
 * (kartın altı da marka rengi kalır — beyaz boşluk yok). Masaüstünde sol marka
 * paneli + sağ form. Davranış (form, yönlendirme, hata) değişmez.
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
    <div className="brand-scope brand-canvas relative flex min-h-[100dvh] flex-col lg:grid lg:grid-cols-[minmax(0,45%)_1fr]">
      {/* Mobil: marka tüm ekranı kaplar (kartın altı da marka kalır). */}
      <div
        aria-hidden="true"
        className="brand-panel pointer-events-none absolute inset-0 overflow-hidden lg:hidden"
      >
        <span className="absolute -right-16 -top-16 h-64 w-64 rounded-full border border-white/15" />
        <span className="absolute -bottom-24 -right-10 h-72 w-72 rounded-full bg-white/5" />
      </div>

      {/* Logo + slogan. Masaüstünde sol marka paneli dolgusunu taşır; mobilde
          saydamdır (tam ekran katman arkada). Beyaz metinler koyu marka
          üzerinde kontrastlıdır; parlak deko tonu yalnızca dekoratiftir. */}
      <aside className="relative z-10 flex justify-center px-6 pt-24 text-center lg:block lg:min-h-screen lg:px-12 lg:pt-0">
        <div
          aria-hidden="true"
          className="brand-panel pointer-events-none absolute inset-0 hidden overflow-hidden lg:block"
        >
          <span className="absolute -right-16 -top-16 h-64 w-64 rounded-full border border-white/15" />
          <span className="absolute -bottom-24 -right-10 h-72 w-72 rounded-full bg-white/5" />
        </div>

        <div className="relative z-10 flex flex-col items-center gap-4 lg:h-full lg:items-start lg:justify-center lg:gap-6">
          <span className="rounded-2xl bg-surface p-4 shadow-[var(--elevation-3)]">
            <BrandLogo className="h-24 w-auto object-contain lg:h-32" />
          </span>
          <p className="text-center text-xl font-semibold leading-snug tracking-wide text-accent-fg lg:text-left lg:text-2xl">
            ÖDEV TAKİP
          </p>
        </div>
      </aside>

      {/* Form — mobilde alt-ortada, masaüstünde sağ kolonda dikey ortada. */}
      <div className="relative z-10 flex flex-1 items-center justify-center px-4 pb-10 lg:pb-0">
        <div className="w-full max-w-sm">
          <div className="rounded-3xl border border-border bg-surface p-6 shadow-[var(--elevation-3)]">
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
                  className="h-11 w-full rounded-xl border border-border bg-surface px-3 text-sm text-text placeholder:text-muted focus:border-accent"
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
                  className="h-11 w-full rounded-xl border border-border bg-surface px-3 text-sm text-text placeholder:text-muted focus:border-accent"
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
                className="flex min-h-12 w-full items-center justify-center rounded-xl bg-accent px-4 text-sm font-medium text-accent-fg transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {submitting ? 'Giriş yapılıyor…' : 'Giriş yap'}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}

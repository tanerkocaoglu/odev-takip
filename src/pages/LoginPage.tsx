/**
 * Giriş ekranı (comfortable yoğunluk).
 * Tek form: "E-posta veya kullanıcı adı" + "Şifre". Sunucu identifier'ın
 * email mi username mi olduğunu çözüp rolü belirler (spec.md §2.1):
 * - Admin/öğretmen: e-posta + şifre
 * - Veli/öğrenci: username + şifre
 *
 * Düzen: dar ekranda üstte ince teal wordmark şeridi, altında form; lg ve
 * üstünde solda teal marka paneli, sağda form. Davranış (form,
 * yönlendirme, hata) değişmez.
 */

import { useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import BrandLogo from '../components/BrandLogo';
import { Button, Field, FormError, Input } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { ApiClientError } from '../services/api';

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
        setFormError('Giriş yapılamadı. Bağlantınızı kontrol edip yeniden deneyin.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-[100dvh] flex-col bg-bg lg:grid lg:grid-cols-[minmax(0,42%)_1fr]">
      {/* Marka paneli — dar ekranda yalnızca wordmark'lı ince teal şerit,
          masaüstünde tam sütun. Sayfadaki TEK BrandLogo burada. */}
      <aside className="brand-panel flex flex-col justify-between px-4 py-4 text-accent-fg lg:p-12">
        <BrandLogo tone="inverse" size="md" />
        <div className="hidden max-w-sm lg:block">
          <p className="text-2xl font-semibold leading-snug">
            Haftalık ödev ve ders raporları, tek yerde.
          </p>
          <p className="mt-3 text-base leading-relaxed text-accent-fg/85">
            Öğretmen raporunu girer, öğrenci ödevini yükler, veli haftalık özeti telefonundan okur.
          </p>
        </div>
        <span aria-hidden="true" className="hidden lg:block" />
      </aside>

      <main className="flex flex-1 flex-col items-center px-4 py-10 lg:justify-center">
        <div className="w-full max-w-sm">
          <h1 className="text-xl font-semibold text-text">Giriş yap</h1>
          <p className="mt-1 text-sm text-muted">
            Öğretmen ve yöneticiler e-posta, öğrenci ve veliler kullanıcı adıyla girer.
          </p>

          <form onSubmit={handleSubmit} className="mt-6 space-y-4" noValidate>
            <Field
              label="E-posta veya kullanıcı adı"
              htmlFor="login-identifier"
              error={fieldErrors.identifier}
            >
              <Input
                id="login-identifier"
                type="text"
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                className="h-11"
              />
            </Field>

            <Field label="Şifre" htmlFor="login-password" error={fieldErrors.password}>
              <Input
                id="login-password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="h-11"
              />
            </Field>

            <FormError message={formError} />

            <Button type="submit" variant="primary" size="lg" loading={submitting} className="w-full">
              {submitting ? 'Giriş yapılıyor…' : 'Giriş yap'}
            </Button>
          </form>

          <p className="mt-6 text-center">
            <Link
              to="/gizlilik"
              className="inline-flex min-h-11 items-center text-sm font-medium text-accent underline underline-offset-2 hover:text-accent-hover"
            >
              Gizlilik ve Aydınlatma Metni
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
}

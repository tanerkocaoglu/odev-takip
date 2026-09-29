/**
 * İlk girişte zorunlu şifre değiştirme ekranı (spec.md §2.1).
 *
 * Yalnızca `must_change_password = 1` olan öğrenci/veli burada durur;
 * ProtectedRoute bayraklı kullanıcıyı bu sayfaya yönlendirir. Değişiklik
 * başarılı olunca AuthContext yeni token + user'ı uygular ve kullanıcı normal
 * akışa döner. comfortable yoğunluk, alan altı hata, mobil öncelikli.
 */

import { useState, type FormEvent } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import BrandLogo from '../components/BrandLogo';
import { Button, Card, Field, FormError, Input } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { ApiClientError } from '../services/api';

/** Katı şifre politikası (backend ile aynı) — min 8 + büyük/küçük/rakam. */
function policyError(password: string): string | null {
  if (password.length < 8) return 'Şifre en az 8 karakter olmalı.';
  if (!/\p{Lu}/u.test(password)) return 'Şifre en az bir büyük harf içermeli.';
  if (!/\p{Ll}/u.test(password)) return 'Şifre en az bir küçük harf içermeli.';
  if (!/\d/.test(password)) return 'Şifre en az bir rakam içermeli.';
  return null;
}

export default function ChangePasswordPage() {
  const { user, changePassword } = useAuth();
  const navigate = useNavigate();

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  // Bayrağı olmayan (veya zorunlu değişim dışı) kullanıcı bu sayfada durmaz.
  if (user && !user.must_change_password) {
    return <Navigate to="/" replace />;
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);

    const errors: Record<string, string> = {};
    if (!currentPassword) {
      errors.current_password = 'Mevcut şifrenizi girin.';
    }
    const weak = policyError(newPassword);
    if (weak) {
      errors.new_password = weak;
    } else if (newPassword === currentPassword) {
      errors.new_password = 'Yeni şifre mevcut şifreyle aynı olamaz.';
    }
    if (!errors.new_password && newPassword !== confirmPassword) {
      errors.confirm_password = 'Şifreler eşleşmiyor.';
    }
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

    setSubmitting(true);
    setFieldErrors({});
    try {
      await changePassword(currentPassword, newPassword);
      navigate('/', { replace: true });
    } catch (err) {
      if (err instanceof ApiClientError) {
        setFormError(err.message);
        setFieldErrors(err.fields ?? {});
      } else {
        setFormError('Şifre değiştirilemedi. Bağlantınızı kontrol edip yeniden deneyin.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-bg px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="flex justify-center">
          <BrandLogo size="md" />
        </div>

        <Card padding="lg" className="mt-6">
          <h1 className="text-xl font-semibold text-text">Yeni şifre belirle</h1>
          <p className="mt-1 text-sm text-muted">
            İlk girişte şifrenizi değiştirmeniz gerekiyor.
          </p>

          <form onSubmit={handleSubmit} className="mt-5 space-y-4" noValidate>
            <Field
              label="Mevcut şifre"
              htmlFor="cp-current"
              error={fieldErrors.current_password}
            >
              <Input
                id="cp-current"
                type="password"
                autoComplete="current-password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className="h-11"
              />
            </Field>

            <Field
              label="Yeni şifre"
              htmlFor="cp-new"
              error={fieldErrors.new_password}
              hint="En az 8 karakter; bir büyük harf, bir küçük harf ve bir rakam."
            >
              <Input
                id="cp-new"
                type="password"
                autoComplete="new-password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="h-11"
              />
            </Field>

            <Field
              label="Yeni şifre (tekrar)"
              htmlFor="cp-confirm"
              error={fieldErrors.confirm_password}
            >
              <Input
                id="cp-confirm"
                type="password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="h-11"
              />
            </Field>

            <FormError message={formError} />

            <Button type="submit" variant="primary" size="lg" loading={submitting} className="w-full">
              {submitting ? 'Şifre değiştiriliyor…' : 'Şifreyi değiştir'}
            </Button>
          </form>
        </Card>
      </div>
    </div>
  );
}

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
import { useAuth } from '../context/AuthContext';
import { ApiClientError } from '../services/api';

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="mt-1 text-xs font-medium text-att-absent">{message}</p>;
}

/** Katı şifre politikası (backend ile aynı) — min 8 + büyük/küçük/rakam. */
function policyError(password: string): string | null {
  if (password.length < 8) return 'Şifre en az 8 karakter olmalı.';
  if (!/\p{Lu}/u.test(password)) return 'Şifre en az bir büyük harf içermeli.';
  if (!/\p{Ll}/u.test(password)) return 'Şifre en az bir küçük harf içermeli.';
  if (!/\d/.test(password)) return 'Şifre en az bir rakam içermeli.';
  return null;
}

const inputClass =
  'h-10 w-full rounded-md border border-border bg-surface px-3 text-sm text-text placeholder:text-muted focus:border-accent';

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
          <h1 className="text-xl font-semibold text-text">Yeni şifre belirle</h1>
          <p className="mt-1 text-sm text-muted">
            İlk girişte şifrenizi değiştirmeniz gerekiyor.
          </p>

          <form onSubmit={handleSubmit} className="mt-4 space-y-4" noValidate>
            <div>
              <label htmlFor="cp-current" className="mb-1 block text-sm font-medium text-muted">
                Mevcut şifre
              </label>
              <input
                id="cp-current"
                type="password"
                autoComplete="current-password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className={inputClass}
              />
              <FieldError message={fieldErrors.current_password} />
            </div>

            <div>
              <label htmlFor="cp-new" className="mb-1 block text-sm font-medium text-muted">
                Yeni şifre
              </label>
              <input
                id="cp-new"
                type="password"
                autoComplete="new-password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className={inputClass}
              />
              <p className="mt-1 text-xs text-muted">
                En az 8 karakter; bir büyük harf, bir küçük harf ve bir rakam.
              </p>
              <FieldError message={fieldErrors.new_password} />
            </div>

            <div>
              <label htmlFor="cp-confirm" className="mb-1 block text-sm font-medium text-muted">
                Yeni şifre (tekrar)
              </label>
              <input
                id="cp-confirm"
                type="password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className={inputClass}
              />
              <FieldError message={fieldErrors.confirm_password} />
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
              {submitting ? 'Kaydediliyor…' : 'Şifreyi değiştir'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

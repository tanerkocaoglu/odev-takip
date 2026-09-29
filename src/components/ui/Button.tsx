/**
 * Buton — tek bileşen, dört görünüm, üç boyut.
 * - primary: sayfadaki tek ana eylem (accent dolgu)
 * - secondary: kenarlıklı ikincil eylem
 * - ghost: araç çubuğu / satır içi düşük vurgulu eylem
 * - danger: yıkıcı eylem (kenarlıklı); danger-solid: onay diyaloğundaki son adım
 * Dar ekranda yükseklik en az 44px (dokunma hedefi).
 */

import type { ButtonHTMLAttributes } from 'react';
import { LoaderCircle } from 'lucide-react';
import { buttonClass, type ButtonSize, type ButtonVariant } from './buttonStyles';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** true iken buton devre dışı kalır ve dönen gösterge çıkar; metin değişmez. */
  loading?: boolean;
}

export function Button({
  variant = 'secondary',
  size = 'md',
  loading,
  disabled,
  className = '',
  type = 'button',
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={buttonClass(variant, size, className)}
      {...rest}
    >
      {loading && <LoaderCircle size={15} aria-hidden="true" className="animate-spin" />}
      {children}
    </button>
  );
}

/* eslint-disable react-refresh/only-export-components -- geçiş katmanı, Parti 7'de silinir */
/**
 * GEÇİŞ KATMANI (shim) — ortak UI parçaları `src/components/ui/` altına taşındı.
 * Bu dosya, sayfa import'ları kendi partilerinde `components/ui`'a
 * geçirilene kadar eski adları yeniden dışa aktarır. Yeni kod BURAYI KULLANMAZ.
 * Tüm sayfalar taşındığında dosya silinir (Parti 7).
 */

import type { ReactNode } from 'react';
import { Button } from '../ui/Button';

export {
  Badge,
  StatusBadge,
  AttendanceBadge,
  type BadgeTone,
  Field,
  SearchBox,
  FilterSelect,
  FilterChip,
  inputClass,
  PageTitle,
  FormError,
  LoadingState,
  EmptyState,
} from '../ui';

export function PrimaryButton({
  children,
  onClick,
  type = 'button',
  disabled,
  className = '',
}: {
  children: ReactNode;
  onClick?: () => void;
  type?: 'button' | 'submit';
  disabled?: boolean;
  className?: string;
}) {
  return (
    <Button variant="primary" type={type} onClick={onClick} disabled={disabled} className={className}>
      {children}
    </Button>
  );
}

export function SecondaryButton({
  children,
  onClick,
  type = 'button',
  disabled,
}: {
  children: ReactNode;
  onClick?: () => void;
  type?: 'button' | 'submit';
  disabled?: boolean;
}) {
  return (
    <Button type={type} onClick={onClick} disabled={disabled}>
      {children}
    </Button>
  );
}

export function DangerButton({
  children,
  onClick,
}: {
  children: ReactNode;
  onClick?: () => void;
}) {
  return (
    <Button variant="danger" size="sm" onClick={onClick}>
      {children}
    </Button>
  );
}

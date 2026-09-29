/** Buton sınıfları — `Button` bileşeni ve buton görünümlü bağlantılar için. */

import { cx } from './cx';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'danger-solid';
export type ButtonSize = 'sm' | 'md' | 'lg';

const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-accent text-accent-fg hover:bg-accent-hover',
  secondary: 'border border-border bg-surface text-text hover:bg-subtle',
  ghost: 'text-muted hover:bg-subtle hover:text-text',
  danger: 'border border-danger/30 bg-surface text-danger hover:bg-danger/5',
  'danger-solid': 'bg-danger text-white hover:opacity-90',
};

const SIZES: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-[13px] max-md:min-h-11',
  md: 'h-9 px-4 text-sm max-md:min-h-11',
  lg: 'h-11 px-5 text-base max-md:min-h-12',
};

export function buttonClass(
  variant: ButtonVariant = 'secondary',
  size: ButtonSize = 'md',
  extra = '',
): string {
  return cx(
    'inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-md font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50',
    VARIANTS[variant],
    SIZES[size],
    extra,
  );
}

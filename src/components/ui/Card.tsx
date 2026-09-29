/**
 * Kart yüzeyi — kenarlıklı, gölgesiz. `interactive` yalnızca tıklanabilir
 * kart/satır içindir (hover'da accent kenarlık, yükselme yok).
 * `padding`: none | sm (12px) | md (16px, varsayılan) | lg (20px).
 */

import type { HTMLAttributes } from 'react';
import { cx } from './cx';

const PADDING = { none: '', sm: 'p-3', md: 'p-4', lg: 'p-5' } as const;

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  padding?: keyof typeof PADDING;
  interactive?: boolean;
}

export function Card({
  padding = 'md',
  interactive,
  className = '',
  children,
  ...rest
}: CardProps) {
  return (
    <div
      className={cx(
        'rounded-md border border-border bg-surface',
        PADDING[padding],
        interactive && 'card-interactive',
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  );
}

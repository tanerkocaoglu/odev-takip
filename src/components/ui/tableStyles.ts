/** Tablo hücre sınıfları (yoğunluğa göre). Bkz. `Table.tsx`. */

import { cx } from './cx';

export type Density = 'compact' | 'comfortable';

export const thClass = (density: Density = 'compact') =>
  cx(
    'text-left font-medium text-muted',
    density === 'compact' ? 'px-3 py-2 text-[13px]' : 'px-4 py-3 text-sm',
  );

export const tdClass = (density: Density = 'compact') =>
  cx('text-text', density === 'compact' ? 'px-3 py-2 text-[13px]' : 'px-4 py-3 text-sm');

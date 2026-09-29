/**
 * Liste deseni — masaüstünde compact tablo, dar ekranda kart listesi.
 *
 * Neden kart (yatay kaydırma değil): 6–7 sütunlu yönetim listelerinde yatay kaydırma,
 * satır eylemini ve ilk sütunu ekran dışında bırakır; telefonda "kim + ne yapabilirim"
 * birlikte görünmelidir. Sütun sayısı az ve karşılaştırma gerektiren tablolar için
 * `mobile="scroll"`: tablo kendi kapsayıcısında yatay kaydırılır (sayfa gövdesi asla).
 *
 * - Sütunlardan `card: 'title'` olan kartın başlığı olur (yoksa ilk sütun); `card: 'hide'`
 *   kartta gösterilmez; diğerleri etiketli satır (dt/dd).
 * - `actions`: satır sonundaki `RowMenu` (tablo: son sütun, kaydırma olsa da sağda sabit;
 *   kart: sağ üst).
 * - İki düzen aynı anda DOM'a basılmaz (`useIsMobile`); testlerde varsayılan masaüstüdür.
 * Yükleniyor/boş/hata durumları `ListState` ile sarılır (sayfa yazmaz).
 */

import type { ReactNode } from 'react';
import { useIsMobile } from '../../hooks/useIsMobile';
import { Card } from './Card';
import { cx } from './cx';
import { EmptyState, ErrorState, LoadingState } from './Feedback';
import { RowMenu, type RowMenuItem } from './RowMenu';
import { TableCard } from './Table';
import { tdClass, thClass } from './tableStyles';

export interface Column<T> {
  key: string;
  header: string;
  cell: (row: T) => ReactNode;
  /** Kart görünümündeki rolü (varsayılan: 'meta'). */
  card?: 'title' | 'meta' | 'hide';
  /** Hücre ek sınıfı (ör. 'tabular text-muted'). */
  className?: string;
}

export function DataTable<T>({
  rows,
  columns,
  rowKey,
  rowLabel,
  actions,
  mobile = 'cards',
}: {
  rows: T[];
  columns: Column<T>[];
  rowKey: (row: T) => string;
  /** Satırın kısa adı — menü düğmesinin erişilebilir adı için ("Ali Yılmaz için işlemler"). */
  rowLabel: (row: T) => string;
  actions?: (row: T) => RowMenuItem[];
  mobile?: 'cards' | 'scroll';
}) {
  const isMobile = useIsMobile();

  if (isMobile && mobile === 'cards') {
    const titleCol = columns.find((c) => c.card === 'title') ?? columns[0];
    const meta = columns.filter((c) => c !== titleCol && c.card !== 'hide');
    return (
      <ul className="space-y-2">
        {rows.map((row) => (
          <li key={rowKey(row)}>
            <Card padding="sm">
              <div
                className={cx(
                  'flex justify-between gap-2',
                  meta.length === 0 ? 'items-center' : 'items-start',
                )}
              >
                <div className="min-w-0 text-sm font-medium text-text">{titleCol.cell(row)}</div>
                {actions && <RowMenu label={rowLabel(row)} items={actions(row)} />}
              </div>
              {meta.length > 0 && (
                <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[13px]">
                  {meta.map((c) => (
                    <div key={c.key} className="contents">
                      <dt className="text-muted">{c.header}</dt>
                      <dd className={cx('min-w-0 break-words text-text', c.className)}>
                        {c.cell(row)}
                      </dd>
                    </div>
                  ))}
                </dl>
              )}
            </Card>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <TableCard className="relative">
      <table className="w-full">
        <thead>
          <tr className="border-b border-border bg-subtle">
            {columns.map((c) => (
              <th key={c.key} className={cx(thClass(), 'whitespace-nowrap')}>
                {c.header}
              </th>
            ))}
            {actions && (
              <th className={cx(thClass(), 'sticky right-0 w-12 bg-subtle')}>
                <span className="sr-only">İşlemler</span>
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={rowKey(row)} className="border-b border-border last:border-b-0">
              {columns.map((c) => (
                <td key={c.key} className={cx(tdClass(), 'whitespace-nowrap', c.className)}>
                  {c.cell(row)}
                </td>
              ))}
              {actions && (
                <td className={cx(tdClass(), 'sticky right-0 bg-surface text-right')}>
                  <div className="flex justify-end">
                    <RowMenu label={rowLabel(row)} items={actions(row)} />
                  </div>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </TableCard>
  );
}

/**
 * Liste durumları: yükleniyor → iskelet, hata → ErrorState (+ yeniden dene),
 * boş → EmptyState; aksi hâlde çocuklar. `error` doluysa liste gösterilmez.
 */
export function ListState({
  loading,
  error,
  onRetry,
  empty,
  emptyMessage,
  emptyAction,
  children,
}: {
  loading: boolean;
  error?: string | null;
  onRetry?: () => void;
  empty: boolean;
  emptyMessage: string;
  emptyAction?: ReactNode;
  children: ReactNode;
}) {
  if (error) return <ErrorState message={error} onRetry={onRetry} />;
  if (loading) return <LoadingState />;
  if (empty) return <EmptyState message={emptyMessage} action={emptyAction} />;
  return <>{children}</>;
}

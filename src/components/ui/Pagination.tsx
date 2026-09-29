/**
 * Sayfalama — tabular-nums; sayfa sayısı 1 ise hiç görünmez.
 */

import { Button } from './Button';

interface PaginationProps {
  page: number;
  pageSize: number;
  total: number;
  onChange: (page: number) => void;
}

export default function Pagination({ page, pageSize, total, onChange }: PaginationProps) {
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  if (pageCount <= 1) return null;

  return (
    <div className="flex items-center justify-between gap-2 text-sm text-muted">
      <span className="tabular">
        {total} kayıt · {page}/{pageCount} sayfa
      </span>
      <div className="flex items-center gap-2">
        <Button size="sm" disabled={page <= 1} onClick={() => onChange(page - 1)}>
          Önceki
        </Button>
        <Button size="sm" disabled={page >= pageCount} onClick={() => onChange(page + 1)}>
          Sonraki
        </Button>
      </div>
    </div>
  );
}

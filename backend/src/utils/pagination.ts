/**
 * Sayfalama yardımcıları — 200 kayıtlık listelerde (öğrenci, veli) zorunlu.
 * Varsayılan: page 1, pageSize 20 (max 100).
 */

export interface Pagination {
  page: number;
  pageSize: number;
  limit: number;
  offset: number;
}

export function parsePagination(query: Record<string, unknown>): Pagination {
  const page = Math.max(1, Number(query.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(query.pageSize) || 20));
  return { page, pageSize, limit: pageSize, offset: (page - 1) * pageSize };
}

export function paged<T>(items: T[], total: number, pagination: Pagination) {
  return {
    items,
    total,
    page: pagination.page,
    pageSize: pagination.pageSize,
  };
}

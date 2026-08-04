/**
 * Liste sayfaları için ortak state yönetimi: arama + sayfalama + yenileme.
 */

import { useCallback, useEffect, useState } from 'react';
import type { Paged } from '../types';

export function useList<T>(
  fetcher: (params: { q: string; page: number; pageSize: number }) => Promise<Paged<T>>,
) {
  const [items, setItems] = useState<T[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const pageSize = 20;

  const reload = useCallback(
    async (nextPage = page, nextQ = q) => {
      setLoading(true);
      setError(null);
      try {
        const data = await fetcher({ q: nextQ, page: nextPage, pageSize });
        setItems(data.items);
        setTotal(data.total);
        setPage(data.page);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Bir hata oluştu.');
      } finally {
        setLoading(false);
      }
    },
    [fetcher, page, q],
  );

  useEffect(() => {
    reload(1, q);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const submitSearch = useCallback((value: string) => {
    setQ(value);
  }, []);

  return {
    items,
    total,
    page,
    pageSize,
    q,
    loading,
    error,
    setError,
    setQ: submitSearch,
    setPage: (p: number) => reload(p, q),
    reload,
  };
}

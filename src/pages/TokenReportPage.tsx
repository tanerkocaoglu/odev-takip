/**
 * Veli rapor sayfası — `/r/{token}` (spec.md §5.4 adım 6).
 * Girişsiz, salt okunur; içerik `weekly_digests.snapshot`'tır. İptal edilmiş
 * veya bilinmeyen token → 410 "Bu rapor artık geçerli değil." (varlık sızmaz).
 */

import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import type { DigestSnapshot } from '../types';
import { publicApi, ApiClientError } from '../services/api';
import ReportSnapshot from '../components/ReportSnapshot';

export default function TokenReportPage() {
  const { token } = useParams<{ token: string }>();
  const [snapshot, setSnapshot] = useState<DigestSnapshot | null>(null);
  const [gone, setGone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    setSnapshot(null);
    setGone(false);
    setError(null);
    publicApi
      .digest(token)
      .then((res) => {
        if (!cancelled) setSnapshot(res.snapshot);
      })
      .catch((err) => {
        if (cancelled) return;
        if (err instanceof ApiClientError && err.status === 410) {
          setGone(true);
        } else {
          setError(
            err instanceof ApiClientError
              ? err.message
              : 'Rapor yüklenemedi. Lütfen tekrar deneyin.',
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  return (
    <div className="flex min-h-screen flex-col bg-bg">
      <div className="mx-auto w-full max-w-2xl flex-1 px-4 py-8">
        <h1 className="text-2xl font-semibold text-text">
          Haftalık ödev takip raporu
        </h1>

        {gone && (
          <div className="mt-6 rounded-md border border-border bg-surface p-6 text-center">
            <p className="text-sm text-text">Bu rapor artık geçerli değil.</p>
            <p className="mt-1 text-sm text-muted">
              Güncel rapor için veli panelinizi kullanabilirsiniz.
            </p>
          </div>
        )}

        {error && (
          <div className="mt-6 rounded-md border border-border bg-surface p-6 text-center">
            <p className="text-sm text-muted">{error}</p>
          </div>
        )}

        {snapshot && !gone && (
          <div className="mt-6">
            <ReportSnapshot snapshot={snapshot} showStudent />
          </div>
        )}

        {!snapshot && !gone && !error && (
          <p className="mt-6 text-sm text-muted">Yükleniyor…</p>
        )}
      </div>
    </div>
  );
}

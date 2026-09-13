/**
 * Veli rapor sayfası — `/r/{token}` (spec.md §5.4 adım 6).
 * Girişsiz, salt okunur; içerik `weekly_digests.snapshot`'tır. İptal edilmiş
 * veya bilinmeyen token → 410 "Bu rapor artık geçerli değil." (varlık sızmaz).
 *
 * Girişli veli detayıyla **aynı** `GuardianReportView` gövdesini kullanır
 * (`variant="public"`); farkı kabuktur: uygulama navigasyonu yok, tam sayfa
 * marka başlığı + rapor. Snapshot'ta dosya yoktur, bu yüzden teslim geçmişi
 * ve önceki-ödev dosya önizlemesi bu sayfada gösterilmez (Bearer gerekir).
 */

import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { DigestSnapshot } from '../types';
import { publicApi, ApiClientError } from '../services/api';
import GuardianReportView from '../components/customer/GuardianReportView';
import BrandLogo from '../components/BrandLogo';

function LoadingSkeleton() {
  return (
    <div className="space-y-4" aria-hidden="true">
      <div className="shimmer h-32 w-full rounded-3xl" />
      <div className="shimmer h-12 w-full rounded-2xl" />
      <div className="shimmer h-64 w-full rounded-2xl" />
      <div className="shimmer h-64 w-full rounded-2xl" />
    </div>
  );
}

export default function TokenReportPage() {
  const { token } = useParams<{ token: string }>();
  const [snapshot, setSnapshot] = useState<DigestSnapshot | null>(null);
  const [sentAt, setSentAt] = useState<string | null>(null);
  const [gone, setGone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    setSnapshot(null);
    setSentAt(null);
    setGone(false);
    setError(null);
    publicApi
      .digest(token)
      .then((res) => {
        if (cancelled) return;
        setSnapshot(res.snapshot);
        setSentAt(res.sent_at);
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
    <div className="customer-face brand-canvas min-h-screen">
      {/* Public marka başlığı — koyu marka dolgusu; beyaz metin kontrastlı,
          parlak deko tonu yalnızca dekoratif. Logo beyaz yüzeyde okunur. */}
      <header className="brand-panel relative overflow-hidden">
        <span
          aria-hidden="true"
          className="pointer-events-none absolute -right-12 -top-12 h-48 w-48 rounded-full border border-white/15"
        />
        <div className="relative z-10 mx-auto flex max-w-2xl flex-col items-center gap-3 px-4 py-8 text-center lg:max-w-4xl">
          <span className="rounded-2xl bg-surface p-3 shadow-[var(--elevation-3)]">
            <BrandLogo className="h-14 w-auto object-contain" />
          </span>
          <p className="text-lg font-semibold tracking-wide text-accent-fg">
            ÖDEV TAKİP
          </p>
        </div>
      </header>

      <main className="mx-auto w-full max-w-2xl px-4 py-8 lg:max-w-4xl">
        {gone && (
          <div className="rounded-3xl border border-border bg-surface p-8 text-center elevation-1">
            <p className="text-base font-medium text-text">Bu rapor artık geçerli değil.</p>
            <p className="mt-1 text-sm text-muted">
              Güncel rapor için veli panelinizi kullanabilirsiniz.
            </p>
          </div>
        )}

        {error && (
          <div className="rounded-3xl border border-border bg-surface p-8 text-center elevation-1">
            <p className="text-sm text-muted">{error}</p>
          </div>
        )}

        {snapshot && !gone && !error && (
          <GuardianReportView snapshot={snapshot} variant="public" sentAt={sentAt} />
        )}

        {!snapshot && !gone && !error && <LoadingSkeleton />}
      </main>

      {/* spec.md §9: aydınlatma metni rapor sayfasının altında; durumdan
          bağımsız (snapshot/gone/error) her zaman görünür. */}
      <footer className="mx-auto w-full max-w-2xl px-4 pb-8 text-center lg:max-w-4xl">
        <Link
          to="/gizlilik"
          className="text-xs font-medium text-accent hover:underline"
        >
          Gizlilik ve Aydınlatma Metni
        </Link>
      </footer>
    </div>
  );
}

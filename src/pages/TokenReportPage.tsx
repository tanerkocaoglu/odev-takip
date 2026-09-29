/**
 * Veli rapor sayfası — `/r/{token}` (spec.md §5.4 adım 6).
 * Girişsiz, salt okunur; içerik `weekly_digests.snapshot`'tır. Sunucu, iptal
 * edilmiş VE bilinmeyen token için aynı 410'u döner (token'ın varlığı sızmaz);
 * bu yüzden ekran ikisini ayırt etmez. Yalnızca biçimi bozuk (eksik kopyalanmış)
 * bağlantı istemcide "Bağlantı geçersiz" olarak ayrılır ve istek atılmaz.
 *
 * Girişli veli detayıyla **aynı** `GuardianReportView` gövdesini kullanır
 * (`variant="public"`). Snapshot'ta dosya yoktur, bu yüzden teslim geçmişi ve
 * önceki-ödev dosya önizlemesi bu sayfada gösterilmez (Bearer gerekir).
 */

import { useEffect, useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Link2Off, TriangleAlert, type LucideIcon } from 'lucide-react';
import type { DigestSnapshot } from '../types';
import { publicApi, ApiClientError } from '../services/api';
import GuardianReportView from '../components/customer/GuardianReportView';
import PublicShell from '../components/layout/PublicShell';
import { Card, ErrorState, Skeleton, buttonClass } from '../components/ui';

/** Gerçek token 43 karakterlik base64url'dür; bundan kısa/farklı olan bozuk kopyadır. */
const TOKEN_SHAPE = /^[A-Za-z0-9_-]{16,}$/;

function LoadingSkeleton() {
  return (
    <div role="status" aria-busy="true" className="space-y-4">
      <span className="sr-only">Rapor yükleniyor…</span>
      <Skeleton className="h-32 w-full" />
      <Skeleton className="h-56 w-full" />
      <Skeleton className="h-64 w-full" />
    </div>
  );
}

function StatusScreen({
  icon: Icon,
  title,
  children,
  action,
}: {
  icon: LucideIcon;
  title: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <Card padding="lg" className="mx-auto mt-4 max-w-md text-center">
      <span className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-subtle text-muted">
        <Icon size={22} aria-hidden="true" />
      </span>
      <h1 className="text-xl font-semibold text-text">{title}</h1>
      <div className="mt-2 text-sm leading-relaxed text-muted">{children}</div>
      {action && <div className="mt-5 flex justify-center">{action}</div>}
    </Card>
  );
}

export default function TokenReportPage() {
  const { token } = useParams<{ token: string }>();
  const [snapshot, setSnapshot] = useState<DigestSnapshot | null>(null);
  const [sentAt, setSentAt] = useState<string | null>(null);
  const [gone, setGone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const malformed = !token || !TOKEN_SHAPE.test(token);

  useEffect(() => {
    if (!token || malformed) return;
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
              : 'Rapor yüklenemedi. Bağlantınızı kontrol edip yeniden deneyin.',
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, [token, malformed, reloadKey]);

  return (
    <PublicShell>
      {malformed ? (
        <StatusScreen icon={TriangleAlert} title="Bağlantı geçersiz">
          <p>
            Bağlantı eksik ya da hatalı kopyalanmış olabilir. WhatsApp mesajındaki
            bağlantının tamamına dokunduğunuzdan emin olun.
          </p>
        </StatusScreen>
      ) : gone ? (
        <StatusScreen
          icon={Link2Off}
          title="Bu rapor artık geçerli değil."
          action={
            <Link to="/login" className={buttonClass('primary', 'lg')}>
              Veli paneline giriş yap
            </Link>
          }
        >
          <p>
            Bu bağlantı iptal edilmiş ya da yeni bir bağlantıyla değiştirilmiş olabilir.
            Güncel raporu veli panelinizden görebilirsiniz; giriş bilginiz yoksa
            dershaneyle iletişime geçin.
          </p>
        </StatusScreen>
      ) : error ? (
        <div className="mx-auto mt-4 max-w-md">
          <ErrorState message={error} onRetry={() => setReloadKey((k) => k + 1)} />
        </div>
      ) : snapshot ? (
        <GuardianReportView snapshot={snapshot} variant="public" sentAt={sentAt} />
      ) : (
        <LoadingSkeleton />
      )}
    </PublicShell>
  );
}


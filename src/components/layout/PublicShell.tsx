/**
 * Girişsiz sayfaların kabuğu — `/r/{token}` (veli raporu) ve `/gizlilik`.
 * Sade üst şerit (yalnızca marka), tek sütun, 16px kenar boşluğu; altta aydınlatma
 * metni bağlantısı (spec.md §9: durumdan bağımsız her zaman görünür).
 * Telefonda WhatsApp bağlantısından açılır: comfortable yoğunluk, yazdırılabilir.
 */

import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import BrandLogo from '../BrandLogo';

export default function PublicShell({
  children,
  width = 'report',
  showPrivacyLink = true,
}: {
  children: ReactNode;
  /** report: veli raporu (geniş ekranda iki sütun ızgara sığar); prose: uzun metin. */
  width?: 'report' | 'prose';
  showPrivacyLink?: boolean;
}) {
  const max = width === 'prose' ? 'max-w-2xl' : 'max-w-2xl lg:max-w-4xl';
  return (
    <div className="min-h-dvh bg-bg">
      <header className="border-b border-border bg-surface print:hidden">
        <div className={`mx-auto flex h-14 items-center px-4 ${max}`}>
          <BrandLogo size="sm" />
        </div>
      </header>
      <main className={`mx-auto w-full px-4 py-6 ${max}`}>{children}</main>
      {showPrivacyLink && (
        <footer className={`mx-auto w-full px-4 pb-8 text-center print:hidden ${max}`}>
          <Link
            to="/gizlilik"
            className="inline-flex min-h-11 items-center text-sm font-medium text-accent underline underline-offset-2 hover:text-accent-hover"
          >
            Gizlilik ve Aydınlatma Metni
          </Link>
        </footer>
      )}
    </div>
  );
}

/**
 * Duyarlı (responsive) düzen seçimi için medya sorgusu kancası.
 *
 * Bazı ekranlar mobilde tamamen farklı bir kompozisyon (çip şeridi, kart
 * listesi) sunduğundan, iki düzeni aynı anda DOM'a basmak yerine yalnızca
 * geçerli olan render edilir. Testlerde (jsdom) `matchMedia` tanımlı
 * olmadığından güvenli varsayılan **masaüstüdür**.
 */

import { useEffect, useState } from 'react';

export function useIsMobile(query = '(max-width: 767px)'): boolean {
  const [matches, setMatches] = useState(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return false;
    }
    return window.matchMedia(query).matches;
  });

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return;
    }
    const mql = window.matchMedia(query);
    const handler = () => setMatches(mql.matches);
    handler();
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, [query]);

  return matches;
}

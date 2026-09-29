/**
 * Ekran (sanal) klavyesi açık mı? — sabit alt çubukların klavyeyle çakışmaması için.
 *
 * Tarayıcılar klavyeyi farklı ele alır:
 * - iOS Safari ve Android Chrome (varsayılan): düzen görünümü (layout viewport)
 *   sabit kalır, `visualViewport.height` küçülür → sabit alt çubuk klavyenin
 *   ARKASINDA kalır ya da içeriği örter.
 * - Android `interactive-widget=resizes-content`: `window.innerHeight` küçülür.
 * İkisini de yakalamak için: bir metin alanı odaktayken görünür yükseklik,
 * gözlenen en büyük yüksekliğin %80'inin altına inerse klavye açık sayılır.
 * (Sayfa yüksekliği klavyeden başka nedenle de değişebilir; ölçüt bu yüzden
 * "odakta düzenlenebilir öğe" koşuluyla birleşir.)
 */

import { useEffect, useState } from 'react';

function isEditable(el: Element | null): boolean {
  if (!el) return false;
  const tag = el.tagName;
  if (tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (tag !== 'INPUT') return false;
  const type = (el as HTMLInputElement).type;
  return !['checkbox', 'radio', 'button', 'submit', 'file', 'range'].includes(type);
}

export function useKeyboardOpen(): boolean {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const vv = window.visualViewport;
    let maxHeight = Math.max(window.innerHeight, vv?.height ?? 0);

    const update = () => {
      const visible = vv?.height ?? window.innerHeight;
      maxHeight = Math.max(maxHeight, window.innerHeight, visible);
      setOpen(isEditable(document.activeElement) && visible < maxHeight * 0.8);
    };

    vv?.addEventListener('resize', update);
    window.addEventListener('resize', update);
    document.addEventListener('focusin', update);
    document.addEventListener('focusout', () => setTimeout(update, 50));
    update();
    return () => {
      vv?.removeEventListener('resize', update);
      window.removeEventListener('resize', update);
      document.removeEventListener('focusin', update);
    };
  }, []);

  return open;
}

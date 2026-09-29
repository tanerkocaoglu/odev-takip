/**
 * Marka imzası — "Ödev Takip" wordmark. Uygulamadaki TEK logo bileşenidir;
 * kaynak resim yoktur (SVG işaret + canlı metin), böylece her boyutta keskin
 * kalır ve `html-to-image` çıktısında (ödev özeti PNG) sorunsuz çizilir.
 *
 * - `size`: sm (başlık şeridi, 28px işaret) | md (varsayılan, 36px) | lg (giriş, 48px)
 * - `variant`: full (işaret + metin) | mark (yalnızca işaret)
 * - `tone`: default (teal işaret, koyu metin) | inverse (teal zemin üzerinde beyaz)
 * - `responsive`: true iken metin dar ekranda (<lg) gizlenir, işaret kalır
 * Erişilebilir ad her durumda "Ödev Takip"tir.
 */

import { cx } from './ui/cx';

/** Marka rengi (--accent ile aynı). SVG özniteliklerinde CSS değişkeni çözülmez ve
    PNG dışa aktarımı sabit değer ister; bu yüzden hex olarak burada durur. */
const ACCENT = '#0D6B62';

const SIZES = {
  sm: { mark: 28, text: 'text-base' },
  md: { mark: 36, text: 'text-lg' },
  lg: { mark: 48, text: 'text-2xl' },
} as const;

interface BrandLogoProps {
  size?: keyof typeof SIZES;
  variant?: 'full' | 'mark';
  tone?: 'default' | 'inverse';
  responsive?: boolean;
  className?: string;
}

export default function BrandLogo({
  size = 'md',
  variant = 'full',
  tone = 'default',
  responsive = false,
  className = '',
}: BrandLogoProps) {
  const { mark, text } = SIZES[size];
  const inverse = tone === 'inverse';
  return (
    <span
      role="img"
      aria-label="Ödev Takip"
      className={cx('inline-flex items-center gap-2.5', className)}
    >
      <svg
        width={mark}
        height={mark}
        viewBox="0 0 32 32"
        aria-hidden="true"
        className="shrink-0"
      >
        <rect
          width="32"
          height="32"
          rx="8"
          fill={inverse ? '#ffffff' : ACCENT}
        />
        <path
          d="M10 8h8.5l4.5 4.5V23a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 9 23V9.5A1.5 1.5 0 0 1 10.5 8z"
          fill="none"
          stroke={inverse ? ACCENT : '#ffffff'}
          strokeWidth="1.8"
          strokeLinejoin="round"
        />
        <path
          d="M12.6 17.2l2.5 2.5 4.7-5.2"
          fill="none"
          stroke={inverse ? ACCENT : '#ffffff'}
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      {variant === 'full' && (
        <span
          aria-hidden="true"
          className={cx(
            'font-semibold tracking-tight',
            text,
            inverse ? 'text-white' : 'text-text',
            responsive && 'hidden lg:inline',
          )}
        >
          Ödev Takip
        </span>
      )}
    </span>
  );
}

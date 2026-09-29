/**
 * 1–10 puan seçici (mobil kart görünümü) — TEK radiogroup; mobilde puanın TEK girdisidir (sayı kutusu yok).
 *
 * Klavye modeli (ARIA radio group):
 * - roving tabindex: gruptaki tek Tab durağı seçili düğmedir (seçim yoksa "1");
 *   böylece 8 öğrenci × 2 puan × 10 düğme = 160 Tab durağı yerine kart başına 2.
 * - ok tuşları grup içinde gezer ve seçer (sonda başa sarar); Home/End = 1/10;
 * - rakam tuşu doğrudan seçer (1–9 → aynı sayı, 0 → 10);
 * - Tab gruptan çıkıp sıradaki alana geçer.
 * Düğmeler 44×44px, 5×2 ızgara.
 */

import { useRef, type KeyboardEvent } from 'react';
import { cx } from './ui';

const VALUES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const;

export default function ScoreRadioGroup({
  labelledBy,
  value,
  onChange,
  disabled,
}: {
  /** Görünür etiketin id'si (`aria-labelledby`). */
  labelledBy: string;
  value: number | null;
  onChange: (value: number) => void;
  disabled?: boolean;
}) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const tabbable = value ?? 1;

  function select(n: number) {
    onChange(n);
    refs.current[n - 1]?.focus();
  }

  function handleKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (disabled) return;
    const current = value ?? 0;
    let next: number | null = null;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = current >= 10 ? 1 : current + 1;
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = current <= 1 ? 10 : current - 1;
    else if (e.key === 'Home') next = 1;
    else if (e.key === 'End') next = 10;
    else if (/^[0-9]$/.test(e.key)) next = e.key === '0' ? 10 : Number(e.key);
    if (next === null) return;
    e.preventDefault();
    select(next);
  }

  return (
    <div
      role="radiogroup"
      aria-labelledby={labelledBy}
      aria-disabled={disabled || undefined}
      onKeyDown={handleKeyDown}
      className="grid grid-cols-5 gap-2"
    >
      {VALUES.map((n) => {
        const checked = value === n;
        return (
          <button
            key={n}
            ref={(el) => {
              refs.current[n - 1] = el;
            }}
            type="button"
            role="radio"
            aria-checked={checked}
            tabIndex={n === tabbable ? 0 : -1}
            disabled={disabled}
            onClick={() => onChange(n)}
            className={cx(
              'tabular h-11 min-w-11 rounded-md border text-base font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50',
              checked
                ? 'border-accent bg-accent text-accent-fg'
                : 'border-border bg-surface text-text hover:border-accent',
            )}
          >
            {n}
          </button>
        );
      })}
    </div>
  );
}

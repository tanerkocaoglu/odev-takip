/**
 * Form alanları: Field (etiket + hata), Input/Select/Textarea, arama kutusu,
 * filtre seçici ve çip. Her alanın görünür <label>'ı vardır; hata alanın altında
 * hem ikonla hem metinle gösterilir.
 */

import { useRef } from 'react';
import type {
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from 'react';
import { CircleAlert, Search, X } from 'lucide-react';
import { cx } from './cx';

/** Ham `<input>`/`<select>` için ortak sınıf (bileşen kullanılamayan yerlerde). */
export const inputClass =
  'h-9 w-full rounded-md border border-border bg-surface px-3 text-sm text-text placeholder:text-muted focus:border-accent disabled:bg-subtle disabled:text-muted max-md:h-11';

export const textareaClass =
  'w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text placeholder:text-muted focus:border-accent disabled:bg-subtle disabled:text-muted';

export function Field({
  label,
  htmlFor,
  children,
  error,
  hint,
}: {
  label: string;
  htmlFor?: string;
  children: ReactNode;
  error?: string;
  hint?: string;
}) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-1 block text-[13px] font-medium text-muted">
        {label}
      </label>
      {children}
      {hint && !error && <p className="mt-1 text-xs text-muted">{hint}</p>}
      {error && (
        <p className="mt-1 flex items-start gap-1 text-xs font-medium text-danger">
          <CircleAlert size={13} aria-hidden="true" className="mt-px shrink-0" />
          {error}
        </p>
      )}
    </div>
  );
}

export function Input({ className = '', ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cx(inputClass, className)} {...rest} />;
}

export function Select({ className = '', ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={cx(inputClass, className)} {...rest} />;
}

export function Textarea({ className = '', ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cx(textareaClass, className)} {...rest} />;
}

export function SearchBox({
  value,
  onChange,
  placeholder,
  label = 'Ara',
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  /** Ekran okuyucu etiketi (görünmez; yer tutucu etiket yerine geçmez). */
  label?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <div className="relative w-full max-w-xs">
      <Search
        size={15}
        aria-hidden="true"
        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted"
      />
      <input
        ref={inputRef}
        type="search"
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete="off"
        // Yerel "×" gizli; yerine aşağıdaki temizleme düğmesi
        className={cx(
          inputClass,
          'pl-9 pr-10 [&::-webkit-search-cancel-button]:hidden [&::-webkit-search-cancel-button]:appearance-none',
        )}
      />
      {value && (
        <button
          type="button"
          aria-label={`${label} kutusunu temizle`}
          onClick={() => {
            onChange('');
            inputRef.current?.focus();
          }}
          className="absolute right-0.5 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-muted transition-colors hover:bg-subtle hover:text-text max-md:h-11 max-md:w-11"
        >
          <X size={15} aria-hidden="true" />
        </button>
      )}
    </div>
  );
}

/**
 * Etiketli filtre seçici. `<option>`'lar children olarak verilir; veri akışı
 * çağıran sayfaya aittir.
 */
export function FilterSelect({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[13px] font-medium text-muted">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={inputClass.replace('w-full ', '')}
      >
        {children}
      </select>
    </label>
  );
}

/** Yatay çip şeridi öğesi — mobil filtre seçimi. Aktif çip accent dolgulu. */
export function FilterChip({
  active,
  onClick,
  children,
}: {
  active?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cx(
        'inline-flex min-h-11 shrink-0 items-center rounded-full border px-4 text-sm font-medium transition-colors md:min-h-9',
        active
          ? 'border-accent bg-accent text-accent-fg'
          : 'border-border bg-surface text-text hover:border-accent hover:text-accent',
      )}
    >
      {children}
    </button>
  );
}

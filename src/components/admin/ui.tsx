/**
 * Admin sayfalarında ortak küçük UI parçaları.
 * Tasarım token'larından türetilir — yeni renk/boyut tanımlanmaz.
 */

import type { ReactNode } from 'react';

export const inputClass =
  'h-9 w-full rounded-md border border-border bg-surface px-3 text-sm text-text placeholder:text-muted focus:border-accent';

export function Field({
  label,
  htmlFor,
  children,
  error,
}: {
  label: string;
  htmlFor?: string;
  children: ReactNode;
  error?: string;
}) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-1 block text-sm font-medium text-muted">
        {label}
      </label>
      {children}
      {error && <p className="mt-1 text-xs font-medium text-att-absent">{error}</p>}
    </div>
  );
}

export function FormError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p role="alert" className="text-sm font-medium text-att-absent">
      {message}
    </p>
  );
}

export function LoadingState() {
  return <p className="py-8 text-center text-sm text-muted">Yükleniyor…</p>;
}

export function EmptyState({ message, action }: { message: string; action?: ReactNode }) {
  return (
    <div className="rounded-md border border-dashed border-border py-10 text-center">
      <p className="text-sm text-muted">{message}</p>
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}

export function SearchBox({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  return (
    <input
      type="search"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={inputClass + ' max-w-xs'}
    />
  );
}

export function PrimaryButton({
  children,
  onClick,
  type = 'button',
  disabled,
}: {
  children: ReactNode;
  onClick?: () => void;
  type?: 'button' | 'submit';
  disabled?: boolean;
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-fg transition-colors hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {children}
    </button>
  );
}

export function SecondaryButton({
  children,
  onClick,
  type = 'button',
}: {
  children: ReactNode;
  onClick?: () => void;
  type?: 'button' | 'submit';
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      className="rounded-md border border-border px-4 py-2 text-sm font-medium text-text transition-colors hover:bg-bg"
    >
      {children}
    </button>
  );
}

export function DangerButton({
  children,
  onClick,
}: {
  children: ReactNode;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-md border border-danger/30 px-3 py-1.5 text-sm font-medium text-danger transition-colors hover:bg-danger/5"
    >
      {children}
    </button>
  );
}

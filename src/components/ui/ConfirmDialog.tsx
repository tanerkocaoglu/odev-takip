/**
 * Onay diyaloğu — geri alınması zor eylemler için (sil, iptal et, geri çek).
 * Onay düğmesi eylemi adıyla söyler ("Öğrenciyi sil"), "Tamam/Onayla" değil.
 */

import type { ReactNode } from 'react';
import { Button } from './Button';
import Modal from './Modal';

export function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel,
  cancelLabel = 'Vazgeç',
  danger = true,
  loading,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  children?: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  danger?: boolean;
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Modal open={open} title={title} onClose={onCancel}>
      {children && <div className="text-sm text-muted">{children}</div>}
      <div className="mt-5 flex justify-end gap-2">
        <Button data-autofocus onClick={onCancel} disabled={loading}>
          {cancelLabel}
        </Button>
        <Button
          variant={danger ? 'danger-solid' : 'primary'}
          onClick={onConfirm}
          loading={loading}
        >
          {confirmLabel}
        </Button>
      </div>
    </Modal>
  );
}

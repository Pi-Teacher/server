import React from 'react';
import { Button } from './Button';
import { Modal } from './Modal';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  errorMessage?: string;
  danger?: boolean;
  isSubmitting?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  open,
  title,
  description,
  confirmLabel,
  errorMessage,
  danger = false,
  isSubmitting = false,
  onConfirm,
  onClose
}) => (
  <Modal open={open} title={title} onClose={onClose}>
    <p className="text-body-md text-on-surface-variant">{description}</p>
    {errorMessage !== undefined && (
      <div role="alert" className="mt-4 rounded-xl border border-error/25 bg-error-container px-3 py-2.5 text-body-sm text-on-error-container">
        {errorMessage}
      </div>
    )}
    <div className="mt-6 flex justify-end gap-3">
      <Button variant="secondary" onClick={onClose} disabled={isSubmitting}>取消</Button>
      <Button variant={danger ? 'danger' : 'primary'} onClick={onConfirm} isLoading={isSubmitting}>{confirmLabel}</Button>
    </div>
  </Modal>
);

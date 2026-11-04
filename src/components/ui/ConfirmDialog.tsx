import React, { type ReactNode } from 'react';
import Modal from './Modal';
import Button from './Button';
import { AlertTriangle, AlertCircle, HelpCircle } from 'lucide-react';

export interface ConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: ReactNode;
  confirmText?: string;
  cancelText?: string;
  variant?: 'danger' | 'primary' | 'warning';
  icon?: ReactNode;
  isLoading?: boolean;
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  variant = 'primary',
  icon,
  isLoading = false,
}) => {
  const defaultIcon =
    variant === 'danger' ? (
      <AlertCircle className="w-5 h-5 text-burgundy" />
    ) : variant === 'warning' ? (
      <AlertTriangle className="w-5 h-5 text-cognac" />
    ) : (
      <HelpCircle className="w-5 h-5 text-accent" />
    );

  const displayIcon = icon ?? defaultIcon;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 rounded-md bg-surface-muted shrink-0">
            {displayIcon}
          </div>
          <span>{title}</span>
        </div>
      }
      maxWidth="md"
      footer={
        <div className="flex justify-end gap-2.5 w-full">
          <Button
            variant="secondary"
            onClick={onClose}
            disabled={isLoading}
          >
            {cancelText}
          </Button>
          <Button
            variant={variant === 'warning' ? 'primary' : variant}
            onClick={onConfirm}
            loading={isLoading}
          >
            {confirmText}
          </Button>
        </div>
      }
    >
      <div className="text-xs text-ink/80 leading-relaxed py-2">
        {typeof message === 'string' ? <p>{message}</p> : message}
      </div>
    </Modal>
  );
};

export default ConfirmDialog;


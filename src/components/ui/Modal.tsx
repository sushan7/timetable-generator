import { useEffect, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { cn } from './cn';

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: ReactNode;
  subtitle?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | '2xl';
}

const MAX_WIDTH_STYLES = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-xl',
  '2xl': 'max-w-2xl',
};

export default function Modal({
  isOpen,
  onClose,
  title,
  subtitle,
  children,
  footer,
  maxWidth = 'lg',
}: ModalProps) {
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = 'unset';
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-[#252522]/40 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-120"
      onClick={onClose}
      role="presentation"
    >
      <div
        className={cn(
          'bg-white rounded-lg shadow-lg w-full max-h-[92vh] flex flex-col overflow-hidden border border-[#E5E2DA] animate-in zoom-in-95 duration-120',
          MAX_WIDTH_STYLES[maxWidth]
        )}
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        {/* Modal Header */}
        <div className="flex justify-between items-start p-5 sm:p-6 border-b border-[#E5E2DA] bg-[#F0EFE9]">
          <div>
            <h2 className="text-base sm:text-lg font-bold text-[#252522] tracking-tight leading-snug">
              {title}
            </h2>
            {subtitle && (
              <p className="text-xs text-[#77766F] mt-0.5">{subtitle}</p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-[#77766F] hover:text-[#252522] rounded-md p-1.5 hover:bg-[#E5E2DA]/60 transition-colors shrink-0 ml-3"
            aria-label="Close dialog"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 sm:p-6 overflow-y-auto flex-1">{children}</div>

        {/* Modal Footer */}
        {footer && (
          <div className="flex flex-wrap justify-end items-center gap-2.5 p-4 sm:p-6 sm:py-4 border-t border-[#E5E2DA] bg-[#F8F7F3]">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

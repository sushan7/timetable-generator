import { useEffect, useRef, useId, type ReactNode } from 'react';
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
  const generatedId = useId();
  const titleId = `modal-title-${generatedId.replace(/[:]/g, '')}`;
  const modalRef = useRef<HTMLDivElement>(null);
  const previousActiveElement = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    // Save active element for focus restoration on close
    previousActiveElement.current = document.activeElement as HTMLElement | null;

    // Initial focus on opening
    const timer = setTimeout(() => {
      if (modalRef.current) {
        const focusable = modalRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        );
        if (focusable.length > 0) {
          focusable[0].focus();
        } else {
          modalRef.current.focus();
        }
      }
    }, 40);

    // Focus trap & escape key handler
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }

      if (e.key === 'Tab' && modalRef.current) {
        const focusable = Array.from(
          modalRef.current.querySelectorAll<HTMLElement>(
            'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
          )
        ).filter(el => el.offsetParent !== null);

        if (focusable.length === 0) return;

        const first = focusable[0];
        const last = focusable[focusable.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === first || !modalRef.current.contains(document.activeElement)) {
            e.preventDefault();
            last.focus();
          }
        } else {
          if (document.activeElement === last || !modalRef.current.contains(document.activeElement)) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    document.body.style.overflow = 'hidden';

    return () => {
      clearTimeout(timer);
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'unset';

      // Restore focus to previously focused element on close
      if (previousActiveElement.current && typeof previousActiveElement.current.focus === 'function') {
        previousActiveElement.current.focus();
      }
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-ink/50 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-120"
      onClick={onClose}
      role="presentation"
    >
      <div
        ref={modalRef}
        tabIndex={-1}
        className={cn(
          'bg-surface rounded-lg shadow-xl w-full max-h-[92vh] flex flex-col overflow-hidden border border-border animate-in zoom-in-95 duration-120 outline-none',
          MAX_WIDTH_STYLES[maxWidth]
        )}
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        {/* Modal Header */}
        <div className="flex justify-between items-start p-5 sm:p-6 border-b border-border bg-surface-muted">
          <div>
            <h2 id={titleId} className="text-base sm:text-lg font-bold text-ink tracking-tight leading-snug">
              {title}
            </h2>
            {subtitle && (
              <p className="text-xs text-ink-muted mt-0.5">{subtitle}</p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-ink-muted hover:text-ink rounded-md p-1.5 hover:bg-border/60 transition-colors shrink-0 ml-3"
            aria-label="Close dialog"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 sm:p-6 overflow-y-auto flex-1">{children}</div>

        {/* Modal Footer */}
        {footer && (
          <div className="flex flex-wrap justify-end items-center gap-2.5 p-4 sm:p-6 sm:py-4 border-t border-border bg-surface-muted">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

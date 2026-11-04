import React, { createContext, useContext, useState, useCallback, useMemo } from 'react';
import { CheckCircle2, AlertTriangle, AlertCircle, Info, X } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface ToastItem {
  id: string;
  type: ToastType;
  message: string;
  duration: number;
}

interface ToastContextType {
  showToast: (message: string, type?: ToastType, duration?: number) => void;
  dismissToast: (id: string) => void;
  toast: {
    success: (message: string, duration?: number) => void;
    error: (message: string, duration?: number) => void;
    warning: (message: string, duration?: number) => void;
    info: (message: string, duration?: number) => void;
  };
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const dismissToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const showToast = useCallback((message: string, type: ToastType = 'info', duration = 4000) => {
    const id = `toast_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const newToast: ToastItem = { id, type, message, duration };

    setToasts(prev => [...prev.slice(-4), newToast]); // Keep at most 5 toasts visible

    if (duration > 0) {
      setTimeout(() => {
        dismissToast(id);
      }, duration);
    }
  }, [dismissToast]);

  const toast = useMemo(
    () => ({
      success: (msg: string, d?: number) => showToast(msg, 'success', d),
      error: (msg: string, d?: number) => showToast(msg, 'error', d || 5000),
      warning: (msg: string, d?: number) => showToast(msg, 'warning', d || 4500),
      info: (msg: string, d?: number) => showToast(msg, 'info', d),
    }),
    [showToast]
  );

  return (
    <ToastContext.Provider value={{ showToast, dismissToast, toast }}>
      {children}
      {/* Toast Notification Container */}
      <div
        className="fixed bottom-5 right-5 z-[9999] flex flex-col gap-2.5 max-w-sm sm:max-w-md w-full pointer-events-none px-4 sm:px-0"
        aria-live="polite"
        aria-atomic="false"
      >
        {toasts.map(t => {
          const isError = t.type === 'error';
          const isWarning = t.type === 'warning';
          const isSuccess = t.type === 'success';

          return (
            <div
              key={t.id}
              role={isError ? 'alert' : 'status'}
              aria-live={isError ? 'assertive' : 'polite'}
              className={`pointer-events-auto flex items-start gap-3 p-3.5 rounded-lg shadow-xl border text-xs leading-relaxed transition-all duration-200 transform translate-y-0 ${
                isSuccess
                  ? 'bg-primary text-canvas border-accent/40 shadow-black/20'
                  : isError
                  ? 'bg-primary text-canvas border-burgundy/40 shadow-burgundy/20'
                  : isWarning
                  ? 'bg-primary text-canvas border-cognac/40 shadow-cognac/20'
                  : 'bg-primary text-canvas border-border/40 shadow-black/20'
              }`}
            >
              <div className="shrink-0 mt-0.5">
                {isSuccess && <CheckCircle2 className="w-4 h-4 text-accent" />}
                {isError && <AlertCircle className="w-4 h-4 text-burgundy" />}
                {isWarning && <AlertTriangle className="w-4 h-4 text-cognac" />}
                {!isSuccess && !isError && !isWarning && <Info className="w-4 h-4 text-accent" />}
              </div>
              <div className="flex-1 font-medium text-canvas">{t.message}</div>
              <button
                type="button"
                onClick={() => dismissToast(t.id)}
                className="shrink-0 text-canvas/50 hover:text-canvas p-0.5 rounded transition-colors focus:outline-none focus:ring-1 focus:ring-accent"
                aria-label="Dismiss notification"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
};

// eslint-disable-next-line react-refresh/only-export-components
export const useToast = (): ToastContextType => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
};


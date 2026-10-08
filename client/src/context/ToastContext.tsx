import React, { createContext, useContext, useState, useCallback } from 'react';
import { CheckCircle2, AlertCircle, Info, X, AlertTriangle } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'info' | 'warning';

export interface Toast {
  id: string;
  title?: string;
  message: string;
  type: ToastType;
}

interface ToastContextType {
  toasts: Toast[];
  showToast: (message: string, type?: ToastType, title?: string) => void;
  removeToast: (id: string) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const showToast = useCallback((message: string, type: ToastType = 'info', title?: string) => {
    const id = `toast_${Date.now()}_${Math.random()}`;
    const newToast: Toast = { id, message, type, title };

    setToasts(prev => [...prev, newToast]);

    setTimeout(() => {
      removeToast(id);
    }, 4500);
  }, [removeToast]);

  return (
    <ToastContext.Provider value={{ toasts, showToast, removeToast }}>
      {children}
      {/* Phones: full width along the top, below the status bar, in the strip a bottom-sheet dialog
          always leaves free. From 640px: bottom-right corner. Above dialogs (z-50). Toasts never block
          taps on what is underneath; only their dismiss button is clickable. */}
      <div
        className="fixed inset-x-0 top-0 z-[70] flex flex-col gap-2 px-3 pt-[max(0.75rem,env(safe-area-inset-top))] pointer-events-none sm:inset-x-auto sm:top-auto sm:right-5 sm:bottom-5 sm:w-[24rem] sm:gap-2.5 sm:px-0 sm:pt-0"
        role="region"
        aria-label="Notifications"
        aria-live="polite"
      >
        {toasts.map(t => (
          <div
            key={t.id}
            role={t.type === 'error' ? 'alert' : 'status'}
            data-type={t.type}
            className="glass-toast pointer-events-none flex items-start gap-3 py-3 pl-5 pr-2.5 sm:py-3.5 sm:pr-3"
          >
            <div className="toast-icon shrink-0 w-9 h-9 flex items-center justify-center">
              {t.type === 'success' && <CheckCircle2 className="w-5 h-5" aria-hidden="true" />}
              {t.type === 'error' && <AlertCircle className="w-5 h-5" aria-hidden="true" />}
              {t.type === 'warning' && <AlertTriangle className="w-5 h-5" aria-hidden="true" />}
              {t.type === 'info' && <Info className="w-5 h-5" aria-hidden="true" />}
            </div>

            <div className="flex-1 min-w-0 self-center text-sm">
              {t.title && <div className="toast-title font-bold mb-0.5">{t.title}</div>}
              <div className="toast-message leading-snug break-words">{t.message}</div>
            </div>

            <button
              type="button"
              onClick={() => removeToast(t.id)}
              aria-label="Dismiss notification"
              className="toast-close pointer-events-auto shrink-0 p-1.5 rounded-lg transition-colors"
            >
              <X className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
};

export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
};

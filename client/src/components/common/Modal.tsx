import React, { useEffect, useId, useRef } from 'react';
import { X } from 'lucide-react';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  children: React.ReactNode;
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '4xl';
}

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

const maxWidthClasses = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-xl',
  '2xl': 'max-w-2xl',
  '4xl': 'max-w-4xl'
};

export const Modal: React.FC<ModalProps> = ({ isOpen, onClose, title, description, children, maxWidth = 'lg' }) => {
  const dialogRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const titleId = useId();
  const descriptionId = useId();

  // Focus management: move focus into the dialog, keep Tab inside it, close on Escape,
  // lock background scroll, and give focus back to whatever opened the dialog.
  useEffect(() => {
    if (!isOpen) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const dialog = dialogRef.current;
    const first = dialog?.querySelector<HTMLElement>(FOCUSABLE);
    (first ?? dialog)?.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (e.key !== 'Tab' || !dialog) return;
      const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(el => el.offsetParent !== null);
      if (focusable.length === 0) return;
      const firstEl = focusable[0];
      const lastEl = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === firstEl) {
        e.preventDefault();
        lastEl.focus();
      } else if (!e.shiftKey && document.activeElement === lastEl) {
        e.preventDefault();
        firstEl.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
      previouslyFocused?.focus?.();
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 overflow-y-auto">
      <div className="fixed inset-0 bg-black/80 backdrop-blur-md" onClick={onClose} aria-hidden="true" />

      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        aria-describedby={description ? descriptionId : undefined}
        aria-label={title ? undefined : 'Dialog'}
        tabIndex={-1}
        className={`relative w-full ${maxWidthClasses[maxWidth]} neu-flat-lg rounded-3xl overflow-hidden z-10 my-8 border border-slate-800/80 outline-none`}
      >
        {(title || description) && (
          <div className="flex items-start justify-between p-6 border-b border-slate-800/80 neu-pressed-sm rounded-t-3xl">
            <div>
              {title && (
                <h2 id={titleId} className="text-xl font-black text-slate-100 font-['Outfit']">
                  {title}
                </h2>
              )}
              {description && (
                <p id={descriptionId} className="text-xs sm:text-sm text-slate-400 mt-1">
                  {description}
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close dialog"
              className="neu-btn p-2 rounded-xl text-slate-400 hover:text-rose-400 transition-colors -mr-1 -mt-1"
            >
              <X className="w-5 h-5" aria-hidden="true" />
            </button>
          </div>
        )}

        {!title && !description && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="absolute top-4 right-4 z-20 neu-btn p-2 rounded-xl text-slate-400 hover:text-rose-400 transition-colors"
          >
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        )}

        <div className="p-6 sm:p-8">{children}</div>
      </div>
    </div>
  );
};

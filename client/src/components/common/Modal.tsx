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
  sm: 'sm:max-w-sm',
  md: 'sm:max-w-md',
  lg: 'sm:max-w-lg',
  xl: 'sm:max-w-xl',
  '2xl': 'sm:max-w-2xl',
  '4xl': 'sm:max-w-4xl'
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

  const closeOnBackdrop = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClose();
  };

  // Phones get a bottom sheet, larger screens a centred card. The panel is never taller than the
  // visible screen: the header with the close button stays in place and only the content scrolls,
  // so nothing can end up above the top edge out of reach.
  return (
    <div className="fixed inset-0 z-50">
      <div className="fixed inset-0 bg-black/70 backdrop-blur-md" aria-hidden="true" />

      <div className="fixed inset-0 flex items-end justify-center sm:items-center sm:p-6" onClick={closeOnBackdrop}>
        <div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={title ? titleId : undefined}
          aria-describedby={description ? descriptionId : undefined}
          aria-label={title ? undefined : 'Dialog'}
          tabIndex={-1}
          className={`modal-panel relative flex w-full flex-col ${maxWidthClasses[maxWidth]} neu-flat-lg overflow-hidden border border-slate-800/80 outline-none`}
        >
          {(title || description) && (
            <div className="flex shrink-0 items-start justify-between gap-3 px-5 py-4 sm:p-6 border-b border-slate-800/80 neu-pressed-sm">
              <div className="min-w-0">
                {title && (
                  <h2 id={titleId} className="text-lg sm:text-xl font-black text-slate-100 font-['Outfit'] break-words">
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
                className="shrink-0 neu-btn p-2 rounded-xl text-slate-400 hover:text-rose-400 transition-colors"
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
              className="absolute top-3 right-3 z-20 neu-btn p-2 rounded-xl text-slate-400 hover:text-rose-400 transition-colors"
            >
              <X className="w-5 h-5" aria-hidden="true" />
            </button>
          )}

          <div className="modal-body min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pt-5 sm:px-8 sm:pt-8">{children}</div>
        </div>
      </div>
    </div>
  );
};

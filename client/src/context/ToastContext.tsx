import React, { createContext, useContext, useState, useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import { CheckCircle2, AlertCircle, Info, X, AlertTriangle } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'info' | 'warning';

export interface Toast {
  id: string;
  title?: string;
  message: string;
  type: ToastType;
  /** How long it stays on screen, in ms, not counting time paused. */
  duration: number;
}

interface ToastContextType {
  toasts: Toast[];
  showToast: (message: string, type?: ToastType, title?: string) => void;
  removeToast: (id: string) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

/**
 * Confirmations go after a few seconds. Errors and warnings stay much longer, since they say what
 * went wrong or what to do next, and long messages get extra reading time. Every toast pauses while
 * the pointer is over it, while its dismiss button has focus, and while the tab is in the background.
 */
function durationFor(type: ToastType, text: string): number {
  const readingTime = text.length * 60;
  if (type === 'error' || type === 'warning') return Math.min(Math.max(10_000, readingTime + 4_000), 30_000);
  return Math.min(Math.max(4_500, readingTime), 10_000);
}

const ToastCard: React.FC<{ toast: Toast; paused: boolean; onDismiss: (id: string, byKeyboard?: boolean) => void }> = ({
  toast: t,
  paused,
  onDismiss
}) => {
  const remaining = useRef(t.duration);

  useEffect(() => {
    if (paused) return;
    const started = Date.now();
    const timer = setTimeout(() => onDismiss(t.id), remaining.current);
    return () => {
      clearTimeout(timer);
      remaining.current -= Date.now() - started;
    };
  }, [paused, t.id, onDismiss]);

  return (
    <div
      role={t.type === 'error' ? 'alert' : 'status'}
      // An error card is announced by its alert role. Other cards are read out by the provider's
      // announcer, which is always on the page (a live region added together with its text is not
      // read reliably), so the card itself stays quiet.
      aria-live={t.type === 'error' ? undefined : 'off'}
      aria-atomic="true"
      data-type={t.type}
      data-toast-id={t.id}
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
        // A click from Enter or Space has no click count; a mouse click or a tap has one.
        onClick={e => onDismiss(t.id, e.detail === 0)}
        aria-label="Dismiss notification"
        className="toast-close neu-icon-btn pointer-events-auto shrink-0 w-7 h-7"
      >
        <X className="w-4 h-4" aria-hidden="true" />
      </button>
    </div>
  );
};

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const regionRef = useRef<HTMLDivElement>(null);
  const [isPointerOver, setIsPointerOver] = useState(false);
  const [isFocusWithin, setIsFocusWithin] = useState(false);
  const [isPageHidden, setIsPageHidden] = useState(() => document.hidden);

  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  // Where focus was before it moved into the toasts, to hand it back to.
  const focusOrigin = useRef<HTMLElement | null>(null);
  // The pointer's last position (null once it has left the window), to tell whether it is over a card.
  const lastPointer = useRef<{ x: number; y: number } | null>(null);

  const isPointerOverACard = useCallback((): boolean => {
    const at = lastPointer.current;
    if (!at) return false;
    const cards = regionRef.current?.querySelectorAll('.glass-toast') ?? [];
    return Array.from(cards).some(card => {
      const r = card.getBoundingClientRect();
      return at.x >= r.left && at.x <= r.right && at.y >= r.top && at.y <= r.bottom;
    });
  }, []);

  // The dismiss button a toast goes with may have focus. Keyboard users carry on from the next
  // toast's dismiss button, or go back to where they were before the toasts (else the page). A click
  // or tap just lets focus go: it was only on the button because the button was pressed.
  const dismissToast = useCallback(
    (id: string, byKeyboard = false) => {
      const region = regionRef.current;
      const cards = Array.from(region?.querySelectorAll<HTMLElement>('[data-toast-id]') ?? []);
      const index = cards.findIndex(card => card.dataset.toastId === id);
      const card = cards[index];
      const focused = document.activeElement;
      if (card && focused instanceof HTMLElement && card.contains(focused)) {
        if (byKeyboard) {
          const neighbour = (cards[index + 1] ?? cards[index - 1])?.querySelector<HTMLElement>('.toast-close');
          const origin = focusOrigin.current;
          const target = neighbour ?? (origin?.isConnected && origin !== document.body ? origin : document.getElementById('main'));
          target?.focus({ preventScroll: true });
        } else {
          focused.blur();
        }
      }
      removeToast(id);
    },
    [removeToast]
  );

  // The latest non-error toast, for the always-present polite announcer below. Keyed by toast id so
  // the same message twice in a row is still read out.
  const [announcement, setAnnouncement] = useState<{ id: string; text: string } | null>(null);

  const showToast = useCallback((message: string, type: ToastType = 'info', title?: string) => {
    const id = `toast_${Date.now()}_${Math.random()}`;
    const duration = durationFor(type, title ? `${title} ${message}` : message);
    setToasts(prev => [...prev, { id, message, type, title, duration }]);
    if (type !== 'error') setAnnouncement({ id, text: title ? `${title}. ${message}` : message });
  }, []);

  const hasToasts = toasts.length > 0;

  // Toasts let clicks through to the page (see below), so hovering is worked out from the pointer
  // position rather than from mouse events on the card.
  useEffect(() => {
    if (!hasToasts) {
      // Not tracked while there are no toasts, so the last position is out of date from here on.
      lastPointer.current = null;
      setIsPointerOver(false);
      return;
    }
    const onMove = (e: PointerEvent) => {
      if (e.pointerType === 'touch') return;
      lastPointer.current = { x: e.clientX, y: e.clientY };
      setIsPointerOver(isPointerOverACard());
    };
    const onLeaveWindow = () => {
      lastPointer.current = null;
      setIsPointerOver(false);
    };
    document.addEventListener('pointermove', onMove, { passive: true });
    document.documentElement.addEventListener('pointerleave', onLeaveWindow);
    return () => {
      document.removeEventListener('pointermove', onMove);
      document.documentElement.removeEventListener('pointerleave', onLeaveWindow);
    };
  }, [hasToasts, isPointerOverACard]);

  // Focus and hover are re-read whenever toasts come or go. A toast removed while its dismiss button
  // had focus takes the focus with it without any blur event reaching the region, and one removed
  // from under the pointer leaves it over nothing (or over the card that moved into its place):
  // left to the events alone, every later toast would stay paused.
  useLayoutEffect(() => {
    setIsFocusWithin(Boolean(regionRef.current?.contains(document.activeElement)));
    setIsPointerOver(isPointerOverACard());
  }, [toasts, isPointerOverACard]);

  useEffect(() => {
    const onVisibility = () => setIsPageHidden(document.hidden);
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  const paused = isPointerOver || isFocusWithin || isPageHidden;

  return (
    <ToastContext.Provider value={{ toasts, showToast, removeToast }}>
      {children}
      {/* Phones: full width along the top, below the status bar, in the strip a bottom-sheet dialog
          always leaves free. From 640px: bottom-right corner. Above dialogs (z-50). Toasts never block
          taps on what is underneath; only their dismiss button is clickable. The container is not a
          live region: errors are read out by their alert role and other toasts by the announcer
          below, so each toast is announced once. */}
      <div
        ref={regionRef}
        className="fixed inset-x-0 top-0 z-[70] flex flex-col gap-2 px-3 pt-[max(0.75rem,env(safe-area-inset-top))] pointer-events-none sm:inset-x-auto sm:top-auto sm:right-5 sm:bottom-5 sm:w-[24rem] sm:gap-2.5 sm:px-0 sm:pt-0"
        role="region"
        aria-label="Notifications"
        data-paused={paused || undefined}
        onFocus={e => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) focusOrigin.current = e.relatedTarget as HTMLElement | null;
          setIsFocusWithin(true);
        }}
        onBlur={e => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setIsFocusWithin(false);
        }}
      >
        {toasts.map(t => (
          <ToastCard key={t.id} toast={t} paused={paused} onDismiss={dismissToast} />
        ))}
      </div>
      <div id="toast-announcer" className="sr-only" aria-live="polite">
        {announcement && <p key={announcement.id}>{announcement.text}</p>}
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

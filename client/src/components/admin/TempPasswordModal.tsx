import React, { useEffect, useRef, useState } from 'react';
import { AlertTriangle, Check, Copy } from 'lucide-react';
import { Modal } from '../common/Modal.js';
import { copyText, focusRing } from './ui.js';

interface TempPasswordModalProps {
  /** null hides the modal; the password is dropped from memory when it closes. */
  credentials: { name: string; email: string; password: string; reason: 'created' | 'reset' } | null;
  onClose: () => void;
}

/** Shows a temporary password exactly once, with a copy button. */
export const TempPasswordModal: React.FC<TempPasswordModalProps> = ({ credentials, onClose }) => {
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const [isHeld, setIsHeld] = useState(false);
  const doneRef = useRef<HTMLButtonElement>(null);
  const copyRef = useRef<HTMLButtonElement>(null);

  // Start on Copy, not on the Modal's corner button (focused first by the Modal, whose effect runs
  // before this one): that button cannot close this dialog, and copying is the first thing to do.
  useEffect(() => {
    if (credentials) copyRef.current?.focus();
  }, [credentials]);

  const close = () => {
    setCopyState('idle');
    setIsHeld(false);
    onClose();
  };

  // The password cannot be shown again (the server keeps only its hash), so a stray click outside,
  // Escape or the corner button does not close the dialog; it points at the button that does.
  const holdOpen = () => {
    setIsHeld(true);
    doneRef.current?.focus();
  };

  if (!credentials) return null;

  const copy = async () => {
    setCopyState((await copyText(credentials.password)) ? 'copied' : 'failed');
  };

  return (
    <Modal
      isOpen
      onClose={holdOpen}
      title={credentials.reason === 'created' ? 'Account created' : 'Password reset'}
      description={`Temporary password for ${credentials.name} (${credentials.email}).`}
      maxWidth="md"
    >
      <div className="space-y-5">
        <div className="glass-tint flex items-start gap-3 rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm font-medium text-amber-800 dark:text-amber-300" role="note">
          <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" aria-hidden="true" />
          <p>
            This password is shown only once. Hand it to {credentials.name} in person and ask them to change it after signing in.
            {credentials.reason === 'reset' && ' They have been signed out on every device.'}
          </p>
        </div>

        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-1.5" id="temp-password-label">
            Temporary password
          </p>
          <div className="flex items-stretch gap-2">
            <output aria-labelledby="temp-password-label" className="flex-1 min-w-0 neu-pressed-sm rounded-xl px-4 py-3 font-mono text-base font-bold text-slate-100 break-all select-all">
              {credentials.password}
            </output>
            <button ref={copyRef} type="button" onClick={copy} className={`neu-btn px-4 rounded-xl text-xs font-bold flex items-center gap-1.5 shrink-0 ${focusRing}`}>
              {copyState === 'copied' ? <Check className="w-4 h-4 text-lime-400" aria-hidden="true" /> : <Copy className="w-4 h-4" aria-hidden="true" />}
              {copyState === 'copied' ? 'Copied' : 'Copy'}
            </button>
          </div>
          <p className="mt-1.5 text-xs text-slate-400" role="status">
            {copyState === 'failed' ? 'Could not copy automatically. Select the password and copy it by hand.' : ''}
          </p>
        </div>

        <div className="space-y-2">
          <p className="text-xs font-semibold text-slate-300" role="status">
            {isHeld ? 'Note the password down first: it cannot be shown again. Then close this with the button below.' : ''}
          </p>
          <button ref={doneRef} type="button" onClick={close} className={`w-full py-3 neu-btn-lime rounded-xl text-sm font-black ${focusRing}`}>
            I have noted it down
          </button>
        </div>
      </div>
    </Modal>
  );
};

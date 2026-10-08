import React, { useState } from 'react';
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

  const close = () => {
    setCopyState('idle');
    onClose();
  };

  if (!credentials) return null;

  const copy = async () => {
    setCopyState((await copyText(credentials.password)) ? 'copied' : 'failed');
  };

  return (
    <Modal
      isOpen
      onClose={close}
      title={credentials.reason === 'created' ? 'Account created' : 'Password reset'}
      description={`Temporary password for ${credentials.name} (${credentials.email}).`}
      maxWidth="md"
    >
      <div className="space-y-5">
        <div className="flex items-start gap-3 rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm text-amber-300" role="note">
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
            <button type="button" onClick={copy} className={`neu-btn px-4 rounded-xl text-xs font-bold flex items-center gap-1.5 shrink-0 ${focusRing}`}>
              {copyState === 'copied' ? <Check className="w-4 h-4 text-lime-400" aria-hidden="true" /> : <Copy className="w-4 h-4" aria-hidden="true" />}
              {copyState === 'copied' ? 'Copied' : 'Copy'}
            </button>
          </div>
          <p className="mt-1.5 text-xs text-slate-400" role="status">
            {copyState === 'failed' ? 'Could not copy automatically. Select the password and copy it by hand.' : ''}
          </p>
        </div>

        <button type="button" onClick={close} className={`w-full py-3 neu-btn-lime rounded-xl text-sm font-black ${focusRing}`}>
          I have noted it down
        </button>
      </div>
    </Modal>
  );
};

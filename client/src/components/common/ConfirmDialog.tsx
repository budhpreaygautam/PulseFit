import React, { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Modal } from './Modal.js';

interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  message: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'danger' | 'default';
  onConfirm: () => Promise<void> | void;
  onClose: () => void;
}

/** "Are you sure?" for destructive or costly actions. Stays open with a spinner while onConfirm runs. */
export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  isOpen,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  tone = 'default',
  onConfirm,
  onClose
}) => {
  const [isWorking, setIsWorking] = useState(false);

  const confirm = async () => {
    setIsWorking(true);
    try {
      await onConfirm();
      onClose();
    } finally {
      setIsWorking(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={isWorking ? () => undefined : onClose} title={title} maxWidth="md">
      <div className="text-sm text-slate-300 leading-relaxed">{message}</div>
      <div className="mt-6 flex flex-col-reverse sm:flex-row sm:justify-end gap-3">
        <button type="button" onClick={onClose} disabled={isWorking} className="neu-btn px-5 py-2.5 rounded-xl text-sm font-bold text-slate-200 disabled:opacity-50">
          {cancelLabel}
        </button>
        <button
          type="button"
          onClick={confirm}
          disabled={isWorking}
          className={`px-5 py-2.5 rounded-xl text-sm font-black flex items-center justify-center gap-2 disabled:opacity-60 ${
            tone === 'danger' ? 'bg-rose-500 hover:bg-rose-400 text-white' : 'neu-btn-lime text-black'
          }`}
        >
          {isWorking && <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />}
          {confirmLabel}
        </button>
      </div>
    </Modal>
  );
};

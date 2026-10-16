import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { IdCardDeactivationReason, IdCardEvent, IdCardStatus, IssuedIdCard } from '../../types/index.js';
import { ApiError, api } from '../../api/client.js';
import { Modal } from '../common/Modal.js';
import { Badge } from '../common/Badge.js';
import { useToast } from '../../context/ToastContext.js';
import { DEACTIVATION_REASON_LABELS } from '../qr/idCard.js';
import { FieldError, FormError, focusRing, formErrorsFrom, hintClass, inputClass, labelClass } from './ui.js';

// Issuing, deactivating and reactivating physical ID cards: the confirmation dialogs and small
// pieces shared by the ID cards page and a member's details.

type Holder = { id: string; name: string };

export type IdCardAction =
  // `current` is the person's current card, if any. An active one is replaced by the new card.
  | { kind: 'issue'; holder: Holder; current: IssuedIdCard | null }
  | { kind: 'deactivate'; holder: Holder; card: IssuedIdCard }
  | { kind: 'reactivate'; holder: Holder; card: IssuedIdCard };

type ClientReason = Exclude<IdCardDeactivationReason, 'replaced'>;
// 'replaced' is not offered: the server sets it when a replacement card is issued.
const REASONS: ClientReason[] = ['lost', 'stolen', 'damaged', 'returned', 'other'];
const MAX_NOTE = 200;

const CARD_STATUS: Record<IdCardStatus | 'none', { label: string; variant: 'lime' | 'crimson' | 'slate' }> = {
  active: { label: 'Active', variant: 'lime' },
  deactivated: { label: 'Deactivated', variant: 'crimson' },
  none: { label: 'Not issued', variant: 'slate' }
};

export const CardStatusBadge: React.FC<{ status: IdCardStatus | 'none' }> = ({ status }) => (
  <Badge size="sm" variant={CARD_STATUS[status].variant}>
    {CARD_STATUS[status].label}
  </Badge>
);

/** 'Deactivated (lost)' and the like, for a card's history. */
export function eventLabel(event: IdCardEvent): string {
  const label = { issued: 'Issued', deactivated: 'Deactivated', reactivated: 'Reactivated' }[event.type];
  return event.reason ? `${label} (${DEACTIVATION_REASON_LABELS[event.reason].toLowerCase()})` : label;
}

/**
 * After a card action the cards are reloaded, and the button that opened the action may be gone (a
 * person with a new card has no "Issue card" any more). Then focus moves to `fallback()`, so keyboard
 * users keep their place. Call the returned function with the fallback before reloading; `data` is
 * what the reload replaces.
 */
export function useFocusAfterReload(data: unknown) {
  const fallback = useRef<(() => HTMLElement | null | undefined) | null>(null);
  useEffect(() => {
    const find = fallback.current;
    if (!find) return;
    fallback.current = null;
    const focused = document.activeElement;
    if (!focused || focused === document.body || !focused.isConnected) find()?.focus();
  }, [data]);
  return useCallback((find: () => HTMLElement | null | undefined) => {
    fallback.current = find;
  }, []);
}

interface IdCardActionDialogProps {
  /** The action to confirm; null keeps the dialog closed. */
  action: IdCardAction | null;
  onClose: () => void;
  /** The cards on show are out of date: after a change, and after a conflict the server reported. */
  onChanged: (action: IdCardAction) => void;
}

/** Confirms an issue, deactivation or reactivation, with an optional note for the card's history. */
export const IdCardActionDialog: React.FC<IdCardActionDialogProps> = ({ action, onClose, onChanged }) => {
  const { showToast } = useToast();
  const [reason, setReason] = useState<ClientReason>('lost');
  const [note, setNote] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  const id = useId();

  // Each action starts from an empty form.
  useEffect(() => {
    setReason('lost');
    setNote('');
    setErrors({});
    setFormError(null);
  }, [action]);

  if (!action) return null;

  const name = action.holder.name;
  const replacing = action.kind === 'issue' && action.current?.status === 'active' ? action.current : null;
  const trimmed = note.trim();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSending) return;
    if (trimmed.length > MAX_NOTE) {
      setErrors({ note: `Keep the note to ${MAX_NOTE} characters or fewer.` });
      return;
    }
    setIsSending(true);
    setErrors({});
    setFormError(null);
    const withNote = trimmed ? { note: trimmed } : {};
    try {
      // The server's message names the card, and says when an old card stopped working.
      let result: { message?: string };
      let fallback: string;
      if (action.kind === 'issue') {
        // Naming the card being replaced makes the server refuse if another desk replaced it first.
        result = await api.issueIdCard(action.holder.id, replacing ? { replace: true, replaces_card_id: replacing.id, ...withNote } : withNote);
        fallback = `A new ID card was issued to ${name}.`;
      } else if (action.kind === 'deactivate') {
        result = await api.deactivateIdCard(action.card.id, { reason, ...withNote });
        fallback = `Card ${action.card.card_number} is deactivated and no longer works at check-in.`;
      } else {
        result = await api.reactivateIdCard(action.card.id, withNote);
        fallback = `Card ${action.card.card_number} works again.`;
      }
      showToast(result.message || fallback, 'success');
      onClose();
      onChanged(action);
    } catch (err) {
      // Someone else changed the card first (another admin, another tab), or the person or card is
      // gone: say what the server found, and show the cards as they are now.
      if (err instanceof ApiError && (err.status === 409 || err.status === 404)) {
        showToast(err.message, 'warning', NOT_DONE[action.kind]);
        onClose();
        onChanged(action);
      } else {
        const { fieldErrors, formError: other } = formErrorsFrom(err, ['note', 'reason']);
        setErrors(fieldErrors);
        setFormError(other);
      }
    } finally {
      setIsSending(false);
    }
  };

  let title: string;
  let confirmLabel: string;
  let danger = false;
  let notePlaceholder: string;
  let body: React.ReactNode;
  if (action.kind === 'issue') {
    title = replacing ? 'Replace the ID card?' : action.current ? 'Issue a new ID card?' : 'Issue an ID card?';
    confirmLabel = replacing ? 'Replace card' : 'Issue card';
    danger = replacing !== null;
    notePlaceholder = 'For example: collected at the desk';
    body = (
      <>
        <p>
          <strong>{name}</strong> gets a new card with its own number and QR code. It works at check-in as soon as it is issued, so hand it over now.
        </p>
        {replacing && <Warning className="mt-3">Card {replacing.card_number} stops working at check-in at once. It stays in the history, marked as replaced.</Warning>}
        {action.current && !replacing && <p className="mt-2">Card {action.current.card_number} stays deactivated.</p>}
      </>
    );
  } else if (action.kind === 'deactivate') {
    title = `Deactivate card ${action.card.card_number}?`;
    confirmLabel = 'Deactivate card';
    danger = true;
    notePlaceholder = 'For example: reported lost by phone';
    body = (
      <Warning>
        The card stops working at check-in straight away. {name} can still check in with the app pass, and you can reactivate the card if it turns up.
      </Warning>
    );
  } else {
    title = `Reactivate card ${action.card.card_number}?`;
    confirmLabel = 'Reactivate card';
    notePlaceholder = 'For example: found in the locker room';
    body = (
      <p>
        <strong>{name}</strong> can check in with card {action.card.card_number} again.
      </p>
    );
  }

  const field = (key: string) => `${id}-${key}`;

  return (
    <Modal isOpen onClose={isSending ? () => undefined : onClose} title={title} maxWidth="md">
      <form onSubmit={submit} noValidate className="space-y-4">
        <div className="text-sm text-slate-300 leading-relaxed">{body}</div>
        <FormError message={formError} />

        {action.kind === 'deactivate' && (
          <div>
            <label htmlFor={field('reason')} className={labelClass}>
              Reason
            </label>
            <select
              id={field('reason')}
              value={reason}
              onChange={e => setReason(e.target.value as ClientReason)}
              disabled={isSending}
              className={inputClass}
              aria-invalid={!!errors.reason}
              aria-describedby={errors.reason ? field('reason-error') : undefined}
            >
              {REASONS.map(r => (
                <option key={r} value={r}>
                  {DEACTIVATION_REASON_LABELS[r]}
                </option>
              ))}
            </select>
            <FieldError id={field('reason-error')} message={errors.reason} />
          </div>
        )}

        <div>
          <label htmlFor={field('note')} className={labelClass}>
            Note <span className="normal-case font-semibold tracking-normal text-slate-400">(optional)</span>
          </label>
          <textarea
            id={field('note')}
            rows={2}
            value={note}
            onChange={e => setNote(e.target.value)}
            disabled={isSending}
            placeholder={notePlaceholder}
            className={inputClass}
            aria-invalid={!!errors.note}
            aria-describedby={`${field('note-hint')}${errors.note ? ` ${field('note-error')}` : ''}`}
          />
          <p id={field('note-hint')} className={`${hintClass} flex justify-between gap-3`}>
            <span>Kept in the card's history.</span>
            <span className={trimmed.length > MAX_NOTE ? 'text-rose-400' : ''}>
              {trimmed.length}/{MAX_NOTE}
            </span>
          </p>
          <FieldError id={field('note-error')} message={errors.note} />
        </div>

        <div className="pt-2 flex flex-col-reverse sm:flex-row sm:justify-end gap-3">
          <button type="button" onClick={onClose} disabled={isSending} className={`neu-btn px-5 py-2.5 rounded-xl text-sm font-bold text-slate-200 disabled:opacity-50 ${focusRing}`}>
            Cancel
          </button>
          <button
            type="submit"
            disabled={isSending}
            className={`px-5 py-2.5 rounded-xl text-sm font-black flex items-center justify-center gap-2 disabled:opacity-60 ${focusRing} ${
              danger ? 'neu-btn-danger' : 'neu-btn-lime text-black'
            }`}
          >
            {isSending && <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />}
            {confirmLabel}
          </button>
        </div>
      </form>
    </Modal>
  );
};

const NOT_DONE: Record<IdCardAction['kind'], string> = {
  issue: 'No card issued',
  deactivate: 'Card not deactivated',
  reactivate: 'Card not reactivated'
};

const Warning: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className = '' }) => (
  <p className={`${className} glass-tint flex items-start gap-2 rounded-xl border border-rose-500/40 bg-rose-500/10 p-3 text-sm font-semibold text-rose-700 dark:text-rose-200`}>
    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
    <span>{children}</span>
  </p>
);

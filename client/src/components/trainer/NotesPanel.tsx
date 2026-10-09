import React, { useCallback, useEffect, useState } from 'react';
import { Eye, EyeOff, Loader2, Trash2 } from 'lucide-react';
import { TrainerClient, TrainerNote, TrainerNoteCategory } from '../../types/index.js';
import { ApiError, api, errorMessage } from '../../api/client.js';
import { Badge } from '../common/Badge.js';
import { ConfirmDialog } from '../common/ConfirmDialog.js';
import { EmptyState, ErrorState, LoadingState } from '../common/States.js';
import { FieldError, FormError, focusRing, hintClass, inputClass, labelClass } from '../admin/ui.js';
import { useToast } from '../../context/ToastContext.js';
import { formatDateTime } from '../../lib/format.js';

const CATEGORIES: { value: TrainerNoteCategory; label: string; variant: 'cyan' | 'lime' | 'crimson' | 'slate' }[] = [
  { value: 'assessment', label: 'Assessment', variant: 'cyan' },
  { value: 'progress', label: 'Progress', variant: 'lime' },
  { value: 'injury', label: 'Injury', variant: 'crimson' },
  { value: 'general', label: 'General', variant: 'slate' }
];
const MAX_NOTE = 2000;

/** GET /trainer/notes also names the member, so a note about someone no longer a client still says who. */
type ListedNote = TrainerNote & { member_name?: string | null };

interface NotesPanelProps {
  clients: TrainerClient[];
  /** Set when an admin views a coach's dashboard. */
  trainerId?: string;
  currentUserId?: string;
  isAdmin: boolean;
  memberFilter: string;
  onMemberFilterChange: (memberId: string) => void;
  /** A note was added or removed; client note counts are out of date. */
  onChanged: () => void;
}

function noteError(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.code === 'NOT_YOUR_CLIENT') return 'You can only write notes about members who book your classes.';
    if (err.code === 'NO_TRAINER_PROFILE') return 'Your account is not linked to a coach profile yet. Ask an admin to link it.';
  }
  return errorMessage(err);
}

export const NotesPanel: React.FC<NotesPanelProps> = ({ clients, trainerId, currentUserId, isAdmin, memberFilter, onMemberFilterChange, onChanged }) => {
  // Every note of this coach; "Show notes about" filters them here, so it can offer earlier clients too.
  const [allNotes, setAllNotes] = useState<ListedNote[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [form, setForm] = useState({ member_id: memberFilter, category: 'progress' as TrainerNoteCategory, note: '', visible_to_member: false });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [deleting, setDeleting] = useState<ListedNote | null>(null);
  const { showToast } = useToast();

  const nameOf = (memberId: string, listed?: string | null) => clients.find(c => c.user_id === memberId)?.name ?? listed ?? 'Member';
  // A coach writes only about their own clients; an admin looking at a coach's page reads them.
  const canWrite = !trainerId;

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      setAllNotes(await api.getTrainerNotes(undefined, trainerId));
    } catch (err) {
      setLoadError(noteError(err));
    }
  }, [trainerId]);

  useEffect(() => {
    setAllNotes(null);
    load();
  }, [load]);

  const notes = allNotes && (memberFilter ? allNotes.filter(n => n.member_id === memberFilter) : allNotes);
  // Members the notes are about who are not clients any more (their bookings were all cancelled).
  // A coach can no longer write about them, but can still find what was written.
  const earlierClients = [
    ...new Map(
      (allNotes ?? []).filter(n => !clients.some(c => c.user_id === n.member_id)).map(n => [n.member_id, n.member_name ?? 'Member'])
    )
  ].sort((a, b) => a[1].localeCompare(b[1]));

  // Choosing whose notes to read also picks them for the next note, when they are still a client.
  // Runs on a new choice only, so a client list refreshed after saving keeps the form's own pick.
  useEffect(() => {
    if (memberFilter && clients.some(c => c.user_id === memberFilter)) setForm(f => ({ ...f, member_id: memberFilter }));
  }, [memberFilter]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const found: Record<string, string> = {};
    if (!form.member_id) found.member_id = 'Choose a client.';
    const text = form.note.trim();
    if (!text) found.note = 'Write the note.';
    else if (text.length > MAX_NOTE) found.note = `Keep the note under ${MAX_NOTE} characters.`;
    setErrors(found);
    setFormError(null);
    if (Object.keys(found).length) return;

    setIsSaving(true);
    try {
      await api.createTrainerNote({ member_id: form.member_id, category: form.category, note: text, visible_to_member: form.visible_to_member });
      showToast(`Note saved for ${nameOf(form.member_id)}.`, 'success');
      // Private is the default: a shared note is a choice made for each note, never carried over.
      setForm(f => ({ ...f, note: '', visible_to_member: false }));
      load();
      onChanged();
    } catch (err) {
      if (err instanceof ApiError && err.code === 'NOT_YOUR_CLIENT') setErrors({ member_id: noteError(err) });
      else setFormError(noteError(err));
    } finally {
      setIsSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    try {
      await api.deleteTrainerNote(deleting.id);
      showToast('Note deleted.', 'success');
      // The last note about an earlier client leaves nothing to show under their name.
      const { id, member_id } = deleting;
      const isEarlier = !clients.some(c => c.user_id === member_id);
      if (memberFilter === member_id && isEarlier && !(allNotes ?? []).some(n => n.id !== id && n.member_id === member_id)) onMemberFilterChange('');
    } catch (err) {
      showToast(noteError(err), 'error', 'Could not delete the note');
    }
    load();
    onChanged();
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 items-start">
      {canWrite && (
        <form onSubmit={submit} className="lg:col-span-2 neu-pressed-sm rounded-2xl p-4 sm:p-5 space-y-4" noValidate aria-labelledby="add-note-heading">
          <h3 id="add-note-heading" className="text-sm font-extrabold text-slate-100 font-['Outfit']">Add a note</h3>
          <FormError message={formError} />
          {clients.length === 0 ? (
            <p className="text-xs text-slate-400">Notes can be written for members who book your classes. You have no clients yet.</p>
          ) : (
            <>
              <div>
                <label htmlFor="note-member" className={labelClass}>Client</label>
                <select id="note-member" value={form.member_id} onChange={e => setForm(f => ({ ...f, member_id: e.target.value }))} className={inputClass} aria-invalid={!!errors.member_id} aria-describedby={errors.member_id ? 'note-member-error' : undefined}>
                  <option value="">Choose a client</option>
                  {clients.map(c => (
                    <option key={c.user_id} value={c.user_id}>{c.name}</option>
                  ))}
                </select>
                <FieldError id="note-member-error" message={errors.member_id} />
              </div>
              <div>
                <label htmlFor="note-category" className={labelClass}>Type</label>
                <select id="note-category" value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value as TrainerNoteCategory }))} className={inputClass}>
                  {CATEGORIES.map(c => (
                    <option key={c.value} value={c.value}>{c.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="note-text" className={labelClass}>Note</label>
                <textarea id="note-text" rows={5} value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} className={inputClass} aria-invalid={!!errors.note} aria-describedby={`note-text-count${errors.note ? ' note-text-error' : ''}`} />
                <p id="note-text-count" className={`${hintClass} text-right ${form.note.trim().length > MAX_NOTE ? 'text-rose-400' : ''}`}>
                  {form.note.trim().length}/{MAX_NOTE}
                </p>
                <FieldError id="note-text-error" message={errors.note} />
              </div>
              <label className="flex items-start gap-2 text-sm font-semibold text-slate-200">
                <input type="checkbox" checked={form.visible_to_member} onChange={e => setForm(f => ({ ...f, visible_to_member: e.target.checked }))} className="w-4 h-4 mt-0.5 accent-lime-500" />
                <span>
                  Let the member see this note
                  <span className="block text-xs font-normal text-slate-400">It appears on their dashboard. Leave unticked for private coaching notes.</span>
                </span>
              </label>
              <button type="submit" disabled={isSaving} className={`w-full py-2.5 neu-btn-lime rounded-xl text-sm font-black flex items-center justify-center gap-2 disabled:opacity-60 ${focusRing}`}>
                {isSaving && <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />}
                Save note
              </button>
            </>
          )}
        </form>
      )}

      <div className={`${canWrite ? 'lg:col-span-3' : 'lg:col-span-5'} space-y-3 min-w-0`}>
        <div>
          <label htmlFor="notes-filter" className={labelClass}>Show notes about</label>
          <select id="notes-filter" value={memberFilter} onChange={e => onMemberFilterChange(e.target.value)} className={inputClass}>
            <option value="">All clients</option>
            {clients.map(c => (
              <option key={c.user_id} value={c.user_id}>{c.name}</option>
            ))}
            {earlierClients.length > 0 && (
              <optgroup label="Earlier clients">
                {earlierClients.map(([id, name]) => (
                  <option key={id} value={id}>{name}</option>
                ))}
              </optgroup>
            )}
          </select>
        </div>
        {loadError ? (
          <ErrorState message={loadError} onRetry={load} />
        ) : !notes ? (
          <LoadingState label="Loading notes…" />
        ) : notes.length === 0 ? (
          <EmptyState title={memberFilter ? `No notes about ${nameOf(memberFilter)} yet` : 'No notes yet'} />
        ) : (
          <ul className="space-y-3">
            {notes.map(n => {
              const category = CATEGORIES.find(c => c.value === n.category) ?? CATEGORIES[3];
              const canDelete = isAdmin || n.trainer_user_id === currentUserId;
              return (
                <li key={n.id} className="neu-pressed-sm rounded-2xl p-4 space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-bold text-sm text-slate-100">{nameOf(n.member_id, n.member_name)}</span>
                      <Badge size="sm" variant={category.variant}>{category.label}</Badge>
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-400">
                        {n.visible_to_member ? <Eye className="w-3.5 h-3.5" aria-hidden="true" /> : <EyeOff className="w-3.5 h-3.5" aria-hidden="true" />}
                        {n.visible_to_member ? 'Shared with member' : 'Private'}
                      </span>
                    </div>
                    {canDelete && (
                      <button type="button" onClick={() => setDeleting(n)} className={`p-2 neu-btn rounded-lg hover:text-rose-400 ${focusRing}`} aria-label={`Delete note about ${nameOf(n.member_id, n.member_name)} from ${formatDateTime(n.created_at)}`}>
                        <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                      </button>
                    )}
                  </div>
                  <p className="text-sm text-slate-200 whitespace-pre-wrap break-words">{n.note}</p>
                  <p className="text-[11px] text-slate-400">
                    {n.trainer_name} · {formatDateTime(n.created_at)}
                  </p>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <ConfirmDialog
        isOpen={deleting !== null}
        title="Delete this note?"
        message={deleting && <p>The {deleting.category} note about <strong>{nameOf(deleting.member_id, deleting.member_name)}</strong> is deleted{deleting.visible_to_member ? ' and disappears from their dashboard' : ''}. This cannot be undone.</p>}
        confirmLabel="Delete note"
        tone="danger"
        onConfirm={confirmDelete}
        onClose={() => setDeleting(null)}
      />
    </div>
  );
};

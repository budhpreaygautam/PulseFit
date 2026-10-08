import React, { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Trainer, User } from '../../types/index.js';
import { ApiError, api, errorMessage } from '../../api/client.js';
import { Modal } from '../common/Modal.js';
import { FieldError, FormError, fieldErrorsFrom, focusRing, hintClass, inputClass, labelClass } from './ui.js';

type Form = {
  name: string;
  email: string;
  phone: string;
  specialties: string;
  bio: string;
  experience_years: string;
  avatar_url: string;
  instagram: string;
  user_id: string;
};

const EMPTY: Form = { name: '', email: '', phone: '', specialties: '', bio: '', experience_years: '0', avatar_url: '', instagram: '', user_id: '' };

const toForm = (t: Trainer): Form => ({
  name: t.name,
  email: t.email ?? '',
  phone: t.phone ?? '',
  specialties: (t.specialties ?? []).join(', '),
  bio: t.bio ?? '',
  experience_years: String(t.experience_years ?? 0),
  avatar_url: t.avatar_url ?? '',
  instagram: t.instagram ?? '',
  user_id: t.user_id ?? ''
});

const isHttpUrl = (v: string) => {
  try {
    return ['http:', 'https:'].includes(new URL(v).protocol);
  } catch {
    return false;
  }
};

interface CoachFormModalProps {
  target: Trainer | 'new' | null;
  /** Coaches already linked to a login, so the account picker can leave them out. */
  trainers: Trainer[];
  onClose: () => void;
  onSaved: (message: string) => void;
}

export const CoachFormModal: React.FC<CoachFormModalProps> = ({ target, trainers, onClose, onSaved }) => {
  const [form, setForm] = useState<Form>(EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [accounts, setAccounts] = useState<User[] | null>(null);
  const [accountsError, setAccountsError] = useState<string | null>(null);
  const editing = target && target !== 'new' ? target : null;

  useEffect(() => {
    if (!target) return;
    setForm(target === 'new' ? EMPTY : toForm(target));
    setErrors({});
    setFormError(null);
    setAccountsError(null);
    api
      .getMembers({ role: 'trainer' })
      .then(setAccounts)
      .catch(err => setAccountsError(errorMessage(err)));
  }, [target]);

  if (!target) return null;
  const set = <K extends keyof Form>(key: K, value: Form[K]) => setForm(f => ({ ...f, [key]: value }));

  const linkedElsewhere = new Set(trainers.filter(t => t.user_id && t.id !== editing?.id).map(t => t.user_id));
  const accountOptions = (accounts ?? []).filter(a => !linkedElsewhere.has(a.id));

  const validate = () => {
    const e: Record<string, string> = {};
    const name = form.name.trim();
    if (name.length < 2 || name.length > 60) e.name = 'Enter a name of 2 to 60 characters.';
    if (!/^\S+@\S+\.\S+$/.test(form.email.trim())) e.email = 'Enter a valid email address.';
    if (form.phone.trim().length > 30) e.phone = 'Phone number is too long.';
    const specialties = form.specialties.split(',').map(s => s.trim()).filter(Boolean);
    if (specialties.length > 10 || specialties.some(s => s.length > 60)) e.specialties = 'Up to 10 specialties, each under 60 characters.';
    const bio = form.bio.trim();
    if (bio.length < 1 || bio.length > 1000) e.bio = 'Write a short bio (up to 1,000 characters).';
    const years = form.experience_years.trim();
    if (!/^\d+$/.test(years) || Number(years) > 60) e.experience_years = 'Enter 0 to 60 years.';
    const avatar = form.avatar_url.trim();
    if (avatar ? !isHttpUrl(avatar) : !!editing) e.avatar_url = 'Enter a photo URL starting with https://.';
    if (form.instagram.trim().length > 60) e.instagram = 'Keep the Instagram handle under 60 characters.';
    return e;
  };

  const submit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    const found = validate();
    setErrors(found);
    setFormError(null);
    if (Object.keys(found).length) return;

    const fields = {
      name: form.name.trim(),
      email: form.email.trim(),
      phone: form.phone.trim(),
      specialties: form.specialties.split(',').map(s => s.trim()).filter(Boolean),
      bio: form.bio.trim(),
      experience_years: Number(form.experience_years),
      instagram: form.instagram.trim(),
      ...(form.avatar_url.trim() ? { avatar_url: form.avatar_url.trim() } : {})
    };

    setIsSaving(true);
    try {
      if (editing) {
        const changes: Parameters<typeof api.updateTrainer>[1] = {};
        for (const [key, value] of Object.entries(fields)) {
          const before = editing[key as keyof Trainer];
          if (JSON.stringify(before ?? '') !== JSON.stringify(value)) Object.assign(changes, { [key]: value });
        }
        if ((editing.user_id ?? '') !== form.user_id) changes.user_id = form.user_id || null;
        if (Object.keys(changes).length === 0) {
          onClose();
          return;
        }
        await api.updateTrainer(editing.id, changes);
        onSaved(`${fields.name}'s profile was updated.`);
      } else {
        await api.createTrainer({ ...fields, ...(form.user_id ? { user_id: form.user_id } : {}) });
        onSaved(`${fields.name} was added as a coach.`);
      }
    } catch (err) {
      if (err instanceof ApiError && err.code === 'EMAIL_TAKEN') setErrors({ email: err.message });
      else if (err instanceof ApiError && (err.code === 'USER_NOT_TRAINER' || err.code === 'USER_ALREADY_LINKED')) setErrors({ user_id: err.message });
      else if (err instanceof ApiError && err.code === 'VALIDATION_ERROR' && Object.keys(fieldErrorsFrom(err)).length) setErrors(fieldErrorsFrom(err));
      else setFormError(errorMessage(err));
    } finally {
      setIsSaving(false);
    }
  };

  const common = (key: keyof Form) => ({
    id: `coach-${key}`,
    'aria-invalid': !!errors[key],
    'aria-describedby': errors[key] ? `coach-${key}-error` : undefined,
    className: inputClass
  });
  const field = (key: keyof Form, label: string, input: React.ReactNode, hint?: React.ReactNode) => (
    <div>
      <label htmlFor={`coach-${key}`} className={labelClass}>{label}</label>
      {input}
      {hint && <p className={hintClass}>{hint}</p>}
      <FieldError id={`coach-${key}-error`} message={errors[key]} />
    </div>
  );

  return (
    <Modal isOpen onClose={isSaving ? () => undefined : onClose} title={editing ? `Edit ${editing.name}` : 'Add a coach'} maxWidth="2xl">
      <form onSubmit={submit} className="space-y-4" noValidate>
        <FormError message={formError} />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {field('name', 'Name', <input type="text" value={form.name} onChange={e => set('name', e.target.value)} {...common('name')} />)}
          {field('email', 'Email', <input type="email" value={form.email} onChange={e => set('email', e.target.value)} {...common('email')} />)}
          {field('phone', 'Phone', <input type="tel" value={form.phone} onChange={e => set('phone', e.target.value)} {...common('phone')} />)}
          {field('experience_years', 'Years of experience', <input type="number" inputMode="numeric" min={0} max={60} value={form.experience_years} onChange={e => set('experience_years', e.target.value)} {...common('experience_years')} />)}
        </div>
        {field('specialties', 'Specialties', <input type="text" value={form.specialties} onChange={e => set('specialties', e.target.value)} {...common('specialties')} />, 'Separate with commas, e.g. Powerlifting, Mobility')}
        {field('bio', 'Bio', <textarea rows={3} value={form.bio} onChange={e => set('bio', e.target.value)} {...common('bio')} />)}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {field('avatar_url', 'Photo URL', <input type="url" value={form.avatar_url} onChange={e => set('avatar_url', e.target.value)} placeholder="https://" {...common('avatar_url')} />, editing ? undefined : 'Leave empty for a generated avatar.')}
          {field('instagram', 'Instagram', <input type="text" value={form.instagram} onChange={e => set('instagram', e.target.value)} placeholder="@handle" {...common('instagram')} />)}
        </div>
        {field(
          'user_id',
          'Coach login',
          <select value={form.user_id} onChange={e => set('user_id', e.target.value)} disabled={!accounts && !accountsError} {...common('user_id')}>
            <option value="">Not linked</option>
            {/* Keep the current link selectable even if the account list failed to load. */}
            {form.user_id && !accountOptions.some(a => a.id === form.user_id) && <option value={form.user_id}>Current linked account</option>}
            {accountOptions.map(a => (
              <option key={a.id} value={a.id}>
                {a.name} ({a.email})
              </option>
            ))}
          </select>,
          accountsError
            ? `Could not load coach accounts: ${accountsError}`
            : 'The account this coach signs in with to see their dashboard, rosters and notes. Only accounts with the coach role are listed.'
        )}
        <div className="flex flex-col-reverse sm:flex-row gap-3 pt-4 border-t border-slate-800/80">
          <button type="button" onClick={onClose} disabled={isSaving} className={`flex-1 py-2.5 neu-btn font-bold text-sm rounded-xl disabled:opacity-50 ${focusRing}`}>
            Cancel
          </button>
          <button type="submit" disabled={isSaving} className={`flex-1 py-2.5 neu-btn-lime font-black text-sm rounded-xl flex items-center justify-center gap-2 disabled:opacity-60 ${focusRing}`}>
            {isSaving && <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />}
            {editing ? 'Save coach' : 'Add coach'}
          </button>
        </div>
      </form>
    </Modal>
  );
};

import React, { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { MembershipStatus, MembershipTier, User, UserRole } from '../../types/index.js';
import { ApiError, api } from '../../api/client.js';
import { Modal } from '../common/Modal.js';
import { STATUS_LABELS, TIER_LABELS, gymToday } from '../../lib/format.js';
import { FieldError, FormError, focusRing, formErrorsFrom, hintClass, inputClass, labelClass, sideEffectsOf } from './ui.js';

const TIERS: MembershipTier[] = ['none', 'basic', 'pro', 'vip'];
const STATUSES: MembershipStatus[] = ['active', 'frozen', 'expired', 'pending'];
const ROLES: { value: UserRole; label: string }[] = [
  { value: 'member', label: 'Member' },
  { value: 'trainer', label: 'Coach (trainer)' },
  { value: 'admin', label: 'Admin' }
];

type Errors = Record<string, string>;

// The fields each form shows a FieldError for; any other server issue goes to the form-level error.
const CREATE_FIELDS = ['name', 'email', 'phone', 'expiry_months'];
const EDIT_FIELDS = ['name', 'phone', 'role', 'membership_tier', 'membership_status', 'membership_expiry'];

const FormButtons: React.FC<{ onCancel: () => void; isSaving: boolean; submitLabel: string }> = ({ onCancel, isSaving, submitLabel }) => (
  <div className="flex flex-col-reverse sm:flex-row gap-3 pt-4 border-t border-slate-800/80">
    <button type="button" onClick={onCancel} disabled={isSaving} className={`flex-1 py-2.5 neu-btn font-bold text-sm rounded-xl disabled:opacity-50 ${focusRing}`}>
      Cancel
    </button>
    <button
      type="submit"
      disabled={isSaving}
      className={`flex-1 py-2.5 neu-btn-lime font-black text-sm rounded-xl flex items-center justify-center gap-2 disabled:opacity-60 ${focusRing}`}
    >
      {isSaving && <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />}
      {submitLabel}
    </button>
  </div>
);

const describedBy = (id: string, errors: Errors, key: string, hint?: boolean) =>
  [errors[key] ? `${id}-error` : '', hint ? `${id}-hint` : ''].filter(Boolean).join(' ') || undefined;

// ---------------------------------------------------------------------------------------------

interface CreateMemberModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated: (member: User, tempPassword: string) => void;
}

export const CreateMemberModal: React.FC<CreateMemberModalProps> = ({ isOpen, onClose, onCreated }) => {
  const [form, setForm] = useState({ name: '', email: '', phone: '', role: 'member' as UserRole, membership_tier: 'none' as MembershipTier, expiry_months: '0' });
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setForm({ name: '', email: '', phone: '', role: 'member', membership_tier: 'none', expiry_months: '0' });
      setErrors({});
      setFormError(null);
    }
  }, [isOpen]);

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => setForm(f => ({ ...f, [key]: value }));

  const validate = (): Errors => {
    const e: Errors = {};
    const name = form.name.trim();
    if (name.length < 2 || name.length > 60) e.name = 'Enter a name of 2 to 60 characters.';
    if (!/^\S+@\S+\.\S+$/.test(form.email.trim())) e.email = 'Enter a valid email address.';
    if (form.phone.trim().length > 20) e.phone = 'Phone number is too long.';
    const months = Number(form.expiry_months);
    if (!Number.isInteger(months) || months < 0 || months > 24) e.expiry_months = 'Enter a whole number of months from 0 to 24.';
    return e;
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const found = validate();
    setErrors(found);
    setFormError(null);
    if (Object.keys(found).length) return;

    setIsSaving(true);
    try {
      const res = await api.createMember({
        name: form.name.trim(),
        email: form.email.trim(),
        phone: form.phone.trim() || undefined,
        role: form.role,
        membership_tier: form.membership_tier,
        expiry_months: Number(form.expiry_months)
      });
      onCreated(res.member, res.tempPassword);
    } catch (err) {
      if (err instanceof ApiError && err.code === 'EMAIL_TAKEN') setErrors({ email: err.message });
      else {
        const { fieldErrors, formError } = formErrorsFrom(err, CREATE_FIELDS);
        setErrors(fieldErrors);
        setFormError(formError);
      }
    } finally {
      setIsSaving(false);
    }
  };

  const paid = form.membership_tier !== 'none' && Number(form.expiry_months) > 0;

  return (
    <Modal isOpen={isOpen} onClose={isSaving ? () => undefined : onClose} title="Add a member" description="A temporary password is generated and shown once." maxWidth="md">
      <form onSubmit={submit} className="space-y-4" noValidate>
        <FormError message={formError} />
        <div>
          <label htmlFor="new-name" className={labelClass}>Full name</label>
          <input id="new-name" type="text" autoComplete="off" value={form.name} onChange={e => set('name', e.target.value)} className={inputClass} aria-invalid={!!errors.name} aria-describedby={describedBy('new-name', errors, 'name')} />
          <FieldError id="new-name-error" message={errors.name} />
        </div>
        <div>
          <label htmlFor="new-email" className={labelClass}>Email</label>
          <input id="new-email" type="email" autoComplete="off" value={form.email} onChange={e => set('email', e.target.value)} className={inputClass} aria-invalid={!!errors.email} aria-describedby={describedBy('new-email', errors, 'email')} />
          <FieldError id="new-email-error" message={errors.email} />
        </div>
        <div>
          <label htmlFor="new-phone" className={labelClass}>Phone (optional)</label>
          <input id="new-phone" type="tel" autoComplete="off" value={form.phone} onChange={e => set('phone', e.target.value)} className={inputClass} aria-invalid={!!errors.phone} aria-describedby={describedBy('new-phone', errors, 'phone')} />
          <FieldError id="new-phone-error" message={errors.phone} />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="new-role" className={labelClass}>Role</label>
            <select id="new-role" value={form.role} onChange={e => set('role', e.target.value as UserRole)} className={inputClass}>
              {ROLES.map(r => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="new-tier" className={labelClass}>Plan</label>
            <select id="new-tier" value={form.membership_tier} onChange={e => set('membership_tier', e.target.value as MembershipTier)} className={inputClass}>
              {TIERS.map(t => (
                <option key={t} value={t}>{TIER_LABELS[t]}</option>
              ))}
            </select>
          </div>
        </div>
        <div>
          <label htmlFor="new-months" className={labelClass}>Months of access</label>
          <input id="new-months" type="number" inputMode="numeric" min={0} max={24} step={1} value={form.expiry_months} onChange={e => set('expiry_months', e.target.value)} className={inputClass} aria-invalid={!!errors.expiry_months} aria-describedby={describedBy('new-months', errors, 'expiry_months', true)} />
          <p id="new-months-hint" className={hintClass}>
            {paid
              ? 'The membership starts today as active, with no payment recorded.'
              : 'With no plan or 0 months the account starts without access until a plan is bought.'}
          </p>
          <FieldError id="new-months-error" message={errors.expiry_months} />
        </div>
        <FormButtons onCancel={onClose} isSaving={isSaving} submitLabel="Add member" />
      </form>
    </Modal>
  );
};

// ---------------------------------------------------------------------------------------------

interface EditMemberModalProps {
  member: User | null;
  currentUserId: string | undefined;
  onClose: () => void;
  /** `notice` is what the save did besides saving, e.g. "2 upcoming bookings were cancelled." */
  onSaved: (member: User, notice?: string) => void;
}

export const EditMemberModal: React.FC<EditMemberModalProps> = ({ member, currentUserId, onClose, onSaved }) => {
  const [form, setForm] = useState({ name: '', phone: '', role: 'member' as UserRole, membership_tier: 'none' as MembershipTier, membership_status: 'pending' as MembershipStatus, expiry: '', noExpiry: false });
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!member) return;
    setForm({
      name: member.name,
      phone: member.phone ?? '',
      role: member.role,
      membership_tier: member.membership_tier,
      membership_status: member.membership_status,
      expiry: member.membership_expiry ?? '',
      noExpiry: member.membership_expiry === null
    });
    setErrors({});
    setFormError(null);
  }, [member]);

  if (!member) return null;
  const isSelf = member.id === currentUserId;
  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => setForm(f => ({ ...f, [key]: value }));
  // Unfreezing with the date left alone: the server moves the expiry on by the days spent frozen,
  // so an old date that has passed may still end up in the future. If not, the server says so.
  const unfreezesWithOldExpiry =
    member.membership_status === 'frozen' && form.membership_status === 'active' && !form.noExpiry && form.expiry === member.membership_expiry;
  // Like the server, the membership rules apply only when the plan, status or expiry changes.
  const touchesMembership =
    form.membership_tier !== member.membership_tier ||
    form.membership_status !== member.membership_status ||
    (form.noExpiry ? null : form.expiry) !== member.membership_expiry;
  // What the server cancels on save, said before the admin presses it (the count comes back after).
  const bookingWarning =
    form.membership_status === 'frozen' && member.membership_status !== 'frozen'
      ? `Freezing cancels ${member.name}'s upcoming class bookings.`
      : member.membership_tier !== 'none' && form.membership_tier !== member.membership_tier
      ? 'Changing the plan cancels upcoming bookings for classes the new plan does not include.'
      : null;
  // A renewal that keeps the status Expired: a member whose plan ran out reads Expired here, so
  // moving only the date on leaves them locked out. Easy to miss, so it is a warning with a fix.
  const expiredWithAccessDate = form.membership_status === 'expired' && !form.noExpiry && !!form.expiry && form.expiry >= gymToday();

  const validate = (): Errors => {
    const e: Errors = {};
    const name = form.name.trim();
    if (name.length < 2 || name.length > 60) e.name = 'Enter a name of 2 to 60 characters.';
    if (form.phone.trim().length > 20) e.phone = 'Phone number is too long.';
    if (!form.noExpiry && !form.expiry) e.membership_expiry = 'Pick a date, or tick "No expiry date".';
    else if (form.membership_status === 'active' && (form.noExpiry || (form.expiry < gymToday() && !unfreezesWithOldExpiry))) {
      e.membership_expiry = 'An active membership needs an expiry date of today or later.';
    }
    if (touchesMembership && form.membership_status === 'active' && form.membership_tier === 'none') {
      e.membership_tier = 'Choose a plan for an active membership.';
    }
    return e;
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const found = validate();
    setErrors(found);
    setFormError(null);
    if (Object.keys(found).length) return;

    const expiry = form.noExpiry ? null : form.expiry;
    const changes: Parameters<typeof api.updateMember>[1] = {};
    if (form.name.trim() !== member.name) changes.name = form.name.trim();
    if (form.phone.trim() !== (member.phone ?? '')) changes.phone = form.phone.trim();
    if (form.role !== member.role) changes.role = form.role;
    if (form.membership_tier !== member.membership_tier) changes.membership_tier = form.membership_tier;
    if (expiry !== member.membership_expiry) changes.membership_expiry = expiry;
    // Any membership change carries the status as shown. The list shows the effective status, so a
    // member whose plan ran out reads "Expired" here while still stored as active; sending it tells
    // the server what the admin sees and means.
    if (touchesMembership) changes.membership_status = form.membership_status;
    if (Object.keys(changes).length === 0) {
      onClose();
      return;
    }

    setIsSaving(true);
    try {
      const { data, message } = await api.updateMember(member.id, changes);
      // Said after a membership change only, not after a lapsed member's phone number or name is fixed.
      const lockedOut =
        changes.membership_status !== undefined && data.membership_status === 'expired' && !!data.membership_expiry && data.membership_expiry >= gymToday()
          ? `${data.name} is marked Expired, so they cannot check in or book until the status is Active.`
          : undefined;
      onSaved(data, [sideEffectsOf(message), lockedOut].filter(Boolean).join(' ') || undefined);
    } catch (err) {
      if (err instanceof ApiError && (err.code === 'CANNOT_CHANGE_OWN_ROLE' || err.code === 'LAST_ADMIN')) setErrors({ role: err.message });
      else {
        const { fieldErrors, formError } = formErrorsFrom(err, EDIT_FIELDS);
        setErrors(fieldErrors);
        setFormError(formError);
      }
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Modal isOpen onClose={isSaving ? () => undefined : onClose} title={`Edit ${member.name}`} description={member.email} maxWidth="md">
      <form onSubmit={submit} className="space-y-4" noValidate>
        <FormError message={formError} />
        <div>
          <label htmlFor="edit-name" className={labelClass}>Full name</label>
          <input id="edit-name" type="text" value={form.name} onChange={e => set('name', e.target.value)} className={inputClass} aria-invalid={!!errors.name} aria-describedby={describedBy('edit-name', errors, 'name')} />
          <FieldError id="edit-name-error" message={errors.name} />
        </div>
        <div>
          <label htmlFor="edit-phone" className={labelClass}>Phone</label>
          <input id="edit-phone" type="tel" value={form.phone} onChange={e => set('phone', e.target.value)} className={inputClass} aria-invalid={!!errors.phone} aria-describedby={describedBy('edit-phone', errors, 'phone')} />
          <FieldError id="edit-phone-error" message={errors.phone} />
        </div>
        <div>
          <label htmlFor="edit-role" className={labelClass}>Role</label>
          <select id="edit-role" value={form.role} disabled={isSelf} onChange={e => set('role', e.target.value as UserRole)} className={inputClass} aria-invalid={!!errors.role} aria-describedby={describedBy('edit-role', errors, 'role', isSelf)}>
            {ROLES.map(r => (
              <option key={r.value} value={r.value}>{r.label}</option>
            ))}
          </select>
          {isSelf && <p id="edit-role-hint" className={hintClass}>You cannot change your own role. Ask another admin.</p>}
          <FieldError id="edit-role-error" message={errors.role} />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="edit-tier" className={labelClass}>Plan</label>
            <select
              id="edit-tier"
              value={form.membership_tier}
              onChange={e => set('membership_tier', e.target.value as MembershipTier)}
              className={inputClass}
              aria-invalid={!!errors.membership_tier}
              aria-describedby={describedBy('edit-tier', errors, 'membership_tier')}
            >
              {TIERS.map(t => (
                <option key={t} value={t}>{TIER_LABELS[t]}</option>
              ))}
            </select>
            <FieldError id="edit-tier-error" message={errors.membership_tier} />
          </div>
          <div>
            <label htmlFor="edit-status" className={labelClass}>Status</label>
            <select
              id="edit-status"
              value={form.membership_status}
              onChange={e => set('membership_status', e.target.value as MembershipStatus)}
              className={inputClass}
              aria-invalid={!!errors.membership_status}
              aria-describedby={describedBy('edit-status', errors, 'membership_status')}
            >
              {STATUSES.map(s => (
                <option key={s} value={s}>{STATUS_LABELS[s]}</option>
              ))}
            </select>
            <FieldError id="edit-status-error" message={errors.membership_status} />
          </div>
        </div>
        {bookingWarning && (
          <p className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-xs font-semibold text-amber-800 dark:text-amber-300" role="note">
            {bookingWarning}
          </p>
        )}
        <div>
          <label htmlFor="edit-expiry" className={labelClass}>Last day of access</label>
          <input
            id="edit-expiry"
            type="date"
            value={form.noExpiry ? '' : form.expiry}
            disabled={form.noExpiry}
            onChange={e => set('expiry', e.target.value)}
            className={inputClass}
            aria-invalid={!!errors.membership_expiry}
            aria-describedby={describedBy('edit-expiry', errors, 'membership_expiry', true)}
          />
          <label className="mt-2 flex items-center gap-2 text-xs font-semibold text-slate-300">
            <input type="checkbox" checked={form.noExpiry} onChange={e => set('noExpiry', e.target.checked)} className="w-4 h-4 accent-lime-500" />
            No expiry date (no plan bought yet)
          </label>
          {expiredWithAccessDate ? (
            <div id="edit-expiry-hint" className="glass-tint mt-2 space-y-2 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-xs font-semibold text-amber-800 dark:text-amber-300" role="note">
              <p>The status is Expired, so {member.name} cannot check in or book, even with this date.</p>
              <button
                type="button"
                onClick={() => {
                  set('membership_status', 'active');
                  // The note (and this button) goes away; focus lands on the field that changed.
                  document.getElementById('edit-status')?.focus();
                }}
                className={`neu-btn px-3 py-1.5 rounded-lg text-xs font-bold ${focusRing}`}
              >
                Set status to Active
              </button>
            </div>
          ) : (
            <p id="edit-expiry-hint" className={hintClass}>
              Setting a frozen member to active without changing this date gives back the open gym days they missed while frozen (not the day of the freeze, today, or Sundays).
            </p>
          )}
          <FieldError id="edit-expiry-error" message={errors.membership_expiry} />
        </div>
        <FormButtons onCancel={onClose} isSaving={isSaving} submitLabel="Save changes" />
      </form>
    </Modal>
  );
};

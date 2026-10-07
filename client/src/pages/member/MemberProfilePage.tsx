import React, { useEffect, useRef, useState } from 'react';
import { Award, Check, Copy, CreditCard, FileText, KeyRound, QrCode, Upload, User as UserIcon } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.js';
import { useToast } from '../../context/ToastContext.js';
import { useNavigation } from '../../context/NavigationContext.js';
import { api, isApiError } from '../../api/client.js';
import { Payment, User } from '../../types/index.js';
import { ConfirmDialog } from '../../components/common/ConfirmDialog.js';
import { EmptyState, ErrorState, LoadingState } from '../../components/common/States.js';
import { DigitalQrPassModal } from '../../components/qr/DigitalQrPassModal.js';
import { MembershipStatusBadge } from '../../components/member/MembershipStatusBadge.js';
import { InvoiceModal } from '../../components/member/InvoiceModal.js';
import { useApiResource } from '../../components/member/useApiResource.js';
import { resizeAvatar } from '../../components/member/avatarImage.js';
import { copyText } from '../../components/member/clipboard.js';
import { formatDate, formatDateTime, formatINR, TIER_LABELS } from '../../lib/format.js';

interface MemberProfilePageProps {
  setCurrentTab: (tab: string) => void;
}

type TabId = 'details' | 'membership' | 'billing' | 'security';

const TABS: { id: TabId; label: string; icon: React.ReactNode }[] = [
  { id: 'details', label: 'Profile', icon: <UserIcon className="w-4 h-4" aria-hidden="true" /> },
  { id: 'membership', label: 'Membership', icon: <Award className="w-4 h-4" aria-hidden="true" /> },
  { id: 'billing', label: 'Invoices & billing', icon: <CreditCard className="w-4 h-4" aria-hidden="true" /> },
  { id: 'security', label: 'Password', icon: <KeyRound className="w-4 h-4" aria-hidden="true" /> }
];

const CYCLE_LABELS: Record<string, string> = { monthly: 'Monthly', annual: 'Annual' };
const PHONE_PATTERN = /^\+?[0-9][0-9\s()-]{6,19}$/;
type Issues = { path: string; message: string }[];
const issuesOf = (err: unknown): Issues => (isApiError(err) ? ((err.data as { issues?: Issues } | undefined)?.issues ?? []) : []);

/** Same rules as the server: 8–72 characters, at most 72 UTF-8 bytes, a letter and a digit. */
function passwordProblem(password: string): string | null {
  if (password.length < 8) return 'Use at least 8 characters.';
  if (new TextEncoder().encode(password).length > 72) return 'Your password is too long. Use fewer or simpler characters.';
  if (!/[A-Za-z]/.test(password)) return 'Include at least one letter.';
  if (!/\d/.test(password)) return 'Include at least one digit.';
  return null;
}

const inputClass = (invalid: boolean) =>
  `w-full px-4 py-2.5 rounded-xl text-sm text-slate-100 placeholder-slate-500 ${invalid ? 'outline outline-2 outline-rose-500/80' : ''}`;

const FieldError: React.FC<{ id: string; message?: string | null }> = ({ id, message }) =>
  message ? (
    <p id={id} className="text-xs text-rose-600 dark:text-rose-300 mt-1">
      {message}
    </p>
  ) : null;

// ---------------------------------------------------------------------------------------------

const ProfileDetails: React.FC<{ user: User; onOpenPass: () => void }> = ({ user, onOpenPass }) => {
  const { updateUser } = useAuth();
  const { showToast } = useToast();
  const [name, setName] = useState(user.name);
  const [phone, setPhone] = useState(user.phone ?? '');
  const [errors, setErrors] = useState<{ name?: string; phone?: string; form?: string }>({});
  const [isSaving, setIsSaving] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setName(user.name);
    setPhone(user.phone ?? '');
  }, [user.name, user.phone]);

  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(t);
  }, [copied]);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const changes: { name?: string; phone?: string } = {};
    const next: typeof errors = {};
    const trimmedName = name.trim();
    const trimmedPhone = phone.trim();
    if (trimmedName.length < 2 || trimmedName.length > 60) next.name = 'Your name needs 2 to 60 characters.';
    if (trimmedPhone && (trimmedPhone.length > 20 || !PHONE_PATTERN.test(trimmedPhone))) next.phone = 'Enter a valid phone number, for example +91 98110 12345.';
    setErrors(next);
    if (next.name || next.phone) return;

    if (trimmedName !== user.name) changes.name = trimmedName;
    if (trimmedPhone !== (user.phone ?? '')) changes.phone = trimmedPhone;
    if (Object.keys(changes).length === 0) {
      showToast('Nothing has changed.', 'info');
      return;
    }

    setIsSaving(true);
    try {
      updateUser(await api.updateProfile(changes));
      showToast('Your profile was updated.', 'success');
    } catch (err) {
      const issues = issuesOf(err);
      setErrors({
        name: issues.find(i => i.path === 'name')?.message,
        phone: issues.find(i => i.path === 'phone')?.message,
        form: issues.length ? undefined : isApiError(err) ? err.message : 'Your profile could not be saved.'
      });
    } finally {
      setIsSaving(false);
    }
  };

  const copyPass = async () => {
    if (await copyText(user.qr_code_token)) {
      setCopied(true);
      showToast('Pass code copied.', 'success');
    } else {
      showToast('Your browser blocked copying. Select the code and copy it by hand.', 'error');
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
      <form onSubmit={save} noValidate className="lg:col-span-8 neu-flat p-5 sm:p-8 rounded-3xl space-y-5">
        <h2 className="text-lg font-black text-slate-100 font-['Outfit']">Personal details</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="profile-name" className="block text-xs font-bold text-slate-300 mb-1.5">Full name</label>
            <input
              id="profile-name"
              type="text"
              autoComplete="name"
              value={name}
              maxLength={60}
              onChange={e => setName(e.target.value)}
              aria-invalid={Boolean(errors.name)}
              aria-describedby={errors.name ? 'profile-name-error' : undefined}
              className={inputClass(Boolean(errors.name))}
            />
            <FieldError id="profile-name-error" message={errors.name} />
          </div>
          <div>
            <label htmlFor="profile-phone" className="block text-xs font-bold text-slate-300 mb-1.5">Phone (optional)</label>
            <input
              id="profile-phone"
              type="tel"
              autoComplete="tel"
              value={phone}
              maxLength={20}
              onChange={e => setPhone(e.target.value)}
              placeholder="+91 98110 12345"
              aria-invalid={Boolean(errors.phone)}
              aria-describedby={errors.phone ? 'profile-phone-error' : undefined}
              className={inputClass(Boolean(errors.phone))}
            />
            <FieldError id="profile-phone-error" message={errors.phone} />
          </div>
        </div>
        <div>
          <label htmlFor="profile-email" className="block text-xs font-bold text-slate-300 mb-1.5">Email</label>
          <input id="profile-email" type="email" value={user.email} readOnly aria-describedby="profile-email-hint" className="w-full px-4 py-2.5 rounded-xl text-sm text-slate-400" />
          <p id="profile-email-hint" className="text-[11px] text-slate-500 mt-1">Your sign-in email. Ask the front desk to change it.</p>
        </div>
        {errors.form && (
          <p role="alert" className="text-sm text-rose-600 dark:text-rose-300">
            {errors.form}
          </p>
        )}
        <button type="submit" disabled={isSaving} className="neu-btn-lime px-6 py-3 rounded-xl text-xs font-extrabold disabled:opacity-50">
          {isSaving ? 'Saving…' : 'Save changes'}
        </button>
      </form>

      <section aria-labelledby="pass-heading" className="lg:col-span-4 neu-flat p-5 sm:p-6 rounded-3xl space-y-4">
        <h2 id="pass-heading" className="text-sm font-extrabold text-slate-100 font-['Outfit'] flex items-center gap-2">
          <QrCode className="w-4 h-4 text-lime-700 dark:text-lime-400" aria-hidden="true" /> Check-in pass
        </h2>
        <p className="text-xs text-slate-400">The front desk scans this code (or types it in) to check you in.</p>
        <div className="p-3 neu-pressed-sm rounded-xl flex items-center justify-between gap-2">
          <code className="font-mono text-xs font-bold text-slate-200 break-all select-all">{user.qr_code_token}</code>
          <button type="button" onClick={copyPass} aria-label="Copy pass code" className="neu-btn p-2 rounded-lg shrink-0">
            {copied ? <Check className="w-4 h-4 text-lime-700 dark:text-lime-400" aria-hidden="true" /> : <Copy className="w-4 h-4" aria-hidden="true" />}
          </button>
        </div>
        <button type="button" onClick={onOpenPass} className="w-full neu-btn py-2.5 rounded-xl text-xs font-bold">
          Show QR code
        </button>
      </section>
    </div>
  );
};

// ---------------------------------------------------------------------------------------------

const MembershipPanel: React.FC<{ user: User; onOpenPricing: () => void }> = ({ user, onOpenPricing }) => {
  const { updateUser, refreshUser } = useAuth();
  const { showToast } = useToast();
  const plans = useApiResource(() => api.getPlans());
  const [confirm, setConfirm] = useState<'freeze' | 'unfreeze' | null>(null);

  const plan = plans.data?.find(p => p.tier === user.membership_tier);
  const status = user.membership_status;

  const run = async () => {
    try {
      const next = confirm === 'freeze' ? await api.freezeMembership() : await api.unfreezeMembership();
      updateUser(next);
      showToast(
        confirm === 'freeze'
          ? 'Your membership is frozen. Unfreeze it whenever you are ready to train again.'
          : `Welcome back. Your membership now runs until ${formatDate(next.membership_expiry)}.`,
        'success'
      );
    } catch (err) {
      if (isApiError(err) && (err.code === 'NOT_ACTIVE' || err.code === 'NOT_FROZEN')) {
        showToast(err.message, 'warning');
        refreshUser();
      } else {
        showToast(isApiError(err) ? err.message : 'Your membership could not be changed.', 'error');
      }
    }
  };

  const planAction = status === 'expired' ? 'Renew membership' : status === 'pending' || user.membership_tier === 'none' ? 'Choose a plan' : 'Change plan';

  return (
    <section aria-labelledby="membership-heading" className="neu-flat p-5 sm:p-8 rounded-3xl space-y-6 max-w-3xl">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div>
          <h2 id="membership-heading" className="text-lg font-black text-slate-100 font-['Outfit']">
            {plan?.name ?? TIER_LABELS[user.membership_tier] ?? user.membership_tier}
          </h2>
          {plan?.description && <p className="text-xs text-slate-400 mt-1">{plan.description}</p>}
        </div>
        <MembershipStatusBadge status={status} className="self-start" />
      </div>

      <dl className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="neu-pressed-sm rounded-2xl p-4">
          <dt className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Plan</dt>
          <dd className="text-sm font-bold text-slate-100 mt-1">{TIER_LABELS[user.membership_tier] ?? user.membership_tier}</dd>
        </div>
        <div className="neu-pressed-sm rounded-2xl p-4">
          <dt className="text-[11px] font-bold uppercase tracking-wider text-slate-400">{status === 'expired' ? 'Ended on' : 'Valid through'}</dt>
          <dd className="text-sm font-bold text-slate-100 mt-1">{user.membership_expiry ? formatDate(user.membership_expiry) : 'No paid period yet'}</dd>
        </div>
        <div className="neu-pressed-sm rounded-2xl p-4">
          <dt className="text-[11px] font-bold uppercase tracking-wider text-slate-400">{status === 'frozen' ? 'Frozen since' : 'Includes'}</dt>
          <dd className="text-sm font-bold text-slate-100 mt-1">
            {status === 'frozen'
              ? formatDate(user.frozen_since ?? null)
              : plan
                ? plan.categories.length === 0
                  ? 'All classes and floors'
                  : plan.categories.join(', ')
                : plans.error
                  ? 'Could not load plan details'
                  : user.membership_tier === 'none'
                    ? 'Nothing yet'
                    : '…'}
          </dd>
        </div>
      </dl>

      {status === 'frozen' && (
        <p className="text-sm text-slate-300">
          While frozen you cannot check in, book classes or clock in. When you unfreeze, the days spent frozen are added to the end of your membership.
        </p>
      )}

      <div className="flex flex-col sm:flex-row gap-3">
        <button type="button" onClick={onOpenPricing} className="neu-btn-lime px-5 py-3 rounded-xl text-xs font-extrabold">
          {planAction}
        </button>
        {status === 'active' && (
          <button type="button" onClick={() => setConfirm('freeze')} className="neu-btn px-5 py-3 rounded-xl text-xs font-bold">
            Freeze membership
          </button>
        )}
        {status === 'frozen' && (
          <button type="button" onClick={() => setConfirm('unfreeze')} className="neu-btn px-5 py-3 rounded-xl text-xs font-bold">
            Unfreeze membership
          </button>
        )}
      </div>

      <ConfirmDialog
        isOpen={confirm !== null}
        title={confirm === 'freeze' ? 'Freeze your membership?' : 'Unfreeze your membership?'}
        message={
          confirm === 'freeze' ? (
            <>
              From today you will not be able to check in, book classes or clock in until you unfreeze. Nothing is lost: when you unfreeze, every day spent frozen is added back to
              your membership, so your end date moves later by that many days.
            </>
          ) : (
            <>
              Your membership becomes active again today. The days it was frozen{user.frozen_since ? ` (since ${formatDate(user.frozen_since)})` : ''} are added to your end date.
            </>
          )
        }
        confirmLabel={confirm === 'freeze' ? 'Freeze membership' : 'Unfreeze'}
        onConfirm={run}
        onClose={() => setConfirm(null)}
      />
    </section>
  );
};

// ---------------------------------------------------------------------------------------------

const BillingPanel: React.FC<{ onOpenPricing: () => void }> = ({ onOpenPricing }) => {
  const payments = useApiResource(() => api.getMyPayments());
  const [open, setOpen] = useState<Payment | null>(null);

  let body: React.ReactNode;
  if (!payments.data && payments.error) body = <ErrorState message={payments.error} onRetry={payments.reload} />;
  else if (!payments.data) body = <LoadingState label="Loading your invoices…" />;
  else if (payments.data.length === 0)
    body = (
      <EmptyState
        title="No payments yet"
        body="Invoices appear here after you buy or renew a membership online."
        action={
          <button type="button" onClick={onOpenPricing} className="neu-btn-lime px-4 py-2 rounded-xl text-xs font-extrabold">
            See memberships
          </button>
        }
      />
    );
  else
    body = (
      <ul className="space-y-3">
        {payments.data.map(p => (
          <li key={p.id} className="neu-pressed-sm rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="flex-1 min-w-0 space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-mono text-xs font-bold text-slate-200">{p.invoice_number}</span>
                {p.status === 'refunded' && <span className="text-[11px] font-bold text-amber-700 dark:text-amber-300">Refunded</span>}
              </div>
              <p className="text-sm font-bold text-slate-100">
                {p.plan_name} · {CYCLE_LABELS[p.billing_cycle] ?? p.billing_cycle}
              </p>
              <p className="text-xs text-slate-400">
                {formatDate(p.period_start)} – {formatDate(p.period_end)} · paid {formatDateTime(p.created_at)}
              </p>
            </div>
            <div className="flex items-center justify-between sm:justify-end gap-4">
              <span className="font-mono text-base font-black text-slate-100">{formatINR(p.amount_inr)}</span>
              <button
                type="button"
                onClick={() => setOpen(p)}
                aria-label={`View invoice ${p.invoice_number}`}
                className="neu-btn px-3 py-2 rounded-xl text-xs font-bold inline-flex items-center gap-1.5"
              >
                <FileText className="w-3.5 h-3.5" aria-hidden="true" /> Invoice
              </button>
            </div>
          </li>
        ))}
      </ul>
    );

  return (
    <section aria-labelledby="billing-heading" className="neu-flat p-5 sm:p-8 rounded-3xl space-y-5">
      <div>
        <h2 id="billing-heading" className="text-lg font-black text-slate-100 font-['Outfit']">Invoices & billing</h2>
        <p className="text-xs text-slate-400 mt-1">Every membership payment, newest first. Open one to print it or save it as a PDF.</p>
      </div>
      {body}
      <InvoiceModal payment={open} onClose={() => setOpen(null)} />
    </section>
  );
};

// ---------------------------------------------------------------------------------------------

const PasswordPanel: React.FC = () => {
  const { changePassword } = useAuth();
  const { showToast } = useToast();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirmValue, setConfirmValue] = useState('');
  const [errors, setErrors] = useState<{ current?: string; next?: string; confirm?: string; form?: string }>({});
  const [isSaving, setIsSaving] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const found: typeof errors = {};
    const problem = passwordProblem(next);
    if (problem) found.next = problem;
    else if (current && next === current) found.next = 'Choose a password different from your current one.';
    if (next !== confirmValue) found.confirm = 'The two new passwords do not match.';
    setErrors(found);
    if (Object.values(found).some(Boolean)) return;

    setIsSaving(true);
    try {
      await changePassword(current || undefined, next);
      setCurrent('');
      setNext('');
      setConfirmValue('');
      showToast('Password changed. Other devices have been signed out.', 'success');
    } catch (err) {
      if (isApiError(err) && err.code === 'WRONG_PASSWORD') {
        setErrors({ current: err.message });
      } else if (isApiError(err) && err.code === 'VALIDATION_ERROR') {
        const issues = issuesOf(err);
        setErrors({
          current: issues.find(i => i.path === 'currentPassword')?.message,
          next: issues.find(i => i.path === 'newPassword')?.message,
          form: issues.length ? undefined : err.message
        });
      } else {
        setErrors({ form: isApiError(err) ? err.message : 'Your password could not be changed.' });
      }
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <form onSubmit={submit} noValidate aria-labelledby="password-heading" className="max-w-2xl neu-flat p-5 sm:p-8 rounded-3xl space-y-5">
      <div>
        <h2 id="password-heading" className="text-lg font-black text-slate-100 font-['Outfit']">Change password</h2>
        <p className="text-xs text-slate-400 mt-1">Changing your password signs you out on every other device.</p>
      </div>
      <div>
        <label htmlFor="pw-current" className="block text-xs font-bold text-slate-300 mb-1.5">Current password</label>
        <input
          id="pw-current"
          type="password"
          autoComplete="current-password"
          value={current}
          onChange={e => setCurrent(e.target.value)}
          aria-invalid={Boolean(errors.current)}
          aria-describedby={`pw-current-hint${errors.current ? ' pw-current-error' : ''}`}
          className={inputClass(Boolean(errors.current))}
        />
        <p id="pw-current-hint" className="text-[11px] text-slate-500 mt-1">
          Leave this empty only if you have always signed in with Google and never set a password.
        </p>
        <FieldError id="pw-current-error" message={errors.current} />
      </div>
      <div>
        <label htmlFor="pw-new" className="block text-xs font-bold text-slate-300 mb-1.5">New password</label>
        <input
          id="pw-new"
          type="password"
          autoComplete="new-password"
          value={next}
          onChange={e => setNext(e.target.value)}
          aria-invalid={Boolean(errors.next)}
          aria-describedby={`pw-new-hint${errors.next ? ' pw-new-error' : ''}`}
          className={inputClass(Boolean(errors.next))}
        />
        <p id="pw-new-hint" className="text-[11px] text-slate-500 mt-1">
          8 to 72 characters, with at least one letter and one digit.
        </p>
        <FieldError id="pw-new-error" message={errors.next} />
      </div>
      <div>
        <label htmlFor="pw-confirm" className="block text-xs font-bold text-slate-300 mb-1.5">Repeat new password</label>
        <input
          id="pw-confirm"
          type="password"
          autoComplete="new-password"
          value={confirmValue}
          onChange={e => setConfirmValue(e.target.value)}
          aria-invalid={Boolean(errors.confirm)}
          aria-describedby={errors.confirm ? 'pw-confirm-error' : undefined}
          className={inputClass(Boolean(errors.confirm))}
        />
        <FieldError id="pw-confirm-error" message={errors.confirm} />
      </div>
      {errors.form && (
        <p role="alert" className="text-sm text-rose-600 dark:text-rose-300">
          {errors.form}
        </p>
      )}
      {(errors.current || errors.next || errors.confirm) && (
        <p role="alert" className="sr-only">
          Please fix the highlighted fields.
        </p>
      )}
      <button type="submit" disabled={isSaving} className="neu-btn-lime px-6 py-3 rounded-xl text-xs font-extrabold disabled:opacity-50">
        {isSaving ? 'Changing…' : 'Change password'}
      </button>
    </form>
  );
};

// ---------------------------------------------------------------------------------------------

export const MemberProfilePage: React.FC<MemberProfilePageProps> = ({ setCurrentTab }) => {
  const { user, updateUser, refreshUser } = useAuth();
  const { showToast } = useToast();
  const { params, navigate } = useNavigation();
  const requested = params.get('tab') as TabId | null;
  const [activeTab, setActiveTab] = useState<TabId>(TABS.some(t => t.id === requested) ? requested! : 'details');
  const [isQrModalOpen, setIsQrModalOpen] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Membership status and expiry can change on the server (expiry, admin edits); start fresh.
  useEffect(() => {
    refreshUser();
  }, [refreshUser]);

  if (!user) return null;

  const selectTab = (id: TabId) => {
    setActiveTab(id);
    navigate('profile', id === 'details' ? undefined : { tab: id }, { replace: true });
  };

  const onTabKeyDown = (e: React.KeyboardEvent) => {
    const index = TABS.findIndex(t => t.id === activeTab);
    let nextIndex = index;
    if (e.key === 'ArrowRight') nextIndex = (index + 1) % TABS.length;
    else if (e.key === 'ArrowLeft') nextIndex = (index - 1 + TABS.length) % TABS.length;
    else if (e.key === 'Home') nextIndex = 0;
    else if (e.key === 'End') nextIndex = TABS.length - 1;
    else return;
    e.preventDefault();
    selectTab(TABS[nextIndex].id);
    document.getElementById(`profile-tab-${TABS[nextIndex].id}`)?.focus();
  };

  const onPhotoChosen = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setPhotoError(null);
    setIsUploading(true);
    try {
      const avatar = await resizeAvatar(file);
      updateUser(await api.updateProfile({ avatar_url: avatar }));
      showToast('Your photo was updated.', 'success');
    } catch (err) {
      setPhotoError(err instanceof Error ? err.message : 'Your photo could not be uploaded.');
    } finally {
      setIsUploading(false);
    }
  };

  const openPricing = () => setCurrentTab('pricing');

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-10 space-y-6 sm:space-y-8">
      <section className="neu-flat rounded-3xl p-5 sm:p-8 flex flex-col md:flex-row md:items-center justify-between gap-5">
        <div className="flex items-center gap-4 min-w-0">
          <img
            src={user.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(user.name)}`}
            alt="Your profile photo"
            className="w-20 h-20 sm:w-24 sm:h-24 rounded-2xl object-cover bg-slate-800 border-2 border-lime-500/50 shrink-0"
          />
          <div className="min-w-0 space-y-1">
            <h1 className="text-2xl sm:text-3xl font-black text-slate-100 font-['Outfit'] break-words">{user.name}</h1>
            <p className="text-xs text-slate-400 break-all">{user.email}</p>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-bold text-slate-300">{TIER_LABELS[user.membership_tier] ?? user.membership_tier}</span>
              <MembershipStatusBadge status={user.membership_status} />
            </div>
          </div>
        </div>
        <div className="flex flex-col sm:flex-row gap-3">
          <input ref={fileInputRef} id="profile-photo" type="file" accept="image/png,image/jpeg,image/webp" onChange={onPhotoChosen} className="sr-only" tabIndex={-1} aria-hidden="true" />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
            aria-describedby="profile-photo-hint"
            className="neu-btn px-5 py-3 rounded-xl text-xs font-bold flex items-center justify-center gap-2 disabled:opacity-60"
          >
            <Upload className="w-4 h-4" aria-hidden="true" /> {isUploading ? 'Uploading…' : 'Change photo'}
          </button>
          <button type="button" onClick={() => setIsQrModalOpen(true)} className="neu-btn-lime px-5 py-3 rounded-xl text-xs font-extrabold flex items-center justify-center gap-2">
            <QrCode className="w-4 h-4" aria-hidden="true" /> Check-in pass
          </button>
        </div>
      </section>
      <p id="profile-photo-hint" className="sr-only">
        PNG, JPEG or WebP. Large photos are shrunk to 256 by 256 pixels before upload.
      </p>
      {photoError && (
        <p role="alert" className="rounded-xl p-3 text-sm border border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-200">
          {photoError}
        </p>
      )}

      <div role="tablist" aria-label="Account sections" className="grid grid-cols-2 sm:flex gap-1 p-1.5 rounded-2xl neu-pressed-sm">
        {TABS.map(tab => (
          <button
            key={tab.id}
            id={`profile-tab-${tab.id}`}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            aria-controls={`profile-panel-${tab.id}`}
            tabIndex={activeTab === tab.id ? 0 : -1}
            onClick={() => selectTab(tab.id)}
            onKeyDown={onTabKeyDown}
            className={`px-3 sm:px-4 py-2.5 rounded-xl text-xs font-bold flex items-center justify-center sm:justify-start gap-2 whitespace-nowrap transition-all ${
              activeTab === tab.id ? 'neu-btn-lime' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      <div id={`profile-panel-${activeTab}`} role="tabpanel" aria-labelledby={`profile-tab-${activeTab}`}>
        {activeTab === 'details' && <ProfileDetails user={user} onOpenPass={() => setIsQrModalOpen(true)} />}
        {activeTab === 'membership' && <MembershipPanel user={user} onOpenPricing={openPricing} />}
        {activeTab === 'billing' && <BillingPanel onOpenPricing={openPricing} />}
        {activeTab === 'security' && <PasswordPanel />}
      </div>

      <DigitalQrPassModal isOpen={isQrModalOpen} onClose={() => setIsQrModalOpen(false)} user={user} />
    </div>
  );
};

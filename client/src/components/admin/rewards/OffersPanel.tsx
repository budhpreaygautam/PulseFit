import React, { useEffect, useState } from 'react';
import { BadgePercent, Edit2, Loader2, Plus, TicketPercent } from 'lucide-react';
import { BillingCycle, Coupon, CouponInput, Offer, OfferInput, PaidTier } from '../../../types/index.js';
import { api } from '../../../api/client.js';
import { useToast } from '../../../context/ToastContext.js';
import { Badge } from '../../common/Badge.js';
import { Modal } from '../../common/Modal.js';
import { EmptyState, ErrorState, LoadingState } from '../../common/States.js';
import { useApiResource } from '../../member/useApiResource.js';
import { TIER_SHORT_LABELS, addDays, formatDate, formatDateTime, formatINR, gymToday } from '../../../lib/format.js';
import { FieldError, FormError, SectionCard, focusRing, formErrorsFrom, hintClass, inputClass, labelClass } from '../ui.js';

const TIERS: PaidTier[] = ['basic', 'pro', 'vip'];
const CYCLES: { value: BillingCycle; label: string }[] = [
  { value: 'monthly', label: 'Monthly' },
  { value: 'annual', label: 'Annual' }
];

// Sale times are typed in gym time. IST has no daylight saving, so one fixed offset converts both ways.
const toInstant = (local: string) => new Date(`${local}:00+05:30`).toISOString();
const toLocalInput = (iso: string) => new Date(Date.parse(iso) + 330 * 60_000).toISOString().slice(0, 16);

type Discount = { percent_off: number | null; amount_off: number | null; tiers: PaidTier[]; billing_cycles: BillingCycle[] };

const discountText = (d: Discount) => (d.percent_off !== null ? `${d.percent_off}% off` : `${formatINR(d.amount_off ?? 0)} off`);
const appliesTo = (d: Discount) =>
  `${d.tiers.length ? d.tiers.map(t => TIER_SHORT_LABELS[t]).join(', ') : 'Every plan'} · ${
    d.billing_cycles.length ? CYCLES.filter(c => d.billing_cycles.includes(c.value)).map(c => c.label).join(' and ') : 'Monthly and annual'
  }`;

type Status = { label: string; variant: 'lime' | 'cyan' | 'slate' | 'amber' };

function saleStatus(o: Offer, now = Date.now()): Status {
  if (!o.active) return { label: 'Retired', variant: 'slate' };
  if (now < Date.parse(o.starts_at)) return { label: 'Upcoming', variant: 'cyan' };
  if (now >= Date.parse(o.ends_at)) return { label: 'Ended', variant: 'slate' };
  return { label: 'Live', variant: 'lime' };
}

function couponStatus(c: Coupon, today = gymToday()): Status {
  if (!c.active) return { label: 'Retired', variant: 'slate' };
  if (today < c.valid_from) return { label: 'Upcoming', variant: 'cyan' };
  if (today > c.valid_until) return { label: 'Expired', variant: 'slate' };
  if (c.max_uses !== null && c.uses >= c.max_uses) return { label: 'Used up', variant: 'amber' };
  return { label: 'Active', variant: 'lime' };
}

// The discount and who it is for, shared by both forms. Nothing ticked means every plan or cycle.
type DiscountForm = { kind: 'percent' | 'amount'; value: string; tiers: PaidTier[]; billing_cycles: BillingCycle[]; active: boolean };

const discountForm = (d: Discount & { active: boolean }): DiscountForm => ({
  kind: d.amount_off !== null ? 'amount' : 'percent',
  value: String(d.amount_off ?? d.percent_off ?? ''),
  tiers: [...d.tiers],
  billing_cycles: [...d.billing_cycles],
  active: d.active
});

const discountPayload = (f: DiscountForm): Discount & { active: boolean } => ({
  percent_off: f.kind === 'percent' ? Number(f.value) : null,
  amount_off: f.kind === 'amount' ? Number(f.value) : null,
  tiers: TIERS.filter(t => f.tiers.includes(t)),
  billing_cycles: CYCLES.map(c => c.value).filter(c => f.billing_cycles.includes(c)),
  active: f.active
});

const isWhole = (v: string, min: number, max: number) => /^\d+$/.test(v.trim()) && Number(v) >= min && Number(v) <= max;

function discountErrors(f: DiscountForm): Record<string, string> {
  if (f.kind === 'percent') return isWhole(f.value, 1, 90) ? {} : { percent_off: 'Enter a whole percentage from 1 to 90.' };
  return isWhole(f.value, 1, 100_000) ? {} : { amount_off: 'Enter whole rupees from 1 to 1,00,000.' };
}

const DISCOUNT_FIELDS = ['percent_off', 'amount_off', 'tiers', 'billing_cycles', 'active'];

const Check: React.FC<{ label: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }> = ({ label, checked, onChange, disabled }) => (
  <label className="inline-flex items-center gap-2 text-sm font-semibold text-slate-200">
    <input type="checkbox" checked={checked} disabled={disabled} onChange={e => onChange(e.target.checked)} className="w-4 h-4 accent-lime-500" />
    {label}
  </label>
);

const toggle = <T,>(list: T[], item: T, on: boolean) => (on ? [...list, item] : list.filter(x => x !== item));

const DiscountFields: React.FC<{ idPrefix: string; value: DiscountForm; onChange: (v: DiscountForm) => void; errors: Record<string, string> }> = ({ idPrefix, value, onChange, errors }) => {
  const set = <K extends keyof DiscountForm>(key: K, v: DiscountForm[K]) => onChange({ ...value, [key]: v });
  const valueError = errors.percent_off ?? errors.amount_off;
  return (
    <>
      <fieldset className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <legend className="sr-only">Discount</legend>
        <div role="radiogroup" aria-label="Discount type" className="flex flex-col gap-2 justify-center">
          {(['percent', 'amount'] as const).map(kind => (
            <label key={kind} className="inline-flex items-center gap-2 text-sm font-semibold text-slate-200">
              <input type="radio" name={`${idPrefix}-kind`} checked={value.kind === kind} onChange={() => set('kind', kind)} className="w-4 h-4 accent-lime-500" />
              {kind === 'percent' ? 'A percentage' : 'An amount in rupees'}
            </label>
          ))}
        </div>
        <div>
          <label htmlFor={`${idPrefix}-value`} className={labelClass}>
            {value.kind === 'percent' ? 'Percent off' : 'Amount off (₹)'}
          </label>
          <input
            id={`${idPrefix}-value`}
            type="number"
            inputMode="numeric"
            min={1}
            max={value.kind === 'percent' ? 90 : 100_000}
            value={value.value}
            onChange={e => set('value', e.target.value)}
            aria-invalid={!!valueError}
            aria-describedby={valueError ? `${idPrefix}-value-error` : undefined}
            className={inputClass}
          />
          <FieldError id={`${idPrefix}-value-error`} message={valueError} />
        </div>
      </fieldset>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <fieldset className="space-y-2">
          <legend className={labelClass}>Plans</legend>
          <div className="flex flex-wrap gap-x-4 gap-y-2">
            {TIERS.map(t => (
              <Check key={t} label={TIER_SHORT_LABELS[t]} checked={value.tiers.includes(t)} onChange={on => set('tiers', toggle(value.tiers, t, on))} />
            ))}
          </div>
          <p className={hintClass}>None ticked: every plan.</p>
          <FieldError message={errors.tiers} />
        </fieldset>
        <fieldset className="space-y-2">
          <legend className={labelClass}>Billing</legend>
          <div className="flex flex-wrap gap-x-4 gap-y-2">
            {CYCLES.map(c => (
              <Check key={c.value} label={c.label} checked={value.billing_cycles.includes(c.value)} onChange={on => set('billing_cycles', toggle(value.billing_cycles, c.value, on))} />
            ))}
          </div>
          <p className={hintClass}>None ticked: monthly and annual.</p>
          <FieldError message={errors.billing_cycles} />
        </fieldset>
      </div>
    </>
  );
};

const FormButtons: React.FC<{ isSaving: boolean; onClose: () => void; label: string }> = ({ isSaving, onClose, label }) => (
  <div className="flex flex-col-reverse sm:flex-row gap-3 pt-4 border-t border-slate-800/80">
    <button type="button" onClick={onClose} disabled={isSaving} className={`flex-1 py-2.5 neu-btn font-bold text-sm rounded-xl disabled:opacity-50 ${focusRing}`}>
      Cancel
    </button>
    <button type="submit" disabled={isSaving} className={`flex-1 py-2.5 neu-btn-lime font-black text-sm rounded-xl flex items-center justify-center gap-2 disabled:opacity-60 ${focusRing}`}>
      {isSaving && <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />}
      {label}
    </button>
  </div>
);

/** A labelled input with its error, ids from `id`. */
const Field: React.FC<{ id: string; label: string; error?: string; hint?: string; children: (props: { id: string; 'aria-invalid': boolean; 'aria-describedby'?: string; className: string }) => React.ReactNode }> = ({
  id,
  label,
  error,
  hint,
  children
}) => (
  <div>
    <label htmlFor={id} className={labelClass}>
      {label}
    </label>
    {children({ id, 'aria-invalid': !!error, 'aria-describedby': error ? `${id}-error` : undefined, className: inputClass })}
    {hint && <p className={hintClass}>{hint}</p>}
    <FieldError id={`${id}-error`} message={error} />
  </div>
);

type SaleForm = { title: string; banner_text: string; starts: string; ends: string; discount: DiscountForm };
const SALE_FIELDS = ['title', 'banner_text', 'starts_at', 'ends_at', ...DISCOUNT_FIELDS];

const newSale = (): SaleForm => {
  const now = new Date().toISOString();
  return {
    title: '',
    banner_text: '',
    starts: toLocalInput(now),
    ends: toLocalInput(new Date(Date.now() + 7 * 86_400_000).toISOString()),
    discount: { kind: 'percent', value: '', tiers: [], billing_cycles: [], active: true }
  };
};

const SaleFormModal: React.FC<{ target: Offer | 'new' | null; onClose: () => void; onSaved: (message: string) => void }> = ({ target, onClose, onSaved }) => {
  const [form, setForm] = useState<SaleForm>(newSale);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const editing = target && target !== 'new' ? target : null;

  useEffect(() => {
    if (!target) return;
    setForm(
      target === 'new'
        ? newSale()
        : { title: target.title, banner_text: target.banner_text, starts: toLocalInput(target.starts_at), ends: toLocalInput(target.ends_at), discount: discountForm(target) }
    );
    setErrors({});
    setFormError(null);
  }, [target]);

  if (!target) return null;
  const set = <K extends keyof SaleForm>(key: K, value: SaleForm[K]) => setForm(f => ({ ...f, [key]: value }));

  const submit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    const found: Record<string, string> = discountErrors(form.discount);
    if (form.title.trim().length < 2) found.title = 'Title must be at least 2 characters.';
    if (!form.starts) found.starts_at = 'Choose when the sale starts.';
    if (!form.ends) found.ends_at = 'Choose when the sale ends.';
    else if (form.starts && form.ends <= form.starts) found.ends_at = 'The sale must end after it starts.';
    setErrors(found);
    setFormError(null);
    if (Object.keys(found).length) return;

    const payload: OfferInput = {
      title: form.title.trim(),
      banner_text: form.banner_text.trim(),
      ...discountPayload(form.discount),
      starts_at: toInstant(form.starts),
      ends_at: toInstant(form.ends)
    };
    setIsSaving(true);
    try {
      if (editing) onSaved((await api.updateOffer(editing.id, payload)).message ?? `${payload.title} was saved.`);
      else onSaved(`${(await api.createOffer(payload)).title} was saved.`);
    } catch (err) {
      const { fieldErrors, formError } = formErrorsFrom(err, SALE_FIELDS);
      setErrors(fieldErrors);
      setFormError(formError);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Modal isOpen onClose={isSaving ? () => undefined : onClose} title={editing ? `Edit ${editing.title}` : 'New sale'} maxWidth="2xl">
      <form onSubmit={submit} className="space-y-4" noValidate>
        <FormError message={formError} />
        <Field id="sale-title" label="Title" error={errors.title}>
          {p => <input type="text" maxLength={80} value={form.title} onChange={e => set('title', e.target.value)} {...p} />}
        </Field>
        <Field id="sale-banner" label="Banner text" error={errors.banner_text} hint="Optional. Shown with the sale on the home page and the Memberships page.">
          {p => <input type="text" maxLength={160} value={form.banner_text} onChange={e => set('banner_text', e.target.value)} {...p} />}
        </Field>
        <DiscountFields idPrefix="sale" value={form.discount} onChange={d => set('discount', d)} errors={errors} />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field id="sale-starts" label="Starts" error={errors.starts_at} hint="Gym time (IST).">
            {p => <input type="datetime-local" value={form.starts} onChange={e => set('starts', e.target.value)} {...p} />}
          </Field>
          <Field id="sale-ends" label="Ends" error={errors.ends_at}>
            {p => <input type="datetime-local" value={form.ends} onChange={e => set('ends', e.target.value)} {...p} />}
          </Field>
        </div>
        <div className="space-y-1">
          <Check label="Active" checked={form.discount.active} onChange={v => set('discount', { ...form.discount, active: v })} />
          <p className={hintClass}>Untick to retire the sale. Members who already paid keep their price.</p>
        </div>
        <FormButtons isSaving={isSaving} onClose={onClose} label={editing ? 'Save sale' : 'Add sale'} />
      </form>
    </Modal>
  );
};

type CouponForm = { code: string; valid_from: string; valid_until: string; max_uses: string; per_member_limit: string; discount: DiscountForm };
const COUPON_FIELDS = ['code', 'valid_from', 'valid_until', 'max_uses', 'per_member_limit', ...DISCOUNT_FIELDS];

const newCoupon = (): CouponForm => ({
  code: '',
  valid_from: gymToday(),
  valid_until: addDays(gymToday(), 30),
  max_uses: '',
  per_member_limit: '1',
  discount: { kind: 'percent', value: '', tiers: [], billing_cycles: [], active: true }
});

const CouponFormModal: React.FC<{ target: Coupon | 'new' | null; onClose: () => void; onSaved: (message: string) => void }> = ({ target, onClose, onSaved }) => {
  const [form, setForm] = useState<CouponForm>(newCoupon);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const editing = target && target !== 'new' ? target : null;

  useEffect(() => {
    if (!target) return;
    setForm(
      target === 'new'
        ? newCoupon()
        : {
            code: target.code,
            valid_from: target.valid_from,
            valid_until: target.valid_until,
            max_uses: target.max_uses === null ? '' : String(target.max_uses),
            per_member_limit: String(target.per_member_limit),
            discount: discountForm(target)
          }
    );
    setErrors({});
    setFormError(null);
  }, [target]);

  if (!target) return null;
  const set = <K extends keyof CouponForm>(key: K, value: CouponForm[K]) => setForm(f => ({ ...f, [key]: value }));

  const submit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    const found: Record<string, string> = discountErrors(form.discount);
    if (!editing && !/^[A-Z0-9]{4,16}$/.test(form.code.trim())) found.code = 'Use 4 to 16 letters and digits.';
    if (!form.valid_from) found.valid_from = 'Choose the first day.';
    if (!form.valid_until) found.valid_until = 'Choose the last day.';
    else if (form.valid_from && form.valid_until < form.valid_from) found.valid_until = 'The last day must be on or after the first day.';
    if (form.max_uses.trim() && !isWhole(form.max_uses, 1, 1_000_000)) found.max_uses = 'Enter a whole number, or leave it empty for no limit.';
    if (!isWhole(form.per_member_limit, 1, 1000)) found.per_member_limit = 'Enter a whole number from 1 to 1,000.';
    setErrors(found);
    setFormError(null);
    if (Object.keys(found).length) return;

    const fields = {
      ...discountPayload(form.discount),
      valid_from: form.valid_from,
      valid_until: form.valid_until,
      max_uses: form.max_uses.trim() ? Number(form.max_uses) : null,
      per_member_limit: Number(form.per_member_limit)
    };
    setIsSaving(true);
    try {
      if (editing) onSaved((await api.updateCoupon(editing.code, fields)).message ?? `Coupon ${editing.code} was saved.`);
      else onSaved(`Coupon ${(await api.createCoupon({ code: form.code.trim(), ...fields } satisfies CouponInput)).code} was saved.`);
    } catch (err) {
      // COUPON_EXISTS comes back as the form's message.
      const { fieldErrors, formError } = formErrorsFrom(err, COUPON_FIELDS);
      setErrors(fieldErrors);
      setFormError(formError);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Modal isOpen onClose={isSaving ? () => undefined : onClose} title={editing ? `Edit coupon ${editing.code}` : 'New coupon'} maxWidth="2xl">
      <form onSubmit={submit} className="space-y-4" noValidate>
        <FormError message={formError} />
        <Field id="coupon-code" label="Code" error={errors.code} hint={editing ? 'A code cannot change once made.' : '4 to 16 letters and digits. Members type it at checkout.'}>
          {p => (
            <input
              type="text"
              maxLength={16}
              autoCapitalize="characters"
              spellCheck={false}
              value={form.code}
              disabled={!!editing}
              onChange={e => set('code', e.target.value.toUpperCase())}
              {...p}
              className={`${p.className} font-mono tracking-widest`}
            />
          )}
        </Field>
        <DiscountFields idPrefix="coupon" value={form.discount} onChange={d => set('discount', d)} errors={errors} />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field id="coupon-from" label="First day" error={errors.valid_from}>
            {p => <input type="date" value={form.valid_from} onChange={e => set('valid_from', e.target.value)} {...p} />}
          </Field>
          <Field id="coupon-until" label="Last day" error={errors.valid_until}>
            {p => <input type="date" value={form.valid_until} onChange={e => set('valid_until', e.target.value)} {...p} />}
          </Field>
          <Field id="coupon-max" label="Total uses" error={errors.max_uses} hint="Empty: no limit.">
            {p => <input type="number" inputMode="numeric" min={1} value={form.max_uses} onChange={e => set('max_uses', e.target.value)} {...p} />}
          </Field>
          <Field id="coupon-per-member" label="Uses per member" error={errors.per_member_limit}>
            {p => <input type="number" inputMode="numeric" min={1} max={1000} value={form.per_member_limit} onChange={e => set('per_member_limit', e.target.value)} {...p} />}
          </Field>
        </div>
        <div className="space-y-1">
          <Check label="Active" checked={form.discount.active} onChange={v => set('discount', { ...form.discount, active: v })} />
          <p className={hintClass}>Untick to retire the code. Members who already paid keep their price.</p>
        </div>
        <FormButtons isSaving={isSaving} onClose={onClose} label={editing ? 'Save coupon' : 'Add coupon'} />
      </form>
    </Modal>
  );
};

const Row: React.FC<{ title: React.ReactNode; status: Status; lines: React.ReactNode[]; onEdit: () => void; editLabel: string }> = ({ title, status, lines, onEdit, editLabel }) => (
  <li className="neu-pressed-sm rounded-2xl p-4 flex items-start gap-3">
    <div className="flex-1 min-w-0 space-y-1">
      <div className="flex flex-wrap items-center gap-2">
        {title}
        <Badge size="sm" variant={status.variant}>
          {status.label}
        </Badge>
      </div>
      {lines.map((line, i) => (
        <p key={i} className="text-xs text-slate-400 break-words">
          {line}
        </p>
      ))}
    </div>
    <button type="button" onClick={onEdit} aria-label={editLabel} title="Edit" className={`p-2 neu-btn rounded-lg shrink-0 ${focusRing}`}>
      <Edit2 className="w-3.5 h-3.5" aria-hidden="true" />
    </button>
  </li>
);

/** Sales (a discount for everyone between two times) and coupon codes (a discount members type at checkout). */
export const OffersPanel: React.FC = () => {
  const { showToast } = useToast();
  const offers = useApiResource(() => api.getOffers());
  const coupons = useApiResource(() => api.getCoupons());
  const [sale, setSale] = useState<Offer | 'new' | null>(null);
  const [coupon, setCoupon] = useState<Coupon | 'new' | null>(null);

  const addButton = (label: string, onClick: () => void) => (
    <button type="button" onClick={onClick} className={`px-4 py-2.5 neu-btn-lime rounded-xl text-xs font-black flex items-center gap-2 ${focusRing}`}>
      <Plus className="w-4 h-4" aria-hidden="true" /> {label}
    </button>
  );

  return (
    <div className="space-y-6">
      <SectionCard
        id="sales-heading"
        title="Sales"
        icon={<BadgePercent className="w-4 h-4 text-lime-400" aria-hidden="true" />}
        description="A live sale lowers the price for everyone, guests included. When a coupon gives more, the member gets the coupon instead: never both."
        actions={addButton('New sale', () => setSale('new'))}
      >
        {!offers.data && offers.error ? (
          <ErrorState message={`Could not load the sales. ${offers.error}`} onRetry={offers.reload} />
        ) : !offers.data ? (
          <LoadingState label="Loading sales…" />
        ) : offers.data.length === 0 ? (
          <EmptyState title="No sales yet" body="Schedule one, and it goes live on its own when it starts." />
        ) : (
          <ul className="space-y-3">
            {offers.data.map(o => (
              <Row
                key={o.id}
                title={<p className="font-extrabold text-slate-100 font-heading break-words">{o.title}</p>}
                status={saleStatus(o)}
                lines={[`${discountText(o)} · ${appliesTo(o)}`, `${formatDateTime(o.starts_at)} to ${formatDateTime(o.ends_at)}`, ...(o.banner_text ? [o.banner_text] : [])]}
                onEdit={() => setSale(o)}
                editLabel={`Edit ${o.title}`}
              />
            ))}
          </ul>
        )}
      </SectionCard>

      <SectionCard
        id="coupons-heading"
        title="Coupon codes"
        icon={<TicketPercent className="w-4 h-4 text-lime-400" aria-hidden="true" />}
        description="Codes members type at checkout. A use counts when the payment goes through; only admins ever see this list."
        actions={addButton('New coupon', () => setCoupon('new'))}
      >
        {!coupons.data && coupons.error ? (
          <ErrorState message={`Could not load the coupons. ${coupons.error}`} onRetry={coupons.reload} />
        ) : !coupons.data ? (
          <LoadingState label="Loading coupons…" />
        ) : coupons.data.length === 0 ? (
          <EmptyState title="No coupon codes yet" />
        ) : (
          <ul className="space-y-3">
            {coupons.data.map(c => (
              <Row
                key={c.code}
                title={<p className="font-mono font-black tracking-widest text-lime-400">{c.code}</p>}
                status={couponStatus(c)}
                lines={[
                  `${discountText(c)} · ${appliesTo(c)}`,
                  `${formatDate(c.valid_from)} to ${formatDate(c.valid_until)}`,
                  `Used ${c.uses.toLocaleString('en-IN')}${c.max_uses === null ? '' : ` of ${c.max_uses.toLocaleString('en-IN')}`} · ${c.per_member_limit} per member`
                ]}
                onEdit={() => setCoupon(c)}
                editLabel={`Edit coupon ${c.code}`}
              />
            ))}
          </ul>
        )}
      </SectionCard>

      <SaleFormModal
        target={sale}
        onClose={() => setSale(null)}
        onSaved={message => {
          setSale(null);
          showToast(message, 'success');
          offers.reload();
        }}
      />
      <CouponFormModal
        target={coupon}
        onClose={() => setCoupon(null)}
        onSaved={message => {
          setCoupon(null);
          showToast(message, 'success');
          coupons.reload();
        }}
      />
    </div>
  );
};

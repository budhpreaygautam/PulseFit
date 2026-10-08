import React, { useEffect, useMemo, useState } from 'react';
import { Loader2, Plus, Trash2 } from 'lucide-react';
import { ClassCategory, MembershipPlan } from '../../types/index.js';
import { ApiError, api, errorMessage } from '../../api/client.js';
import { Badge } from '../common/Badge.js';
import { TIER_LABELS, formatINR } from '../../lib/format.js';
import { FieldError, FormError, fieldErrorsFrom, focusRing, hintClass, inputClass, labelClass } from './ui.js';

const CATEGORIES: ClassCategory[] = ['Workout & Strength', 'Zumba & Cardio'];
const MAX_FEATURES = 20;

type Form = {
  name: string;
  description: string;
  price_monthly: string;
  price_annual: string;
  features: string[];
  categories: ClassCategory[];
  is_popular: boolean;
  badge: string;
};

const toForm = (p: MembershipPlan): Form => ({
  name: p.name,
  description: p.description ?? '',
  price_monthly: String(p.price_monthly),
  price_annual: String(p.price_annual),
  features: [...(p.features ?? [])],
  categories: [...(p.categories ?? [])],
  is_popular: !!p.is_popular,
  badge: p.badge ?? ''
});

/** The fields that differ from the saved plan, in the shape PUT /plans/:id takes. */
function changesFrom(form: Form, plan: MembershipPlan) {
  const next = {
    name: form.name.trim(),
    description: form.description.trim(),
    price_monthly: Number(form.price_monthly),
    price_annual: Number(form.price_annual),
    features: form.features.map(f => f.trim()).filter(Boolean),
    categories: CATEGORIES.filter(c => form.categories.includes(c)),
    is_popular: form.is_popular,
    badge: form.badge.trim()
  };
  const before = {
    name: plan.name,
    description: plan.description ?? '',
    price_monthly: plan.price_monthly,
    price_annual: plan.price_annual,
    features: plan.features ?? [],
    categories: CATEGORIES.filter(c => (plan.categories ?? []).includes(c)),
    is_popular: !!plan.is_popular,
    badge: plan.badge ?? ''
  };
  return Object.fromEntries(
    Object.entries(next).filter(([key, value]) => JSON.stringify(value) !== JSON.stringify(before[key as keyof typeof before]))
  ) as Partial<typeof next>;
}

const isInt = (v: string, min: number, max: number) => /^\d+$/.test(v.trim()) && Number(v) >= min && Number(v) <= max;

interface PlanEditorProps {
  plan: MembershipPlan;
  onSaved: (plan: MembershipPlan) => void;
  onStale: () => void;
}

export const PlanEditor: React.FC<PlanEditorProps> = ({ plan, onSaved, onStale }) => {
  const [form, setForm] = useState<Form>(() => toForm(plan));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const id = (field: string) => `plan-${plan.id}-${field}`;

  useEffect(() => {
    setForm(toForm(plan));
  }, [plan]);

  const set = <K extends keyof Form>(key: K, value: Form[K]) => setForm(f => ({ ...f, [key]: value }));
  const changes = useMemo(() => changesFrom(form, plan), [form, plan]);
  const isDirty = Object.keys(changes).length > 0;

  const monthly = Number(form.price_monthly);
  const annual = Number(form.price_annual);
  const pricesValid = isInt(form.price_monthly, 1, 100_000) && isInt(form.price_annual, 1, 1_200_000);
  const saving = monthly * 12 - annual;

  const validate = () => {
    const e: Record<string, string> = {};
    const name = form.name.trim();
    if (name.length < 2 || name.length > 80) e.name = 'Enter a name of 2 to 80 characters.';
    if (form.description.trim().length > 500) e.description = 'Keep the description under 500 characters.';
    if (!isInt(form.price_monthly, 1, 100_000)) e.price_monthly = 'Enter a whole rupee amount from 1 to 1,00,000.';
    if (!isInt(form.price_annual, 1, 1_200_000)) e.price_annual = 'Enter a whole rupee amount from 1 to 12,00,000.';
    if (form.features.some(f => f.trim().length > 200)) e.features = 'Keep each feature under 200 characters.';
    if (form.badge.trim().length > 30) e.badge = 'Keep the badge under 30 characters.';
    return e;
  };

  const save = async (ev: React.FormEvent) => {
    ev.preventDefault();
    const found = validate();
    setErrors(found);
    setFormError(null);
    if (Object.keys(found).length || !isDirty) return;
    setIsSaving(true);
    try {
      onSaved((await api.updatePlan(plan.id, changes)).data);
    } catch (err) {
      if (err instanceof ApiError && err.code === 'VALIDATION_ERROR' && Object.keys(fieldErrorsFrom(err)).length) setErrors(fieldErrorsFrom(err));
      else {
        setFormError(errorMessage(err));
        if (err instanceof ApiError && err.code === 'NOT_FOUND') onStale();
      }
    } finally {
      setIsSaving(false);
    }
  };

  const describedBy = (field: string, hint?: boolean) => [errors[field] ? `${id(field)}-error` : '', hint ? `${id(field)}-hint` : ''].filter(Boolean).join(' ') || undefined;

  return (
    <form onSubmit={save} className="neu-flat p-5 sm:p-7 rounded-3xl border border-slate-800/80 space-y-5 min-w-0" aria-labelledby={id('heading')} noValidate>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id={id('heading')} className="text-lg font-black text-slate-100 font-['Outfit']">
          {plan.name}
        </h2>
        <div className="flex gap-2">
          <Badge size="sm" variant="cyan">{TIER_LABELS[plan.tier]}</Badge>
          {isDirty && <Badge size="sm" variant="amber">Unsaved changes</Badge>}
        </div>
      </div>
      <FormError message={formError} />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label htmlFor={id('name')} className={labelClass}>Name</label>
          <input id={id('name')} type="text" value={form.name} onChange={e => set('name', e.target.value)} className={inputClass} aria-invalid={!!errors.name} aria-describedby={describedBy('name')} />
          <FieldError id={`${id('name')}-error`} message={errors.name} />
        </div>
        <div>
          <label htmlFor={id('badge')} className={labelClass}>Badge (optional)</label>
          <input id={id('badge')} type="text" value={form.badge} onChange={e => set('badge', e.target.value)} placeholder="e.g. Best value" className={inputClass} aria-invalid={!!errors.badge} aria-describedby={describedBy('badge', true)} />
          <p id={`${id('badge')}-hint`} className={hintClass}>Shown on the pricing card. Leave empty for none.</p>
          <FieldError id={`${id('badge')}-error`} message={errors.badge} />
        </div>
      </div>

      <div>
        <label htmlFor={id('description')} className={labelClass}>Description</label>
        <textarea id={id('description')} rows={2} value={form.description} onChange={e => set('description', e.target.value)} className={inputClass} aria-invalid={!!errors.description} aria-describedby={describedBy('description')} />
        <FieldError id={`${id('description')}-error`} message={errors.description} />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label htmlFor={id('price_monthly')} className={labelClass}>Monthly price (₹)</label>
          <input id={id('price_monthly')} type="number" inputMode="numeric" min={1} max={100000} value={form.price_monthly} onChange={e => set('price_monthly', e.target.value)} className={inputClass} aria-invalid={!!errors.price_monthly} aria-describedby={describedBy('price_monthly')} />
          <FieldError id={`${id('price_monthly')}-error`} message={errors.price_monthly} />
        </div>
        <div>
          <label htmlFor={id('price_annual')} className={labelClass}>Annual price (₹, 12 months)</label>
          <input id={id('price_annual')} type="number" inputMode="numeric" min={1} max={1200000} value={form.price_annual} onChange={e => set('price_annual', e.target.value)} className={inputClass} aria-invalid={!!errors.price_annual} aria-describedby={describedBy('price_annual', true)} />
          <p id={`${id('price_annual')}-hint`} className={`${hintClass} ${pricesValid && saving < 0 ? 'text-amber-400' : ''}`} aria-live="polite">
            {!pricesValid
              ? 'Enter both prices to see the comparison.'
              : saving > 0
              ? `${formatINR(Math.round(annual / 12))}/month equivalent · saves ${formatINR(saving)} (${Math.round((saving / (monthly * 12)) * 100)}%) against 12 monthly payments.`
              : saving === 0
              ? `${formatINR(Math.round(annual / 12))}/month equivalent · the same as 12 monthly payments.`
              : `${formatINR(Math.round(annual / 12))}/month equivalent · costs ${formatINR(-saving)} more than 12 monthly payments.`}
          </p>
          <FieldError id={`${id('price_annual')}-error`} message={errors.price_annual} />
        </div>
      </div>

      <fieldset className="space-y-2">
        <legend className={labelClass}>Class categories included</legend>
        <div className="flex flex-wrap gap-4">
          {CATEGORIES.map(c => (
            <label key={c} className="flex items-center gap-2 text-sm font-semibold text-slate-200">
              <input
                type="checkbox"
                checked={form.categories.includes(c)}
                onChange={e => set('categories', e.target.checked ? [...form.categories, c] : form.categories.filter(x => x !== c))}
                className="w-4 h-4 accent-lime-500"
              />
              {c}
            </label>
          ))}
        </div>
        <p className={hintClass}>{form.categories.length === 0 ? 'None ticked: members on this plan can book every category.' : 'Members on this plan can book only the ticked categories.'}</p>
      </fieldset>

      <fieldset className="space-y-2">
        <legend className={labelClass}>Features ({form.features.length}/{MAX_FEATURES})</legend>
        <ul className="space-y-2">
          {form.features.map((feature, i) => (
            <li key={i} className="flex gap-2">
              <label htmlFor={id(`feature-${i}`)} className="sr-only">Feature {i + 1}</label>
              <input
                id={id(`feature-${i}`)}
                type="text"
                value={feature}
                onChange={e => set('features', form.features.map((f, j) => (j === i ? e.target.value : f)))}
                className={inputClass}
              />
              <button
                type="button"
                onClick={() => set('features', form.features.filter((_, j) => j !== i))}
                className={`p-2.5 neu-btn rounded-xl hover:text-rose-400 shrink-0 ${focusRing}`}
                aria-label={`Remove feature ${i + 1}${feature ? `: ${feature}` : ''}`}
              >
                <Trash2 className="w-4 h-4" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
        <button
          type="button"
          onClick={() => set('features', [...form.features, ''])}
          disabled={form.features.length >= MAX_FEATURES}
          className={`px-3 py-2 neu-btn rounded-xl text-xs font-bold flex items-center gap-1.5 disabled:opacity-50 ${focusRing}`}
        >
          <Plus className="w-3.5 h-3.5" aria-hidden="true" /> Add feature
        </button>
        <FieldError message={errors.features} />
      </fieldset>

      <label className="flex items-center gap-2 text-sm font-semibold text-slate-200">
        <input type="checkbox" checked={form.is_popular} onChange={e => set('is_popular', e.target.checked)} className="w-4 h-4 accent-lime-500" />
        Highlight as the most popular plan
      </label>

      <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-3 pt-4 border-t border-slate-800/80">
        <button
          type="button"
          onClick={() => {
            setForm(toForm(plan));
            setErrors({});
            setFormError(null);
          }}
          disabled={!isDirty || isSaving}
          className={`px-5 py-2.5 neu-btn rounded-xl text-sm font-bold disabled:opacity-50 ${focusRing}`}
        >
          Discard changes
        </button>
        <button type="submit" disabled={!isDirty || isSaving} aria-label={`Save ${plan.name}`} className={`px-5 py-2.5 neu-btn-lime rounded-xl text-sm font-black flex items-center justify-center gap-2 disabled:opacity-50 ${focusRing}`}>
          {isSaving && <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />}
          Save changes
        </button>
      </div>
    </form>
  );
};

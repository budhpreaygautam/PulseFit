import React, { useEffect, useState } from 'react';
import { Loader2, Plus, SlidersHorizontal, Trash2, X } from 'lucide-react';
import { BillingCycle, Gift, Milestone, PaidTier, RewardSettings, RewardSettingsInput } from '../../../types/index.js';
import { api } from '../../../api/client.js';
import { useToast } from '../../../context/ToastContext.js';
import { ErrorState, LoadingState } from '../../common/States.js';
import { useApiResource } from '../../member/useApiResource.js';
import { TIER_SHORT_LABELS } from '../../../lib/format.js';
import { FieldError, FormError, SectionCard, focusRing, formErrorsFrom, hintClass, inputClass, labelClass } from '../ui.js';

const POINTS = [
  { key: 'points_per_checkin', label: 'Points per check-in', hint: 'Each check-in at the front desk.' },
  { key: 'points_per_workout', label: 'Points per workout', hint: 'One workout a day, logged on the day.' },
  { key: 'points_per_referral', label: 'Points for a referral', hint: 'To the member whose code a new member used, on that member’s first payment.' },
  { key: 'welcome_points_for_referred', label: 'Welcome points for a referred member', hint: 'To the new member, on their first payment.' }
] as const;
type PointsKey = (typeof POINTS)[number]['key'];

const PLANS: { tier: PaidTier; billing_cycle: BillingCycle }[] = (['basic', 'pro', 'vip'] as const).flatMap(tier =>
  (['monthly', 'annual'] as const).map(billing_cycle => ({ tier, billing_cycle }))
);
const planLabel = (p: { tier: PaidTier; billing_cycle: BillingCycle }) => `${TIER_SHORT_LABELS[p.tier]}, ${p.billing_cycle === 'monthly' ? 'monthly' : 'annual'}`;
const MAX_MILESTONES = 30;
const MAX_JOINING_GIFTS = 5;
const FIELDS = [...POINTS.map(p => p.key), 'milestones', 'joining_gifts'];

type MilestoneRow = Omit<Milestone, 'id' | 'threshold'> & { id?: string; threshold: string };
type JoiningRow = { tier: PaidTier; billing_cycle: BillingCycle; gift_ids: string[]; once_per_member: boolean };
type Form = { points: Record<PointsKey, string>; milestones: MilestoneRow[]; joining: JoiningRow[] };

const toForm = (s: RewardSettings): Form => ({
  points: Object.fromEntries(POINTS.map(p => [p.key, String(s[p.key])])) as Record<PointsKey, string>,
  milestones: s.milestones.map(m => ({ ...m, threshold: String(m.threshold) })),
  // shortcut: one rule per plan and cycle, as this form and the seed write them; a second rule for the same plan sent straight to the API is folded into the first.
  joining: PLANS.map(p => {
    const rules = s.joining_gifts.filter(j => j.tier === p.tier && j.billing_cycle === p.billing_cycle);
    return { ...p, gift_ids: [...new Set(rules.flatMap(j => j.gift_ids))], once_per_member: rules[0]?.once_per_member ?? false };
  })
});

const isWhole = (v: string, min: number, max: number) => /^\d+$/.test(v.trim()) && Number(v) >= min && Number(v) <= max;

/** Point values, milestone gifts and the gifts each plan comes with: one form, one Save. */
export const RulesPanel: React.FC = () => {
  const { showToast } = useToast();
  const settings = useApiResource(() => api.getRewardSettings());
  const catalogue = useApiResource(() => api.getGiftCatalogue());
  const [form, setForm] = useState<Form | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (settings.data) setForm(toForm(settings.data));
  }, [settings.data]);

  const failed = (!settings.data && settings.error) || (!catalogue.data && catalogue.error);
  if (failed) {
    const retry = () => Promise.all([settings.reload(), catalogue.reload()]);
    return <ErrorState message={`Could not load the reward rules. ${failed}`} onRetry={retry} />;
  }
  if (!form || !catalogue.data) return <LoadingState label="Loading the reward rules…" />;

  const gifts = catalogue.data;
  const active = gifts.filter(g => g.active);
  const nameOf = (id: string) => gifts.find(g => g.id === id)?.name ?? 'A deleted gift';
  // A rule can still name a gift that was retired since: show it, so the server's error has something to point at.
  const options = (current: string): Gift[] => (current && !active.some(g => g.id === current) ? [...active, ...gifts.filter(g => g.id === current)] : active);

  const setMilestone = (i: number, patch: Partial<MilestoneRow>) => setForm({ ...form, milestones: form.milestones.map((m, j) => (j === i ? { ...m, ...patch } : m)) });
  const setJoining = (i: number, patch: Partial<JoiningRow>) => setForm({ ...form, joining: form.joining.map((j, k) => (k === i ? { ...j, ...patch } : j)) });

  const validate = () => {
    const e: Record<string, string> = {};
    for (const p of POINTS) if (!isWhole(form.points[p.key], 0, 100_000)) e[p.key] = 'Enter a whole number from 0 to 1,00,000.';
    const bad = form.milestones.findIndex(m => !isWhole(m.threshold, 1, 10_000) || !m.gift_id);
    if (bad >= 0) e.milestones = `Milestone ${bad + 1}: enter a number from 1 to 10,000 and choose a gift.`;
    return e;
  };

  const save = async (ev: React.FormEvent) => {
    ev.preventDefault();
    const found = validate();
    setErrors(found);
    setFormError(null);
    if (Object.keys(found).length) return;

    const payload: RewardSettingsInput = {
      ...(Object.fromEntries(POINTS.map(p => [p.key, Number(form.points[p.key])])) as Record<PointsKey, number>),
      milestones: form.milestones.map(({ id, type, threshold, gift_id }) => ({ ...(id ? { id } : {}), type, threshold: Number(threshold), gift_id })),
      joining_gifts: form.joining.filter(j => j.gift_ids.length > 0)
    };
    setIsSaving(true);
    try {
      const { data, message } = await api.updateRewardSettings(payload);
      setForm(toForm(data));
      showToast(message ?? 'Reward rules saved.', 'success');
    } catch (err) {
      const { fieldErrors, formError } = formErrorsFrom(err, FIELDS);
      setErrors(fieldErrors);
      setFormError(formError);
    } finally {
      setIsSaving(false);
    }
  };

  const selectClass = 'px-3 py-2.5 rounded-xl text-sm text-slate-100 font-medium min-w-0';

  return (
    <form onSubmit={save} className="space-y-6" noValidate>
      <FormError message={formError} />

      <SectionCard id="points-rules-heading" title="Points" icon={<SlidersHorizontal className="w-4 h-4 text-lime-400" aria-hidden="true" />} description="What members earn. 0 turns that kind of points off.">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {POINTS.map(p => (
            <div key={p.key}>
              <label htmlFor={`rules-${p.key}`} className={labelClass}>
                {p.label}
              </label>
              <input
                id={`rules-${p.key}`}
                type="number"
                inputMode="numeric"
                min={0}
                max={100000}
                value={form.points[p.key]}
                onChange={e => setForm({ ...form, points: { ...form.points, [p.key]: e.target.value } })}
                aria-invalid={!!errors[p.key]}
                aria-describedby={`rules-${p.key}-hint${errors[p.key] ? ` rules-${p.key}-error` : ''}`}
                className={inputClass}
              />
              <p id={`rules-${p.key}-hint`} className={hintClass}>
                {p.hint}
              </p>
              <FieldError id={`rules-${p.key}-error`} message={errors[p.key]} />
            </div>
          ))}
        </div>
      </SectionCard>

      <SectionCard
        id="milestone-rules-heading"
        title="Milestones"
        description="A gift for a number of visits or a streak of days, counted from check-ins and attended classes. Each one is given once per member."
      >
        {form.milestones.length === 0 ? (
          <p className="text-sm text-slate-400">No milestones. Members earn points only.</p>
        ) : (
          <ul className="space-y-3">
            {form.milestones.map((m, i) => (
              <li key={m.id ?? `new-${i}`} className="neu-pressed-sm rounded-2xl p-3 flex flex-wrap items-center gap-2">
                <select aria-label={`Milestone ${i + 1} type`} value={m.type} onChange={e => setMilestone(i, { type: e.target.value as Milestone['type'] })} className={selectClass}>
                  <option value="visits">Visits</option>
                  <option value="streak">Day streak</option>
                </select>
                <input
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={10000}
                  aria-label={`Milestone ${i + 1} ${m.type === 'visits' ? 'visits' : 'days'}`}
                  value={m.threshold}
                  onChange={e => setMilestone(i, { threshold: e.target.value })}
                  className={`${selectClass} w-24`}
                />
                <span className="text-sm text-slate-400" aria-hidden="true">
                  gives
                </span>
                <select aria-label={`Milestone ${i + 1} gift`} value={m.gift_id} onChange={e => setMilestone(i, { gift_id: e.target.value })} className="px-3 py-2.5 rounded-xl text-sm text-slate-100 font-medium flex-1 min-w-[11rem]">
                  <option value="">Choose a gift</option>
                  {options(m.gift_id).map(g => (
                    <option key={g.id} value={g.id}>
                      {g.active ? g.name : `${g.name} (inactive)`}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => setForm({ ...form, milestones: form.milestones.filter((_, j) => j !== i) })}
                  aria-label={`Remove milestone ${i + 1}`}
                  className={`p-2.5 neu-btn rounded-xl hover:text-rose-400 shrink-0 ${focusRing}`}
                >
                  <Trash2 className="w-4 h-4" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        )}
        <FieldError message={errors.milestones} />
        <button
          type="button"
          onClick={() => setForm({ ...form, milestones: [...form.milestones, { type: 'visits', threshold: '', gift_id: '' }] })}
          disabled={form.milestones.length >= MAX_MILESTONES}
          className={`px-3 py-2 neu-btn rounded-xl text-xs font-bold flex items-center gap-1.5 disabled:opacity-50 ${focusRing}`}
        >
          <Plus className="w-3.5 h-3.5" aria-hidden="true" /> Add milestone
        </button>
      </SectionCard>

      <SectionCard
        id="joining-rules-heading"
        title="Joining gifts"
        description="What each paid plan comes with, online or at the front desk. Once per member: given on the first payment only, not on every renewal."
      >
        <ul className="space-y-3">
          {form.joining.map((j, i) => {
            const label = planLabel(j);
            return (
              <li key={label} className="neu-pressed-sm rounded-2xl p-4 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-extrabold text-slate-100 font-heading">{label}</p>
                  <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-300">
                    <input type="checkbox" checked={j.once_per_member} onChange={e => setJoining(i, { once_per_member: e.target.checked })} className="w-4 h-4 accent-lime-500" />
                    Once per member
                  </label>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {j.gift_ids.length === 0 && <span className="text-xs text-slate-400">No gift.</span>}
                  {j.gift_ids.map(id => (
                    <span key={id} className="inline-flex items-center gap-1 pl-3 pr-1 py-1 rounded-full neu-btn text-xs font-bold text-slate-200">
                      {nameOf(id)}
                      <button
                        type="button"
                        onClick={() => setJoining(i, { gift_ids: j.gift_ids.filter(x => x !== id) })}
                        aria-label={`Remove ${nameOf(id)} from ${label}`}
                        className={`p-1 rounded-full hover:text-rose-400 ${focusRing}`}
                      >
                        <X className="w-3 h-3" aria-hidden="true" />
                      </button>
                    </span>
                  ))}
                  {j.gift_ids.length < MAX_JOINING_GIFTS && (
                    <select
                      aria-label={`Add a gift to ${label}`}
                      value=""
                      onChange={e => e.target.value && setJoining(i, { gift_ids: [...j.gift_ids, e.target.value] })}
                      className="px-3 py-1.5 rounded-xl text-xs font-bold text-slate-100"
                    >
                      <option value="">Add a gift…</option>
                      {active
                        .filter(g => !j.gift_ids.includes(g.id))
                        .map(g => (
                          <option key={g.id} value={g.id}>
                            {g.name}
                          </option>
                        ))}
                    </select>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
        <FieldError message={errors.joining_gifts} />
      </SectionCard>

      <div className="flex justify-end">
        <button type="submit" disabled={isSaving} className={`px-5 py-2.5 neu-btn-lime rounded-xl text-sm font-black flex items-center justify-center gap-2 disabled:opacity-50 ${focusRing}`}>
          {isSaving && <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />}
          Save rules
        </button>
      </div>
    </form>
  );
};

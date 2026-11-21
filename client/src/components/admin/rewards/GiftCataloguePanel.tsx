import React, { useEffect, useRef, useState } from 'react';
import { Edit2, Gift as GiftIcon, ImagePlus, Loader2, Plus, Trash2 } from 'lucide-react';
import { Gift, GiftInput, GiftLevel, GiftSize } from '../../../types/index.js';
import { api, errorMessage } from '../../../api/client.js';
import { useToast } from '../../../context/ToastContext.js';
import { Badge } from '../../common/Badge.js';
import { ConfirmDialog } from '../../common/ConfirmDialog.js';
import { GiftImage } from '../../common/GiftImage.js';
import { Modal } from '../../common/Modal.js';
import { EmptyState, ErrorState, LoadingState } from '../../common/States.js';
import { useApiResource } from '../../member/useApiResource.js';
import { resizeAvatar } from '../../member/avatarImage.js';
import pictures from '../../../data/gift-pictures.json';
import { FieldError, FormError, SectionCard, focusRing, formErrorsFrom, hintClass, inputClass, labelClass } from '../ui.js';

const LEVELS: { value: GiftLevel; label: string; band: string }[] = [
  { value: 'small', label: 'Small', band: '150–250 points' },
  { value: 'medium', label: 'Medium', band: '300–500 points' },
  { value: 'big', label: 'Big', band: '700–1,200 points' },
  { value: 'premium', label: 'Premium', band: '1,500–3,000 points' }
];
const SIZES: GiftSize[] = ['S', 'M', 'L', 'XL', 'XXL'];
// The fields the server reports errors for, so each shows next to its input.
const FIELDS = ['name', 'description', 'image', 'level', 'points_cost', 'kind', 'sizes', 'stock_by_size', 'stock', 'active'] as const;

type Form = {
  name: string;
  description: string;
  image: string;
  level: GiftLevel;
  points_cost: string;
  reward_only: boolean;
  kind: Gift['kind'];
  has_sizes: boolean;
  sizes: GiftSize[];
  stock_by_size: Record<GiftSize, string>;
  stock: string;
  unlimited: boolean;
  active: boolean;
};

const EMPTY: Form = {
  name: '',
  description: '',
  image: '🎁',
  level: 'small',
  points_cost: '',
  reward_only: false,
  kind: 'item',
  has_sizes: false,
  sizes: [...SIZES],
  stock_by_size: { S: '0', M: '0', L: '0', XL: '0', XXL: '0' },
  stock: '0',
  unlimited: false,
  active: true
};

const toForm = (g: Gift): Form => ({
  name: g.name,
  description: g.description,
  image: g.image,
  level: g.level,
  points_cost: g.points_cost === null ? '' : String(g.points_cost),
  reward_only: g.points_cost === null,
  kind: g.kind,
  has_sizes: !!g.sizes,
  sizes: g.sizes ?? [...SIZES],
  stock_by_size: { ...EMPTY.stock_by_size, ...Object.fromEntries(Object.entries(g.stock_by_size ?? {}).map(([s, n]) => [s, String(n)])) },
  stock: g.stock === null ? '0' : String(g.stock),
  unlimited: !g.sizes && g.stock === null,
  active: g.active
});

const isCount = (v: string) => /^\d+$/.test(v.trim());

function stockText(g: Gift): string {
  if (g.sizes) return g.sizes.map(s => `${s} ${g.stock_by_size?.[s] ?? 0}`).join(' · ');
  return g.stock === null ? 'Unlimited' : g.stock.toLocaleString('en-IN');
}

const GiftFormModal: React.FC<{ target: Gift | 'new' | null; onClose: () => void; onSaved: (message: string) => void }> = ({ target, onClose, onSaved }) => {
  const [form, setForm] = useState<Form>(EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const editing = target && target !== 'new' ? target : null;

  useEffect(() => {
    if (!target) return;
    setForm(target === 'new' ? EMPTY : toForm(target));
    setErrors({});
    setFormError(null);
  }, [target]);

  if (!target) return null;
  const set = <K extends keyof Form>(key: K, value: Form[K]) => setForm(f => ({ ...f, [key]: value }));
  const isPhoto = form.image.startsWith('data:') || form.image.startsWith('/gifts/');
  const builtIn = Object.entries(pictures as Record<string, string>);
  const sized = form.kind === 'item' && form.has_sizes;

  const onPhotoChosen = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      set('image', await resizeAvatar(file));
      setErrors(({ image: _image, ...rest }) => rest);
    } catch (err) {
      setErrors(prev => ({ ...prev, image: errorMessage(err) }));
    }
  };

  const validate = () => {
    const e: Record<string, string> = {};
    if (form.name.trim().length < 2) e.name = 'Name must be at least 2 characters.';
    if (!form.image.trim()) e.image = 'Choose an emoji or upload a photo.';
    if (!form.reward_only && (!isCount(form.points_cost) || Number(form.points_cost) < 1)) e.points_cost = 'Enter the points it costs, or make it reward-only.';
    if (sized) {
      if (form.sizes.length === 0) e.sizes = 'Choose at least one size.';
      else if (form.sizes.some(s => !isCount(form.stock_by_size[s]))) e.stock_by_size = 'Enter a whole number for each size.';
    } else if (!form.unlimited && !isCount(form.stock)) {
      e.stock = 'Enter a whole number, or tick Unlimited.';
    }
    return e;
  };

  const submit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    const found = validate();
    setErrors(found);
    setFormError(null);
    if (Object.keys(found).length) return;

    const payload: GiftInput = {
      name: form.name.trim(),
      description: form.description.trim(),
      image: form.image.trim(),
      level: form.level,
      points_cost: form.reward_only ? null : Number(form.points_cost),
      kind: form.kind,
      // A gift with sizes counts stock per size only.
      stock: sized || form.unlimited ? null : Number(form.stock),
      ...(sized ? { sizes: form.sizes, stock_by_size: Object.fromEntries(form.sizes.map(s => [s, Number(form.stock_by_size[s])])) } : {}),
      active: form.active
    };

    setIsSaving(true);
    try {
      if (editing) {
        // Members claim stock while the form is open: send counts only when the admin changed them, with the ones they replace.
        const { stock, sizes, stock_by_size, ...rest } = payload;
        const sameStock = stock === editing.stock && String(sizes) === String(editing.sizes) && (sizes ?? []).every(s => stock_by_size?.[s] === editing.stock_by_size?.[s]);
        const expected_stock = { stock: editing.stock, ...(editing.stock_by_size ? { stock_by_size: editing.stock_by_size } : {}) };
        const { message } = await api.updateGift(editing.id, sameStock ? rest : { ...payload, expected_stock });
        onSaved(message ?? `${payload.name} was saved.`);
      } else {
        const gift = await api.createGift(payload);
        onSaved(`${gift.name} was added to the catalogue.`);
      }
    } catch (err) {
      // 409s (a size a claim holds, a gift a rule names, stock claimed meanwhile) come back as the form's message.
      const { fieldErrors, formError } = formErrorsFrom(err, FIELDS);
      setErrors(fieldErrors);
      setFormError(formError);
    } finally {
      setIsSaving(false);
    }
  };

  const common = (key: (typeof FIELDS)[number]) => ({
    id: `gift-${key}`,
    'aria-invalid': !!errors[key],
    'aria-describedby': errors[key] ? `gift-${key}-error` : undefined,
    className: inputClass
  });
  const field = (key: (typeof FIELDS)[number], label: string, input: React.ReactNode, hint?: React.ReactNode) => (
    <div>
      <label htmlFor={`gift-${key}`} className={labelClass}>
        {label}
      </label>
      {input}
      {hint && <p className={hintClass}>{hint}</p>}
      <FieldError id={`gift-${key}-error`} message={errors[key]} />
    </div>
  );
  const check = (label: string, checked: boolean, onChange: (v: boolean) => void, disabled = false) => (
    <label className="inline-flex items-center gap-2 text-sm font-semibold text-slate-200">
      <input type="checkbox" checked={checked} disabled={disabled} onChange={e => onChange(e.target.checked)} className="w-4 h-4 accent-lime-500" />
      {label}
    </label>
  );

  return (
    <Modal isOpen onClose={isSaving ? () => undefined : onClose} title={editing ? `Edit ${editing.name}` : 'Add a gift'} maxWidth="2xl">
      <form onSubmit={submit} className="space-y-4" noValidate>
        <FormError message={formError} />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {field('name', 'Name', <input type="text" maxLength={60} value={form.name} onChange={e => set('name', e.target.value)} {...common('name')} />)}
          {field(
            'level',
            'Level',
            <select value={form.level} onChange={e => set('level', e.target.value as GiftLevel)} {...common('level')}>
              {LEVELS.map(l => (
                <option key={l.value} value={l.value}>
                  {l.label} ({l.band})
                </option>
              ))}
            </select>
          )}
        </div>
        {field('description', 'Description', <textarea rows={2} maxLength={300} value={form.description} onChange={e => set('description', e.target.value)} {...common('description')} />)}

        <div>
          <label htmlFor="gift-image" className={labelClass}>
            Picture
          </label>
          <div className="flex items-center gap-3 flex-wrap">
            <GiftImage image={form.image || ' '} name={form.name} />
            {isPhoto ? (
              <button type="button" onClick={() => set('image', '🎁')} className={`px-3 py-2 neu-btn rounded-xl text-xs font-bold ${focusRing}`}>
                Use an emoji instead
              </button>
            ) : (
              <input type="text" maxLength={8} value={form.image} onChange={e => set('image', e.target.value)} {...common('image')} className={inputClass.replace('w-full', 'w-24')} />
            )}
            <input ref={fileInputRef} type="file" accept="image/png,image/jpeg,image/webp" onChange={onPhotoChosen} className="sr-only" tabIndex={-1} aria-hidden="true" />
            <button type="button" onClick={() => fileInputRef.current?.click()} className={`px-3 py-2 neu-btn rounded-xl text-xs font-bold inline-flex items-center gap-1.5 ${focusRing}`}>
              <ImagePlus className="w-3.5 h-3.5" aria-hidden="true" /> Upload a photo
            </button>
          </div>
          {builtIn.length > 0 && (
            <select aria-label="Built-in picture" value={builtIn.some(([, path]) => path === form.image) ? form.image : ''} onChange={e => e.target.value && set('image', e.target.value)} className={`${inputClass} mt-2 sm:w-64`}>
              <option value="">Pick a built-in picture</option>
              {builtIn.map(([id, path]) => (
                <option key={id} value={path}>
                  {id.replace(/^gift_/, '').replace(/_/g, ' ')}
                </option>
              ))}
            </select>
          )}
          <p className={hintClass}>An emoji, a built-in picture, or a photo (shrunk to 256 px before it is saved).</p>
          <FieldError id="gift-image-error" message={errors.image} />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            {field(
              'points_cost',
              'Points',
              <input type="number" inputMode="numeric" min={1} value={form.reward_only ? '' : form.points_cost} disabled={form.reward_only} onChange={e => set('points_cost', e.target.value)} {...common('points_cost')} />
            )}
            {check('Reward only (milestones and joining gifts, not in the store)', form.reward_only, v => set('reward_only', v))}
          </div>
          {field(
            'kind',
            'Kind',
            <select value={form.kind} onChange={e => set('kind', e.target.value as Gift['kind'])} disabled={!!editing?.sizes} {...common('kind')}>
              <option value="item">Item to hand over</option>
              <option value="service">Service (a session, free days, a guest pass)</option>
            </select>,
            form.kind === 'service' ? 'Staff fulfil a service by hand, then mark it handed over.' : undefined
          )}
        </div>

        {form.kind === 'item' && (
          <div className="space-y-2">
            {check('Comes in sizes', form.has_sizes, v => set('has_sizes', v), !!editing?.sizes)}
            {editing?.sizes && <p className={hintClass}>A gift with sizes keeps them. Untick a size to stop offering it.</p>}
          </div>
        )}

        {sized ? (
          <fieldset className="space-y-2">
            <legend className={labelClass}>Stock per size</legend>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              {SIZES.map(s => {
                const offered = form.sizes.includes(s);
                return (
                  <div key={s} className="space-y-1">
                    {check(s, offered, v => set('sizes', v ? SIZES.filter(x => x === s || form.sizes.includes(x)) : form.sizes.filter(x => x !== s)))}
                    <input
                      type="number"
                      inputMode="numeric"
                      min={0}
                      aria-label={`Stock of size ${s}`}
                      value={form.stock_by_size[s]}
                      disabled={!offered}
                      onChange={e => set('stock_by_size', { ...form.stock_by_size, [s]: e.target.value })}
                      className={inputClass}
                    />
                  </div>
                );
              })}
            </div>
            <FieldError message={errors.sizes ?? errors.stock_by_size} />
          </fieldset>
        ) : (
          <div className="space-y-2">
            {field('stock', 'Stock', <input type="number" inputMode="numeric" min={0} value={form.unlimited ? '' : form.stock} disabled={form.unlimited} onChange={e => set('stock', e.target.value)} {...common('stock')} />)}
            {check('Unlimited', form.unlimited, v => set('unlimited', v))}
          </div>
        )}

        <div className="space-y-1">
          {check('Active', form.active, v => set('active', v))}
          <p className={hintClass}>An inactive gift leaves the store and stops being granted; claims already made stay collectable.</p>
        </div>

        <div className="flex flex-col-reverse sm:flex-row gap-3 pt-4 border-t border-slate-800/80">
          <button type="button" onClick={onClose} disabled={isSaving} className={`flex-1 py-2.5 neu-btn font-bold text-sm rounded-xl disabled:opacity-50 ${focusRing}`}>
            Cancel
          </button>
          <button type="submit" disabled={isSaving} className={`flex-1 py-2.5 neu-btn-lime font-black text-sm rounded-xl flex items-center justify-center gap-2 disabled:opacity-60 ${focusRing}`}>
            {isSaving && <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />}
            {editing ? 'Save gift' : 'Add gift'}
          </button>
        </div>
      </form>
    </Modal>
  );
};

/** The whole gift catalogue with its stock: add, edit, retire or delete gifts. */
export const GiftCataloguePanel: React.FC = () => {
  const { showToast } = useToast();
  const gifts = useApiResource(() => api.getGiftCatalogue());
  const [target, setTarget] = useState<Gift | 'new' | null>(null);
  const [toDelete, setToDelete] = useState<Gift | null>(null);

  const remove = async () => {
    if (!toDelete) return;
    try {
      await api.deleteGift(toDelete.id);
      showToast(`${toDelete.name} was deleted.`, 'success', undefined, 'deleted');
    } catch (err) {
      // GIFT_IN_USE: a rule names it or members claimed it; the message says to deactivate it instead.
      showToast(errorMessage(err), 'error', `${toDelete.name} was not deleted`);
    }
    gifts.reload();
  };

  return (
    <SectionCard
      id="gift-catalogue-heading"
      title="Gift catalogue"
      icon={<GiftIcon className="w-4 h-4 text-lime-400" aria-hidden="true" />}
      description="What members can claim with points, and the gifts milestones and plans give. Stock you add goes to waiting claims first, oldest first."
      actions={
        <button type="button" onClick={() => setTarget('new')} className={`px-4 py-2.5 neu-btn-lime rounded-xl text-xs font-black flex items-center gap-2 ${focusRing}`}>
          <Plus className="w-4 h-4" aria-hidden="true" /> Add gift
        </button>
      }
    >
      {!gifts.data && gifts.error ? (
        <ErrorState message={`Could not load the catalogue. ${gifts.error}`} onRetry={gifts.reload} />
      ) : !gifts.data ? (
        <LoadingState label="Loading the catalogue…" />
      ) : gifts.data.length === 0 ? (
        <EmptyState title="No gifts in the catalogue" body="Add the first gift members can earn." />
      ) : (
        // relative: keeps the sr-only header (absolutely positioned) inside the scroller, so the table never widens a phone's page.
        <div className="relative neu-pressed-sm rounded-2xl overflow-x-auto">
          <table className="neu-table w-full text-left text-xs">
            <caption className="sr-only">Gift catalogue</caption>
            <thead className="border-b border-slate-800/80 text-slate-400 font-bold uppercase tracking-wider text-[10px]">
              <tr>
                <th scope="col" className="p-3 pl-4">Gift</th>
                <th scope="col" className="p-3">Level</th>
                <th scope="col" className="p-3">Cost</th>
                <th scope="col" className="p-3">Stock</th>
                <th scope="col" className="p-3">Status</th>
                <th scope="col" className="p-3 pr-4">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 text-slate-300">
              {gifts.data.map(g => (
                <tr key={g.id}>
                  <td className="p-3 pl-4">
                    <div className="flex items-center gap-3 min-w-[12rem]">
                      <GiftImage image={g.image} name={g.name} className="w-10 h-10 text-2xl" />
                      <div className="min-w-0">
                        <p className="font-extrabold text-sm text-slate-100 font-heading">{g.name}</p>
                        {g.kind === 'service' && <p className="text-[11px] text-slate-400">Service</p>}
                      </div>
                    </div>
                  </td>
                  <td className="p-3 whitespace-nowrap">{LEVELS.find(l => l.value === g.level)?.label ?? g.level}</td>
                  <td className="p-3 whitespace-nowrap">{g.points_cost === null ? 'Reward only' : `${g.points_cost.toLocaleString('en-IN')} points`}</td>
                  <td className="p-3 whitespace-nowrap">{stockText(g)}</td>
                  <td className="p-3">
                    <Badge size="sm" variant={g.active ? 'lime' : 'slate'}>
                      {g.active ? 'Active' : 'Inactive'}
                    </Badge>
                  </td>
                  <td className="p-3 pr-4">
                    <div className="flex gap-2 justify-end">
                      <button type="button" onClick={() => setTarget(g)} aria-label={`Edit ${g.name}`} title="Edit" className={`p-2 neu-btn rounded-lg ${focusRing}`}>
                        <Edit2 className="w-3.5 h-3.5" aria-hidden="true" />
                      </button>
                      <button type="button" onClick={() => setToDelete(g)} aria-label={`Delete ${g.name}`} title="Delete" className={`p-2 neu-btn rounded-lg hover:text-rose-400 ${focusRing}`}>
                        <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <GiftFormModal
        target={target}
        onClose={() => setTarget(null)}
        onSaved={message => {
          setTarget(null);
          showToast(message, 'success', undefined, 'saved');
          gifts.reload();
        }}
      />
      <ConfirmDialog
        isOpen={toDelete !== null}
        title="Delete this gift?"
        message={
          toDelete && (
            <p>
              <strong>{toDelete.name}</strong> is removed from the catalogue. A gift that members have claimed, or that a milestone or plan gives, cannot be deleted: deactivate it instead.
            </p>
          )
        }
        confirmLabel="Delete gift"
        tone="danger"
        onConfirm={remove}
        onClose={() => setToDelete(null)}
      />
    </SectionCard>
  );
};

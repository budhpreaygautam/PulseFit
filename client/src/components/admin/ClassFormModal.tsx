import React, { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { GymClass, Trainer } from '../../types/index.js';
import { ApiError, api } from '../../api/client.js';
import { Modal } from '../common/Modal.js';
import { DAY_NAMES } from '../../lib/format.js';
import { useAppConfig } from '../../context/ConfigContext.js';
import { FieldError, FormError, focusRing, formErrorsFrom, hintClass, inputClass, labelClass, sideEffectsOf } from './ui.js';

export const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];
const CATEGORIES = ['Workout & Strength', 'Zumba & Cardio'];
const INTENSITIES: GymClass['intensity'][] = ['Low', 'Medium', 'High', 'Extreme'];

type Form = {
  title: string;
  category: string;
  trainer_id: string;
  day_of_week: string;
  start_time: string;
  duration_minutes: string;
  room: string;
  capacity: string;
  intensity: GymClass['intensity'];
  description: string;
  image_url: string;
  calories_burn_est: string;
};

const EMPTY: Form = {
  title: '',
  category: CATEGORIES[0],
  trainer_id: '',
  day_of_week: '1',
  start_time: '07:00',
  duration_minutes: '60',
  room: '',
  capacity: '20',
  intensity: 'Medium',
  description: '',
  image_url: '',
  calories_burn_est: '0'
};

const toForm = (c: GymClass): Form => ({
  title: c.title,
  category: c.category,
  trainer_id: c.trainer_id,
  day_of_week: String(c.day_of_week),
  start_time: c.start_time,
  duration_minutes: String(c.duration_minutes),
  room: c.room,
  capacity: String(c.capacity),
  intensity: c.intensity,
  description: c.description ?? '',
  image_url: c.image_url ?? '',
  calories_burn_est: String(c.calories_burn_est ?? 0)
});

const isInt = (v: string, min: number, max: number) => /^\d+$/.test(v.trim()) && Number(v) >= min && Number(v) <= max;
const isHttpUrl = (v: string) => {
  try {
    return ['http:', 'https:'].includes(new URL(v).protocol);
  } catch {
    return false;
  }
};

interface ClassFormModalProps {
  /** 'new' to create, a class to edit, null when closed. */
  target: GymClass | 'new' | null;
  trainers: Trainer[];
  onClose: () => void;
  /** `notice` is what the save did besides saving, e.g. "2 upcoming bookings were cancelled (…)". */
  onSaved: (message: string, notice?: string) => void;
  /** The chosen coach no longer exists; the page should reload its coach list. */
  onTrainersStale: () => void;
}

export const ClassFormModal: React.FC<ClassFormModalProps> = ({ target, trainers, onClose, onSaved, onTrainersStale }) => {
  const [form, setForm] = useState<Form>(EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const editing = target && target !== 'new' ? target : null;
  const { closedWeekdays } = useAppConfig().config.gym.hours;

  useEffect(() => {
    if (!target) return;
    setForm(target === 'new' ? { ...EMPTY, trainer_id: trainers[0]?.id ?? '' } : toForm(target));
    setErrors({});
    setFormError(null);
    // Only when the dialog opens; the coach list refreshing must not wipe what was typed.
  }, [target]);

  if (!target) return null;
  const set = <K extends keyof Form>(key: K, value: Form[K]) => setForm(f => ({ ...f, [key]: value }));

  const validate = () => {
    const e: Record<string, string> = {};
    const title = form.title.trim();
    if (title.length < 2 || title.length > 100) e.title = 'Enter a title of 2 to 100 characters.';
    if (!form.trainer_id) e.trainer_id = 'Choose a coach.';
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(form.start_time)) e.start_time = 'Enter a start time.';
    if (!isInt(form.duration_minutes, 15, 180)) e.duration_minutes = 'Enter 15 to 180 minutes.';
    const room = form.room.trim();
    if (room.length < 1 || room.length > 60) e.room = 'Enter a room (up to 60 characters).';
    if (!isInt(form.capacity, 1, 200)) e.capacity = 'Enter a capacity from 1 to 200.';
    if (form.description.trim().length > 1000) e.description = 'Keep the description under 1,000 characters.';
    const image = form.image_url.trim();
    if (image ? !isHttpUrl(image) : !!editing) e.image_url = 'Enter an image URL starting with https://.';
    if (!isInt(form.calories_burn_est, 0, 3000)) e.calories_burn_est = 'Enter 0 to 3,000 calories.';
    return e;
  };

  const submit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    const found = validate();
    setErrors(found);
    setFormError(null);
    if (Object.keys(found).length) return;

    const payload = {
      title: form.title.trim(),
      category: form.category,
      trainer_id: form.trainer_id,
      day_of_week: Number(form.day_of_week),
      start_time: form.start_time,
      duration_minutes: Number(form.duration_minutes),
      room: form.room.trim(),
      capacity: Number(form.capacity),
      intensity: form.intensity,
      description: form.description.trim(),
      calories_burn_est: Number(form.calories_burn_est),
      ...(form.image_url.trim() ? { image_url: form.image_url.trim() } : {})
    };

    setIsSaving(true);
    try {
      if (editing) {
        const changes = Object.fromEntries(
          Object.entries(payload).filter(([key, value]) => editing[key as keyof GymClass] !== value)
        ) as Partial<GymClass>;
        if (Object.keys(changes).length === 0) {
          onClose();
          return;
        }
        // The server counts the bookings a day or category change cancelled, and why.
        const { message } = await api.updateClass(editing.id, changes);
        onSaved(`${payload.title} was updated.`, sideEffectsOf(message));
      } else {
        await api.createClass(payload);
        onSaved(`${payload.title} was added to the timetable.`);
      }
    } catch (err) {
      if (err instanceof ApiError && err.code === 'CAPACITY_BELOW_BOOKINGS') setErrors({ capacity: err.message });
      else if (err instanceof ApiError && err.code === 'TRAINER_NOT_FOUND') {
        setErrors({ trainer_id: `${err.message} Choose another coach.` });
        onTrainersStale();
      } else {
        const { fieldErrors, formError } = formErrorsFrom(err, [...Object.keys(EMPTY), 'end_time']);
        // A class that runs past closing time is reported on end_time, which the form sets through its length.
        if (fieldErrors.end_time) {
          fieldErrors.duration_minutes ??= fieldErrors.end_time;
          delete fieldErrors.end_time;
        }
        setErrors(fieldErrors);
        setFormError(formError);
      }
    } finally {
      setIsSaving(false);
    }
  };

  const field = (key: keyof Form, label: string, input: React.ReactNode, hint?: string) => (
    <div>
      <label htmlFor={`class-${key}`} className={labelClass}>{label}</label>
      {input}
      {hint && <p className={hintClass}>{hint}</p>}
      <FieldError id={`class-${key}-error`} message={errors[key]} />
    </div>
  );
  const common = (key: keyof Form) => ({
    id: `class-${key}`,
    'aria-invalid': !!errors[key],
    'aria-describedby': errors[key] ? `class-${key}-error` : undefined,
    className: inputClass
  });
  const dayChanged = editing && Number(form.day_of_week) !== editing.day_of_week;
  const categoryChanged = editing && form.category !== editing.category;
  const warningClass = 'rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-xs font-semibold text-amber-800 dark:text-amber-300';

  return (
    <Modal isOpen onClose={isSaving ? () => undefined : onClose} title={editing ? `Edit ${editing.title}` : 'Add a class'} description="A weekly class: it runs on the same day and time every week." maxWidth="2xl">
      <form onSubmit={submit} className="space-y-4" noValidate>
        <FormError message={formError} />
        {field('title', 'Title', <input type="text" value={form.title} onChange={e => set('title', e.target.value)} {...common('title')} />)}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {field(
            'category',
            'Category',
            <select value={form.category} onChange={e => set('category', e.target.value)} {...common('category')}>
              {CATEGORIES.map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          )}
          {field(
            'trainer_id',
            'Coach',
            <select value={form.trainer_id} onChange={e => set('trainer_id', e.target.value)} {...common('trainer_id')}>
              <option value="" disabled>Choose a coach</option>
              {trainers.map(t => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          )}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {field(
            'day_of_week',
            'Day',
            <select value={form.day_of_week} onChange={e => set('day_of_week', e.target.value)} {...common('day_of_week')}>
              {/* The gym is closed on these days; an older class already on one keeps it while edited. */}
              {WEEK_ORDER.filter(d => !closedWeekdays.includes(d) || editing?.day_of_week === d).map(d => (
                <option key={d} value={d}>{DAY_NAMES[d]}</option>
              ))}
            </select>
          )}
          {field('start_time', 'Starts (gym time)', <input type="time" value={form.start_time} onChange={e => set('start_time', e.target.value)} {...common('start_time')} />)}
          {field('duration_minutes', 'Minutes', <input type="number" inputMode="numeric" min={15} max={180} value={form.duration_minutes} onChange={e => set('duration_minutes', e.target.value)} {...common('duration_minutes')} />)}
        </div>
        {dayChanged && (
          <p className={warningClass} role="note">
            Moving the class to another day cancels its upcoming bookings on {DAY_NAMES[editing.day_of_week]}.
          </p>
        )}
        {categoryChanged && (
          <p className={warningClass} role="note">
            Changing the category cancels upcoming bookings by members whose plan does not include {form.category}.
          </p>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {field('room', 'Room', <input type="text" value={form.room} onChange={e => set('room', e.target.value)} {...common('room')} />)}
          {field('capacity', 'Capacity', <input type="number" inputMode="numeric" min={1} max={200} value={form.capacity} onChange={e => set('capacity', e.target.value)} {...common('capacity')} />)}
          {field(
            'intensity',
            'Intensity',
            <select value={form.intensity} onChange={e => set('intensity', e.target.value as GymClass['intensity'])} {...common('intensity')}>
              {INTENSITIES.map(i => (
                <option key={i} value={i}>{i}</option>
              ))}
            </select>
          )}
        </div>
        {field('description', 'Description', <textarea rows={3} value={form.description} onChange={e => set('description', e.target.value)} {...common('description')} />)}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="sm:col-span-2">
            {field(
              'image_url',
              'Image URL',
              <input type="url" value={form.image_url} onChange={e => set('image_url', e.target.value)} placeholder="https://" {...common('image_url')} />,
              editing ? undefined : 'Leave empty to use the default class photo.'
            )}
          </div>
          {field('calories_burn_est', 'Calories (estimate)', <input type="number" inputMode="numeric" min={0} max={3000} value={form.calories_burn_est} onChange={e => set('calories_burn_est', e.target.value)} {...common('calories_burn_est')} />)}
        </div>
        <div className="flex flex-col-reverse sm:flex-row gap-3 pt-4 border-t border-slate-800/80">
          <button type="button" onClick={onClose} disabled={isSaving} className={`flex-1 py-2.5 neu-btn font-bold text-sm rounded-xl disabled:opacity-50 ${focusRing}`}>
            Cancel
          </button>
          <button type="submit" disabled={isSaving} className={`flex-1 py-2.5 neu-btn-lime font-black text-sm rounded-xl flex items-center justify-center gap-2 disabled:opacity-60 ${focusRing}`}>
            {isSaving && <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />}
            {editing ? 'Save class' : 'Add class'}
          </button>
        </div>
      </form>
    </Modal>
  );
};

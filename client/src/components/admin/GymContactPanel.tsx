import React, { useEffect, useState } from 'react';
import { Loader2, Phone } from 'lucide-react';
import { GymContact } from '../../types/index.js';
import { api } from '../../api/client.js';
import { useToast } from '../../context/ToastContext.js';
import { ErrorState, LoadingState } from '../common/States.js';
import { useApiResource } from '../member/useApiResource.js';
import { FieldError, FormError, SectionCard, focusRing, formErrorsFrom, hintClass, inputClass, labelClass } from './ui.js';

const HIDE_ICON = 'Leave empty to hide the icon.';

const FIELDS: { key: keyof GymContact; label: string; type: 'tel' | 'email' | 'url'; placeholder: string; hint: string }[] = [
  { key: 'phone', label: 'Phone', type: 'tel', placeholder: '+91 98110 12345', hint: 'An Indian mobile or landline. On the website, the app, ID cards and payment messages.' },
  { key: 'whatsapp', label: 'WhatsApp number', type: 'tel', placeholder: '+91 98110 12345', hint: 'Leave empty to hide the WhatsApp button.' },
  { key: 'email', label: 'Email', type: 'email', placeholder: 'desk@yourgym.in', hint: 'Shown next to the phone number.' },
  { key: 'instagram', label: 'Instagram', type: 'url', placeholder: 'https://instagram.com/yourgym', hint: HIDE_ICON },
  { key: 'facebook', label: 'Facebook', type: 'url', placeholder: 'https://facebook.com/yourgym', hint: HIDE_ICON },
  { key: 'youtube', label: 'YouTube', type: 'url', placeholder: 'https://youtube.com/@yourgym', hint: HIDE_ICON },
  { key: 'x', label: 'X (Twitter)', type: 'url', placeholder: 'https://x.com/yourgym', hint: HIDE_ICON }
];
const KEYS = FIELDS.map(f => f.key);

/** The phone, WhatsApp, email and social links everyone sees (GET /api/config): one form, one Save. */
export const GymContactPanel: React.FC = () => {
  const { showToast } = useToast();
  const saved = useApiResource(() => api.getGymContact());
  const [form, setForm] = useState<GymContact | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (saved.data) setForm(saved.data);
  }, [saved.data]);

  if (!saved.data && saved.error) return <ErrorState message={`Could not load the contact details. ${saved.error}`} onRetry={saved.reload} />;
  if (!form) return <LoadingState label="Loading the contact details…" />;

  const save = async (ev: React.FormEvent) => {
    ev.preventDefault();
    setErrors({});
    setFormError(null);
    setIsSaving(true);
    try {
      // The server checks every field and sends back the phones in its one stored form.
      const { data, message } = await api.updateGymContact(form);
      setForm(data);
      showToast(message ?? 'Gym contact details saved.', 'success');
    } catch (err) {
      const { fieldErrors, formError } = formErrorsFrom(err, KEYS);
      setErrors(fieldErrors);
      setFormError(formError);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <form onSubmit={save} className="space-y-6" noValidate>
      <FormError message={formError} />
      <SectionCard
        id="gym-contact-heading"
        title="Gym contact details"
        icon={<Phone className="w-4 h-4 text-lime-400" aria-hidden="true" />}
        description="How people call, message, email and follow the gym, on the website and in the app. A change shows on the next page load, with no app update."
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {FIELDS.map(f => (
            <div key={f.key}>
              <label htmlFor={`contact-${f.key}`} className={labelClass}>
                {f.label}
              </label>
              <input
                id={`contact-${f.key}`}
                type={f.type}
                inputMode={f.type}
                autoComplete="off"
                value={form[f.key]}
                onChange={e => setForm({ ...form, [f.key]: e.target.value })}
                placeholder={f.placeholder}
                aria-invalid={!!errors[f.key]}
                aria-describedby={`contact-${f.key}-hint${errors[f.key] ? ` contact-${f.key}-error` : ''}`}
                className={inputClass}
              />
              <p id={`contact-${f.key}-hint`} className={hintClass}>
                {f.hint}
              </p>
              <FieldError id={`contact-${f.key}-error`} message={errors[f.key]} />
            </div>
          ))}
        </div>
      </SectionCard>
      <div className="flex justify-end">
        <button type="submit" disabled={isSaving} className={`px-5 py-2.5 neu-btn-lime rounded-xl text-sm font-black flex items-center justify-center gap-2 disabled:opacity-50 ${focusRing}`}>
          {isSaving && <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />}
          Save contact details
        </button>
      </div>
    </form>
  );
};

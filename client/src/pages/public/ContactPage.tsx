import React, { useState } from 'react';
import { CheckCircle2, Loader2, Mail, MessageSquare, Phone, Send, User as UserIcon } from 'lucide-react';
import { FormField, issuesByField } from '../../components/public/FormField.js';
import { TabLink } from '../../components/public/TabLink.js';
import { emailError, nameError, normalizeIndianPhone, PHONE_HINT } from '../../components/public/validation.js';
import { CATEGORIES, HOURS_SUMMARY } from '../../components/public/gymInfo.js';
import { WhatsAppButton } from '../../components/public/ContactLinks.js';
import { useAppConfig } from '../../context/ConfigContext.js';
import { useNavigation } from '../../context/NavigationContext.js';
import { formatPhone } from '../../lib/format.js';
import { api, errorMessage, isApiError } from '../../api/client.js';
import { Enquiry } from '../../types/index.js';
import { PageScene } from '../../components/app/PageScene.js';

const INTERESTS: Enquiry['interest'][] = [...CATEGORIES, 'All-Access', 'Not sure yet'];
const CONTACT_TIMES: Enquiry['contact_time'][] = ['Any time', 'Morning', 'Afternoon', 'Evening'];

type Field = 'name' | 'email' | 'phone' | 'message' | 'consent';

const labelClass = 'block text-xs font-bold uppercase tracking-wider text-slate-300 mb-1';
const inputClass = 'w-full px-3.5 py-2.5 text-sm text-slate-100 placeholder-slate-500 rounded-xl';

export const ContactPage: React.FC = () => {
  const { navigate } = useNavigation();
  const { phone: gymPhone } = useAppConfig().config.gym.contact;
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [interest, setInterest] = useState<Enquiry['interest']>('Not sure yet');
  const [contactTime, setContactTime] = useState<Enquiry['contact_time']>('Any time');
  const [message, setMessage] = useState('');
  const [consent, setConsent] = useState(false);
  const [website, setWebsite] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<Field, string>>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const validate = (): boolean => {
    const errors: Partial<Record<Field, string>> = {};
    const n = nameError(name);
    if (n) errors.name = n;
    const e = emailError(email);
    if (e) errors.email = e;
    if (!phone.trim()) errors.phone = 'Enter your mobile number so the front desk can call you back.';
    else if (!normalizeIndianPhone(phone)) errors.phone = PHONE_HINT;
    if (!consent) errors.consent = 'Please agree so we can contact you.';
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (!validate()) return;

    setIsSubmitting(true);
    const normalizedPhone = normalizeIndianPhone(phone)!;
    try {
      await api.sendEnquiry({
        name: name.trim(),
        email: email.trim(),
        phone: normalizedPhone,
        interest,
        contact_time: contactTime,
        message: message.trim(),
        consent: true,
        website
      });
      setSentTo(normalizedPhone);
    } catch (err) {
      if (isApiError(err) && err.code === 'RATE_LIMITED') {
        setFormError(`Too many enquiries from this connection. Please call us on ${formatPhone(gymPhone)}.`);
      } else if (isApiError(err) && err.code === 'VALIDATION_ERROR' && Object.keys(issuesByField(err.data)).length > 0) {
        setFieldErrors(issuesByField(err.data) as Partial<Record<Field, string>>);
      } else {
        setFormError(errorMessage(err));
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <article className="max-w-3xl mx-auto px-4 sm:px-6 py-10 sm:py-14">
      <header className="space-y-3 border-b border-slate-800/80 pb-6">
        <div className="w-12 h-12 rounded-2xl neu-pressed-sm flex items-center justify-center text-lime-400">
          <MessageSquare className="w-5 h-5" aria-hidden="true" />
        </div>
        <PageScene tab="contact" placement="beside" />
        <h1 className="text-3xl sm:text-4xl font-black text-slate-100 font-heading">Contact us</h1>
        <p className="text-sm text-slate-400">Questions about memberships, classes or timings? Leave your details and our front desk will call you back.</p>
        <p className="text-xs text-slate-500">
          Prefer to call?{' '}
          <a href={`tel:${gymPhone}`} className="text-lime-400 underline">
            {formatPhone(gymPhone)}
          </a>{' '}
          · {HOURS_SUMMARY}
        </p>
        <WhatsAppButton />
      </header>

      <div className="mt-8">
        {sentTo ? (
          <div role="status" className="neu-flat rounded-3xl p-6 border border-lime-500/40 space-y-2">
            <CheckCircle2 className="w-8 h-8 text-lime-400" aria-hidden="true" />
            <h2 className="text-xl font-black text-slate-100 font-heading">Thanks, we've got your enquiry</h2>
            <p className="text-sm text-slate-300">
              We'll call you on {sentTo} during opening hours ({HOURS_SUMMARY}).
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="neu-flat rounded-3xl p-6 sm:p-8 space-y-4" noValidate>
            <FormField
              id="enquiry-name"
              label="Full name"
              icon={UserIcon}
              autoComplete="name"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. Aarav Sharma"
              maxLength={60}
              error={fieldErrors.name}
              required
            />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormField
                id="enquiry-email"
                label="Email"
                icon={Mail}
                type="email"
                autoComplete="email"
                inputMode="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@example.com"
                error={fieldErrors.email}
                required
              />
              <FormField
                id="enquiry-phone"
                label="Mobile number"
                icon={Phone}
                type="tel"
                autoComplete="tel"
                inputMode="tel"
                value={phone}
                onChange={e => setPhone(e.target.value)}
                placeholder="+91 98110 12345"
                error={fieldErrors.phone}
                required
              />
            </div>

            <fieldset>
              <legend className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-1.5">What are you interested in?</legend>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {INTERESTS.map(option => (
                  <label
                    key={option}
                    className={`flex items-center gap-2 p-3 rounded-xl cursor-pointer text-sm font-bold transition-all has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-lime-500 ${
                      interest === option ? 'neu-pressed-sm text-lime-400 border border-lime-500/40' : 'neu-btn text-slate-200'
                    }`}
                  >
                    <input type="radio" name="enquiry-interest" value={option} checked={interest === option} onChange={() => setInterest(option)} className="sr-only" />
                    {option}
                  </label>
                ))}
              </div>
            </fieldset>

            <div>
              <label htmlFor="enquiry-time" className={labelClass}>
                Best time to call
              </label>
              <select id="enquiry-time" value={contactTime} onChange={e => setContactTime(e.target.value as Enquiry['contact_time'])} className={inputClass}>
                {CONTACT_TIMES.map(t => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="enquiry-message" className={labelClass}>
                Message <span className="ml-1 normal-case tracking-normal font-medium text-slate-500">(optional)</span>
              </label>
              <textarea
                id="enquiry-message"
                rows={4}
                maxLength={1000}
                value={message}
                onChange={e => setMessage(e.target.value)}
                aria-invalid={fieldErrors.message ? true : undefined}
                aria-describedby={fieldErrors.message ? 'enquiry-message-error' : undefined}
                className={inputClass}
              />
              {fieldErrors.message && (
                <p id="enquiry-message-error" role="alert" className="mt-1 text-xs font-semibold text-rose-400">
                  {fieldErrors.message}
                </p>
              )}
            </div>

            <div>
              <div className="flex items-start gap-2">
                <input
                  type="checkbox"
                  id="enquiry-consent"
                  checked={consent}
                  onChange={e => setConsent(e.target.checked)}
                  aria-invalid={fieldErrors.consent ? true : undefined}
                  aria-describedby={fieldErrors.consent ? 'enquiry-consent-error' : undefined}
                  className="w-4 h-4 mt-0.5 accent-lime-500"
                />
                <label htmlFor="enquiry-consent" className="text-xs text-slate-300">
                  PulseFit Athletics may contact me about this enquiry by phone or email.{' '}
                  <TabLink tab="privacy" navigate={navigate} className="text-lime-400 underline">
                    Privacy policy
                  </TabLink>
                </label>
              </div>
              {fieldErrors.consent && (
                <p id="enquiry-consent-error" role="alert" className="mt-1 text-xs font-semibold text-rose-400">
                  {fieldErrors.consent}
                </p>
              )}
            </div>

            {/* Trap field: hidden from people and screen readers; the server drops any enquiry that fills it. */}
            <div aria-hidden="true" className="absolute -left-[10000px] w-px h-px overflow-hidden">
              <label htmlFor="enquiry-website">Website</label>
              <input id="enquiry-website" name="website" tabIndex={-1} autoComplete="off" value={website} onChange={e => setWebsite(e.target.value)} />
            </div>

            {formError && (
              <div role="alert" className="glass-tint p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-xs font-semibold text-rose-300">
                <p>{formError}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-3.5 neu-btn-lime font-black rounded-2xl text-sm flex items-center justify-center gap-2 disabled:opacity-60"
            >
              {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : <Send className="w-4 h-4" aria-hidden="true" />}
              {isSubmitting ? 'Sending…' : 'Send enquiry'}
            </button>
          </form>
        )}
      </div>
    </article>
  );
};

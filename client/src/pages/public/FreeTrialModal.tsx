import React, { useEffect, useMemo, useState } from 'react';
import { CalendarDays, Check, Copy, Loader2, Mail, Phone, Sparkles, Ticket, User as UserIcon } from 'lucide-react';
import { Modal } from '../../components/common/Modal.js';
import { FormField, issuesByField } from '../../components/public/FormField.js';
import { emailError, nameError, normalizeIndianPhone, PHONE_HINT } from '../../components/public/validation.js';
import { CATEGORIES, HOURS_TIME, weekdayOf } from '../../components/public/gymInfo.js';
import { useAuth } from '../../context/AuthContext.js';
import { api, errorMessage, isApiError } from '../../api/client.js';
import { addDays, formatDate, gymToday } from '../../lib/format.js';
import { ClassCategory, TrialPass } from '../../types/index.js';

interface FreeTrialModalProps {
  isOpen: boolean;
  onClose: () => void;
  onRegisterInstead: () => void;
}

const TRIAL_WINDOW_DAYS = 14;

type Field = 'name' | 'email' | 'phone' | 'interest' | 'preferred_date';

export const FreeTrialModal: React.FC<FreeTrialModalProps> = ({ isOpen, onClose, onRegisterInstead }) => {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [interest, setInterest] = useState<ClassCategory>(CATEGORIES[0]);
  const [preferredDate, setPreferredDate] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<Field, string>>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [alreadyClaimed, setAlreadyClaimed] = useState(false);
  const [pass, setPass] = useState<TrialPass | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [copied, setCopied] = useState(false);
  const { triggerCelebration } = useAuth();

  // The selectable days are computed at the gym (IST), recomputed each time the dialog opens.
  const days = useMemo(() => {
    const today = gymToday();
    return Array.from({ length: TRIAL_WINDOW_DAYS + 1 }, (_, i) => {
      const date = addDays(today, i);
      return { date, isSunday: weekdayOf(date) === 0, isToday: i === 0 };
    });
  }, [isOpen]);

  useEffect(() => {
    setName('');
    setEmail('');
    setPhone('');
    setInterest(CATEGORIES[0]);
    setPreferredDate('');
    setFieldErrors({});
    setFormError(null);
    setAlreadyClaimed(false);
    setPass(null);
    setIsSubmitting(false);
    setCopied(false);
  }, [isOpen]);

  const validate = (): boolean => {
    const errors: Partial<Record<Field, string>> = {};
    const n = nameError(name);
    if (n) errors.name = n;
    const e = emailError(email);
    if (e) errors.email = e;
    if (!phone.trim()) errors.phone = 'Enter your mobile number so the front desk can reach you.';
    else if (!normalizeIndianPhone(phone)) errors.phone = PHONE_HINT;
    if (!preferredDate) errors.preferred_date = 'Pick the day you want to visit.';
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleClaim = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setAlreadyClaimed(false);
    if (!validate()) return;

    setIsSubmitting(true);
    try {
      const trial = await api.claimTrial({
        name: name.trim(),
        email: email.trim(),
        phone: normalizeIndianPhone(phone)!,
        interest,
        preferred_date: preferredDate
      });
      setPass(trial);
      triggerCelebration();
    } catch (err) {
      if (isApiError(err) && err.code === 'TRIAL_ALREADY_CLAIMED') {
        setAlreadyClaimed(true);
        setFormError('A free trial has already been claimed with this email or phone number. Each person can have one free pass.');
      } else if (isApiError(err) && err.code === 'GYM_CLOSED') {
        setFieldErrors({ preferred_date: 'The gym is closed on Sundays. Please pick another day.' });
      } else if (isApiError(err) && err.code === 'RATE_LIMITED') {
        setFormError('Too many free-pass requests from this connection. Please try again in an hour, or ask at the front desk.');
      } else if (isApiError(err) && err.code === 'VALIDATION_ERROR' && Object.keys(issuesByField(err.data)).length > 0) {
        setFieldErrors(issuesByField(err.data) as Partial<Record<Field, string>>);
      } else {
        setFormError(errorMessage(err));
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const copyCode = async () => {
    if (!pass) return;
    try {
      await navigator.clipboard.writeText(pass.code);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={pass ? 'Your free pass is ready' : 'Claim a free 1-day pass'}
      description={pass ? 'Show this code at the front desk on your visit.' : 'Try the Strength floor or a Zumba & Cardio class for one day, free. No payment needed.'}
      maxWidth="lg"
    >
      {pass ? (
        <div className="space-y-5">
          <div className="p-6 rounded-3xl neu-flat border border-lime-500/40 text-center">
            <Ticket className="w-8 h-8 text-lime-400 mx-auto" aria-hidden="true" />
            <p className="mt-2 text-xs font-bold uppercase tracking-wider text-slate-400">Pass for {pass.name}</p>
            <div className="mt-3 flex items-center justify-center gap-2 flex-wrap">
              <span className="px-4 py-3 rounded-2xl neu-pressed font-mono text-lg sm:text-2xl font-black text-lime-400 tracking-widest break-all">{pass.code}</span>
              <button type="button" onClick={copyCode} className="neu-btn p-2.5 rounded-xl text-slate-200" aria-label="Copy pass code">
                {copied ? <Check className="w-4 h-4 text-lime-400" aria-hidden="true" /> : <Copy className="w-4 h-4" aria-hidden="true" />}
              </button>
            </div>
            <p className="mt-1 text-[11px] text-slate-400" role="status">
              {copied ? 'Code copied.' : ''}
            </p>
            <p className="mt-2 text-sm font-bold text-slate-100">Valid on {formatDate(pass.valid_on, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p>
            <p className="text-xs text-slate-400">{pass.interest}</p>
          </div>

          <div className="neu-pressed-sm p-4 rounded-2xl text-xs text-slate-300 space-y-2">
            <p className="font-bold text-lime-400">How to use it</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>
                Come in on {formatDate(pass.valid_on)} during opening hours ({HOURS_TIME}) and give this code at the front desk.
              </li>
              <li>It works once, on that day only.</li>
              <li>We don't email the code, so take a screenshot or copy it now.</li>
            </ul>
          </div>

          <div className="flex flex-col sm:flex-row gap-3">
            <button type="button" onClick={onClose} className="flex-1 py-3 neu-btn text-slate-200 font-bold rounded-xl text-sm">
              Done
            </button>
            <button type="button" onClick={onRegisterInstead} className="flex-1 py-3 neu-btn-lime font-extrabold rounded-xl text-sm">
              Create an account
            </button>
          </div>
        </div>
      ) : (
        <form onSubmit={handleClaim} className="space-y-4" noValidate>
          <FormField
            id="trial-name"
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
              id="trial-email"
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
              id="trial-phone"
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
            <legend className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-1.5">What would you like to try?</legend>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {CATEGORIES.map(category => (
                <label
                  key={category}
                  className={`flex items-center gap-2 p-3 rounded-xl cursor-pointer text-sm font-bold transition-all has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-lime-500 ${
                    interest === category ? 'neu-pressed-sm text-lime-400 border border-lime-500/40' : 'neu-btn text-slate-200'
                  }`}
                >
                  <input type="radio" name="trial-interest" value={category} checked={interest === category} onChange={() => setInterest(category)} className="sr-only" />
                  {category}
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset aria-describedby={fieldErrors.preferred_date ? 'trial-date-error' : 'trial-date-hint'}>
            <legend className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-1 flex items-center gap-1.5">
              <CalendarDays className="w-3.5 h-3.5" aria-hidden="true" /> Day of your visit
            </legend>
            <p id="trial-date-hint" className="text-[11px] text-slate-500 mb-2">
              Any day in the next two weeks. The gym is closed on Sundays.
            </p>
            <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
              {days.map(day => {
                const selected = preferredDate === day.date;
                return (
                  <label
                    key={day.date}
                    className={`relative px-2 py-2 rounded-xl text-center text-[11px] leading-tight transition-all has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-lime-500 ${
                      day.isSunday
                        ? 'neu-pressed-sm text-slate-500 opacity-60 cursor-not-allowed'
                        : selected
                          ? 'neu-pressed-sm text-lime-400 border border-lime-500/50 font-black cursor-pointer'
                          : 'neu-btn text-slate-200 font-semibold cursor-pointer'
                    }`}
                  >
                    <input
                      type="radio"
                      name="trial-date"
                      value={day.date}
                      disabled={day.isSunday}
                      checked={selected}
                      onChange={() => setPreferredDate(day.date)}
                      className="sr-only"
                    />
                    <span className="block font-bold">{day.isToday ? 'Today' : formatDate(day.date, { weekday: 'short' })}</span>
                    <span className="block">{formatDate(day.date, { day: 'numeric', month: 'short' })}</span>
                    {day.isSunday && <span className="block text-[9px] uppercase">Closed</span>}
                  </label>
                );
              })}
            </div>
            {fieldErrors.preferred_date && (
              <p id="trial-date-error" role="alert" className="mt-1 text-xs font-semibold text-rose-400">
                {fieldErrors.preferred_date}
              </p>
            )}
          </fieldset>

          {formError && (
            <div role="alert" className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-xs font-semibold text-rose-300 space-y-2">
              <p>{formError}</p>
              {alreadyClaimed && (
                <button type="button" onClick={onRegisterInstead} className="text-lime-400 font-bold hover:underline">
                  Create an account and choose a membership
                </button>
              )}
            </div>
          )}

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full py-3.5 neu-btn-lime font-black rounded-2xl text-sm flex items-center justify-center gap-2 disabled:opacity-60"
          >
            {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : <Sparkles className="w-4 h-4" aria-hidden="true" />}
            {isSubmitting ? 'Claiming your pass…' : 'Get my free pass'}
          </button>
          <p className="text-[11px] text-slate-500 text-center">One free pass per person. We use your details only to manage your visit.</p>
        </form>
      )}
    </Modal>
  );
};

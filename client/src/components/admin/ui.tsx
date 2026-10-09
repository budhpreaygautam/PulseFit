import React from 'react';
import { CalendarDays, Gauge, QrCode, Tag, Users, UserPlus } from 'lucide-react';
import { ApiError, errorMessage } from '../../api/client.js';
import { useNavigation } from '../../context/NavigationContext.js';

// Building blocks shared by the admin and coach screens.

export const focusRing = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lime-400 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent';
export const inputClass = 'w-full px-4 py-2.5 rounded-xl text-sm text-slate-100 placeholder-slate-500 font-medium disabled:opacity-60';
export const labelClass = 'block text-xs font-bold uppercase tracking-wider text-slate-300 mb-1.5';
export const hintClass = 'mt-1 text-[11px] text-slate-400';

export const FieldError: React.FC<{ id?: string; message?: string }> = ({ id, message }) =>
  message ? (
    <p id={id} className="mt-1 text-xs font-semibold text-rose-400" role="alert">
      {message}
    </p>
  ) : null;

export const FormError: React.FC<{ message?: string | null }> = ({ message }) =>
  message ? (
    <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm font-semibold text-rose-300 [.light_&]:text-rose-700" role="alert">
      {message}
    </div>
  ) : null;

type Issue = { path: string; message: string };
const issuesOf = (err: unknown): Issue[] =>
  err instanceof ApiError && err.code === 'VALIDATION_ERROR' ? ((err.data as { issues?: Issue[] } | undefined)?.issues ?? []) : [];

/** VALIDATION_ERROR issues keyed by their first path segment, for showing next to each field. */
export function fieldErrorsFrom(err: unknown): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const issue of issuesOf(err)) {
    const key = issue.path.split('.')[0];
    if (key && !errors[key]) errors[key] = issue.message;
  }
  return errors;
}

/**
 * A failed save, split into errors for the fields the form shows (`fields`) and one form-level
 * message for everything else, so no answer from the server is swallowed.
 */
export function formErrorsFrom(err: unknown, fields: readonly string[]): { fieldErrors: Record<string, string>; formError: string | null } {
  const issues = issuesOf(err);
  if (issues.length === 0) return { fieldErrors: {}, formError: errorMessage(err) };
  const fieldErrors: Record<string, string> = {};
  const other: string[] = [];
  for (const issue of issues) {
    const key = issue.path.split('.')[0];
    if (fields.includes(key)) {
      if (!fieldErrors[key]) fieldErrors[key] = issue.message;
    } else {
      other.push(key ? `${issue.path.replace(/[._]/g, ' ')}: ${issue.message}` : issue.message);
    }
  }
  return { fieldErrors, formError: other.length ? other.join(' ') : null };
}

/**
 * What an edit did besides saving, from the server's message: "Plan updated. 2 upcoming bookings
 * were cancelled …" gives "2 upcoming bookings were cancelled …". Undefined for a plain "Plan updated."
 */
export function sideEffectsOf(message?: string): string | undefined {
  const rest = message?.replace(/^\s*\w+ updated\.\s*/i, '').trim();
  return rest || undefined;
}

/** Toast type for a side-effect message: cancelled bookings or a member still locked out are a warning, anything else is news. */
export const sideEffectTone = (text: string) => (/cancel|cannot/i.test(text) ? ('warning' as const) : ('info' as const));

export const PageHeader: React.FC<{ eyebrow: string; title: string; description?: React.ReactNode; actions?: React.ReactNode }> = ({
  eyebrow,
  title,
  description,
  actions
}) => (
  <header className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-slate-800/80 pb-6">
    <div className="min-w-0">
      <p className="text-[11px] font-black uppercase tracking-[0.2em] text-lime-400">{eyebrow}</p>
      <h1 className="text-3xl sm:text-4xl font-black text-slate-100 tracking-tight mt-1 font-['Outfit']">{title}</h1>
      {description && <p className="text-sm text-slate-400 mt-1 max-w-2xl">{description}</p>}
    </div>
    {actions && <div className="flex flex-wrap items-center gap-2 shrink-0">{actions}</div>}
  </header>
);

const ADMIN_LINKS = [
  { tab: 'admin-dashboard', label: 'Dashboard', icon: Gauge },
  { tab: 'admin-members', label: 'Members', icon: Users },
  { tab: 'admin-scanner', label: 'Check-in', icon: QrCode },
  { tab: 'admin-classes', label: 'Classes & coaches', icon: CalendarDays },
  { tab: 'admin-plans', label: 'Plans', icon: Tag },
  { tab: 'admin-trials', label: 'Trial leads', icon: UserPlus }
];

/**
 * Links between the admin screens, for phones only: from the md breakpoint the navbar's
 * "Front desk & admin" bar shows the same links, and below it they sit behind the menu button.
 */
export const AdminNav: React.FC = () => {
  const { tab, navigate } = useNavigation();
  return (
    <nav aria-label="Admin sections" className="md:hidden -mx-4 px-4 sm:mx-0 sm:px-0 overflow-x-auto">
      <ul className="flex gap-2 py-2 w-max sm:w-auto sm:flex-wrap">
        {ADMIN_LINKS.map(({ tab: id, label, icon: Icon }) => {
          const active = tab === id;
          return (
            <li key={id}>
              <button
                type="button"
                onClick={() => navigate(id)}
                aria-current={active ? 'page' : undefined}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 whitespace-nowrap ${focusRing} ${
                  active ? 'neu-pressed-sm text-lime-400' : 'neu-btn text-slate-300'
                }`}
              >
                <Icon className="w-3.5 h-3.5" aria-hidden="true" /> {label}
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
};

/** Copies text and reports whether it worked (clipboard access can be refused). */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export const SectionCard: React.FC<{ title: string; icon?: React.ReactNode; description?: React.ReactNode; actions?: React.ReactNode; children: React.ReactNode; className?: string; id?: string }> = ({
  title,
  icon,
  description,
  actions,
  children,
  className = '',
  id
}) => (
  <section className={`neu-flat p-5 sm:p-7 rounded-3xl border border-slate-800/80 space-y-4 min-w-0 ${className}`} aria-labelledby={id}>
    <div className="flex items-start justify-between gap-3">
      <div className="flex-1 min-w-0">
        <h2 id={id} className="text-base font-extrabold text-slate-100 flex items-center gap-2 font-['Outfit']">
          {icon}
          {title}
        </h2>
        {description && <p className="text-xs text-slate-400 mt-0.5">{description}</p>}
      </div>
      {actions && <div className="shrink-0">{actions}</div>}
    </div>
    {children}
  </section>
);

export const Avatar: React.FC<{ src?: string | null; name: string; size?: string }> = ({ src, name, size = 'w-10 h-10' }) =>
  src ? (
    <img src={src} alt="" className={`${size} rounded-xl object-cover border border-slate-700 bg-slate-800 shrink-0`} />
  ) : (
    <span aria-hidden="true" className={`${size} rounded-xl neu-pressed-sm flex items-center justify-center text-xs font-black text-lime-400 shrink-0`}>
      {name
        .split(/\s+/)
        .map(part => part[0])
        .join('')
        .slice(0, 2)
        .toUpperCase()}
    </span>
  );

import React, { useEffect, useState } from 'react';
import { Mail, MessageSquare, Phone, ShieldCheck } from 'lucide-react';
import { useNavigation } from '../../context/NavigationContext.js';
import { TabLink } from '../../components/public/TabLink.js';
import { GYM_EMAIL, GYM_NAME, GYM_PHONE_DISPLAY, GYM_PHONE_TEL } from '../../components/public/gymInfo.js';
import { CONTENT, type Kind, PolicySections } from './LegalPage.js';
import { formatDate } from '../../lib/format.js';
import { isNativeApp } from '../../lib/native.js';
import { prefersReducedMotion } from '../../lib/appMotion.js';

const KINDS = Object.keys(CONTENT) as Kind[];
const linkClass = 'text-lime-400 underline';
// Clear of the sticky app bar when a jump link scrolls a part to the top.
const PART = 'scroll-mt-[calc(env(safe-area-inset-top)_+_4.5rem)] outline-none';

/**
 * The app's Policies & terms page (the website has none, and keeps /privacy, /terms and /refund-policy):
 * the website's three policies on one page with a jump list, then how to see or delete your account's
 * data, who to contact and the app's version.
 */
export const PoliciesPage: React.FC = () => {
  const { navigate } = useNavigation();
  const [version, setVersion] = useState<string | null>(null);

  // Only the installed app knows its version.
  useEffect(() => {
    if (!isNativeApp) return;
    import('@capacitor/app')
      .then(({ App }) => App.getInfo())
      .then(info => setVersion(info.version), () => undefined);
  }, []);

  // In place: a #fragment would reach the app's Back handling (a popstate) and jump to the top.
  const jump = (e: React.MouseEvent<HTMLAnchorElement>) => {
    const part = document.getElementById(e.currentTarget.hash.slice(1));
    if (!part) return;
    e.preventDefault();
    part.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
    part.focus({ preventScroll: true });
  };

  const parts = [...KINDS.map(kind => ({ id: `policy-${kind}`, title: CONTENT[kind].title })), { id: 'policy-account', title: 'Your account and data' }];

  return (
    <article className="max-w-3xl mx-auto px-4 sm:px-6 py-8 sm:py-14">
      <header className="space-y-3 border-b border-slate-800/80 pb-6">
        <div className="w-12 h-12 rounded-2xl neu-pressed-sm flex items-center justify-center text-lime-400">
          <ShieldCheck className="w-5 h-5" aria-hidden="true" />
        </div>
        <h1 className="text-3xl sm:text-4xl font-black text-slate-100 font-heading">Policies & terms</h1>
        <p className="text-sm text-slate-400">How {GYM_NAME} handles your data, the rules for the gym and your membership, and how refunds work.</p>
      </header>

      <nav aria-label="On this page" className="mt-6 neu-flat rounded-2xl p-2">
        <ul>
          {parts.map(part => (
            <li key={part.id}>
              <a href={`#${part.id}`} onClick={jump} className="block px-3 py-2.5 rounded-xl text-sm font-bold text-slate-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-lime-500">
                {part.title}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      {KINDS.map(kind => (
        <section key={kind} id={`policy-${kind}`} tabIndex={-1} aria-labelledby={`policy-${kind}-title`} className={`mt-12 ${PART}`}>
          <h2 id={`policy-${kind}-title`} className="text-2xl font-black text-slate-100 font-heading">
            {CONTENT[kind].title}
          </h2>
          <p className="mt-2 text-sm text-slate-400">{CONTENT[kind].intro}</p>
          <p className="mt-1 text-xs text-slate-500">
            Last updated <time dateTime={CONTENT[kind].updated}>{formatDate(CONTENT[kind].updated, { day: 'numeric', month: 'long', year: 'numeric' })}</time>
          </p>
          <PolicySections kind={kind} level={3} />
        </section>
      ))}

      <section id="policy-account" tabIndex={-1} aria-labelledby="policy-account-title" className={`mt-12 ${PART}`}>
        <h2 id="policy-account-title" className="text-2xl font-black text-slate-100 font-heading">
          Your account and data
        </h2>
        <div className="mt-4 space-y-3 text-sm text-slate-300 leading-relaxed">
          <p>
            You can change your name, phone number, gender and photo yourself on{' '}
            <TabLink tab="profile" navigate={navigate} className={linkClass}>
              My account
            </TabLink>
            , and see your invoices under{' '}
            <TabLink tab="profile" params={{ tab: 'billing' }} navigate={navigate} className={linkClass}>
              Invoices & billing
            </TabLink>
            .
          </p>
          <p>
            For a copy of the personal data we hold about you, or to delete your account and its data, ask the front desk (below). We confirm who you are
            first. What is deleted with an account, and the payment records the law makes us keep, is under "How long we keep it" in the{' '}
            <a href="#policy-privacy" onClick={jump} className={linkClass}>
              privacy policy
            </a>
            .
          </p>
        </div>

        <h3 className="mt-6 text-lg font-black text-slate-100 font-heading">Who to contact</h3>
        <ul className="mt-3 grid gap-2 text-sm">
          <li>
            <a href={`tel:${GYM_PHONE_TEL}`} className="neu-btn flex items-center gap-3 px-4 py-3 rounded-xl font-bold text-slate-200">
              <Phone className="w-4 h-4 text-lime-400 shrink-0" aria-hidden="true" /> {GYM_PHONE_DISPLAY}
            </a>
          </li>
          <li>
            <a href={`mailto:${GYM_EMAIL}`} className="neu-btn flex items-center gap-3 px-4 py-3 rounded-xl font-bold text-slate-200 break-all">
              <Mail className="w-4 h-4 text-lime-400 shrink-0" aria-hidden="true" /> {GYM_EMAIL}
            </a>
          </li>
          <li>
            <TabLink tab="contact" navigate={navigate} className="neu-btn flex items-center gap-3 px-4 py-3 rounded-xl font-bold text-slate-200">
              <MessageSquare className="w-4 h-4 text-lime-400 shrink-0" aria-hidden="true" /> Contact us
            </TabLink>
          </li>
        </ul>

        {version && <p className="mt-8 text-xs text-slate-500">PulseFit app version {version}</p>}
      </section>
    </article>
  );
};

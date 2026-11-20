import React from 'react';
import { ExternalLink, MessageCircle } from 'lucide-react';
import { useAppConfig } from '../../context/ConfigContext.js';

// Links to the gym's pages elsewhere, from the contact details admins keep (GET /api/config ›
// gym.contact), shown only for what is filled in. On the website they open in a new tab; the app
// hands every other site's address to the phone's browser (Capacitor opens links to other hosts
// outside its WebView, as for the app update and UPI checkout), so none of them opens inside the app.

const external = { target: '_blank', rel: 'noopener noreferrer' } as const;
const focus = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-lime-500';

type Network = 'instagram' | 'facebook' | 'youtube' | 'x';

// lucide-react has no brand icons, so these are drawn in its style (24 px grid, 2 px stroke, currentColor).
const NETWORKS: { key: Network; label: string; icon: React.ReactNode }[] = [
  {
    key: 'instagram',
    label: 'Instagram',
    icon: (
      <>
        <rect x="2" y="2" width="20" height="20" rx="5" />
        <circle cx="12" cy="12" r="4" />
        <path d="M17.5 6.5h.01" />
      </>
    )
  },
  { key: 'facebook', label: 'Facebook', icon: <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z" /> },
  {
    key: 'youtube',
    label: 'YouTube',
    icon: (
      <>
        <path d="M2.5 17a24.12 24.12 0 0 1 0-10 2 2 0 0 1 1.4-1.4 49.56 49.56 0 0 1 16.2 0A2 2 0 0 1 21.5 7a24.12 24.12 0 0 1 0 10 2 2 0 0 1-1.4 1.4 49.55 49.55 0 0 1-16.2 0A2 2 0 0 1 2.5 17" />
        <path d="m10 15 5-3-5-3z" />
      </>
    )
  },
  {
    key: 'x',
    label: 'X',
    icon: (
      <>
        <path d="M4 4l11.733 16h4.267l-11.733-16z" />
        <path d="M4 20l6.768-6.768m2.46-2.46L20 4" />
      </>
    )
  }
];

/** Round icon links to the gym's social pages; nothing when none is set. */
export const SocialLinks: React.FC<{ className?: string }> = ({ className = '' }) => {
  const { contact } = useAppConfig().config.gym;
  const filled = NETWORKS.filter(n => contact[n.key]);
  if (filled.length === 0) return null;
  return (
    <ul className={`flex flex-wrap gap-2 ${className}`}>
      {filled.map(n => (
        <li key={n.key}>
          <a
            href={contact[n.key]}
            {...external}
            aria-label={`PulseFit on ${n.label}`}
            title={n.label}
            className={`neu-icon-btn w-9 h-9 rounded-full flex items-center justify-center text-slate-300 hover:text-lime-400 transition-colors ${focus}`}
          >
            <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              {n.icon}
            </svg>
          </a>
        </li>
      ))}
    </ul>
  );
};

/** "WhatsApp us", a wa.me chat with the gym's WhatsApp number; nothing when none is set. */
export const WhatsAppButton: React.FC<{ className?: string }> = ({ className = '' }) => {
  const { whatsapp } = useAppConfig().config.gym.contact;
  if (!whatsapp) return null;
  return (
    <a
      href={`https://wa.me/${whatsapp.replace(/\D/g, '')}`}
      {...external}
      className={`inline-flex items-center gap-2 px-4 py-2.5 neu-btn rounded-xl text-sm font-bold text-slate-200 hover:text-lime-400 ${focus} ${className}`}
    >
      <MessageCircle className="w-4 h-4 text-lime-400" aria-hidden="true" />
      WhatsApp us
    </a>
  );
};

/** The website, opened in the browser (from the app: outside it); nothing when the server has no public address. */
export const VisitWebsiteLink: React.FC<{ className?: string; children?: React.ReactNode }> = ({ className = '', children = 'Visit our website' }) => {
  const { website } = useAppConfig().config.gym;
  if (!website) return null;
  return (
    <a href={website} {...external} className={`inline-flex items-center gap-1.5 font-bold text-lime-400 hover:underline rounded ${focus} ${className}`}>
      {children}
      <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
    </a>
  );
};

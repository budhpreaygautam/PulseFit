import React from 'react';
import { FileText } from 'lucide-react';
import { useNavigation } from '../../context/NavigationContext.js';
import { TabLink } from '../../components/public/TabLink.js';
import { GYM_ADDRESS, GYM_EMAIL, GYM_NAME, GYM_PHONE_DISPLAY, GYM_PHONE_TEL, HOURS_SUMMARY } from '../../components/public/gymInfo.js';
import { formatDate } from '../../lib/format.js';

type Kind = 'privacy' | 'terms' | 'refunds';

const LAST_UPDATED = '2026-10-07';

interface Section {
  heading: string;
  body: React.ReactNode;
}

const Contact: React.FC = () => (
  <>
    the front desk at {GYM_ADDRESS} ({HOURS_SUMMARY}), by phone on{' '}
    <a href={`tel:${GYM_PHONE_TEL}`} className="text-lime-400 underline">
      {GYM_PHONE_DISPLAY}
    </a>
    , or by email at{' '}
    <a href={`mailto:${GYM_EMAIL}`} className="text-lime-400 underline">
      {GYM_EMAIL}
    </a>
  </>
);

const PRIVACY: Section[] = [
  {
    heading: 'Who we are',
    body: (
      <p>
        {GYM_NAME} ("PulseFit", "we") runs a single gym in Gurugram, Haryana. This policy explains what personal data our website and app collect, why, how long we keep it
        and what you can ask us to do with it. It applies to members, coaches, staff accounts and anyone who claims a free trial pass.
      </p>
    )
  },
  {
    heading: 'What we collect and why',
    body: (
      <ul>
        <li>
          <strong>Your account:</strong> name, email address, an optional mobile number and a profile picture. We use them to identify you at the front desk and to
          contact you about your membership. Your password is stored only as a one-way hash; we never see it.
        </li>
        <li>
          <strong>Google sign-in (if you choose it):</strong> the Google account identifier, name and verified email address Google shares with us. We use them only to sign
          you in.
        </li>
        <li>
          <strong>Membership and payments:</strong> your plan, its start and end dates, freeze dates and your invoices (amount, plan and period). Card, UPI and bank details are
          entered on Razorpay's checkout and handled by Razorpay; we receive only a payment reference, never your card number.
        </li>
        <li>
          <strong>Visits and bookings:</strong> the time and method of each check-in (your QR pass or a manual check-in by staff), the classes you book or cancel, and whether
          you attended.
        </li>
        <li>
          <strong>Training records you add:</strong> workouts and sets you log, and the time you clock in and out of the training floor. Your streak is worked out from these.
        </li>
        <li>
          <strong>Coach notes:</strong> coaches may record assessments, progress or injury notes about members who book their classes. You can see the notes a coach marks
          as visible to you.
        </li>
        <li>
          <strong>Free trial passes:</strong> name, email, mobile number, the activity you are interested in and the day you chose, so the front desk can let you in and we
          can make sure each person claims one pass.
        </li>
        <li>
          <strong>On your device:</strong> your browser stores your sign-in token and your light/dark theme choice. We do not use advertising or tracking cookies.
        </li>
      </ul>
    )
  },
  {
    heading: 'Who can see it',
    body: (
      <ul>
        <li>Front-desk and admin staff see member accounts, memberships, payments, visits and bookings so they can run the gym.</li>
        <li>Coaches see the names, contact details and attendance of members booked into their classes, and the notes they write.</li>
        <li>Razorpay processes online payments. Google processes sign-in if you use "Continue with Google".</li>
        <li>
          Until you choose your own photo, your account picture is a cartoon avatar drawn by DiceBear (api.dicebear.com) from your name, so your name is sent to DiceBear
          whenever the picture is shown. To stop this, upload your own photo or pick a preset on your account page.
        </li>
        <li>
          Our pages load fonts from Google Fonts and photos from Unsplash. Like any website you visit, those services see your IP address and browser details, but not your
          account.
        </li>
        <li>On the public website, the live floor counter shows only how many people are training, never who.</li>
      </ul>
    )
  },
  {
    heading: 'We never sell your data',
    body: <p>We do not sell or rent personal data, and we do not share it with advertisers. We disclose it to authorities only when the law requires us to.</p>
  },
  {
    heading: 'How long we keep it',
    body: (
      <ul>
        <li>Your account, visits, bookings, workouts and coach notes are kept while your account exists.</li>
        <li>
          When an account is deleted, its bookings, workout logs, check-ins, floor sessions, coach notes and password-reset links are deleted with it. Invoices and payment
          records are kept, because Indian tax and accounting rules require businesses to keep financial records.
        </li>
        <li>Password-reset links expire after 30 minutes. Sign-in sessions expire after 7 days, and all of them end when your password changes.</li>
        <li>Free trial requests are kept so that each person can claim only one free pass.</li>
      </ul>
    )
  },
  {
    heading: 'Your rights',
    body: (
      <>
        <p>Under India's Digital Personal Data Protection Act, 2023 you can:</p>
        <ul>
          <li>see the personal data we hold about you and how we use it;</li>
          <li>correct it: you can change your name, phone number and photo yourself on your account page, and the front desk can fix anything else;</li>
          <li>ask us to delete your account and the data listed above (except records we must keep by law);</li>
          <li>withdraw consent you gave, for example by removing your phone number or asking us to delete your account;</li>
          <li>raise a complaint with us, and then with the Data Protection Board of India if you are not satisfied.</li>
        </ul>
        <p>
          To use any of these rights, contact <Contact />. We will confirm who you are before changing or deleting anything.
        </p>
      </>
    )
  },
  {
    heading: 'Security',
    body: (
      <p>
        Passwords are hashed, sign-in tokens expire, and changing or resetting a password signs out every other device. Only staff whose role needs the data can see it. No
        system is perfectly secure; if we learn of a breach that affects you, we will tell you and the authorities as the law requires.
      </p>
    )
  },
  {
    heading: 'Changes to this policy',
    body: <p>If we change how we use personal data, we will update this page and its date, and tell members at the front desk or by email before the change takes effect.</p>
  }
];

const TERMS: Section[] = [
  {
    heading: 'About these terms',
    body: (
      <p>
        These terms apply when you use the {GYM_NAME} gym, website or app, buy a membership or claim a free trial pass. By creating an account or entering the gym you agree to
        them. Our <TabLinkInline tab="privacy">privacy policy</TabLinkInline> and <TabLinkInline tab="refunds">refund & cancellation policy</TabLinkInline> are part of these
        terms.
      </p>
    )
  },
  {
    heading: 'Opening hours',
    body: <p>The gym is open {HOURS_SUMMARY}. Classes run only on the days and times shown on the timetable, and we may change the timetable with notice on the website.</p>
  },
  {
    heading: 'Accounts',
    body: (
      <ul>
        <li>Creating an account is free. Give your real name and keep your contact details up to date.</li>
        <li>Keep your password private. You are responsible for what is done with your account.</li>
        <li>Your QR entry pass is personal. Do not share it; staff may refuse entry if a pass is used by someone else.</li>
      </ul>
    )
  },
  {
    heading: 'Memberships',
    body: (
      <ul>
        <li>
          Each plan lets you book certain classes, as listed on the <TabLinkInline tab="pricing">memberships page</TabLinkInline>. Prices there are in Indian rupees and are the
          full price of the plan.
        </li>
        <li>
          A monthly plan runs until the day before the same date next month (if that date does not exist, until the last day of that month). An annual plan runs for 12
          months. Your account page shows the exact last day.
        </li>
        <li>Plans do not renew automatically. Renewing the same plan before it ends adds the new period after your current one, so you lose no days.</li>
        <li>
          Switching to a different plan starts the new plan on the day you pay. The unused days of your old plan are credited as extra days on the new plan, in proportion to
          the two plans' monthly prices.
        </li>
        <li>
          You can freeze an active membership. While it is frozen you cannot enter or book classes; when you unfreeze it, the days it was frozen are added to your end date.
          Paying for a plan while frozen unfreezes your membership first.
        </li>
      </ul>
    )
  },
  {
    heading: 'Class bookings',
    body: (
      <ul>
        <li>Members with an active plan that includes the class can book up to 14 days ahead, while spots are left.</li>
        <li>You can cancel a booking any time before the class starts, which frees your spot for someone else.</li>
        <li>Coaches mark attendance. Please cancel if you cannot come, so others can take the spot.</li>
      </ul>
    )
  },
  {
    heading: 'Free trial pass',
    body: (
      <p>
        One free 1-day pass per person (checked by email and phone number). It is valid only on the day you choose, Monday to Saturday within the next two weeks, and can be
        used once. Trial visitors follow the same gym rules as members.
      </p>
    )
  },
  {
    heading: 'Health and safety',
    body: (
      <ul>
        <li>Check with a doctor before starting a new exercise programme, especially if you have a medical condition, an injury or are pregnant.</li>
        <li>Tell your coach about injuries or conditions that affect how you train. Follow staff instructions and use equipment as intended.</li>
        <li>The training plans, diet charts and supplement information on this website are general information, not medical advice.</li>
      </ul>
    )
  },
  {
    heading: 'Conduct',
    body: (
      <p>
        Treat other members and staff with respect, re-rack weights and wipe down equipment after use. We may suspend or end the membership of anyone who puts others at
        risk, harasses people or damages the gym, after giving them a chance to explain.
      </p>
    )
  },
  {
    heading: 'Liability',
    body: (
      <p>
        We take reasonable care to keep the gym and its equipment safe. Nothing in these terms limits liability that cannot be limited under Indian law, including for injury
        caused by our negligence. Please do not leave valuables unattended.
      </p>
    )
  },
  {
    heading: 'Changes and disputes',
    body: (
      <p>
        We may update these terms; the date at the top shows the latest version, and changes do not affect a period you have already paid for. These terms are governed by
        the laws of India. If you have a complaint, please talk to us first at <Contact />.
      </p>
    )
  }
];

const REFUNDS: Section[] = [
  {
    heading: 'Paying online',
    body: (
      <p>
        Online payments are processed by Razorpay in Indian rupees. The amount is always the price of the plan you chose, shown on the{' '}
        <TabLinkInline tab="pricing">memberships page</TabLinkInline> before you pay. Every payment creates an invoice you can see on your account page.
      </p>
    )
  },
  {
    heading: 'No automatic renewals',
    body: <p>Memberships never renew or charge you on their own. To stop being a member, simply don't renew; there is nothing to cancel and no cancellation fee.</p>
  },
  {
    heading: 'Instead of a refund: freeze or switch',
    body: (
      <ul>
        <li>
          <strong>Freeze:</strong> if you travel, are ill or need a break, freeze your membership. It is paused, and when you unfreeze, every day it was frozen is added back
          to your end date, so you lose nothing.
        </li>
        <li>
          <strong>Switch plans:</strong> moving to a different plan credits the unused days of your current plan to the new one, in proportion to the two plans' monthly
          prices.
        </li>
      </ul>
    )
  },
  {
    heading: 'When we refund',
    body: (
      <ul>
        <li>
          <strong>Charged but not activated:</strong> if money left your account but your membership did not become active, contact us. We activate the plan you paid for or
          refund it in full.
        </li>
        <li>
          <strong>Charged twice:</strong> a duplicate payment for the same order is refunded in full.
        </li>
        <li>
          <strong>We close or cannot provide the service:</strong> if the gym closes permanently, or a plan can no longer be provided, we refund the unused part of your plan.
        </li>
        <li>
          Otherwise, fees for a plan that has started are not refundable. Please use a freeze or a plan switch instead.
        </li>
      </ul>
    )
  },
  {
    heading: 'How refunds are paid',
    body: (
      <p>
        Refunds go back to the card, UPI account or bank account you paid with, through Razorpay. Once we have issued a refund, your bank usually takes a few working days to
        show it.
      </p>
    )
  },
  {
    heading: 'Class bookings',
    body: <p>Booking a class is free with an eligible plan. Cancel any time before the class starts to release your spot; there is no charge for cancelling.</p>
  },
  {
    heading: 'Questions',
    body: (
      <p>
        For anything about a payment, contact <Contact />. Please have your invoice number (it starts with "PF-") ready.
      </p>
    )
  }
];

const CONTENT: Record<Kind, { title: string; intro: string; sections: Section[] }> = {
  privacy: { title: 'Privacy policy', intro: 'What we collect, why, how long we keep it, and your rights.', sections: PRIVACY },
  terms: { title: 'Terms of service', intro: 'The rules for using the gym, the website and your membership.', sections: TERMS },
  refunds: { title: 'Refund & cancellation policy', intro: 'How payments, cancellations, freezes and refunds work.', sections: REFUNDS }
};

function TabLinkInline({ tab, children }: { tab: string; children: React.ReactNode }) {
  const { navigate } = useNavigation();
  return (
    <TabLink tab={tab} navigate={navigate} className="text-lime-400 underline">
      {children}
    </TabLink>
  );
}

export const LegalPage: React.FC<{ kind: Kind }> = ({ kind }) => {
  const { navigate } = useNavigation();
  const { title, intro, sections } = CONTENT[kind];

  return (
    <article className="max-w-3xl mx-auto px-4 sm:px-6 py-10 sm:py-14">
      <header className="space-y-3 border-b border-slate-800/80 pb-6">
        <div className="w-12 h-12 rounded-2xl neu-pressed-sm flex items-center justify-center text-lime-400">
          <FileText className="w-5 h-5" aria-hidden="true" />
        </div>
        <h1 className="text-3xl sm:text-4xl font-black text-slate-100 font-['Outfit']">{title}</h1>
        <p className="text-sm text-slate-400">{intro}</p>
        <p className="text-xs text-slate-500">
          {GYM_NAME} · Last updated <time dateTime={LAST_UPDATED}>{formatDate(LAST_UPDATED, { day: 'numeric', month: 'long', year: 'numeric' })}</time>
        </p>
      </header>

      <nav aria-label="Policies" className="mt-6 flex flex-wrap gap-2">
        {(Object.keys(CONTENT) as Kind[]).map(k => (
          <TabLink
            key={k}
            tab={k}
            navigate={navigate}
            isCurrent={k === kind}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold ${k === kind ? 'neu-pressed-sm text-lime-400 border border-lime-500/30' : 'neu-btn text-slate-200'}`}
          >
            {CONTENT[k].title}
          </TabLink>
        ))}
      </nav>

      <div className="mt-8 space-y-8 text-sm text-slate-300 leading-relaxed [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-2 [&_p+p]:mt-3 [&_p+ul]:mt-3 [&_ul+p]:mt-3 [&_strong]:text-slate-900 dark:[&_strong]:text-slate-100">
        {sections.map((section, i) => (
          <section key={section.heading} aria-labelledby={`legal-${kind}-${i}`}>
            <h2 id={`legal-${kind}-${i}`} className="text-lg font-black text-slate-100 font-['Outfit'] mb-2">
              {section.heading}
            </h2>
            {section.body}
          </section>
        ))}
      </div>
    </article>
  );
};

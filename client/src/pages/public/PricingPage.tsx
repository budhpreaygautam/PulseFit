import React, { useState } from 'react';
import { CheckCircle2, XCircle, Sparkles, ChevronDown, ChevronUp, Lock, Loader2, AlertCircle } from 'lucide-react';
import { Badge } from '../../components/common/Badge.js';
import { useAuth } from '../../context/AuthContext.js';
import { useToast } from '../../context/ToastContext.js';
import { useRazorpay } from '../../hooks/useRazorpay.js';

interface PricingPageProps {
  onOpenAuthModal: (mode: 'login' | 'register') => void;
  onOpenFreeTrialModal: () => void;
}

export const PricingPage: React.FC<PricingPageProps> = ({
  onOpenAuthModal,
  onOpenFreeTrialModal
}) => {
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'annual'>('monthly');
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const { isAuthenticated } = useAuth();
  const { showToast } = useToast();
  const { checkout, isProcessing, error, clearError } = useRazorpay();

  const handleChoosePlan = async (plan: typeof plans[number]) => {
    clearError();

    if (!isAuthenticated) {
      showToast('Sign in or create an account to purchase a membership.', 'info', 'Login Required');
      onOpenAuthModal('register');
      return;
    }

    try {
      await checkout({
        amount: billingCycle === 'annual' ? plan.priceAnnual : plan.priceMonthly,
        tier: plan.id as 'basic' | 'pro' | 'vip',
        planName: plan.name,
        billingCycle,
        onSuccess: () =>
          showToast(
            `${plan.name} activated! Your membership is now live. Welcome to PulseFit Cyber Hub.`,
            'success',
            'Payment Successful'
          )
      });
    } catch (err: any) {
      showToast(err.message || 'Payment could not be completed. Please try again.', 'error', 'Payment Failed');
    }
  };

  const plans = [
    {
      id: 'basic',
      name: 'Standard Pass',
      badge: null,
      priceMonthly: 1499,
      priceAnnual: 1199,
      description: 'Full 24/7 access to our gym floor, Olympic lifting platforms, and cardio zone.',
      features: [
        '24/7 Gym Floor & Free Weights Access',
        'Olympic Lifting Platforms & Sprint Turf Lane',
        'Locker Room, Steam & High-Pressure Showers',
        'Pulse Mobile App & Digital QR Pass',
        'Daily Workout Set Logger',
        'Keyless Smart Locker & RO Water Access'
      ],
      excluded: [
        'Coach-Led Group Classes (HIIT, Boxing, Yoga, CrossFit)',
        'Infrared Sauna & Contrast Cold Plunge Suite',
        'Personal Training Assessment Credits',
        'Complimentary Medical-Grade InBody Scans'
      ]
    },
    {
      id: 'pro',
      name: 'Performance Pro',
      badge: 'MOST POPULAR',
      priceMonthly: 2499,
      priceAnnual: 1999,
      description: 'Unlimited coach-led group fitness classes, sauna recovery, and progression tracking.',
      features: [
        'Everything in Standard Pass',
        'Unlimited Group Fitness (HIIT, Boxing, Power Yoga, CrossFit)',
        'Infrared Sauna & Steam Recovery Suites',
        'Priority 7-Day Advance Class Reservations',
        '1 Monthly 1-on-1 Trainer Assessment',
        'Advanced 1RM Progression & Volume Analytics',
        '10% Discount at Pulse Recovery Chai & Juice Bar'
      ],
      excluded: [
        'Contrast Cold Plunge Hydrotherapy Pool',
        'Free Monthly VIP Guest Passes'
      ]
    },
    {
      id: 'vip',
      name: 'Elite All-Access VIP',
      badge: 'VIP ACCESS',
      priceMonthly: 3999,
      priceAnnual: 3199,
      description: 'The pinnacle of high-performance athletics with recovery plunge and personal training.',
      features: [
        'Everything in Performance Pro',
        'Contrast Cold Plunge Hydrotherapy (10°C)',
        '2 Free Personal Training Sessions per Month',
        '2 Free VIP Guest Passes per Month',
        'Unlimited Medical-Grade InBody Biometric Scans',
        'Complimentary Towel Service & Reserved Parking',
        'Private VIP Athlete Lounge',
        '20% Off All Merchandise & Protein Bar'
      ],
      excluded: []
    }
  ];

  const faqs = [
    {
      q: 'Are there any hidden sign-up fees or cancellation penalties?',
      a: 'Zero hidden fees. PulseFit operates on a transparent month-to-month model in INR. You can cancel or freeze your membership with 14-days notice with no penalty fees.'
    },
    {
      q: 'How does the digital QR Pass turnstile work at Cyber Hub?',
      a: 'Once you sign up, your mobile app generates a dynamic encrypted QR token. Simply hold your phone screen up to our optical entrance turnstiles for frictionless 24/7 access.'
    },
    {
      q: 'Can I test the gym and classes before committing?',
      a: 'Yes! You can claim our 1-Day VIP Free Trial pass right now, which grants complete access to all classes, gym floor, sauna, and recovery suites at no cost.'
    },
    {
      q: 'How does priority class reservation work?',
      a: 'Performance Pro and VIP members can reserve class spots up to 7 days in advance. If a class fills up, you are automatically placed on the waitlist and notified as spots open.'
    },
    {
      q: 'Can I freeze my membership if I travel?',
      a: 'Yes. All active members can freeze their membership directly in their portal for up to 60 days per calendar year at no extra charge.'
    }
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12 space-y-12 sm:space-y-16">
      {/* Header */}
      <div className="text-center max-w-3xl mx-auto space-y-3 sm:space-y-4">
        <Badge variant="lime">MEMBERSHIP TIERS</Badge>
        <h1 className="text-3xl sm:text-5xl md:text-6xl font-black text-white tracking-tight font-['Outfit']">
          INVEST IN YOUR PEAK PERFORMANCE
        </h1>
        <p className="text-xs sm:text-sm md:text-base text-slate-400">
          Transparent pricing in INR. Zero hidden fees. Choose the tier that matches your athletic ambition.
        </p>

        {/* Monthly vs Annual Toggle */}
        <div className="inline-flex items-center gap-2 sm:gap-3 p-1.5 rounded-2xl bg-gym-900 border border-slate-800 mt-3">
          <button
            onClick={() => setBillingCycle('monthly')}
            className={`px-4 sm:px-5 py-2 rounded-xl text-xs font-bold transition-all ${
              billingCycle === 'monthly'
                ? 'bg-lime-500 text-black shadow-glow-lime'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Monthly Billing
          </button>
          <button
            onClick={() => setBillingCycle('annual')}
            className={`px-4 sm:px-5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
              billingCycle === 'annual'
                ? 'bg-lime-500 text-black shadow-glow-lime'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Annual Billing
            <span className="bg-amber-400/20 text-amber-300 text-[10px] px-1.5 py-0.5 rounded font-extrabold">
              SAVE 20%
            </span>
          </button>
        </div>
      </div>

      {/* Pricing Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 sm:gap-8 items-stretch">
        {plans.map(plan => {
          const isPro = plan.id === 'pro';
          const price = billingCycle === 'annual' ? plan.priceAnnual : plan.priceMonthly;

          return (
            <div
              key={plan.id}
              className={`rounded-3xl p-6 sm:p-8 flex flex-col justify-between relative transition-all ${
                isPro
                  ? 'border-2 border-lime-500 bg-gradient-to-b from-lime-500/10 via-gym-900 to-gym-950 shadow-glow-lime transform lg:-translate-y-3'
                  : 'glass-panel border border-slate-800 bg-gym-900/80'
              }`}
            >
              {plan.badge && (
                <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 bg-lime-500 text-black text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-full shadow-md">
                  {plan.badge}
                </div>
              )}

              <div className="space-y-5 sm:space-y-6">
                <div>
                  <h3 className="text-xl font-black text-white">{plan.name}</h3>
                  <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">{plan.description}</p>
                </div>

                <div className="flex items-baseline gap-1.5 py-2 border-y border-slate-800/80">
                  <span className="text-4xl sm:text-5xl font-black text-white font-['Outfit']">
                    ₹{price.toLocaleString('en-IN')}
                  </span>
                  <span className="text-xs text-slate-400 font-medium">
                    / month {billingCycle === 'annual' ? '(billed annually)' : ''}
                  </span>
                </div>

                {/* Features List */}
                <div className="space-y-3">
                  <div className="text-xs font-bold uppercase tracking-wider text-slate-300">
                    Included Amenities:
                  </div>
                  <ul className="space-y-2.5 text-xs text-slate-200">
                    {plan.features.map((feat, i) => (
                      <li key={i} className="flex items-start gap-2.5">
                        <CheckCircle2 className="w-4 h-4 text-lime-400 shrink-0 mt-0.5" />
                        <span className="leading-snug">{feat}</span>
                      </li>
                    ))}
                    {plan.excluded.map((exc, i) => (
                      <li key={i} className="flex items-start gap-2.5 text-slate-500 opacity-60">
                        <XCircle className="w-4 h-4 text-slate-600 shrink-0 mt-0.5" />
                        <span className="leading-snug line-through">{exc}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              {/* Action Button */}
              <div className="mt-8 pt-6 border-t border-slate-800">
                <button
                  onClick={() => handleChoosePlan(plan)}
                  disabled={isProcessing}
                  className={`w-full py-3.5 sm:py-4 rounded-xl font-extrabold text-xs transition-all flex items-center justify-center gap-2 ${
                    isPro
                      ? 'bg-gradient-to-r from-lime-500 to-lime-400 hover:from-lime-400 text-black shadow-glow-lime active:scale-[0.98]'
                      : 'bg-slate-800 hover:bg-slate-700 text-white active:scale-[0.98]'
                  } ${isProcessing ? 'opacity-60 cursor-not-allowed' : ''}`}
                >
                  {isProcessing ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Processing…
                    </>
                  ) : isAuthenticated ? (
                    <>
                      <Lock className="w-3.5 h-3.5" />
                      Pay ₹{price.toLocaleString('en-IN')} & Activate
                    </>
                  ) : (
                    `Choose ${plan.name}`
                  )}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Payment Error Message */}
      {error && (
        <div className="max-w-3xl mx-auto flex items-start gap-3 p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-200">
          <AlertCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
          <div className="text-sm leading-snug">{error}</div>
        </div>
      )}

      {/* Free Pass Banner */}
      <div className="p-6 sm:p-8 rounded-3xl bg-gym-900 border border-slate-800 text-center sm:text-left flex flex-col sm:flex-row items-center justify-between gap-6">
        <div className="space-y-1">
          <h3 className="text-lg sm:text-xl font-bold text-white flex items-center gap-2 justify-center sm:justify-start">
            <Sparkles className="w-5 h-5 text-amber-400" /> Want to try PulseFit Gurugram first?
          </h3>
          <p className="text-xs text-slate-400">
            Get a 1-day complimentary all-access pass to our facility, classes, and recovery suites.
          </p>
        </div>
        <button
          onClick={onOpenFreeTrialModal}
          className="px-6 py-3 bg-amber-500 hover:bg-amber-400 text-black font-extrabold text-xs rounded-xl shadow-glow-amber transition-all shrink-0"
        >
          Claim 1-Day VIP Free Pass
        </button>
      </div>

      {/* FAQ Accordion */}
      <div className="max-w-3xl mx-auto space-y-6 pt-4">
        <div className="text-center space-y-2">
          <Badge variant="cyan">FREQUENTLY ASKED QUESTIONS</Badge>
          <h2 className="text-2xl sm:text-3xl font-black text-white font-['Outfit']">
            EVERYTHING YOU NEED TO KNOW
          </h2>
        </div>

        <div className="space-y-3">
          {faqs.map((faq, idx) => (
            <div
              key={idx}
              className="rounded-2xl border border-slate-800 bg-gym-900/60 overflow-hidden transition-all"
            >
              <button
                onClick={() => setOpenFaq(openFaq === idx ? null : idx)}
                className="w-full p-4 sm:p-5 text-left flex items-center justify-between gap-4 font-bold text-xs sm:text-sm text-slate-100 hover:text-lime-400 transition-colors"
              >
                <span>{faq.q}</span>
                {openFaq === idx ? (
                  <ChevronUp className="w-4 h-4 text-lime-400 shrink-0" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
                )}
              </button>

              {openFaq === idx && (
                <div className="px-4 sm:px-5 pb-4 sm:pb-5 text-xs text-slate-400 leading-relaxed border-t border-slate-800/60 pt-3 animate-in fade-in">
                  {faq.a}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

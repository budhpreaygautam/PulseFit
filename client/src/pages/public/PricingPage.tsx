import React, { useState } from 'react';
import { CheckCircle2, XCircle, Sparkles, ChevronDown, ChevronUp, Lock, Loader2, AlertCircle, Dumbbell, Music2, Zap } from 'lucide-react';
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
        tier: plan.id as 'basic' | 'pro' | 'vip',
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
      name: 'Workout & Strength Pass',
      badge: null,
      icon: Dumbbell,
      priceMonthly: 1199,
      priceAnnual: 999,
      description: 'Complete access to the gym floor, free weights & strength workout sessions.',
      features: [
        'Full Gym Floor & Free Weights Access',
        'Olympic Barbells, Racks & Dumbbells (up to 40kg)',
        'Daily Workout & Strength Training Sessions',
        'Daily Workout Set Logger & Time Tracker',
        'Locker Room & High-Pressure Showers',
        'Pulse Mobile App & Digital QR Turnstile Pass'
      ],
      excluded: [
        'Zumba & Dance Cardio Group Sessions',
        'Personal Trainer Form & Progress Assessment'
      ]
    },
    {
      id: 'pro',
      name: 'Zumba & Cardio Pass',
      badge: null,
      icon: Music2,
      priceMonthly: 1499,
      priceAnnual: 1199,
      description: 'Unlimited high-energy Zumba dance and cardio conditioning classes.',
      features: [
        'Unlimited Zumba & Dance Cardio Sessions',
        'Acoustic Dance Studio & Aerobic Floor',
        'Calorie Burn Tracking & Class Reservations',
        'Locker Room & High-Pressure Showers',
        'Pulse Mobile App & Digital QR Turnstile Pass'
      ],
      excluded: [
        'Gym Floor & Heavy Free Weights Zone',
        'Personal Trainer Form & Progress Assessment'
      ]
    },
    {
      id: 'vip',
      name: 'Dual All-Access Pass',
      badge: 'BEST VALUE',
      icon: Zap,
      priceMonthly: 1999,
      priceAnnual: 1599,
      description: 'The complete package: unlimited access to BOTH Strength Training & Zumba Cardio sessions.',
      features: [
        'Unlimited Workout & Strength Training Floor',
        'Unlimited Zumba & Cardio Dance Classes',
        'Full Free Weights, Racks & Machine Access',
        '1 Monthly Trainer Form & Fitness Assessment',
        'Priority Class Spot Advance Booking',
        'Pulse Mobile App & Digital QR Turnstile Pass',
        'Locker Room & High-Pressure Showers'
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
      a: 'Once you sign up, your mobile app generates a dynamic encrypted QR token. Simply hold your phone screen up to our optical entrance turnstiles for frictionless access.'
    },
    {
      q: 'Can I test the gym and classes before committing?',
      a: 'Yes! You can claim our 1-Day Free Trial pass right now, which grants complete access to strength workouts and Zumba sessions at no cost.'
    },
    {
      q: 'Can I switch between Strength Pass and Zumba Pass later?',
      a: 'Yes, you can upgrade or switch plans anytime from your member dashboard. The Dual All-Access plan at ₹1,999/mo gives you access to both simultaneously.'
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
          AFFORDABLE FITNESS IN GURUGRAM
        </h1>
        <p className="text-xs sm:text-sm md:text-base text-slate-400 font-medium">
          High-end equipment and energetic Zumba classes at honest, pocket-friendly INR pricing.
        </p>

        {/* Neumorphic Inset Monthly vs Annual Toggle */}
        <div className="inline-flex items-center gap-2 p-1.5 rounded-2xl neu-pressed-sm mt-3">
          <button
            onClick={() => setBillingCycle('monthly')}
            className={`px-4 sm:px-5 py-2 rounded-xl text-xs font-bold transition-all ${
              billingCycle === 'monthly'
                ? 'neu-btn-lime shadow-glow-lime'
                : 'text-slate-800 dark:text-slate-200 hover:text-black dark:hover:text-white'
            }`}
          >
            Monthly Billing
          </button>
          <button
            onClick={() => setBillingCycle('annual')}
            className={`px-4 sm:px-5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
              billingCycle === 'annual'
                ? 'neu-btn-lime shadow-glow-lime'
                : 'text-slate-800 dark:text-slate-200 hover:text-black dark:hover:text-white'
            }`}
          >
            Annual Billing
            <span className="bg-amber-400/20 text-amber-300 text-[10px] px-1.5 py-0.5 rounded font-black">
              SAVE 15%
            </span>
          </button>
        </div>
      </div>

      {/* Neumorphic Pricing Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 sm:gap-8 items-stretch">
        {plans.map(plan => {
          const isVip = plan.id === 'vip';
          const price = billingCycle === 'annual' ? plan.priceAnnual : plan.priceMonthly;
          const PlanIcon = plan.icon;

          return (
            <div
              key={plan.id}
              className={`rounded-3xl p-6 sm:p-8 flex flex-col justify-between relative transition-all ${
                isVip
                  ? 'neu-flat border-2 border-lime-500/70 shadow-glow-lime transform lg:-translate-y-3'
                  : 'neu-flat'
              }`}
            >
              {plan.badge && (
                <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 neu-btn-lime text-[10px] font-black uppercase tracking-widest px-3.5 py-1 rounded-full shadow-md">
                  {plan.badge}
                </div>
              )}

              <div className="space-y-5 sm:space-y-6">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="text-xl font-black text-white font-['Outfit']">{plan.name}</h3>
                    <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">{plan.description}</p>
                  </div>
                  <div className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 neu-pressed-sm ${
                    isVip ? 'text-lime-400 border border-lime-500/30' : plan.id === 'pro' ? 'text-pink-400 border border-pink-500/30' : 'text-cyan-400 border border-cyan-500/30'
                  }`}>
                    <PlanIcon className="w-5 h-5" />
                  </div>
                </div>

                <div className="flex items-baseline gap-1.5 py-3 border-y border-slate-800/80">
                  <span className="text-4xl sm:text-5xl font-black text-white font-['Outfit']">
                    ₹{price.toLocaleString('en-IN')}
                  </span>
                  <span className="text-xs text-slate-400 font-medium">
                    / month {billingCycle === 'annual' ? '(billed annually)' : ''}
                  </span>
                </div>

                {/* Features List */}
                <div className="space-y-3">
                  <div className="text-xs font-bold uppercase tracking-wider text-slate-300 font-mono">
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
              <div className="mt-8 pt-6 border-t border-slate-800/80">
                <button
                  onClick={() => handleChoosePlan(plan)}
                  disabled={isProcessing}
                  className={`w-full py-3.5 sm:py-4 rounded-2xl font-black text-xs transition-all flex items-center justify-center gap-2 ${
                    isVip
                      ? 'neu-btn-lime shadow-glow-lime'
                      : 'neu-btn text-white hover:text-lime-400'
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
        <div className="max-w-3xl mx-auto flex items-start gap-3 p-4 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-200 neu-pressed-sm">
          <AlertCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
          <div className="text-sm leading-snug font-medium">{error}</div>
        </div>
      )}

      {/* Neumorphic Free Pass Banner */}
      <div className="p-6 sm:p-8 rounded-3xl neu-flat text-center sm:text-left flex flex-col sm:flex-row items-center justify-between gap-6 border border-lime-500/20">
        <div className="space-y-1">
          <h3 className="text-lg sm:text-xl font-bold text-white flex items-center gap-2 justify-center sm:justify-start font-['Outfit']">
            <Sparkles className="w-5 h-5 text-lime-400" /> Want to try PulseFit Gurugram first?
          </h3>
          <p className="text-xs text-slate-400 font-medium">
            Get a 1-day complimentary all-access pass to our Strength floor and Zumba sessions.
          </p>
        </div>
        <button
          onClick={onOpenFreeTrialModal}
          className="px-6 py-3.5 neu-btn-lime text-black font-black text-xs rounded-xl shadow-glow-lime transition-all shrink-0"
        >
          Claim 1-Day Free Pass
        </button>
      </div>

      {/* Neumorphic FAQ Accordion */}
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
              className="rounded-2xl neu-flat p-1 overflow-hidden transition-all"
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
                <div className="px-4 sm:px-5 pb-4 sm:pb-5 text-xs text-slate-400 leading-relaxed border-t border-slate-800/60 pt-3 animate-in fade-in neu-pressed-sm m-2 rounded-xl">
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

import React, { useEffect, useRef, useState } from 'react';
import { Dumbbell, Sparkles } from 'lucide-react';
import { useNavigation } from '../../context/NavigationContext.js';
import { ServiceTiles } from '../../components/app/services.js';
import { riseOrder } from '../../lib/appMotion.js';

const SLIDES = [
  { emoji: '💪', title: 'Strength floor', body: 'Racks, barbells and coaches on the floor. Log every set in the app.' },
  { emoji: '💃', title: 'Zumba studio', body: 'High-energy classes on every open day. Book your spot in two taps.' },
  { emoji: '🎁', title: 'Rewards & gifts', body: 'Earn points for your visits and workouts, and collect gifts at the front desk.' }
];

const panelButton = 'app-press w-full min-h-[48px] rounded-2xl flex items-center justify-center gap-2 text-sm';

/**
 * A signed-out app's first screen (App.tsx): three swipeable slides on the first launch, then the
 * panel with the gym's services and buttons to sign in, create an account, claim a free pass,
 * contact the gym or look around first (the Services screen).
 */
export const WelcomeScreen: React.FC<{
  showSlides: boolean;
  onSlidesDone: () => void;
  onSignIn: () => void;
  onRegister: () => void;
  onFreePass: () => void;
  onExplore: () => void;
}> = ({ showSlides, onSlidesDone, onSignIn, onRegister, onFreePass, onExplore }) => {
  const { navigate } = useNavigation();
  const track = useRef<HTMLDivElement>(null);
  const [slide, setSlide] = useState(0);
  const isLast = slide === SLIDES.length - 1;
  const rise = riseOrder();

  // The button that ended the slides is gone, so focus moves to the panel's heading.
  const heading = useRef<HTMLHeadingElement>(null);
  const hadSlides = useRef(showSlides);
  useEffect(() => {
    if (hadSlides.current && !showSlides) heading.current?.focus();
  }, [showSlides]);

  const next = () => {
    const el = track.current;
    if (isLast || !el) onSlidesDone();
    else el.scrollTo({ left: (slide + 1) * el.clientWidth });
  };

  return (
    <>
      {/* Fixed behind everything, so it never wraps the slides. */}
      <div className="app-backdrop" aria-hidden="true" />
      {/* The screen between the status bar and the home indicator: body already pads the bottom inset. */}
      <div className="app-screen min-h-[calc(100dvh-env(safe-area-inset-top)-env(safe-area-inset-bottom))] flex flex-col">
        {showSlides ? (
          <>
            <h1 className="sr-only">Welcome to PulseFit</h1>
            <div className="flex justify-end">
              <button type="button" onClick={onSlidesDone} className="min-h-[44px] px-3 -mr-3 text-[13px] font-bold text-[color:var(--app-mu)]">
                Skip
              </button>
            </div>
            <div
              ref={track}
              onScroll={e => setSlide(Math.round(e.currentTarget.scrollLeft / e.currentTarget.clientWidth))}
              className="flex-1 -mx-5 flex overflow-x-auto snap-x snap-mandatory motion-safe:scroll-smooth [scrollbar-width:none]"
            >
              {SLIDES.map(s => (
                <div key={s.title} className="w-full shrink-0 snap-start px-8 flex flex-col items-center justify-center gap-4 text-center">
                  <span aria-hidden="true" className="text-[72px] leading-none">
                    {s.emoji}
                  </span>
                  <h2 className="font-heading font-black text-[26px] leading-tight">{s.title}</h2>
                  <p className="text-[13px] leading-normal text-[color:var(--app-mu)]">{s.body}</p>
                </div>
              ))}
            </div>
            {/* Next keeps focus, so the slide it brings is announced. */}
            <p className="sr-only" aria-live="polite">{`Slide ${slide + 1} of ${SLIDES.length}: ${SLIDES[slide].title}`}</p>
            <div aria-hidden="true" className="flex justify-center gap-1.5 my-6">
              {SLIDES.map((s, i) => (
                <span key={s.title} className={`h-2 rounded-full transition-all duration-200 ${i === slide ? 'w-6 bg-[#84cc16]' : 'w-2 bg-[color:var(--app-mu2)]'}`} />
              ))}
            </div>
            <button type="button" onClick={next} className={`app-lime-btn font-extrabold ${panelButton}`}>
              {isLast ? 'Get started' : 'Next'}
            </button>
          </>
        ) : (
          <div className="flex-1 flex flex-col justify-center gap-6">
            <div className="flex flex-col items-center gap-3 text-center">
              <span className="app-lime-btn w-16 h-16 rounded-[20px] flex items-center justify-center">
                <Dumbbell className="w-8 h-8 stroke-[2.5]" aria-hidden="true" />
              </span>
              <h1 ref={heading} tabIndex={-1} className="font-heading font-black text-[26px] leading-tight outline-none">
                Welcome to PulseFit
              </h1>
              <p className="text-[13px] text-[color:var(--app-mu)]">Sector 29 · Gurugram</p>
            </div>
            <section aria-labelledby="welcome-services-heading" style={rise()} className="app-rise">
              <h2 id="welcome-services-heading" className="text-[11px] font-bold uppercase tracking-[0.08em] mb-2.5 text-center text-[color:var(--app-mu)]">
                What we offer
              </h2>
              <ServiceTiles />
            </section>
            <div className="flex flex-col gap-3">
              <button type="button" onClick={onSignIn} aria-haspopup="dialog" style={rise()} className={`app-rise app-lime-btn font-extrabold ${panelButton}`}>
                Sign in
              </button>
              <button type="button" onClick={onRegister} aria-haspopup="dialog" style={rise()} className={`app-rise app-glass font-bold text-[color:var(--app-tx2)] ${panelButton}`}>
                Create account
              </button>
              <button type="button" onClick={onFreePass} aria-haspopup="dialog" style={rise()} className={`app-rise app-glass font-bold text-[color:var(--app-tx2)] ${panelButton}`}>
                <Sparkles className="w-4 h-4 text-[color:var(--app-lime)]" aria-hidden="true" /> Get a free pass
              </button>
              <button type="button" onClick={() => navigate('contact')} style={rise()} className={`app-rise app-glass font-bold text-[color:var(--app-tx2)] ${panelButton}`}>
                Contact us
              </button>
              <button type="button" onClick={onExplore} style={rise()} className={`app-rise font-bold text-[color:var(--app-lime)] ${panelButton}`}>
                Explore first
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  );
};

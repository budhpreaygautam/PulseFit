import React, { useState } from 'react';
import { Apple, CheckCircle2, Clock, Dumbbell, Info, Pill, Sparkles, Target } from 'lucide-react';
import { api } from '../../api/client.js';
import { Badge } from '../../components/common/Badge.js';
import { ErrorState } from '../../components/common/States.js';
import { CardSkeletons } from '../../components/public/CardSkeletons.js';
import { SignInPrompt } from '../../components/public/SignInPrompt.js';
import { useApiData } from '../../components/public/useApiData.js';
import { useAuth } from '../../context/AuthContext.js';
import { FitnessGuide, GuideMeal } from '../../types/index.js';

type GuideTab = 'workout-plans' | 'diet-charts' | 'supplements';

const GUIDE_TABS: { id: GuideTab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'workout-plans', label: 'Workout plans', icon: Dumbbell },
  { id: 'diet-charts', label: 'Diet & meal charts', icon: Apple },
  { id: 'supplements', label: 'Supplements guide', icon: Pill }
];

/**
 * What guests see of each section: the names and one line each, never the charts. The full guide
 * is only sent by the server, to signed-in accounts (GET /api/guide), so it is not in this bundle;
 * the server's tests/guide.test.ts checks the plan and diet names here against it.
 */
const TEASERS: Record<GuideTab, { prompt: { title: string; body: string }; items: { name: string; tag: string; summary: string }[] }> = {
  'workout-plans': {
    prompt: {
      title: 'Sign in to open the full workout plans',
      body: 'Each plan day by day: every exercise with its sets, reps, rest time and a coaching cue.'
    },
    items: [
      { name: '5-Day Push / Pull / Legs (PPL)', tag: 'Intermediate - Advanced', summary: 'Five days a week, for maximum muscle growth and balanced strength.' },
      { name: '4-Day Upper / Lower Strength Split', tag: 'Beginner - Intermediate', summary: 'Four days a week, to build a strength foundation around a busy schedule.' },
      { name: 'Zumba Cardio + Strength Hybrid Plan', tag: 'All Fitness Levels', summary: 'Zumba classes and resistance training, five days a week, for fat loss and tone.' }
    ]
  },
  'diet-charts': {
    prompt: {
      title: 'Sign in to open the full diet charts',
      body: "Meal-by-meal charts built on Indian staples, with timings, portions, calories and the day's protein, carbs and fats."
    },
    items: [
      { name: 'Muscle Gain & Bulk Plan', tag: 'High Protein / Lean Surplus', summary: 'For building lean muscle on wholesome, high-energy Indian food.' },
      { name: 'Fat Loss & Lean Definition', tag: 'Calorie Deficit / High Satiety', summary: 'For losing body fat while keeping your muscle.' },
      { name: 'Pure Vegetarian High-Protein Plan', tag: 'Plant & Dairy Protein Power', summary: 'High protein without meat, from paneer, dal, soya and sprouts.' }
    ]
  },
  supplements: {
    prompt: {
      title: 'Sign in to read the full supplements guide',
      body: 'How much to take, when to take it, why it works, and answers to the common myths.'
    },
    items: [
      { name: 'Whey protein', tag: 'Recovery', summary: 'Fast-digesting protein to help your muscles recover after training.' },
      { name: 'Creatine monohydrate', tag: 'Strength & power', summary: 'The most researched supplement for strength and power.' },
      { name: 'Electrolytes', tag: 'Hydration', summary: 'Replacing what you sweat out in long sessions and Zumba classes.' },
      { name: 'Omega-3 fish oil', tag: 'Joint health', summary: 'For joints under heavy training, with a vegetarian option.' },
      { name: 'Ashwagandha & ZMA', tag: 'Sleep & stress', summary: 'For sleep and recovery when training and work pile up.' }
    ]
  }
};

/** Total kcal of a day's meals. */
const dayTotalKcal = (meals: GuideMeal[]) => meals.reduce((sum, m) => sum + m.calories, 0);

const GuideTeaser: React.FC<{ tab: GuideTab; onOpenAuthModal: (mode: 'login' | 'register') => void }> = ({ tab, onOpenAuthModal }) => {
  const { prompt, items } = TEASERS[tab];
  return (
    <>
      <ul className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {items.map(item => (
          <li key={item.name} className="p-5 rounded-2xl neu-flat space-y-2">
            <Badge variant="slate" size="sm">
              {item.tag}
            </Badge>
            <h2 className="font-black text-sm sm:text-base text-white">{item.name}</h2>
            <p className="text-xs text-slate-400">{item.summary}</p>
          </li>
        ))}
      </ul>
      <SignInPrompt title={prompt.title} body={prompt.body} onOpenAuthModal={onOpenAuthModal} />
    </>
  );
};

interface FitnessGuidePageProps {
  setCurrentTab: (tab: string) => void;
  onOpenAuthModal: (mode: 'login' | 'register') => void;
}

export const FitnessGuidePage: React.FC<FitnessGuidePageProps> = ({ setCurrentTab, onOpenAuthModal }) => {
  const [activeCategory, setActiveCategory] = useState<GuideTab>('workout-plans');
  const { user, isInitializing } = useAuth();
  const [selectedPlanIdx, setSelectedPlanIdx] = useState<number>(0);
  const [selectedDietIdx, setSelectedDietIdx] = useState<number>(0);
  // The full guide is fetched only for a signed-in account (guests would get a 401). Signing in
  // here loads it without a reload; a saved session still being restored waits on a skeleton.
  const guide = useApiData(() => (user ? api.getGuide() : Promise.resolve(null)), [user?.id]);
  const isGuest = !user && !isInitializing;

  // WAI-ARIA tabs: arrow keys (and Home/End) move between sections; only the selected one is a Tab stop.
  const onTabKeyDown = (e: React.KeyboardEvent) => {
    const index = GUIDE_TABS.findIndex(t => t.id === activeCategory);
    let next: number;
    if (e.key === 'ArrowRight') next = (index + 1) % GUIDE_TABS.length;
    else if (e.key === 'ArrowLeft') next = (index - 1 + GUIDE_TABS.length) % GUIDE_TABS.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = GUIDE_TABS.length - 1;
    else return;
    e.preventDefault();
    setActiveCategory(GUIDE_TABS[next].id);
    document.getElementById(`guide-tab-${GUIDE_TABS[next].id}`)?.focus();
  };

  // A section's panel: the teaser and a call to sign in for guests, else the full content.
  const panel = (id: GuideTab, render: (content: FitnessGuide) => React.ReactNode) => (
    <div className="space-y-8" role="tabpanel" id={`guide-panel-${id}`} aria-labelledby={`guide-tab-${id}`}>
      {isGuest ? (
        <GuideTeaser tab={id} onOpenAuthModal={onOpenAuthModal} />
      ) : guide.error ? (
        <ErrorState message={guide.error} onRetry={guide.reload} className="max-w-xl mx-auto" />
      ) : guide.data ? (
        render(guide.data)
      ) : (
        <CardSkeletons label="Loading the guide…" count={3} className="grid grid-cols-1 md:grid-cols-3 gap-4" cardClassName="h-36 rounded-2xl" />
      )}
    </div>
  );

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12 space-y-12 sm:space-y-16">
      {/* 1. Page Header */}
      <div className="text-center max-w-3xl mx-auto space-y-4">
        <Badge variant="lime">SCIENCE-BACKED ATHLETIC GUIDES</Badge>
        <h1 className="text-3xl sm:text-5xl md:text-6xl font-black text-white tracking-tight font-heading">
          TRAINING PLANS, DIETS & SUPPLEMENTS
        </h1>
        <p className="text-xs sm:text-sm md:text-base text-slate-400 leading-relaxed">
          Master your fitness journey with proven workout splits, localized high-protein Indian diet charts, and safe, research-backed supplement recommendations.
        </p>

        <div className="inline-flex items-center gap-1.5 sm:gap-2 p-1.5 rounded-2xl neu-pressed-sm mt-4 overflow-x-auto max-w-full" role="tablist" aria-label="Guide sections">
          {GUIDE_TABS.map(t => (
            <button
              key={t.id}
              type="button"
              role="tab"
              id={`guide-tab-${t.id}`}
              aria-selected={activeCategory === t.id}
              aria-controls={`guide-panel-${t.id}`}
              tabIndex={activeCategory === t.id ? 0 : -1}
              onClick={() => setActiveCategory(t.id)}
              onKeyDown={onTabKeyDown}
              className={`px-4 sm:px-6 py-2.5 rounded-xl text-xs sm:text-sm font-extrabold transition-all flex items-center gap-2 whitespace-nowrap ${
                activeCategory === t.id ? 'neu-btn-lime' : 'text-slate-300'
              }`}
            >
              <t.icon className="w-4 h-4" aria-hidden="true" />
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* 2. TAB 1: WORKOUT PLANS */}
      {activeCategory === 'workout-plans' && panel('workout-plans', ({ workout_plans: workoutPlans }) => (
        <>
          {/* Plan Selector Pills */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {workoutPlans.map((plan, idx) => (
              <button
                key={plan.id}
                type="button"
                aria-pressed={selectedPlanIdx === idx}
                onClick={() => setSelectedPlanIdx(idx)}
                className={`p-5 rounded-2xl text-left transition-all ${
                  selectedPlanIdx === idx
                    ? 'neu-pressed-sm border border-lime-500/50 shadow-glow-lime'
                    : 'neu-flat hover:border-slate-700'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <Badge variant={selectedPlanIdx === idx ? 'lime' : 'slate'} size="sm">
                    {plan.level}
                  </Badge>
                  <span className="text-[10px] text-slate-400 font-mono">{plan.frequency.split('•')[0]}</span>
                </div>
                {/* A button may only hold phrasing content, so its title is a span, not a heading. */}
                <span className="block font-black text-sm sm:text-base text-white">{plan.name}</span>
                <span className="block text-xs text-slate-400 mt-1 line-clamp-2">{plan.goal}</span>
              </button>
            ))}
          </div>

          {/* Active Plan Detail Box */}
          {workoutPlans[selectedPlanIdx] && (
            <div className="neu-flat p-6 sm:p-8 rounded-3xl space-y-8">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800/80 pb-6">
                <div>
                  <div className="flex items-center gap-2">
                    <Badge variant="lime">{workoutPlans[selectedPlanIdx].level}</Badge>
                    <span className="text-xs font-mono text-slate-400 font-bold">{workoutPlans[selectedPlanIdx].frequency}</span>
                  </div>
                  <h2 className="text-2xl sm:text-3xl font-black text-white mt-1 font-heading">
                    {workoutPlans[selectedPlanIdx].name}
                  </h2>
                  <p className="text-xs sm:text-sm text-slate-400 mt-1 max-w-2xl">
                    {workoutPlans[selectedPlanIdx].description}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => setCurrentTab('workout-logger')}
                  className="px-6 py-3 neu-btn-lime font-extrabold text-xs rounded-xl transition-all flex items-center justify-center gap-2 shrink-0 active:scale-95"
                >
                  <Dumbbell className="w-4 h-4" aria-hidden="true" /> Log it in the workout logger
                </button>
              </div>

              {/* Workout Days Accordion/Grid */}
              <div className="space-y-6">
                {workoutPlans[selectedPlanIdx].days.map((d, dIdx) => (
                  <div key={dIdx} className="p-5 rounded-2xl neu-pressed-sm space-y-4">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm sm:text-base font-extrabold text-lime-400 flex items-center gap-2">
                        <Target className="w-4 h-4" /> {d.name}
                      </h3>
                      <span className="text-xs font-mono text-slate-500 font-bold">{d.exercises.length} Exercises</span>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="neu-table w-full text-left text-xs">
                        <thead className="text-slate-400 uppercase text-[10px] border-b border-slate-800/80">
                          <tr>
                            <th className="p-3 pl-4">#</th>
                            <th className="p-3">Exercise Name</th>
                            <th className="p-3">Target Sets</th>
                            <th className="p-3">Target Reps</th>
                            <th className="p-3">Rest Interval</th>
                            <th className="p-3 pr-4">Coaching Cue / Form Tip</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/40 text-slate-200">
                          {d.exercises.map((ex, exIdx) => (
                            <tr key={exIdx} className="hover:bg-slate-800/20 transition-colors">
                              <td className="p-3 pl-4 font-mono font-bold text-slate-500">{exIdx + 1}</td>
                              <td className="p-3 font-extrabold text-white">{ex.name}</td>
                              <td className="p-3 font-mono text-lime-400 font-bold">{ex.sets}</td>
                              <td className="p-3 font-mono text-amber-700 dark:text-amber-300 font-bold">{ex.reps}</td>
                              <td className="p-3 font-mono text-slate-400">{ex.rest}</td>
                              <td className="p-3 pr-4 text-slate-400 text-xs">{ex.tip}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      ))}

      {/* 3. TAB 2: DIET CHARTS */}
      {activeCategory === 'diet-charts' && panel('diet-charts', ({ diet_charts: dietCharts, nutrition_rules: nutritionRules }) => (
        <>
          {/* Diet Plan Selector Pills */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {dietCharts.map((diet, idx) => (
              <button
                key={diet.id}
                type="button"
                aria-pressed={selectedDietIdx === idx}
                onClick={() => setSelectedDietIdx(idx)}
                className={`p-5 rounded-2xl text-left transition-all ${
                  selectedDietIdx === idx
                    ? 'neu-pressed-sm border border-lime-500/50 shadow-glow-lime'
                    : 'neu-flat hover:border-slate-700'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <Badge variant={selectedDietIdx === idx ? 'lime' : 'slate'} size="sm">
                    {diet.type}
                  </Badge>
                  <span className="text-[10px] text-lime-400 font-mono font-bold">≈ {dayTotalKcal(diet.meals).toLocaleString('en-IN')} kcal/day</span>
                </div>
                <span className="block font-black text-sm sm:text-base text-white">{diet.title}</span>
                <span className="block text-xs text-slate-400 mt-1 line-clamp-2">{diet.description}</span>
              </button>
            ))}
          </div>

          {/* Active Diet Details */}
          {dietCharts[selectedDietIdx] && (
            <div className="neu-flat p-6 sm:p-8 rounded-3xl space-y-8">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800/80 pb-6">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="lime">{dietCharts[selectedDietIdx].type}</Badge>
                    <span className="text-xs font-mono text-slate-400 font-bold">≈ {dayTotalKcal(dietCharts[selectedDietIdx].meals).toLocaleString('en-IN')} kcal a day</span>
                  </div>
                  <h2 className="text-2xl sm:text-3xl font-black text-white mt-1 font-heading">
                    {dietCharts[selectedDietIdx].title}
                  </h2>
                  <p className="text-xs sm:text-sm text-slate-400 mt-1 max-w-2xl">
                    {dietCharts[selectedDietIdx].description}
                  </p>
                </div>

                {/* Macro summary pills */}
                <div className="flex items-center gap-3 p-3 rounded-2xl neu-pressed-sm shrink-0">
                  <div className="text-center px-2">
                    <div className="text-[10px] uppercase font-bold text-slate-400">Protein</div>
                    <div className="text-sm font-black text-lime-400 font-mono">{dietCharts[selectedDietIdx].macros.protein_g}g</div>
                  </div>
                  <div className="h-6 w-[1px] bg-slate-800" />
                  <div className="text-center px-2">
                    <div className="text-[10px] uppercase font-bold text-slate-400">Carbs</div>
                    <div className="text-sm font-black text-amber-700 dark:text-amber-300 font-mono">{dietCharts[selectedDietIdx].macros.carbs_g}g</div>
                  </div>
                  <div className="h-6 w-[1px] bg-slate-800" />
                  <div className="text-center px-2">
                    <div className="text-[10px] uppercase font-bold text-slate-400">Fats</div>
                    <div className="text-sm font-black text-cyan-700 dark:text-cyan-400 font-mono">{dietCharts[selectedDietIdx].macros.fats_g}g</div>
                  </div>
                </div>
              </div>

              {/* Meals Schedule Cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                {dietCharts[selectedDietIdx].meals.map((m, mIdx) => (
                  <div key={mIdx} className="p-5 rounded-2xl neu-pressed-sm space-y-3 flex flex-col justify-between">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-mono font-bold text-lime-400 flex items-center gap-1.5">
                          <Clock className="w-3.5 h-3.5 text-lime-400" /> {m.timing}
                        </span>
                        <span className="text-[11px] font-mono font-extrabold text-amber-700 dark:text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-md">
                          {m.calories} kcal
                        </span>
                      </div>
                      <h3 className="font-extrabold text-sm text-white">{m.name}</h3>

                      <ul className="space-y-1.5 pt-2 border-t border-slate-800/80 text-xs text-slate-300">
                        {m.items.map((item, i) => (
                          <li key={i} className="flex items-start gap-2">
                            <CheckCircle2 className="w-3.5 h-3.5 text-lime-400 shrink-0 mt-0.5" />
                            <span>{item}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                ))}
              </div>

              {/* Quick Nutrition Rules */}
              <div className="p-5 rounded-2xl neu-pressed-sm border border-lime-500/30 space-y-2">
                <h3 className="text-xs font-bold text-lime-400 uppercase tracking-wider flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4" aria-hidden="true" /> Golden Hydration & Nutrition Rules:
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs text-slate-300 pt-1">
                  {nutritionRules.map(rule => (
                    <div key={rule.title}>
                      {rule.emoji} <strong>{rule.title}:</strong> {rule.text}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </>
      ))}

      {/* 4. TAB 3: SUPPLEMENTS GUIDE */}
      {activeCategory === 'supplements' && panel('supplements', ({ supplements }) => (
        <>
          <div className="neu-flat p-6 sm:p-8 rounded-3xl space-y-3 text-center max-w-3xl mx-auto">
            <Badge variant="cyan">EVIDENCE-BASED NUTRACEUTICALS</Badge>
            <h2 className="text-2xl sm:text-3xl font-black text-white font-heading">
              THE TRUTH ABOUT FITNESS SUPPLEMENTS
            </h2>
            <p className="text-xs sm:text-sm text-slate-400 leading-relaxed">
              Supplements are meant to <em>supplement</em> a solid whole-food diet, not replace it. Here is the scientifically verified breakdown of what actually works.
            </p>
          </div>

          <div className="space-y-6">
            {supplements.map((supp, sIdx) => (
              <div
                key={sIdx}
                className="p-6 sm:p-8 rounded-3xl neu-flat space-y-5 hover:border-lime-500/40 transition-all"
              >
                <div className="flex flex-col md:flex-row md:items-start justify-between gap-4 border-b border-slate-800/80 pb-4">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="lime" size="sm">{supp.badge}</Badge>
                      <span className="text-xs font-mono text-amber-700 dark:text-amber-400 font-bold">
                        <span aria-hidden="true">{'⭐'.repeat(supp.stars)}</span>
                        <span className="sr-only">{supp.stars} out of 5 stars</span> ({supp.verdict})
                      </span>
                    </div>
                    <h3 className="text-xl sm:text-2xl font-black text-white mt-1.5">{supp.name}</h3>
                  </div>

                  <div className="p-3 neu-pressed-sm rounded-xl text-xs space-y-1 shrink-0">
                    <div><strong className="text-slate-400">Standard Dose:</strong> <span className="text-lime-400 font-mono font-bold">{supp.dosage}</span></div>
                    <div><strong className="text-slate-400">Best Timing:</strong> <span className="text-slate-200">{supp.timing}</span></div>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="text-xs font-bold uppercase tracking-wider text-slate-400">Why It Works:</div>
                  <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">{supp.why}</p>
                </div>

                {/* FAQ questions */}
                <div className="space-y-2.5 pt-2">
                  <div className="text-xs font-bold uppercase tracking-wider text-slate-400">Common Questions & Myth-Busting:</div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {supp.faqs.map((faq, fIdx) => (
                      <div key={fIdx} className="p-3.5 neu-pressed-sm rounded-xl space-y-1">
                        <div className="text-xs font-bold text-lime-400">{faq.question}</div>
                        <div className="text-xs text-slate-400 leading-relaxed">{faq.answer}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="p-6 rounded-3xl neu-pressed-sm flex items-start gap-3.5 text-xs text-slate-400">
            <Info className="w-5 h-5 text-amber-700 dark:text-amber-400 shrink-0 mt-0.5" />
            <div>
              <strong className="text-slate-200">Medical Disclaimer:</strong> Always consult with a licensed physician or registered dietitian before introducing new dietary supplements, particularly if you have pre-existing medical conditions.
            </div>
          </div>
        </>
      ))}

      {/* 5. Call to Action */}
      <div className="p-8 sm:p-12 rounded-3xl neu-flat border-2 border-lime-500/50 shadow-glow-lime text-center space-y-6">
        <Badge variant="lime">START YOUR TRANSFORMATION</Badge>
        <h2 className="text-3xl sm:text-5xl font-black text-white font-heading">
          TRAIN SMARTER WITH A COACH
        </h2>
        <p className="text-xs sm:text-sm text-slate-300 max-w-xl mx-auto">
          Coach-led strength classes and Zumba & Cardio sessions under one roof.
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <button
            onClick={() => setCurrentTab('pricing')}
            className="w-full sm:w-auto px-8 py-4 neu-btn-lime text-black font-extrabold text-sm rounded-2xl shadow-glow-lime transition-all active:scale-95"
          >
            Explore Membership Passes
          </button>
          <button
            onClick={() => setCurrentTab('schedule')}
            className="w-full sm:w-auto px-8 py-4 neu-btn text-white font-bold text-sm rounded-2xl"
          >
            View the class timetable
          </button>
        </div>
      </div>
    </div>
  );
};

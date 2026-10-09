import React, { useState } from 'react';
import { Apple, CheckCircle2, Clock, Dumbbell, Info, Pill, Sparkles, Target } from 'lucide-react';
import { Badge } from '../../components/common/Badge.js';
import { useAuth } from '../../context/AuthContext.js';

type GuideTab = 'workout-plans' | 'diet-charts' | 'supplements';

const GUIDE_TABS: { id: GuideTab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'workout-plans', label: 'Workout plans', icon: Dumbbell },
  { id: 'diet-charts', label: 'Diet & meal charts', icon: Apple },
  { id: 'supplements', label: 'Supplements guide', icon: Pill }
];

/** Total of a day's meals, from the per-meal figures ('650 kcal'). */
const dayTotalKcal = (meals: { calories: string }[]) => meals.reduce((sum, m) => sum + (parseInt(m.calories.replace(/\D/g, ''), 10) || 0), 0);

interface FitnessGuidePageProps {
  setCurrentTab: (tab: string) => void;
}

export const FitnessGuidePage: React.FC<FitnessGuidePageProps> = ({ setCurrentTab }) => {
  const [activeCategory, setActiveCategory] = useState<GuideTab>('workout-plans');
  const { user } = useAuth();
  const [selectedPlanIdx, setSelectedPlanIdx] = useState<number>(0);
  const [selectedDietIdx, setSelectedDietIdx] = useState<number>(0);

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

  // 1. Workout Plans Data
  const workoutPlans = [
    {
      id: 'ppl',
      name: '5-Day Push / Pull / Legs (PPL)',
      level: 'Intermediate - Advanced',
      goal: 'Maximum Muscle Hypertrophy & Symmetrical Strength',
      frequency: '5 Days / Week • 60-75 Mins',
      desc: 'The gold standard bodybuilding split that groups muscles by anatomical movement patterns for optimal recovery and frequency.',
      days: [
        {
          name: 'Day 1: Push (Chest, Shoulders, Triceps)',
          exercises: [
            { name: 'Barbell Flat Bench Press', sets: '4 Sets', reps: '6-8 Reps', rest: '2-3 Mins', tip: 'Retract scapula and keep core tight.' },
            { name: 'Incline Dumbbell Press', sets: '3 Sets', reps: '8-10 Reps', rest: '90 Secs', tip: '30-degree bench angle for upper chest.' },
            { name: 'Standing Overhead Barbell Press', sets: '3 Sets', reps: '8-10 Reps', rest: '2 Mins', tip: 'Full lockout at top.' },
            { name: 'Cable Lateral Raises', sets: '4 Sets', reps: '12-15 Reps', rest: '60 Secs', tip: 'Constant cable tension on side delts.' },
            { name: 'Tricep Rope Pushdowns', sets: '3 Sets', reps: '12-15 Reps', rest: '60 Secs', tip: 'Flourish rope outward at bottom.' }
          ]
        },
        {
          name: 'Day 2: Pull (Back, Rear Delts, Biceps)',
          exercises: [
            { name: 'Conventional Deadlift', sets: '3 Sets', reps: '5 Reps', rest: '3 Mins', tip: 'Hinge hips back, drive through heels.' },
            { name: 'Wide-Grip Lat Pulldowns', sets: '4 Sets', reps: '8-10 Reps', rest: '90 Secs', tip: 'Pull with elbows down to clavicle.' },
            { name: 'Barbell Bent-Over Row', sets: '3 Sets', reps: '8-10 Reps', rest: '90 Secs', tip: '45-degree torso, pull towards navel.' },
            { name: 'Face Pulls with External Rotation', sets: '3 Sets', reps: '15 Reps', rest: '60 Secs', tip: 'Great for shoulder health and posture.' },
            { name: 'Incline Dumbbell Bicep Curls', sets: '3 Sets', reps: '10-12 Reps', rest: '60 Secs', tip: 'Full stretch at bottom of movement.' }
          ]
        },
        {
          name: 'Day 3: Legs & Abs (Quads, Hamstrings, Calves)',
          exercises: [
            { name: 'Barbell Back Squats', sets: '4 Sets', reps: '6-8 Reps', rest: '3 Mins', tip: 'Hit parallel or below, knees tracking toes.' },
            { name: 'Romanian Deadlifts (RDL)', sets: '3 Sets', reps: '8-10 Reps', rest: '2 Mins', tip: 'Feel the deep stretch in hamstrings.' },
            { name: 'Leg Press (Quad Focus)', sets: '3 Sets', reps: '10-12 Reps', rest: '90 Secs', tip: 'Feet low and narrow on platform.' },
            { name: 'Seated Calf Raises', sets: '4 Sets', reps: '15-20 Reps', rest: '45 Secs', tip: '2-second pause at bottom stretch.' },
            { name: 'Hanging Leg Raises', sets: '3 Sets', reps: '12-15 Reps', rest: '45 Secs', tip: 'Control swing with lower abs.' }
          ]
        },
        {
          name: 'Day 4: Upper Body Power',
          exercises: [
            { name: 'Weighted Pull-Ups or Lat Rows', sets: '4 Sets', reps: '6-8 Reps', rest: '2 Mins', tip: 'Full range of motion.' },
            { name: 'Dumbbell Incline Bench Press', sets: '4 Sets', reps: '8-10 Reps', rest: '90 Secs', tip: 'Heavy controlled eccentric.' },
            { name: 'Seated Dumbbell Shoulder Press', sets: '3 Sets', reps: '8-10 Reps', rest: '90 Secs', tip: 'Elbows slightly tucked at 45 degrees.' },
            { name: 'Hammer Curls', sets: '3 Sets', reps: '12 Reps', rest: '60 Secs', tip: 'Targets brachialis and forearm thickness.' }
          ]
        },
        {
          name: 'Day 5: Lower Body & Athletic HIIT',
          exercises: [
            { name: 'Bulgarian Split Squats', sets: '3 Sets / Leg', reps: '10 Reps', rest: '90 Secs', tip: 'Torso slightly leaned forward for glutes.' },
            { name: 'Lying Hamstring Curls', sets: '3 Sets', reps: '12 Reps', rest: '60 Secs', tip: 'Squeeze hamstrings at contraction.' },
            { name: 'Kettlebell Swings', sets: '4 Sets', reps: '20 Reps', rest: '45 Secs', tip: 'Explosive hip drive and power.' },
            { name: 'Plank Hold', sets: '3 Sets', reps: '60 Secs', rest: '45 Secs', tip: 'Tight glutes, core and quads.' }
          ]
        }
      ]
    },
    {
      id: 'upper-lower',
      name: '4-Day Upper / Lower Strength Split',
      level: 'Beginner - Intermediate',
      goal: 'Strength Foundation & Lean Muscle Density',
      frequency: '4 Days / Week • 50-60 Mins',
      desc: 'Ideal for busy schedules: four focused training days per week.',
      days: [
        {
          name: 'Day 1: Upper Body Strength A',
          exercises: [
            { name: 'Barbell Bench Press', sets: '4 Sets', reps: '6 Reps', rest: '2.5 Mins', tip: 'Explosive press upward.' },
            { name: 'Chest Supported T-Bar Row', sets: '4 Sets', reps: '8 Reps', rest: '90 Secs', tip: 'Full scapular squeeze.' },
            { name: 'Standing DB Overhead Press', sets: '3 Sets', reps: '8-10 Reps', rest: '90 Secs', tip: 'Maintain neutral spine.' },
            { name: 'Barbell Bicep Curls', sets: '3 Sets', reps: '10-12 Reps', rest: '60 Secs', tip: 'No swinging with lower back.' }
          ]
        },
        {
          name: 'Day 2: Lower Body Strength A',
          exercises: [
            { name: 'Barbell Back Squats', sets: '4 Sets', reps: '6 Reps', rest: '3 Mins', tip: 'Brace core with Valsalva maneuver.' },
            { name: 'Romanian Deadlifts', sets: '3 Sets', reps: '8 Reps', rest: '2 Mins', tip: 'Soft knees, push hips backward.' },
            { name: 'Standing Calf Raises', sets: '4 Sets', reps: '15 Reps', rest: '45 Secs', tip: 'Full plantar flexion.' },
            { name: 'Ab Cable Crunches', sets: '3 Sets', reps: '15 Reps', rest: '45 Secs', tip: 'Flex spine with abs, not hips.' }
          ]
        },
        {
          name: 'Day 3: Upper Body Hypertrophy B',
          exercises: [
            { name: 'Incline Dumbbell Press', sets: '3 Sets', reps: '10-12 Reps', rest: '90 Secs', tip: 'Great upper chest recruitment.' },
            { name: 'Lat Pulldowns (Neutral Grip)', sets: '4 Sets', reps: '10-12 Reps', rest: '90 Secs', tip: 'Elbows tight to sides.' },
            { name: 'Lateral Raises', sets: '4 Sets', reps: '15 Reps', rest: '45 Secs', tip: 'Lead with elbows.' },
            { name: 'Overhead Tricep Extension', sets: '3 Sets', reps: '12 Reps', rest: '60 Secs', tip: 'Stretch long head of triceps.' }
          ]
        },
        {
          name: 'Day 4: Lower Body Hypertrophy B',
          exercises: [
            { name: 'Leg Press', sets: '4 Sets', reps: '10-12 Reps', rest: '2 Mins', tip: 'Full depth without lower back rounding.' },
            { name: 'Dumbbell Walking Lunges', sets: '3 Sets', reps: '12 Steps / Leg', rest: '90 Secs', tip: '90-degree angle on lead knee.' },
            { name: 'Leg Extensions', sets: '3 Sets', reps: '15 Reps', rest: '45 Secs', tip: '1-second squeeze at top.' },
            { name: 'Leg Curls', sets: '3 Sets', reps: '12-15 Reps', rest: '45 Secs', tip: 'Control lowering phase.' }
          ]
        }
      ]
    },
    {
      id: 'zumba-strength',
      name: 'Zumba Cardio + Strength Hybrid Plan',
      level: 'All Fitness Levels',
      goal: 'Fat Loss, Toned Muscle & Cardiovascular Endurance',
      frequency: '5 Days / Week • 45-60 Mins',
      desc: 'Combines the calorie-burning excitement of Zumba dance classes with targeted resistance training for tone and definition.',
      days: [
        {
          name: 'Monday: Full Body Resistance & Tone',
          exercises: [
            { name: 'Goblet Squats', sets: '3 Sets', reps: '12 Reps', rest: '60 Secs', tip: 'Keep kettlebell/dumbbell tight to chest.' },
            { name: 'Dumbbell Flat Press', sets: '3 Sets', reps: '12 Reps', rest: '60 Secs', tip: 'Smooth controlled tempo.' },
            { name: 'Lat Pulldowns', sets: '3 Sets', reps: '12 Reps', rest: '60 Secs', tip: 'Focus on posture and back engagement.' },
            { name: 'Plank Hold', sets: '3 Sets', reps: '45 Secs', rest: '30 Secs', tip: 'Full core bracing.' }
          ]
        },
        {
          name: 'Tuesday: Zumba & Cardio class',
          exercises: [
            { name: 'Any Zumba & Cardio class on the timetable', sets: '1 Session', reps: 'Full class', rest: 'Water breaks between songs', tip: 'Follow the choreography and keep your feet moving.' }
          ]
        },
        {
          name: 'Wednesday: Upper Body & Core Sculpt',
          exercises: [
            { name: 'Dumbbell Shoulder Press', sets: '3 Sets', reps: '12 Reps', rest: '60 Secs', tip: 'Smooth overhead drive.' },
            { name: 'Seated Cable Row', sets: '3 Sets', reps: '12 Reps', rest: '60 Secs', tip: 'Chest tall, squeeze back.' },
            { name: 'Bicep Curls + Tricep Kickbacks Super-Set', sets: '3 Sets', reps: '12 Reps each', rest: '60 Secs', tip: 'High arm burn and tone.' }
          ]
        },
        {
          name: 'Thursday: Zumba & Cardio class',
          exercises: [
            { name: 'A second Zumba & Cardio class', sets: '1 Session', reps: 'Full class', rest: 'Water breaks between songs', tip: 'Push the high-energy tracks, recover on the slower ones.' }
          ]
        },
        {
          name: 'Friday: Glutes, Legs & Core Conditioning',
          exercises: [
            { name: 'Glute Bridges / Hip Thrusts', sets: '3 Sets', reps: '15 Reps', rest: '60 Secs', tip: 'Hold top squeeze for 2 seconds.' },
            { name: 'Dumbbell Romanian Deadlifts', sets: '3 Sets', reps: '12 Reps', rest: '60 Secs', tip: 'Feel hamstring stretch.' },
            { name: 'Step-Ups on Plyo Box', sets: '3 Sets', reps: '10 / Leg', rest: '45 Secs', tip: 'Drive through lead heel.' }
          ]
        }
      ]
    }
  ];

  // 2. Diet Charts Data (Desi & Clean Indian Nutrition)
  const dietCharts = [
    {
      id: 'muscle-gain',
      title: 'Muscle Gain & Bulk Plan',
      type: 'High Protein / Lean Surplus',
      macros: { protein: '170g', carbs: '380g', fats: '75g' },
      desc: 'Formulated for athletes building lean muscle tissue with wholesome, high-energy Indian staples and complete protein sources.',
      meals: [
        {
          timing: '7:30 AM • Breakfast',
          name: 'Oats & High-Protein Fuel Bowl',
          items: ['80g Rolled Oats cooked in 250ml low-fat milk', '1 Scoop Whey Protein (or 40g roasted Sattu powder)', '1 Banana + 15g Almonds & Chia seeds', '2 Whole Boiled Eggs or 50g Paneer cubes'],
          calories: '650 kcal'
        },
        {
          timing: '11:00 AM • Mid-Morning Snack',
          name: 'Fruit & Sprout Power Boost',
          items: ['1 Bowl Boiled Moong Sprouts Salad with cucumber & lemon', '1 Apple or seasonal fruit', '1 Handful Roasted Chana (40g)'],
          calories: '320 kcal'
        },
        {
          timing: '1:30 PM • Lunch',
          name: 'Wholesome Desi Muscle Thali',
          items: ['150g Grilled Chicken Breast OR 150g Low-Fat Paneer / Soya chunks', '2 Whole Wheat Roti / 1.5 cup Brown Rice', '1 Bowl Thick Dal Tadka / Rajma / Chhole', '1 Bowl Curd / Dahi + Mixed green salad'],
          calories: '850 kcal'
        },
        {
          timing: '5:00 PM • Pre-Workout Fuel',
          name: 'Energy & Nitric Boost (60 mins before gym)',
          items: ['2 Brown bread slices with 20g Peanut Butter', '1 Large Banana + 1 cup Black Coffee (zero sugar)'],
          calories: '380 kcal'
        },
        {
          timing: '7:30 PM • Post-Workout (within 45 mins)',
          name: 'Anabolic Recovery Shake',
          items: ['1 Scoop Whey Protein in 250ml water/milk', '3-5g Creatine Monohydrate', '1 Spoon Honey or 2 Dates'],
          calories: '280 kcal'
        },
        {
          timing: '9:00 PM • Dinner',
          name: 'Recovery & Protein Re-charge',
          items: ['150g Paneer / Tofu / Fish / Chicken curry with light oil', '2 Multigrain Rotis', '1 Large Bowl Steamed Veggies + Salad with lemon'],
          calories: '520 kcal'
        }
      ]
    },
    {
      id: 'fat-loss',
      title: 'Fat Loss & Lean Definition',
      type: 'Calorie Deficit / High Satiety',
      macros: { protein: '150g', carbs: '160g', fats: '45g' },
      desc: 'Designed to shed body fat while preserving lean muscle mass. High protein, high fiber, and sustained energy for workouts and Zumba.',
      meals: [
        {
          timing: '8:00 AM • Breakfast',
          name: 'High-Protein Egg / Besan Chilla',
          items: ['3 Boiled Egg Whites + 1 Whole Egg (OR 2 Besan-Paneer Chillas with veggies)', '1 Cup Green Tea or Black Coffee', '1 Handful Soaked Almonds (6-8 pieces)'],
          calories: '340 kcal'
        },
        {
          timing: '11:30 AM • Mid-Morning',
          name: 'Hydration & Satiety Snack',
          items: ['1 Glass Chaas (Buttermilk) with roasted jeera & mint', '1 Cucumber & Tomato salad bowl with black salt'],
          calories: '90 kcal'
        },
        {
          timing: '1:30 PM • Lunch',
          name: 'Portion-Controlled Lean Meal',
          items: ['120g Grilled Chicken Breast OR 120g Air-Fried Tofu / Paneer', '1 Multigrain Roti or 1/2 cup Boiled Rice', '1 Bowl Yellow Moong Dal (light tadka)', 'Large Bowl Cucumber, Beetroot & Carrot salad'],
          calories: '480 kcal'
        },
        {
          timing: '5:00 PM • Pre-Workout / Evening Snack',
          name: 'Clean Focus Fuel',
          items: ['1 Medium Apple with a dash of cinnamon', '1 Cup Black Coffee or Green Tea', '30g Roasted Makhana (Fox nuts)'],
          calories: '180 kcal'
        },
        {
          timing: '7:30 PM • Post-Workout',
          name: 'Lean Protein Hit',
          items: ['1 Scoop Whey Protein Isolate in cold water', '3g Creatine Monohydrate'],
          calories: '130 kcal'
        },
        {
          timing: '8:30 PM • Dinner',
          name: 'Light Digestible Protein Dinner',
          items: ['100g Paneer Bhurji with capsicum & onion OR Grilled Fish/Chicken', '1 Bowl Clear Vegetable Soup or Dal', 'Generous Green Salad (zero mayonnaise/dressings)'],
          calories: '420 kcal'
        }
      ]
    },
    {
      id: 'pure-veg',
      title: 'Pure Vegetarian High-Protein Plan',
      type: 'Plant & Dairy Protein Power',
      macros: { protein: '140g', carbs: '260g', fats: '60g' },
      desc: 'A 100% pure vegetarian Indian diet proving you do not need meat to build muscle, hit 140g+ protein daily, and stay in peak shape.',
      meals: [
        {
          timing: '7:30 AM • Breakfast',
          name: 'Sattu & Paneer Protein Kick',
          items: ['1 Glass Desi Sattu Shake (40g Chana Sattu + Water + Cumin + Lemon)', '100g Low-fat Paneer / Tofu lightly pan-seared with chaat masala', '1 Banana'],
          calories: '480 kcal'
        },
        {
          timing: '11:00 AM • Snack',
          name: 'Sprouts & Greek Yogurt',
          items: ['1 Bowl Mixed Moong & Kala Chana sprouts', '1 Cup Low-fat Greek Yogurt / Hung Curd (100g)'],
          calories: '260 kcal'
        },
        {
          timing: '1:30 PM • Lunch',
          name: 'High-Protein Soy & Dal Thali',
          items: ['50g Soya Chunks Curry (yielding ~26g pure protein)', '2 Whole Wheat Rotis', '1 Bowl Thick Black Chhole or Rajma', '1 Bowl Cucumber & Onion Salad'],
          calories: '620 kcal'
        },
        {
          timing: '5:00 PM • Pre-Workout',
          name: 'Clean Carb Loader',
          items: ['2 Boiled Potatoes or 1 Sweet Potato (Shakarkandi) with lemon', '1 Cup Black Coffee'],
          calories: '220 kcal'
        },
        {
          timing: '7:30 PM • Post-Workout',
          name: 'Plant / Whey Protein Shake',
          items: ['1 Scoop Whey or Pea-Rice Plant Protein', '3g Creatine Monohydrate in water'],
          calories: '140 kcal'
        },
        {
          timing: '9:00 PM • Dinner',
          name: 'Paneer & Dal Tadka',
          items: ['120g Paneer with mixed veggies (broccoli, beans, capsicum)', '1 Roti + 1 Bowl Moong Dal', '1 Glass Warm Milk with pinch of Turmeric / Haldi'],
          calories: '480 kcal'
        }
      ]
    }
  ];

  // 3. Supplements Guide Data
  const supplements = [
    {
      name: 'Whey Protein (Concentrate / Isolate)',
      badge: 'ESSENTIAL FOR RECOVERY',
      rating: '⭐⭐⭐⭐⭐ (Gold Standard)',
      dosage: '1 to 2 scoops daily (24g–48g protein)',
      timing: 'Immediately post-workout or between meals',
      why: 'Whey protein has the highest Biological Value (BV) of any protein source and delivers fast-acting Branched-Chain Amino Acids (BCAAs, especially Leucine) directly to damaged muscle fibers to trigger muscle protein synthesis (MPS).',
      faqs: [
        { q: 'Is Whey Protein artificial or harmful to kidneys?', a: 'No. Whey is naturally derived from cow’s milk during the cheese-making process. For healthy individuals with normal renal function, whey is completely safe and backed by hundreds of clinical trials.' },
        { q: 'What is the difference between Concentrate vs Isolate?', a: 'Whey Concentrate contains ~80% protein with traces of lactose and fats (great value). Whey Isolate is micro-filtered to 90%+ protein with near-zero lactose and fast digestion.' }
      ]
    },
    {
      name: 'Creatine Monohydrate (Creapure®)',
      badge: 'STRENGTH & POWER',
      rating: '⭐⭐⭐⭐⭐ (Most Researched)',
      dosage: '3g to 5g daily (consistent every day)',
      timing: 'Any time of day (post-workout with carbs/water recommended)',
      why: 'Creatine replenishes intracellular Phosphocreatine (PCr) in your muscle cells, allowing rapid regeneration of ATP (adenosine triphosphate). It boosts maximum 1RM strength, explosive power, sprint speed, and promotes cell volumization.',
      faqs: [
        { q: 'Do I need a "Loading Phase" (20g/day)?', a: 'No! Taking 3-5g daily will fully saturate your muscle stores within 3-4 weeks with zero stomach bloating or digestive distress.' },
        { q: 'Does creatine cause hair loss or kidney stones?', a: 'No scientifically valid randomized controlled trials have ever shown creatine causes hair loss or kidney damage in healthy individuals. Drink 3-4 liters of water daily.' }
      ]
    },
    {
      name: 'Electrolytes & Intra-Workout Hydration',
      badge: 'CRUCIAL FOR GURUGRAM HEAT & ZUMBA',
      rating: '⭐⭐⭐⭐⭐ (High Performance)',
      dosage: '1 sachet / 500ml water sipped during workouts',
      timing: 'Intra-workout during heavy lifts or 60-min dance cardio',
      why: 'Sweat contains essential sodium, potassium, and magnesium. Losing just 2% of body weight in sweat degrades strength and causes severe muscle cramping, fatigue, and brain fog.',
      faqs: [
        { q: 'Can I just drink plain water?', a: 'For short workouts under 30 mins, water is fine. For intense 60+ min strength sessions or high-sweat Zumba dance classes, replenishing sodium and potassium prevents sudden cramps and dizziness.' }
      ]
    },
    {
      name: 'Omega-3 Fish Oil (EPA / DHA)',
      badge: 'JOINT HEALTH & INFLAMMATION',
      rating: '⭐⭐⭐⭐ (Core Health)',
      dosage: '1,000mg to 2,000mg total combined EPA+DHA daily',
      timing: 'With a fat-containing meal (Breakfast or Lunch)',
      why: 'High-load barbell training and impact from jumping puts stress on knees and shoulders. Omega-3 fatty acids reduce chronic systemic inflammation, accelerate joint recovery, and support cardiovascular health.',
      faqs: [
        { q: 'What if I am vegetarian?', a: 'Vegetarians can opt for Algal Oil (derived from marine algae), which provides bioavailable EPA and DHA without fish-based gelatin.' }
      ]
    },
    {
      name: 'Ashwagandha (KSM-66®) & Zinc / Magnesium (ZMA)',
      badge: 'SLEEP & CORTISOL REGULATION',
      rating: '⭐⭐⭐⭐ (Stress Recovery)',
      dosage: '300mg–600mg KSM-66 extract at bedtime',
      timing: '30-45 minutes before sleep',
      why: 'Hard training on top of long work hours raises stress. Ashwagandha is a well-studied adaptogen: trials suggest it can lower cortisol (a stress hormone) and improve sleep quality.',
      faqs: [
        { q: 'How long until I feel the effects?', a: 'Studies typically measure effects after several weeks of daily use. Stop and see a doctor if you feel unwell.' }
      ]
    }
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12 space-y-12 sm:space-y-16">
      {/* 1. Page Header */}
      <div className="text-center max-w-3xl mx-auto space-y-4">
        <Badge variant="lime">SCIENCE-BACKED ATHLETIC GUIDES</Badge>
        <h1 className="text-3xl sm:text-5xl md:text-6xl font-black text-white tracking-tight font-['Outfit']">
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
      {activeCategory === 'workout-plans' && (
        <div className="space-y-8" role="tabpanel" id="guide-panel-workout-plans" aria-labelledby="guide-tab-workout-plans">
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
                <h3 className="font-black text-sm sm:text-base text-white">{plan.name}</h3>
                <p className="text-xs text-slate-400 mt-1 line-clamp-2">{plan.goal}</p>
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
                  <h2 className="text-2xl sm:text-3xl font-black text-white mt-1 font-['Outfit']">
                    {workoutPlans[selectedPlanIdx].name}
                  </h2>
                  <p className="text-xs sm:text-sm text-slate-400 mt-1 max-w-2xl">
                    {workoutPlans[selectedPlanIdx].desc}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => setCurrentTab('workout-logger')}
                  className="px-6 py-3 neu-btn-lime font-extrabold text-xs rounded-xl transition-all flex items-center justify-center gap-2 shrink-0 active:scale-95"
                >
                  <Dumbbell className="w-4 h-4" aria-hidden="true" /> {user ? 'Log it in the workout logger' : 'Sign in to log your workouts'}
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
        </div>
      )}

      {/* 3. TAB 2: DIET CHARTS */}
      {activeCategory === 'diet-charts' && (
        <div className="space-y-8" role="tabpanel" id="guide-panel-diet-charts" aria-labelledby="guide-tab-diet-charts">
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
                <h3 className="font-black text-sm sm:text-base text-white">{diet.title}</h3>
                <p className="text-xs text-slate-400 mt-1 line-clamp-2">{diet.desc}</p>
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
                  <h2 className="text-2xl sm:text-3xl font-black text-white mt-1 font-['Outfit']">
                    {dietCharts[selectedDietIdx].title}
                  </h2>
                  <p className="text-xs sm:text-sm text-slate-400 mt-1 max-w-2xl">
                    {dietCharts[selectedDietIdx].desc}
                  </p>
                </div>

                {/* Macro summary pills */}
                <div className="flex items-center gap-3 p-3 rounded-2xl neu-pressed-sm shrink-0">
                  <div className="text-center px-2">
                    <div className="text-[10px] uppercase font-bold text-slate-400">Protein</div>
                    <div className="text-sm font-black text-lime-400 font-mono">{dietCharts[selectedDietIdx].macros.protein}</div>
                  </div>
                  <div className="h-6 w-[1px] bg-slate-800" />
                  <div className="text-center px-2">
                    <div className="text-[10px] uppercase font-bold text-slate-400">Carbs</div>
                    <div className="text-sm font-black text-amber-700 dark:text-amber-300 font-mono">{dietCharts[selectedDietIdx].macros.carbs}</div>
                  </div>
                  <div className="h-6 w-[1px] bg-slate-800" />
                  <div className="text-center px-2">
                    <div className="text-[10px] uppercase font-bold text-slate-400">Fats</div>
                    <div className="text-sm font-black text-cyan-700 dark:text-cyan-400 font-mono">{dietCharts[selectedDietIdx].macros.fats}</div>
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
                          {m.calories}
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
                <h4 className="text-xs font-bold text-lime-400 uppercase tracking-wider flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4" /> Golden Hydration & Nutrition Rules:
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs text-slate-300 pt-1">
                  <div>💧 <strong>Water Intake:</strong> Drink 3.5 to 4.5 Liters of water daily for optimal nutrient transport and digestion.</div>
                  <div>🧂 <strong>Electrolytes:</strong> Add pinch of pink Himalayan salt & lemon in morning water.</div>
                  <div>🥗 <strong>Fiber & Greens:</strong> Keep at least 2 raw salads daily for gut microbiome and digestive health.</div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 4. TAB 3: SUPPLEMENTS GUIDE */}
      {activeCategory === 'supplements' && (
        <div className="space-y-8" role="tabpanel" id="guide-panel-supplements" aria-labelledby="guide-tab-supplements">
          <div className="neu-flat p-6 sm:p-8 rounded-3xl space-y-3 text-center max-w-3xl mx-auto">
            <Badge variant="cyan">EVIDENCE-BASED NUTRACEUTICALS</Badge>
            <h2 className="text-2xl sm:text-3xl font-black text-white font-['Outfit']">
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
                      <span className="text-xs font-mono text-amber-700 dark:text-amber-400 font-bold">{supp.rating}</span>
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
                        <div className="text-xs font-bold text-lime-400">{faq.q}</div>
                        <div className="text-xs text-slate-400 leading-relaxed">{faq.a}</div>
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
        </div>
      )}

      {/* 5. Call to Action */}
      <div className="p-8 sm:p-12 rounded-3xl neu-flat border-2 border-lime-500/50 shadow-glow-lime text-center space-y-6">
        <Badge variant="lime">START YOUR TRANSFORMATION</Badge>
        <h2 className="text-3xl sm:text-5xl font-black text-white font-['Outfit']">
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

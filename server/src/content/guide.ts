import { FitnessGuide } from '../types/index.js';

// The full fitness guide: workout plans, diet and meal charts, the supplements guide and the
// strength floor's sample split. Only signed-in accounts read it (GET /api/guide), and it is kept
// out of the client bundle so the gate cannot be read around. Guests see a teaser written in the
// client (FitnessGuidePage.tsx, WorkoutPage.tsx) that names the same plans; tests/guide.test.ts
// fails when the names drift apart.

export const GUIDE: FitnessGuide = {
  workout_plans: [
    {
      id: 'ppl',
      name: '5-Day Push / Pull / Legs (PPL)',
      level: 'Intermediate - Advanced',
      goal: 'Maximum Muscle Hypertrophy & Symmetrical Strength',
      frequency: '5 Days / Week • 60-75 Mins',
      description: 'The gold standard bodybuilding split that groups muscles by anatomical movement patterns for optimal recovery and frequency.',
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
      description: 'Ideal for busy schedules: four focused training days per week.',
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
      description: 'Combines the calorie-burning excitement of Zumba dance classes with targeted resistance training for tone and definition.',
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
  ],

  // Desi & clean Indian nutrition. Calories are per meal (kcal); the client adds up the day.
  diet_charts: [
    {
      id: 'muscle-gain',
      title: 'Muscle Gain & Bulk Plan',
      type: 'High Protein / Lean Surplus',
      macros: { protein_g: 170, carbs_g: 380, fats_g: 75 },
      description: 'Formulated for athletes building lean muscle tissue with wholesome, high-energy Indian staples and complete protein sources.',
      meals: [
        {
          timing: '7:30 AM • Breakfast',
          name: 'Oats & High-Protein Fuel Bowl',
          items: ['80g Rolled Oats cooked in 250ml low-fat milk', '1 Scoop Whey Protein (or 40g roasted Sattu powder)', '1 Banana + 15g Almonds & Chia seeds', '2 Whole Boiled Eggs or 50g Paneer cubes'],
          calories: 650
        },
        {
          timing: '11:00 AM • Mid-Morning Snack',
          name: 'Fruit & Sprout Power Boost',
          items: ['1 Bowl Boiled Moong Sprouts Salad with cucumber & lemon', '1 Apple or seasonal fruit', '1 Handful Roasted Chana (40g)'],
          calories: 320
        },
        {
          timing: '1:30 PM • Lunch',
          name: 'Wholesome Desi Muscle Thali',
          items: ['150g Grilled Chicken Breast OR 150g Low-Fat Paneer / Soya chunks', '2 Whole Wheat Roti / 1.5 cup Brown Rice', '1 Bowl Thick Dal Tadka / Rajma / Chhole', '1 Bowl Curd / Dahi + Mixed green salad'],
          calories: 850
        },
        {
          timing: '5:00 PM • Pre-Workout Fuel',
          name: 'Energy & Nitric Boost (60 mins before gym)',
          items: ['2 Brown bread slices with 20g Peanut Butter', '1 Large Banana + 1 cup Black Coffee (zero sugar)'],
          calories: 380
        },
        {
          timing: '7:30 PM • Post-Workout (within 45 mins)',
          name: 'Anabolic Recovery Shake',
          items: ['1 Scoop Whey Protein in 250ml water/milk', '3-5g Creatine Monohydrate', '1 Spoon Honey or 2 Dates'],
          calories: 280
        },
        {
          timing: '9:00 PM • Dinner',
          name: 'Recovery & Protein Re-charge',
          items: ['150g Paneer / Tofu / Fish / Chicken curry with light oil', '2 Multigrain Rotis', '1 Large Bowl Steamed Veggies + Salad with lemon'],
          calories: 520
        }
      ]
    },
    {
      id: 'fat-loss',
      title: 'Fat Loss & Lean Definition',
      type: 'Calorie Deficit / High Satiety',
      macros: { protein_g: 150, carbs_g: 160, fats_g: 45 },
      description: 'Designed to shed body fat while preserving lean muscle mass. High protein, high fiber, and sustained energy for workouts and Zumba.',
      meals: [
        {
          timing: '8:00 AM • Breakfast',
          name: 'High-Protein Egg / Besan Chilla',
          items: ['3 Boiled Egg Whites + 1 Whole Egg (OR 2 Besan-Paneer Chillas with veggies)', '1 Cup Green Tea or Black Coffee', '1 Handful Soaked Almonds (6-8 pieces)'],
          calories: 340
        },
        {
          timing: '11:30 AM • Mid-Morning',
          name: 'Hydration & Satiety Snack',
          items: ['1 Glass Chaas (Buttermilk) with roasted jeera & mint', '1 Cucumber & Tomato salad bowl with black salt'],
          calories: 90
        },
        {
          timing: '1:30 PM • Lunch',
          name: 'Portion-Controlled Lean Meal',
          items: ['120g Grilled Chicken Breast OR 120g Air-Fried Tofu / Paneer', '1 Multigrain Roti or 1/2 cup Boiled Rice', '1 Bowl Yellow Moong Dal (light tadka)', 'Large Bowl Cucumber, Beetroot & Carrot salad'],
          calories: 480
        },
        {
          timing: '5:00 PM • Pre-Workout / Evening Snack',
          name: 'Clean Focus Fuel',
          items: ['1 Medium Apple with a dash of cinnamon', '1 Cup Black Coffee or Green Tea', '30g Roasted Makhana (Fox nuts)'],
          calories: 180
        },
        {
          timing: '7:30 PM • Post-Workout',
          name: 'Lean Protein Hit',
          items: ['1 Scoop Whey Protein Isolate in cold water', '3g Creatine Monohydrate'],
          calories: 130
        },
        {
          timing: '8:30 PM • Dinner',
          name: 'Light Digestible Protein Dinner',
          items: ['100g Paneer Bhurji with capsicum & onion OR Grilled Fish/Chicken', '1 Bowl Clear Vegetable Soup or Dal', 'Generous Green Salad (zero mayonnaise/dressings)'],
          calories: 420
        }
      ]
    },
    {
      id: 'pure-veg',
      title: 'Pure Vegetarian High-Protein Plan',
      type: 'Plant & Dairy Protein Power',
      macros: { protein_g: 140, carbs_g: 260, fats_g: 60 },
      description: 'A 100% pure vegetarian Indian diet proving you do not need meat to build muscle, hit 140g+ protein daily, and stay in peak shape.',
      meals: [
        {
          timing: '7:30 AM • Breakfast',
          name: 'Sattu & Paneer Protein Kick',
          items: ['1 Glass Desi Sattu Shake (40g Chana Sattu + Water + Cumin + Lemon)', '100g Low-fat Paneer / Tofu lightly pan-seared with chaat masala', '1 Banana'],
          calories: 480
        },
        {
          timing: '11:00 AM • Snack',
          name: 'Sprouts & Greek Yogurt',
          items: ['1 Bowl Mixed Moong & Kala Chana sprouts', '1 Cup Low-fat Greek Yogurt / Hung Curd (100g)'],
          calories: 260
        },
        {
          timing: '1:30 PM • Lunch',
          name: 'High-Protein Soy & Dal Thali',
          items: ['50g Soya Chunks Curry (yielding ~26g pure protein)', '2 Whole Wheat Rotis', '1 Bowl Thick Black Chhole or Rajma', '1 Bowl Cucumber & Onion Salad'],
          calories: 620
        },
        {
          timing: '5:00 PM • Pre-Workout',
          name: 'Clean Carb Loader',
          items: ['2 Boiled Potatoes or 1 Sweet Potato (Shakarkandi) with lemon', '1 Cup Black Coffee'],
          calories: 220
        },
        {
          timing: '7:30 PM • Post-Workout',
          name: 'Plant / Whey Protein Shake',
          items: ['1 Scoop Whey or Pea-Rice Plant Protein', '3g Creatine Monohydrate in water'],
          calories: 140
        },
        {
          timing: '9:00 PM • Dinner',
          name: 'Paneer & Dal Tadka',
          items: ['120g Paneer with mixed veggies (broccoli, beans, capsicum)', '1 Roti + 1 Bowl Moong Dal', '1 Glass Warm Milk with pinch of Turmeric / Haldi'],
          calories: 480
        }
      ]
    }
  ],

  nutrition_rules: [
    { emoji: '💧', title: 'Water Intake', text: 'Drink 3.5 to 4.5 Liters of water daily for optimal nutrient transport and digestion.' },
    { emoji: '🧂', title: 'Electrolytes', text: 'Add pinch of pink Himalayan salt & lemon in morning water.' },
    { emoji: '🥗', title: 'Fiber & Greens', text: 'Keep at least 2 raw salads daily for gut microbiome and digestive health.' }
  ],

  supplements: [
    {
      name: 'Whey Protein (Concentrate / Isolate)',
      badge: 'ESSENTIAL FOR RECOVERY',
      stars: 5,
      verdict: 'Gold Standard',
      dosage: '1 to 2 scoops daily (24g–48g protein)',
      timing: 'Immediately post-workout or between meals',
      why: 'Whey protein has the highest Biological Value (BV) of any protein source and delivers fast-acting Branched-Chain Amino Acids (BCAAs, especially Leucine) directly to damaged muscle fibers to trigger muscle protein synthesis (MPS).',
      faqs: [
        { question: 'Is Whey Protein artificial or harmful to kidneys?', answer: 'No. Whey is naturally derived from cow’s milk during the cheese-making process. For healthy individuals with normal renal function, whey is completely safe and backed by hundreds of clinical trials.' },
        { question: 'What is the difference between Concentrate vs Isolate?', answer: 'Whey Concentrate contains ~80% protein with traces of lactose and fats (great value). Whey Isolate is micro-filtered to 90%+ protein with near-zero lactose and fast digestion.' }
      ]
    },
    {
      name: 'Creatine Monohydrate (Creapure®)',
      badge: 'STRENGTH & POWER',
      stars: 5,
      verdict: 'Most Researched',
      dosage: '3g to 5g daily (consistent every day)',
      timing: 'Any time of day (post-workout with carbs/water recommended)',
      why: 'Creatine replenishes intracellular Phosphocreatine (PCr) in your muscle cells, allowing rapid regeneration of ATP (adenosine triphosphate). It boosts maximum 1RM strength, explosive power, sprint speed, and promotes cell volumization.',
      faqs: [
        { question: 'Do I need a "Loading Phase" (20g/day)?', answer: 'No! Taking 3-5g daily will fully saturate your muscle stores within 3-4 weeks with zero stomach bloating or digestive distress.' },
        { question: 'Does creatine cause hair loss or kidney stones?', answer: 'No scientifically valid randomized controlled trials have ever shown creatine causes hair loss or kidney damage in healthy individuals. Drink 3-4 liters of water daily.' }
      ]
    },
    {
      name: 'Electrolytes & Intra-Workout Hydration',
      badge: 'CRUCIAL FOR GURUGRAM HEAT & ZUMBA',
      stars: 5,
      verdict: 'High Performance',
      dosage: '1 sachet / 500ml water sipped during workouts',
      timing: 'Intra-workout during heavy lifts or 60-min dance cardio',
      why: 'Sweat contains essential sodium, potassium, and magnesium. Losing just 2% of body weight in sweat degrades strength and causes severe muscle cramping, fatigue, and brain fog.',
      faqs: [
        { question: 'Can I just drink plain water?', answer: 'For short workouts under 30 mins, water is fine. For intense 60+ min strength sessions or high-sweat Zumba dance classes, replenishing sodium and potassium prevents sudden cramps and dizziness.' }
      ]
    },
    {
      name: 'Omega-3 Fish Oil (EPA / DHA)',
      badge: 'JOINT HEALTH & INFLAMMATION',
      stars: 4,
      verdict: 'Core Health',
      dosage: '1,000mg to 2,000mg total combined EPA+DHA daily',
      timing: 'With a fat-containing meal (Breakfast or Lunch)',
      why: 'High-load barbell training and impact from jumping puts stress on knees and shoulders. Omega-3 fatty acids reduce chronic systemic inflammation, accelerate joint recovery, and support cardiovascular health.',
      faqs: [
        { question: 'What if I am vegetarian?', answer: 'Vegetarians can opt for Algal Oil (derived from marine algae), which provides bioavailable EPA and DHA without fish-based gelatin.' }
      ]
    },
    {
      name: 'Ashwagandha (KSM-66®) & Zinc / Magnesium (ZMA)',
      badge: 'SLEEP & CORTISOL REGULATION',
      stars: 4,
      verdict: 'Stress Recovery',
      dosage: '300mg–600mg KSM-66 extract at bedtime',
      timing: '30-45 minutes before sleep',
      why: 'Hard training on top of long work hours raises stress. Ashwagandha is a well-studied adaptogen: trials suggest it can lower cortisol (a stress hormone) and improve sleep quality.',
      faqs: [
        { question: 'How long until I feel the effects?', answer: 'Studies typically measure effects after several weeks of daily use. Stop and see a doctor if you feel unwell.' }
      ]
    }
  ],

  strength_split: [
    { day: 'Day 1', title: 'Chest & triceps', exercises: ['Barbell bench press 4×8', 'Incline dumbbell press 3×10', 'Cable flyes 3×12', 'Rope pushdowns 3×15'] },
    { day: 'Day 2', title: 'Back & biceps', exercises: ['Deadlift 4×6', 'Lat pulldown 4×10', 'Barbell row 3×10', 'Incline dumbbell curl 3×12'] },
    { day: 'Day 3', title: 'Legs & core', exercises: ['Back squat 4×8', 'Romanian deadlift 3×10', 'Leg press 4×12', 'Hanging leg raise 3×15'] },
    { day: 'Day 4', title: 'Shoulders & arms', exercises: ['Overhead press 4×8', 'Lateral raise 4×15', 'Reverse flye 3×12', 'Hammer curl & skull crusher 3×12'] }
  ]
};

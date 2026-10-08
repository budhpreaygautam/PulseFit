import db from './database.js';
import { runSeedExtensions } from './seed/index.js';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { User, Trainer, GymClass, Exercise, MembershipPlan, Booking, AttendanceLog, Workout, WorkoutSet, TimeSession } from '../types/index.js';

/**
 * Wipe the database and load data.
 * - demo (default): the full demo gym, including the four demo personas whose password
 *   (pulse123) is published in the README, members, bookings, payments and activity.
 * - demo: false: only the catalogue a real gym starts from (plans, exercises, coaches and the
 *   weekly timetable), with no accounts at all. Create the first admin with `npm run create-admin`.
 */
export function seedDatabase(options: { demo?: boolean } = {}) {
  const demo = options.demo ?? true;
  if (!process.env.VITEST) console.log(demo ? '🌱 Seeding the PulseFit demo database...' : '🌱 Writing the starting catalogue (plans, exercises, coaches, timetable)...');

  db.reset();

  const passwordHash = bcrypt.hashSync('pulse123', 10);

  // 1. Users
  const users: User[] = [
    {
      id: 'usr_member_1',
      email: 'member@pulsefit.com',
      password_hash: passwordHash,
      name: 'Aarav Sharma',
      role: 'member',
      avatar_url: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=300&auto=format&fit=crop&q=80',
      phone: '+91 98111 23456',
      membership_tier: 'pro',
      membership_status: 'active',
      membership_expiry: '2027-12-31',
      qr_code_token: 'PULSE-MEM-AARAV-8821',
      created_at: '2026-01-15T08:00:00.000Z',
      streak_days: 14
    },
    {
      id: 'usr_admin_1',
      email: 'admin@pulsefit.com',
      password_hash: passwordHash,
      name: 'Priya Verma',
      role: 'admin',
      avatar_url: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=300&auto=format&fit=crop&q=80',
      phone: '+91 98110 98765',
      membership_tier: 'vip',
      membership_status: 'active',
      membership_expiry: '2030-01-01',
      qr_code_token: 'PULSE-ADM-PRIYA-001',
      created_at: '2025-06-01T08:00:00.000Z',
      streak_days: 28
    },
    {
      id: 'usr_trainer_1',
      email: 'trainer@pulsefit.com',
      password_hash: passwordHash,
      name: 'Coach Vikram Rathore',
      role: 'trainer',
      avatar_url: 'https://images.unsplash.com/photo-1568602471122-7832951cc4c5?w=300&auto=format&fit=crop&q=80',
      phone: '+91 98112 45678',
      membership_tier: 'vip',
      membership_status: 'active',
      membership_expiry: '2030-01-01',
      qr_code_token: 'PULSE-TRN-VIKRAM-002',
      created_at: '2025-08-10T08:00:00.000Z',
      streak_days: 45
    },
    {
      id: 'usr_member_2',
      email: 'vip@pulsefit.com',
      password_hash: passwordHash,
      name: 'Ananya Gupta',
      role: 'member',
      avatar_url: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=300&auto=format&fit=crop&q=80',
      phone: '+91 98113 67890',
      membership_tier: 'vip',
      membership_status: 'active',
      membership_expiry: '2027-08-15',
      qr_code_token: 'PULSE-MEM-ANANYA-7734',
      created_at: '2026-02-01T08:00:00.000Z',
      streak_days: 9
    },
    {
      id: 'usr_member_3',
      email: 'rohan.mehra@example.com',
      password_hash: passwordHash,
      name: 'Rohan Mehra',
      role: 'member',
      avatar_url: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=300&auto=format&fit=crop&q=80',
      phone: '+91 98114 32199',
      membership_tier: 'basic',
      membership_status: 'active',
      membership_expiry: '2026-11-20',
      qr_code_token: 'PULSE-MEM-ROHAN-4412',
      created_at: '2026-04-10T08:00:00.000Z',
      streak_days: 5
    },
    {
      id: 'usr_member_4',
      email: 'maya.patel@example.com',
      password_hash: passwordHash,
      name: 'Maya Patel',
      role: 'member',
      avatar_url: 'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?w=300&auto=format&fit=crop&q=80',
      phone: '+91 98115 88823',
      membership_tier: 'pro',
      membership_status: 'active',
      membership_expiry: '2027-03-10',
      qr_code_token: 'PULSE-MEM-MAYA-9012',
      created_at: '2026-03-18T08:00:00.000Z',
      streak_days: 21
    },
    {
      id: 'usr_member_5',
      email: 'dev.kapoor@example.com',
      password_hash: passwordHash,
      name: 'Dev Kapoor',
      role: 'member',
      avatar_url: 'https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?w=300&auto=format&fit=crop&q=80',
      phone: '+91 98116 55501',
      membership_tier: 'basic',
      membership_status: 'expired',
      membership_expiry: '2026-08-01',
      qr_code_token: 'PULSE-MEM-DEV-1100',
      created_at: '2025-10-01T08:00:00.000Z',
      streak_days: 0
    }
  ];

  db.users = users;

  // 2. Trainers (Specialized in Workout/Strength and Zumba/Cardio)
  const trainers: Trainer[] = [
    {
      id: 'trn_vikram',
      user_id: 'usr_trainer_1',
      name: 'Coach Vikram Rathore',
      email: 'vikram@pulsefit.com',
      phone: '+91 98112 45678',
      specialties: ['Workout & Strength Training', 'Barbell Compound Movements', 'Progressive Muscle Building'],
      bio: 'Certified Strength & Conditioning specialist with 10+ years experience mentoring gym-goers in compound lifting, hypertrophy, and proper lifting form.',
      experience_years: 10,
      rating: 4.96,
      reviews_count: 142,
      avatar_url: 'https://images.unsplash.com/photo-1568602471122-7832951cc4c5?w=400&auto=format&fit=crop&q=80',
      instagram: '@coach.vikramrathore'
    },
    {
      id: 'trn_kavya',
      name: 'Kavya Sen',
      email: 'kavya@pulsefit.com',
      phone: '+91 98117 67843',
      specialties: ['Zumba & Cardio Dance', 'Aerobic Fat Burn', 'High-Energy Cardio Sessions'],
      bio: 'Licensed Zumba instructor & cardio dance coach bringing infectious rhythm, energetic choreography, and intense calorie burn to every session.',
      experience_years: 7,
      rating: 4.95,
      reviews_count: 128,
      avatar_url: 'https://images.unsplash.com/photo-1594381898411-846e7d193883?w=400&auto=format&fit=crop&q=80',
      instagram: '@kavya.zumbafit'
    },
    {
      id: 'trn_rohan',
      name: 'Rohan Mehta',
      email: 'rohan@pulsefit.com',
      phone: '+91 98118 78998',
      specialties: ['Functional Strength Training', 'Core Strengthening', 'Free Weight Workouts'],
      bio: 'Dedicated strength coach focusing on foundational weight training, functional lifting, dumbbell routines, and injury prevention.',
      experience_years: 8,
      rating: 4.91,
      reviews_count: 96,
      avatar_url: 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=400&auto=format&fit=crop&q=80',
      instagram: '@rohan.strength'
    },
    {
      id: 'trn_simran',
      name: 'Simran Kaur',
      email: 'simran@pulsefit.com',
      phone: '+91 98119 32145',
      specialties: ['Zumba Party Sessions', 'Cardio Blast', 'Endurance & Stamina'],
      bio: 'High-octane fitness coach certified in Zumba and cardio conditioning, turning intense workout routines into enjoyable, beat-driven dance workouts.',
      experience_years: 6,
      rating: 4.93,
      reviews_count: 110,
      avatar_url: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=400&auto=format&fit=crop&q=80',
      instagram: '@simran_cardiozumba'
    }
  ];

  db.trainers = trainers;

  // 3. Classes - Only 2 Disciplines: "Workout & Strength" and "Zumba & Cardio"
  const classes: GymClass[] = [
    {
      id: 'cls_zumba_mon',
      title: 'Sunrise Zumba Dance & Cardio',
      category: 'Zumba & Cardio',
      trainer_id: 'trn_kavya',
      trainer_name: 'Kavya Sen',
      trainer_avatar: 'https://images.unsplash.com/photo-1594381898411-846e7d193883?w=400&auto=format&fit=crop&q=80',
      day_of_week: 1, // Mon
      start_time: '06:30',
      duration_minutes: 45,
      room: 'Zumba Studio',
      capacity: 25,
      booked_count: 18,
      intensity: 'High',
      calories_burn_est: 550,
      description: 'Start your week energized with upbeat Latin & Bollywood dance cardio choreography that torches calories and boosts endurance.',
      image_url: 'https://images.unsplash.com/photo-1518611012118-696072aa579a?w=600&auto=format&fit=crop&q=80'
    },
    {
      id: 'cls_str_mon',
      title: 'Barbell Strength & Hypertrophy',
      category: 'Workout & Strength',
      trainer_id: 'trn_vikram',
      trainer_name: 'Coach Vikram Rathore',
      trainer_avatar: 'https://images.unsplash.com/photo-1568602471122-7832951cc4c5?w=400&auto=format&fit=crop&q=80',
      day_of_week: 1, // Mon
      start_time: '18:00',
      duration_minutes: 60,
      room: 'Strength Arena',
      capacity: 20,
      booked_count: 16,
      intensity: 'Extreme',
      calories_burn_est: 480,
      description: 'Structured workout session focusing on major compound lifts—squats, bench press, and barbell rows with personalized form corrections.',
      image_url: 'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=600&auto=format&fit=crop&q=80'
    },
    {
      id: 'cls_str_tue',
      title: 'Functional Full-Body Strength',
      category: 'Workout & Strength',
      trainer_id: 'trn_rohan',
      trainer_name: 'Rohan Mehta',
      trainer_avatar: 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=400&auto=format&fit=crop&q=80',
      day_of_week: 2, // Tue
      start_time: '07:00',
      duration_minutes: 50,
      room: 'Strength Arena',
      capacity: 20,
      booked_count: 14,
      intensity: 'High',
      calories_burn_est: 450,
      description: 'Dumbbell and kettlebell workout targeting all major muscle groups for balanced muscle tone, core stability, and stamina.',
      image_url: 'https://images.unsplash.com/photo-1581009146145-b5ef050c2e1e?w=600&auto=format&fit=crop&q=80'
    },
    {
      id: 'cls_zumba_tue',
      title: 'High-Energy Zumba Beats',
      category: 'Zumba & Cardio',
      trainer_id: 'trn_simran',
      trainer_name: 'Simran Kaur',
      trainer_avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=400&auto=format&fit=crop&q=80',
      day_of_week: 2, // Tue
      start_time: '17:30',
      duration_minutes: 45,
      room: 'Zumba Studio',
      capacity: 25,
      booked_count: 21,
      intensity: 'High',
      calories_burn_est: 520,
      description: 'Dynamic cardio dance workout set to pulsing rhythms. Great for cardiovascular health, agility, and burning stubborn fat.',
      image_url: 'https://images.unsplash.com/photo-1524594152303-9fd13543fe6e?w=600&auto=format&fit=crop&q=80'
    },
    {
      id: 'cls_zumba_wed',
      title: 'Cardio Dance Party Zumba',
      category: 'Zumba & Cardio',
      trainer_id: 'trn_kavya',
      trainer_name: 'Kavya Sen',
      trainer_avatar: 'https://images.unsplash.com/photo-1594381898411-846e7d193883?w=400&auto=format&fit=crop&q=80',
      day_of_week: 3, // Wed
      start_time: '07:30',
      duration_minutes: 45,
      room: 'Zumba Studio',
      capacity: 25,
      booked_count: 19,
      intensity: 'Medium',
      calories_burn_est: 480,
      description: 'Fun-filled cardio choreography suitable for all fitness levels. Sweat it out, improve rhythm, and elevate your mood.',
      image_url: 'https://images.unsplash.com/photo-1517838277536-f5f99be501cd?w=600&auto=format&fit=crop&q=80'
    },
    {
      id: 'cls_str_wed',
      title: 'Upper Body Push & Pull Strength',
      category: 'Workout & Strength',
      trainer_id: 'trn_vikram',
      trainer_name: 'Coach Vikram Rathore',
      trainer_avatar: 'https://images.unsplash.com/photo-1568602471122-7832951cc4c5?w=400&auto=format&fit=crop&q=80',
      day_of_week: 3, // Wed
      start_time: '18:30',
      duration_minutes: 55,
      room: 'Strength Arena',
      capacity: 18,
      booked_count: 15,
      intensity: 'Extreme',
      calories_burn_est: 500,
      description: 'Focused workout on chest press, lat pulldowns, shoulder presses, and arm conditioning with guided rep tempos.',
      image_url: 'https://images.unsplash.com/photo-1583454110551-21f2fa2afe61?w=600&auto=format&fit=crop&q=80'
    },
    {
      id: 'cls_zumba_thu',
      title: 'Core & Cardio Burn Session',
      category: 'Zumba & Cardio',
      trainer_id: 'trn_simran',
      trainer_name: 'Simran Kaur',
      trainer_avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=400&auto=format&fit=crop&q=80',
      day_of_week: 4, // Thu
      start_time: '08:00',
      duration_minutes: 45,
      room: 'Zumba Studio',
      capacity: 22,
      booked_count: 17,
      intensity: 'High',
      calories_burn_est: 490,
      description: 'A blend of rhythmic dance cardio followed by standing and mat-based core conditioning intervals.',
      image_url: 'https://images.unsplash.com/photo-1540497077202-7c8a3999166f?w=600&auto=format&fit=crop&q=80'
    },
    {
      id: 'cls_str_thu',
      title: 'Lower Body & Squat Mechanics',
      category: 'Workout & Strength',
      trainer_id: 'trn_rohan',
      trainer_name: 'Rohan Mehta',
      trainer_avatar: 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=400&auto=format&fit=crop&q=80',
      day_of_week: 4, // Thu
      start_time: '18:00',
      duration_minutes: 60,
      room: 'Strength Arena',
      capacity: 18,
      booked_count: 16,
      intensity: 'High',
      calories_burn_est: 520,
      description: 'Strengthen quads, hamstrings, and glutes with guided barbell back squats, lunges, and Romanian deadlifts.',
      image_url: 'https://images.unsplash.com/photo-1574680096145-d05b474e2155?w=600&auto=format&fit=crop&q=80'
    },
    {
      id: 'cls_str_fri',
      title: 'Power Workout & Strength Circuit',
      category: 'Workout & Strength',
      trainer_id: 'trn_vikram',
      trainer_name: 'Coach Vikram Rathore',
      trainer_avatar: 'https://images.unsplash.com/photo-1568602471122-7832951cc4c5?w=400&auto=format&fit=crop&q=80',
      day_of_week: 5, // Fri
      start_time: '07:00',
      duration_minutes: 50,
      room: 'Strength Arena',
      capacity: 20,
      booked_count: 17,
      intensity: 'Extreme',
      calories_burn_est: 530,
      description: 'Full-body strength training circuit alternating between free weights and resistance machines for maximum muscle tone.',
      image_url: 'https://images.unsplash.com/photo-1517838277536-f5f99be501cd?w=600&auto=format&fit=crop&q=80'
    },
    {
      id: 'cls_zumba_fri',
      title: 'Friday Night Zumba Party',
      category: 'Zumba & Cardio',
      trainer_id: 'trn_kavya',
      trainer_name: 'Kavya Sen',
      trainer_avatar: 'https://images.unsplash.com/photo-1594381898411-846e7d193883?w=400&auto=format&fit=crop&q=80',
      day_of_week: 5, // Fri
      start_time: '17:30',
      duration_minutes: 50,
      room: 'Zumba Studio',
      capacity: 28,
      booked_count: 24,
      intensity: 'High',
      calories_burn_est: 600,
      description: 'Celebrate the weekend with our flagship dance cardio party! Non-stop music, infectious energy, and maximum sweat.',
      image_url: 'https://images.unsplash.com/photo-1518611012118-696072aa579a?w=600&auto=format&fit=crop&q=80'
    },
    {
      id: 'cls_zumba_sat',
      title: 'Weekend Ultimate Zumba Fiesta',
      category: 'Zumba & Cardio',
      trainer_id: 'trn_simran',
      trainer_name: 'Simran Kaur',
      trainer_avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=400&auto=format&fit=crop&q=80',
      day_of_week: 6, // Sat
      start_time: '09:00',
      duration_minutes: 60,
      room: 'Zumba Studio',
      capacity: 30,
      booked_count: 26,
      intensity: 'High',
      calories_burn_est: 620,
      description: 'Extended Saturday Zumba masterclass blending salsa, merengue, hip-hop, and energetic aerobic fitness.',
      image_url: 'https://images.unsplash.com/photo-1524594152303-9fd13543fe6e?w=600&auto=format&fit=crop&q=80'
    },
    {
      id: 'cls_str_sat',
      title: 'Deadlift & Heavy Compound Strength',
      category: 'Workout & Strength',
      trainer_id: 'trn_vikram',
      trainer_name: 'Coach Vikram Rathore',
      trainer_avatar: 'https://images.unsplash.com/photo-1568602471122-7832951cc4c5?w=400&auto=format&fit=crop&q=80',
      day_of_week: 6, // Sat
      start_time: '11:00',
      duration_minutes: 60,
      room: 'Strength Arena',
      capacity: 18,
      booked_count: 15,
      intensity: 'Extreme',
      calories_burn_est: 510,
      description: 'Master the king of lifts: conventional deadlifts, Romanian deadlifts, and back accessory training with expert coaching.',
      image_url: 'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=600&auto=format&fit=crop&q=80'
    }
  ];

  db.classes = classes;

  // 4. Exercises for Workout Logger
  const exercises: Exercise[] = [
    {
      id: 'ex_bench_press',
      name: 'Barbell Flat Bench Press',
      category: 'Chest',
      equipment: 'Barbell',
      difficulty: 'Intermediate',
      instructions: [
        'Lie flat on the bench with eyes directly under the racked bar.',
        'Grip bar slightly wider than shoulder-width, plant feet firmly into floor.',
        'Unrack bar, lower controlled to mid-chest while tucking elbows at 45 degrees.',
        'Drive through feet and press forcefully back to lockout without bouncing.'
      ],
      target_muscles: ['Pectoralis Major', 'Anterior Deltoid', 'Triceps Brachii'],
      thumbnail_url: 'https://images.unsplash.com/photo-1581009146145-b5ef050c2e1e?w=300&auto=format&fit=crop&q=80'
    },
    {
      id: 'ex_incline_db_press',
      name: 'Incline Dumbbell Press',
      category: 'Chest',
      equipment: 'Dumbbell',
      difficulty: 'Intermediate',
      instructions: [
        'Set bench to 30-45 degree angle.',
        'Kick dumbbells to shoulder level and maintain a slight chest arch.',
        'Press dumbbells upward in a slight converging arc, squeezing upper pecs at the peak.',
        'Lower slowly until thumbs reach outer chest level.'
      ],
      target_muscles: ['Clavicular Pectoral (Upper Chest)', 'Anterior Deltoid', 'Triceps'],
      thumbnail_url: 'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=300&auto=format&fit=crop&q=80'
    },
    {
      id: 'ex_deadlift',
      name: 'Conventional Barbell Deadlift',
      category: 'Back',
      equipment: 'Barbell',
      difficulty: 'Advanced',
      instructions: [
        'Stand with feet hip-width apart, bar over mid-foot.',
        'Hinge hips back, grip bar just outside knees, and pull chest up to lock lats.',
        'Drive legs into floor, maintaining neutral spine until hips and knees extend together.',
        'Return weight with control by hinging hips back before bending knees.'
      ],
      target_muscles: ['Erector Spinae', 'Gluteus Maximus', 'Hamstrings', 'Latissimus Dorsi', 'Traps'],
      thumbnail_url: 'https://images.unsplash.com/photo-1517838277536-f5f99be501cd?w=300&auto=format&fit=crop&q=80'
    },
    {
      id: 'ex_barbell_squat',
      name: 'Barbell Back Squat',
      category: 'Legs',
      equipment: 'Barbell',
      difficulty: 'Intermediate',
      instructions: [
        'Rest bar across upper traps/rear delts, feet shoulder-width, toes slightly flared.',
        'Brace core deeply with 360-degree intra-abdominal pressure.',
        'Descend by breaking at hips and knees simultaneously until thighs pass parallel.',
        'Drive out of the hole spreading the floor with feet.'
      ],
      target_muscles: ['Quadriceps', 'Gluteus Maximus', 'Adductors', 'Core'],
      thumbnail_url: 'https://images.unsplash.com/photo-1574680096145-d05b474e2155?w=300&auto=format&fit=crop&q=80'
    },
    {
      id: 'ex_pullup',
      name: 'Weighted / Bodyweight Pull-Up',
      category: 'Back',
      equipment: 'Bodyweight',
      difficulty: 'Intermediate',
      instructions: [
        'Grab overhead bar with overhand grip slightly wider than shoulder width.',
        'Initiate pull by retracting scapulae downward.',
        'Pull chest towards bar until chin clears bar comfortably.',
        'Lower with full control to a dead hang to ensure full lat stretch.'
      ],
      target_muscles: ['Latissimus Dorsi', 'Biceps Brachii', 'Rhomboids', 'Teres Major'],
      thumbnail_url: 'https://images.unsplash.com/photo-1598971639058-fab3c3109a00?w=300&auto=format&fit=crop&q=80'
    },
    {
      id: 'ex_overhead_press',
      name: 'Barbell Overhead Military Press',
      category: 'Shoulders',
      equipment: 'Barbell',
      difficulty: 'Intermediate',
      instructions: [
        'Rack bar at clavicle height, grip just outside shoulders.',
        'Squeeze glutes and abs tight for a rock-solid base.',
        'Press vertically, pulling head back slightly to clear the bar path, then locking out overhead.',
        'Lower under strict control back to front rack.'
      ],
      target_muscles: ['Anterior Deltoids', 'Lateral Deltoids', 'Triceps', 'Upper Trapezius'],
      thumbnail_url: 'https://images.unsplash.com/photo-1581009146145-b5ef050c2e1e?w=300&auto=format&fit=crop&q=80'
    },
    {
      id: 'ex_romanian_deadlift',
      name: 'Romanian Deadlift (RDL)',
      category: 'Legs',
      equipment: 'Barbell',
      difficulty: 'Intermediate',
      instructions: [
        'Hold bar at hip level, soft bend in knees.',
        'Push hips backward as far as possible while keeping bar glued to legs.',
        'Stop once hamstrings reach maximum tension (usually just below knees).',
        'Drive hips forward and squeeze glutes to stand.'
      ],
      target_muscles: ['Hamstrings', 'Gluteus Maximus', 'Lower Back'],
      thumbnail_url: 'https://images.unsplash.com/photo-1517838277536-f5f99be501cd?w=300&auto=format&fit=crop&q=80'
    },
    {
      id: 'ex_cable_lateral_raise',
      name: 'Cable Lateral Raise',
      category: 'Shoulders',
      equipment: 'Cable',
      difficulty: 'Beginner',
      instructions: [
        'Set pulley to lowest setting or wrist height.',
        'Raise arm out to the side in the scapular plane (slight 15-degree forward angle).',
        'Pause at shoulder height, then lower slowly through constant cable tension.'
      ],
      target_muscles: ['Lateral Deltoid (Side Delt)'],
      thumbnail_url: 'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=300&auto=format&fit=crop&q=80'
    },
    {
      id: 'ex_barbell_curl',
      name: 'EZ-Bar Bicep Curl',
      category: 'Arms',
      equipment: 'Barbell',
      difficulty: 'Beginner',
      instructions: [
        'Hold EZ-bar with underhand grip at shoulder width.',
        'Pin elbows to ribcage and curl bar upward towards upper chest.',
        'Squeeze biceps hard at peak contraction and resist the descent for 3 seconds.'
      ],
      target_muscles: ['Biceps Brachii', 'Brachialis'],
      thumbnail_url: 'https://images.unsplash.com/photo-1581009146145-b5ef050c2e1e?w=300&auto=format&fit=crop&q=80'
    },
    {
      id: 'ex_tricep_rope_pushdown',
      name: 'Tricep Rope Pushdown',
      category: 'Arms',
      equipment: 'Cable',
      difficulty: 'Beginner',
      instructions: [
        'Attach rope to high pulley, tuck elbows close to torso.',
        'Push down extending elbows and spread rope apart at the bottom lockout.',
        'Allow forearms to rise back to 90 degrees under control.'
      ],
      target_muscles: ['Triceps Lateral & Long Head'],
      thumbnail_url: 'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=300&auto=format&fit=crop&q=80'
    },
    {
      id: 'ex_hanging_leg_raise',
      name: 'Hanging Leg / Knee Raise',
      category: 'Core',
      equipment: 'Bodyweight',
      difficulty: 'Intermediate',
      instructions: [
        'Hang from pull-up bar with active shoulders.',
        'Curl pelvis upward and lift toes or knees to chest height without swinging.',
        'Lower with steady control to maintain continuous abdominal engagement.'
      ],
      target_muscles: ['Rectus Abdominis', 'Hip Flexors', 'Obliques'],
      thumbnail_url: 'https://images.unsplash.com/photo-1598971639058-fab3c3109a00?w=300&auto=format&fit=crop&q=80'
    },
    {
      id: 'ex_bulgarian_split_squat',
      name: 'Bulgarian Split Squat',
      category: 'Legs',
      equipment: 'Dumbbell',
      difficulty: 'Intermediate',
      instructions: [
        'Place rear foot elevated on bench behind you.',
        'Lower front hip until front thigh is parallel to floor.',
        'Drive through front heel to return to top position.'
      ],
      target_muscles: ['Quadriceps', 'Gluteus Medius & Maximus'],
      thumbnail_url: 'https://images.unsplash.com/photo-1574680096145-d05b474e2155?w=300&auto=format&fit=crop&q=80'
    }
  ];

  db.exercises = exercises;

  // 5. Plans: pocket-friendly INR pricing (admins can change it on the Plans page)
  const plans: MembershipPlan[] = [
    {
      id: 'plan_basic',
      name: 'Workout & Strength Pass',
      tier: 'basic',
      categories: ['Workout & Strength'],
      price_monthly: 699,
      price_annual: 7188, // ₹599/month billed annually (₹7,188/yr)
      description: 'Complete access to the gym floor, free weights & strength workout sessions.',
      features: [
        'Full Gym Floor & Free Weights Access',
        'Workout & Strength Training Sessions',
        'Locker Room & High-Pressure Showers',
        'Pulse Mobile App & Digital QR Pass',
        'Daily Workout Set Logger & Time Tracker'
      ],
      is_popular: false
    },
    {
      id: 'plan_pro',
      name: 'Zumba & Cardio Pass',
      tier: 'pro',
      categories: ['Zumba & Cardio'],
      price_monthly: 799,
      price_annual: 8388, // ₹699/month billed annually (₹8,388/yr)
      description: 'Unlimited high-energy Zumba dance and cardio conditioning classes.',
      features: [
        'Unlimited Zumba & Cardio Sessions',
        'Daily Dance Cardio Classes & Aerobic Floor',
        'Locker Room & Shower Access',
        'Pulse Mobile App & Digital QR Pass',
        'Calorie Burn Tracking & Class Reservations'
      ],
      is_popular: false
    },
    {
      id: 'plan_vip',
      name: 'Dual All-Access Pass (Strength + Zumba)',
      tier: 'vip',
      categories: [], // empty = every category
      price_monthly: 999,
      price_annual: 10188, // ₹849/month billed annually (₹10,188/yr)
      description: 'The best value: unlimited access to BOTH Strength Training & Zumba Cardio sessions.',
      features: [
        'Unlimited Workout & Strength Training Sessions',
        'Unlimited Zumba & Cardio Dance Classes',
        'Full Gym Floor & Free Weights Access',
        '1 Monthly Trainer Form & Progress Assessment',
        'Priority Class Spot Reservation',
        'Pulse Mobile App & Digital QR Turnstile Pass'
      ],
      is_popular: true,
      badge: 'BEST VALUE'
    }
  ];

  db.membership_plans = plans;

  // 6. Bookings for Aarav
  const bookings: Booking[] = [
    {
      id: 'bk_aarav_1',
      class_id: 'cls_zumba_mon',
      user_id: 'usr_member_1',
      booking_date: '2026-09-14',
      status: 'confirmed',
      created_at: '2026-09-08T10:00:00.000Z',
      class_title: 'Sunrise Zumba Dance & Cardio',
      category: 'Zumba & Cardio',
      start_time: '06:30',
      room: 'Zumba Studio',
      trainer_name: 'Kavya Sen'
    },
    {
      id: 'bk_aarav_2',
      class_id: 'cls_str_mon',
      user_id: 'usr_member_1',
      booking_date: '2026-09-14',
      status: 'confirmed',
      created_at: '2026-09-08T10:05:00.000Z',
      class_title: 'Barbell Strength & Hypertrophy',
      category: 'Workout & Strength',
      start_time: '18:00',
      room: 'Strength Arena',
      trainer_name: 'Coach Vikram Rathore'
    },
    {
      id: 'bk_aarav_3',
      class_id: 'cls_zumba_tue',
      user_id: 'usr_member_1',
      booking_date: '2026-09-15',
      status: 'confirmed',
      created_at: '2026-09-08T10:10:00.000Z',
      class_title: 'High-Energy Zumba Beats',
      category: 'Zumba & Cardio',
      start_time: '17:30',
      room: 'Zumba Studio',
      trainer_name: 'Simran Kaur'
    }
  ];

  db.bookings = bookings;

  // 7. Attendance Logs
  const attendanceLogs: AttendanceLog[] = [
    { id: 'att_1', user_id: 'usr_member_1', user_name: 'Aarav Sharma', user_email: 'member@pulsefit.com', user_tier: 'pro', check_in_time: '2026-09-08T07:14:22.000Z', check_in_method: 'qr' },
    { id: 'att_2', user_id: 'usr_member_1', user_name: 'Aarav Sharma', user_email: 'member@pulsefit.com', user_tier: 'pro', check_in_time: '2026-09-07T18:22:10.000Z', check_in_method: 'qr' },
    { id: 'att_3', user_id: 'usr_member_2', user_name: 'Ananya Gupta', user_email: 'vip@pulsefit.com', user_tier: 'vip', check_in_time: '2026-09-07T19:05:00.000Z', check_in_method: 'qr' },
    { id: 'att_4', user_id: 'usr_member_1', user_name: 'Aarav Sharma', user_email: 'member@pulsefit.com', user_tier: 'pro', check_in_time: '2026-09-06T08:05:43.000Z', check_in_method: 'qr' },
    { id: 'att_5', user_id: 'usr_member_3', user_name: 'Rohan Mehra', user_email: 'rohan.mehra@example.com', user_tier: 'basic', check_in_time: '2026-09-06T09:12:00.000Z', check_in_method: 'manual' },
    { id: 'att_6', user_id: 'usr_member_1', user_name: 'Aarav Sharma', user_email: 'member@pulsefit.com', user_tier: 'pro', check_in_time: '2026-09-05T10:12:30.000Z', check_in_method: 'qr' },
    { id: 'att_7', user_id: 'usr_member_4', user_name: 'Maya Patel', user_email: 'maya.patel@example.com', user_tier: 'pro', check_in_time: '2026-09-05T17:30:00.000Z', check_in_method: 'qr' },
    { id: 'att_8', user_id: 'usr_member_1', user_name: 'Aarav Sharma', user_email: 'member@pulsefit.com', user_tier: 'pro', check_in_time: '2026-09-04T17:45:11.000Z', check_in_method: 'qr' },
    { id: 'att_9', user_id: 'usr_member_1', user_name: 'Aarav Sharma', user_email: 'member@pulsefit.com', user_tier: 'pro', check_in_time: '2026-09-03T06:55:04.000Z', check_in_method: 'qr' },
    { id: 'att_10', user_id: 'usr_member_1', user_name: 'Aarav Sharma', user_email: 'member@pulsefit.com', user_tier: 'pro', check_in_time: '2026-09-02T18:30:19.000Z', check_in_method: 'qr' },
    { id: 'att_11', user_id: 'usr_member_2', user_name: 'Ananya Gupta', user_email: 'vip@pulsefit.com', user_tier: 'vip', check_in_time: '2026-09-02T19:15:00.000Z', check_in_method: 'qr' }
  ];

  db.attendance_logs = attendanceLogs;

  // 8. Workouts & Sets for Aarav
  const workouts: Workout[] = [
    {
      id: 'wk_aarav_1',
      user_id: 'usr_member_1',
      title: 'Heavy Chest & Triceps Push',
      date: '2026-09-08',
      duration_minutes: 55,
      notes: 'Felt strong on barbell bench press. Reached 100kg for 6 reps smoothly.',
      total_volume_kg: 8420,
      created_at: '2026-09-08T08:15:00.000Z',
      sets: [
        { id: uuidv4(), workout_id: 'wk_aarav_1', exercise_id: 'ex_bench_press', exercise_name: 'Barbell Flat Bench Press', set_number: 1, weight_kg: 60, reps: 10, rpe: 6, is_warmup: true },
        { id: uuidv4(), workout_id: 'wk_aarav_1', exercise_id: 'ex_bench_press', exercise_name: 'Barbell Flat Bench Press', set_number: 2, weight_kg: 80, reps: 8, rpe: 7.5, is_warmup: false },
        { id: uuidv4(), workout_id: 'wk_aarav_1', exercise_id: 'ex_bench_press', exercise_name: 'Barbell Flat Bench Press', set_number: 3, weight_kg: 95, reps: 6, rpe: 8.5, is_warmup: false },
        { id: uuidv4(), workout_id: 'wk_aarav_1', exercise_id: 'ex_bench_press', exercise_name: 'Barbell Flat Bench Press', set_number: 4, weight_kg: 100, reps: 6, rpe: 9, is_warmup: false },
        { id: uuidv4(), workout_id: 'wk_aarav_1', exercise_id: 'ex_incline_db_press', exercise_name: 'Incline Dumbbell Press', set_number: 1, weight_kg: 32, reps: 10, rpe: 8, is_warmup: false },
        { id: uuidv4(), workout_id: 'wk_aarav_1', exercise_id: 'ex_incline_db_press', exercise_name: 'Incline Dumbbell Press', set_number: 2, weight_kg: 34, reps: 8, rpe: 8.5, is_warmup: false },
        { id: uuidv4(), workout_id: 'wk_aarav_1', exercise_id: 'ex_tricep_rope_pushdown', exercise_name: 'Tricep Rope Pushdown', set_number: 1, weight_kg: 25, reps: 15, rpe: 7, is_warmup: false },
        { id: uuidv4(), workout_id: 'wk_aarav_1', exercise_id: 'ex_tricep_rope_pushdown', exercise_name: 'Tricep Rope Pushdown', set_number: 2, weight_kg: 30, reps: 12, rpe: 8.5, is_warmup: false }
      ]
    },
    {
      id: 'wk_aarav_2',
      user_id: 'usr_member_1',
      title: 'Back & Biceps Power Pull',
      date: '2026-09-06',
      duration_minutes: 60,
      notes: 'Conventional deadlifts with full lockout. Excellent lat pump.',
      total_volume_kg: 9650,
      created_at: '2026-09-06T09:30:00.000Z',
      sets: [
        { id: uuidv4(), workout_id: 'wk_aarav_2', exercise_id: 'ex_deadlift', exercise_name: 'Conventional Barbell Deadlift', set_number: 1, weight_kg: 100, reps: 8, rpe: 6, is_warmup: true },
        { id: uuidv4(), workout_id: 'wk_aarav_2', exercise_id: 'ex_deadlift', exercise_name: 'Conventional Barbell Deadlift', set_number: 2, weight_kg: 140, reps: 5, rpe: 7.5, is_warmup: false },
        { id: uuidv4(), workout_id: 'wk_aarav_2', exercise_id: 'ex_deadlift', exercise_name: 'Conventional Barbell Deadlift', set_number: 3, weight_kg: 160, reps: 4, rpe: 8.5, is_warmup: false },
        { id: uuidv4(), workout_id: 'wk_aarav_2', exercise_id: 'ex_pullup', exercise_name: 'Weighted / Bodyweight Pull-Up', set_number: 1, weight_kg: 0, reps: 12, rpe: 8, is_warmup: false },
        { id: uuidv4(), workout_id: 'wk_aarav_2', exercise_id: 'ex_pullup', exercise_name: 'Weighted / Bodyweight Pull-Up', set_number: 2, weight_kg: 10, reps: 8, rpe: 9, is_warmup: false },
        { id: uuidv4(), workout_id: 'wk_aarav_2', exercise_id: 'ex_barbell_curl', exercise_name: 'EZ-Bar Bicep Curl', set_number: 1, weight_kg: 35, reps: 10, rpe: 8, is_warmup: false }
      ]
    },
    {
      id: 'wk_aarav_3',
      user_id: 'usr_member_1',
      title: 'Quad & Hamstring Dominance',
      date: '2026-09-04',
      duration_minutes: 65,
      notes: 'Heavy back squats down to parallel depth. Bulgarian split squats burned.',
      total_volume_kg: 11200,
      created_at: '2026-09-04T19:00:00.000Z',
      sets: [
        { id: uuidv4(), workout_id: 'wk_aarav_3', exercise_id: 'ex_barbell_squat', exercise_name: 'Barbell Back Squat', set_number: 1, weight_kg: 80, reps: 10, rpe: 6, is_warmup: true },
        { id: uuidv4(), workout_id: 'wk_aarav_3', exercise_id: 'ex_barbell_squat', exercise_name: 'Barbell Back Squat', set_number: 2, weight_kg: 110, reps: 8, rpe: 7.5, is_warmup: false },
        { id: uuidv4(), workout_id: 'wk_aarav_3', exercise_id: 'ex_barbell_squat', exercise_name: 'Barbell Back Squat', set_number: 3, weight_kg: 130, reps: 5, rpe: 9, is_warmup: false },
        { id: uuidv4(), workout_id: 'wk_aarav_3', exercise_id: 'ex_romanian_deadlift', exercise_name: 'Romanian Deadlift (RDL)', set_number: 1, weight_kg: 90, reps: 10, rpe: 8, is_warmup: false },
        { id: uuidv4(), workout_id: 'wk_aarav_3', exercise_id: 'ex_bulgarian_split_squat', exercise_name: 'Bulgarian Split Squat', set_number: 1, weight_kg: 20, reps: 12, rpe: 8.5, is_warmup: false }
      ]
    }
  ];

  db.workouts = workouts;

  // 9. Time Tracking Sessions (Active floor and past logs)
  const now = new Date();
  const timeSessions: TimeSession[] = [
    // Currently Active Sessions on Gym Floor
    {
      id: 'ses_active_1',
      user_id: 'usr_member_1',
      user_name: 'Aarav Sharma',
      user_email: 'member@pulsefit.com',
      user_avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=300&auto=format&fit=crop&q=80',
      user_tier: 'pro',
      category: 'Workout & Strength',
      clock_in_time: new Date(now.getTime() - 42 * 60 * 1000).toISOString(), // 42 min ago
      clock_out_time: null,
      duration_minutes: 42,
      status: 'active',
      notes: 'Chest & Tricep hypertrophy session'
    },
    {
      id: 'ses_active_2',
      user_id: 'usr_member_2',
      user_name: 'Ananya Gupta',
      user_email: 'vip@pulsefit.com',
      user_avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=300&auto=format&fit=crop&q=80',
      user_tier: 'vip',
      category: 'Zumba & Cardio',
      clock_in_time: new Date(now.getTime() - 25 * 60 * 1000).toISOString(), // 25 min ago
      clock_out_time: null,
      duration_minutes: 25,
      status: 'active',
      notes: 'Zumba dance party workout'
    },
    {
      id: 'ses_active_3',
      user_id: 'usr_member_3',
      user_name: 'Rohan Mehra',
      user_email: 'rohan.mehra@example.com',
      user_avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=300&auto=format&fit=crop&q=80',
      user_tier: 'basic',
      category: 'Workout & Strength',
      clock_in_time: new Date(now.getTime() - 55 * 60 * 1000).toISOString(), // 55 min ago
      clock_out_time: null,
      duration_minutes: 55,
      status: 'active',
      notes: 'Leg day - squat progression'
    },
    {
      id: 'ses_active_4',
      user_id: 'usr_member_4',
      user_name: 'Maya Patel',
      user_email: 'maya.patel@example.com',
      user_avatar: 'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?w=300&auto=format&fit=crop&q=80',
      user_tier: 'pro',
      category: 'Zumba & Cardio',
      clock_in_time: new Date(now.getTime() - 18 * 60 * 1000).toISOString(), // 18 min ago
      clock_out_time: null,
      duration_minutes: 18,
      status: 'active',
      notes: 'Cardio blast & aerobic dance'
    },
    // Past Completed Sessions for Aarav Sharma
    {
      id: 'ses_past_1',
      user_id: 'usr_member_1',
      user_name: 'Aarav Sharma',
      user_email: 'member@pulsefit.com',
      user_avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=300&auto=format&fit=crop&q=80',
      user_tier: 'pro',
      category: 'Workout & Strength',
      clock_in_time: '2026-09-08T07:15:00.000Z',
      clock_out_time: '2026-09-08T08:15:00.000Z',
      duration_minutes: 60,
      status: 'completed',
      notes: 'Heavy chest push workout'
    },
    {
      id: 'ses_past_2',
      user_id: 'usr_member_1',
      user_name: 'Aarav Sharma',
      user_email: 'member@pulsefit.com',
      user_avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=300&auto=format&fit=crop&q=80',
      user_tier: 'pro',
      category: 'Zumba & Cardio',
      clock_in_time: '2026-09-07T18:00:00.000Z',
      clock_out_time: '2026-09-07T18:48:00.000Z',
      duration_minutes: 48,
      status: 'completed',
      notes: 'Evening Zumba dance & cardio'
    },
    {
      id: 'ses_past_3',
      user_id: 'usr_member_1',
      user_name: 'Aarav Sharma',
      user_email: 'member@pulsefit.com',
      user_avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=300&auto=format&fit=crop&q=80',
      user_tier: 'pro',
      category: 'Workout & Strength',
      clock_in_time: '2026-09-06T08:00:00.000Z',
      clock_out_time: '2026-09-06T09:05:00.000Z',
      duration_minutes: 65,
      status: 'completed',
      notes: 'Back deadlift pull session'
    },
    {
      id: 'ses_past_4',
      user_id: 'usr_member_1',
      user_name: 'Aarav Sharma',
      user_email: 'member@pulsefit.com',
      user_avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=300&auto=format&fit=crop&q=80',
      user_tier: 'pro',
      category: 'Workout & Strength',
      clock_in_time: '2026-09-04T17:45:00.000Z',
      clock_out_time: '2026-09-04T18:50:00.000Z',
      duration_minutes: 65,
      status: 'completed',
      notes: 'Leg day squat workout'
    },
    {
      id: 'ses_past_5',
      user_id: 'usr_member_1',
      user_name: 'Aarav Sharma',
      user_email: 'member@pulsefit.com',
      user_avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=300&auto=format&fit=crop&q=80',
      user_tier: 'pro',
      category: 'Zumba & Cardio',
      clock_in_time: '2026-09-03T06:45:00.000Z',
      clock_out_time: '2026-09-03T07:35:00.000Z',
      duration_minutes: 50,
      status: 'completed',
      notes: 'Morning dance calorie blast'
    }
  ];

  db.time_sessions = timeSessions;

  // Domain-specific demo data (payments, bookings, trials, ...), see db/seed/.
  runSeedExtensions();

  if (!demo) {
    db.users = [];
    db.trainers = db.trainers.map(({ user_id: _unlinked, ...trainer }) => trainer);
    db.bookings = [];
    db.attendance_logs = [];
    db.workouts = [];
    db.workout_sets = [];
    db.time_sessions = [];
    db.payment_orders = [];
    db.payments = [];
    db.trial_passes = [];
    db.trainer_notes = [];
    db.password_resets = [];
  }

  db.saveSync();

  if (!process.env.VITEST) console.log(`✅ ${demo ? 'Demo data' : 'Catalogue'} written to ${db.filePath}`);
}


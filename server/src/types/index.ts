export type UserRole = 'admin' | 'member' | 'trainer';
// 'none' = signed up but never bought a plan.
export type MembershipTier = 'none' | 'basic' | 'pro' | 'vip';
// 'pending' = no paid period yet. 'expired' is also derived at read time from membership_expiry
// (see lib/membership.ts), so a stored 'active' past its expiry date is treated as expired.
export type MembershipStatus = 'active' | 'expired' | 'pending' | 'frozen';
export type BillingCycle = 'monthly' | 'annual';

export interface User {
  id: string;
  email: string;
  password_hash?: string;
  name: string;
  role: UserRole;
  avatar_url: string;
  phone: string;
  membership_tier: MembershipTier;
  membership_status: MembershipStatus;
  // YYYY-MM-DD in the gym's timezone, inclusive last day of access. null = no paid period.
  membership_expiry: string | null;
  // Set while frozen (YYYY-MM-DD); unfreezing extends membership_expiry by the frozen days.
  frozen_since?: string | null;
  qr_code_token: string;
  created_at: string;
  streak_days?: number;
  // Gym-local date (YYYY-MM-DD) of the last activity that counted towards the streak.
  last_active_date?: string | null;
  // Bumped on password change/reset; JWTs carrying an older value are rejected.
  token_version?: number;
  google_sub?: string;
}

/** A user as it may leave the API: never includes password_hash. */
export type SafeUser = Omit<User, 'password_hash'>;

export interface Trainer {
  id: string;
  user_id?: string;
  name: string;
  email: string;
  phone: string;
  specialties: string[];
  bio: string;
  experience_years: number;
  rating: number;
  reviews_count: number;
  avatar_url: string;
  instagram: string;
}

export type ClassCategory = 'Workout & Strength' | 'Zumba & Cardio';

export interface GymClass {
  id: string;
  title: string;
  category: ClassCategory | string;
  trainer_id: string;
  trainer_name?: string;
  trainer_avatar?: string;
  day_of_week: number; // 0 = Sunday, 1 = Monday, ... 6 = Saturday
  start_time: string; // "07:00", gym-local time
  duration_minutes: number;
  room: string;
  capacity: number;
  // Not stored: computed per occurrence from confirmed bookings (see the classes API).
  booked_count?: number;
  intensity: 'Low' | 'Medium' | 'High' | 'Extreme';
  description: string;
  image_url: string;
  calories_burn_est: number;
}

export type BookingStatus = 'confirmed' | 'attended' | 'no_show' | 'cancelled';

export interface Booking {
  id: string;
  class_id: string;
  user_id: string;
  booking_date: string; // YYYY-MM-DD, gym-local date of the class occurrence
  status: BookingStatus;
  created_at: string;
  cancelled_at?: string;
  class_title?: string;
  category?: string;
  start_time?: string;
  room?: string;
  trainer_name?: string;
}

export interface AttendanceLog {
  id: string;
  user_id: string; // a trial pass check-in uses the trial pass id
  user_name?: string;
  user_email?: string;
  user_tier?: string;
  check_in_time: string; // ISO timestamp
  check_in_method: 'qr' | 'manual' | 'kiosk' | 'camera';
  trial_pass_id?: string;
}

export interface Exercise {
  id: string;
  name: string;
  category: 'Chest' | 'Back' | 'Legs' | 'Shoulders' | 'Arms' | 'Core' | 'Cardio' | 'Full Body';
  equipment: 'Barbell' | 'Dumbbell' | 'Machine' | 'Cable' | 'Bodyweight' | 'Kettlebell' | 'Cardio';
  difficulty: 'Beginner' | 'Intermediate' | 'Advanced';
  instructions: string[];
  target_muscles: string[];
  thumbnail_url?: string;
}

export interface WorkoutSet {
  id?: string;
  workout_id?: string;
  exercise_id: string;
  exercise_name?: string;
  set_number: number;
  weight_kg: number;
  reps: number;
  rpe?: number;
  is_warmup?: boolean;
}

export interface Workout {
  id: string;
  user_id: string;
  title: string;
  date: string;
  duration_minutes: number;
  notes?: string;
  total_volume_kg?: number;
  created_at?: string;
  sets?: WorkoutSet[];
}

export interface MembershipPlan {
  id: string;
  name: string;
  tier: Exclude<MembershipTier, 'none'>;
  price_monthly: number; // INR
  price_annual: number; // INR for 12 months, billed once
  description: string;
  features: string[];
  // Class categories this plan may book. Empty = every category.
  categories: ClassCategory[];
  is_popular?: boolean;
  badge?: string;
}

/** A Razorpay order created by the server; the price and plan are fixed here, never by the client. */
export interface PaymentOrder {
  id: string; // Razorpay order id
  user_id: string;
  tier: Exclude<MembershipTier, 'none'>;
  billing_cycle: BillingCycle;
  amount_inr: number;
  currency: 'INR';
  status: 'created' | 'paid' | 'failed';
  created_at: string;
  paid_at?: string;
}

/** A completed membership payment; the member's invoice history. */
export interface Payment {
  id: string;
  invoice_number: string; // e.g. PF-2026-000042
  user_id: string;
  user_name: string; // snapshot, so invoices survive member deletion
  user_email: string;
  order_id: string;
  razorpay_payment_id: string;
  tier: Exclude<MembershipTier, 'none'>;
  plan_name: string;
  billing_cycle: BillingCycle;
  amount_inr: number;
  currency: 'INR';
  status: 'paid' | 'refunded';
  period_start: string; // YYYY-MM-DD
  period_end: string; // YYYY-MM-DD, inclusive
  created_at: string;
  source: 'checkout' | 'webhook' | 'seed';
}

export interface TrialPass {
  id: string;
  code: string; // PULSE-TRIAL-XXXXXX, accepted once at the turnstile on valid_on
  name: string;
  email: string;
  phone: string;
  interest: ClassCategory;
  valid_on: string; // YYYY-MM-DD
  status: 'issued' | 'redeemed';
  created_at: string;
  redeemed_at?: string;
}

export interface TrainerNote {
  id: string;
  trainer_user_id: string;
  trainer_name: string;
  member_id: string;
  category: 'assessment' | 'progress' | 'injury' | 'general';
  note: string;
  visible_to_member: boolean;
  created_at: string;
}

export interface PasswordReset {
  id: string;
  user_id: string;
  token_hash: string; // sha256 of the token in the reset link
  expires_at: string;
  used_at?: string;
  created_at: string;
}

export type TimeSessionCategory = 'Workout & Strength' | 'Zumba & Cardio';

export interface TimeSession {
  id: string;
  user_id: string;
  user_name: string;
  user_email: string;
  user_avatar?: string;
  user_tier: string;
  category: TimeSessionCategory;
  clock_in_time: string; // ISO timestamp
  clock_out_time: string | null; // ISO timestamp or null if active
  duration_minutes: number;
  status: 'active' | 'completed';
  auto_closed?: boolean;
  notes?: string;
}

/** A person on the floor as staff see them: no email, notes or ids. */
export interface FloorPresence {
  user_name: string;
  user_avatar: string;
  user_tier: string;
  clock_in_time: string;
  duration_minutes: number;
}

export interface ActiveFloorStatus {
  totalActive: number;
  workoutActive: number;
  zumbaActive: number;
  // Only included for staff (admin/trainer); the public sees counts only.
  workoutUsers?: FloorPresence[];
  zumbaUsers?: FloorPresence[];
}

export interface UserTimeTrackingStats {
  activeSession: TimeSession | null;
  totalTimeMinutesThisWeek: number;
  totalTimeMinutesThisMonth: number;
  totalSessionsCompleted: number;
  recentSessions: TimeSession[];
}

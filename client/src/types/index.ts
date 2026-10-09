// Shapes returned by the PulseFit API. docs/API.md is the source of truth.

export type UserRole = 'admin' | 'member' | 'trainer';
export type MembershipTier = 'none' | 'basic' | 'pro' | 'vip';
export type PaidTier = Exclude<MembershipTier, 'none'>;
export type MembershipStatus = 'active' | 'expired' | 'pending' | 'frozen';
export type BillingCycle = 'monthly' | 'annual';
export type ClassCategory = 'Workout & Strength' | 'Zumba & Cardio';

export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  avatar_url?: string;
  phone?: string;
  membership_tier: MembershipTier;
  // Effective today: a membership past its expiry date arrives as 'expired'.
  membership_status: MembershipStatus;
  // Last day of access (inclusive), or null when no plan has been bought.
  membership_expiry: string | null;
  frozen_since?: string | null;
  qr_code_token: string;
  created_at: string;
  streak_days?: number;
  last_active_date?: string | null;
}

export interface AppConfig {
  demoMode: boolean;
  googleClientId: string | null;
  payments: { enabled: boolean; keyId: string | null };
  gym: { name: string; timezone: string; currency: string; hours: OpeningHours };
}

/** Gym-local opening hours; closedWeekdays uses 0 = Sunday. */
export interface OpeningHours {
  opensAt: string;
  closesAt: string;
  closedWeekdays: number[];
  /** When true the server refuses check-ins, clock-ins and same-day trials outside these hours. */
  enforced: boolean;
}

export interface AuthSession {
  token: string;
  user: User;
}

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
  classes_count?: number;
}

export interface GymClass {
  id: string;
  title: string;
  category: ClassCategory | string;
  trainer_id: string;
  trainer_name?: string;
  trainer_avatar?: string;
  day_of_week: number; // 0 = Sunday
  start_time: string; // HH:MM, gym-local
  duration_minutes: number;
  room: string;
  capacity: number;
  intensity: 'Low' | 'Medium' | 'High' | 'Extreme';
  description: string;
  image_url: string;
  calories_burn_est: number;
}

/** A class on a specific date, with capacity counted for that date. */
export interface ClassOccurrence extends GymClass {
  occurrence_date: string; // YYYY-MM-DD
  starts_at: string; // ISO instant
  booked_count: number;
  spots_left: number;
  is_full: boolean;
  my_booking_id: string | null;
}

export type BookingStatus = 'confirmed' | 'attended' | 'no_show' | 'cancelled';

export interface Booking {
  id: string;
  class_id: string;
  user_id: string;
  booking_date: string;
  status: BookingStatus;
  created_at: string;
  cancelled_at?: string;
  class_title?: string;
  category?: string;
  start_time?: string;
  room?: string;
  trainer_name?: string;
}

export interface MyBooking extends Booking {
  image_url?: string;
  duration_minutes?: number;
  starts_at: string;
  can_cancel: boolean;
}

export interface RosterEntry {
  booking_id: string;
  user_id: string;
  user_name: string;
  user_email: string;
  user_phone?: string;
  user_avatar?: string;
  user_tier: MembershipTier;
  status: BookingStatus;
  booked_at: string;
}

export interface ClassRoster {
  class: ClassOccurrence;
  date: string;
  attendees: RosterEntry[];
}

export interface TrainerDashboard {
  trainer: Trainer;
  upcoming: ClassOccurrence[];
  stats: {
    classes_per_week: number;
    booked_next_7_days: number;
    attendance_rate_30d: number | null;
    clients_count: number;
  };
}

export interface TrainerClient {
  user_id: string;
  name: string;
  avatar_url?: string;
  membership_tier: MembershipTier;
  membership_status: MembershipStatus;
  sessions_attended: number;
  last_attended: string | null;
  upcoming_bookings: number;
  notes_count: number;
}

export type TrainerNoteCategory = 'assessment' | 'progress' | 'injury' | 'general';

export interface TrainerNote {
  id: string;
  trainer_user_id: string;
  trainer_name: string;
  member_id: string;
  category: TrainerNoteCategory;
  note: string;
  visible_to_member: boolean;
  created_at: string;
}

export interface AttendanceLog {
  id: string;
  user_id: string;
  user_name?: string;
  user_email?: string;
  user_tier?: string;
  check_in_time: string;
  check_in_method: 'qr' | 'manual' | 'kiosk' | 'camera';
  trial_pass_id?: string;
}

export interface Paginated<T> {
  items: T[];
  total: number;
}

export interface TrialPass {
  id: string;
  code: string;
  name: string;
  email: string;
  phone: string;
  interest: ClassCategory;
  valid_on: string;
  status: 'issued' | 'redeemed';
  created_at: string;
  redeemed_at?: string;
}

export interface CheckInMember {
  id: string;
  name: string;
  email: string;
  avatar_url?: string;
  membership_tier: MembershipTier;
  membership_status: MembershipStatus;
  membership_expiry: string | null;
  streak_days?: number;
}

export interface CheckInResult {
  result: 'granted';
  already_checked_in: boolean;
  kind: 'member' | 'trial';
  member?: CheckInMember;
  trial?: TrialPass;
  log: AttendanceLog;
}

/** `data` of a denied check-in (403). */
export interface CheckInDenial {
  member?: CheckInMember;
  trial?: TrialPass;
}

export interface MemberDetail extends User {
  bookings_count: number;
  attendance_count: number;
  workouts_count: number;
  upcoming_bookings: number;
  recent_attendance: AttendanceLog[];
  payments: Payment[];
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

export interface NewWorkout {
  title: string;
  date: string;
  duration_minutes: number;
  notes?: string;
  sets: Array<Pick<WorkoutSet, 'exercise_id' | 'set_number' | 'weight_kg' | 'reps' | 'rpe' | 'is_warmup'>>;
}

export interface MembershipPlan {
  id: string;
  name: string;
  tier: PaidTier;
  price_monthly: number; // INR
  price_annual: number; // INR for 12 months, billed once
  description: string;
  features: string[];
  categories: ClassCategory[]; // empty = every category
  is_popular?: boolean;
  badge?: string;
}

export interface PaymentOrder {
  orderId: string;
  amount: number; // paise
  amount_inr: number;
  currency: 'INR';
  keyId: string;
  tier: PaidTier;
  billing_cycle: BillingCycle;
  plan_name: string;
  description: string;
}

export interface Payment {
  id: string;
  invoice_number: string;
  user_id: string;
  user_name: string;
  user_email: string;
  order_id: string;
  razorpay_payment_id: string;
  tier: PaidTier;
  plan_name: string;
  billing_cycle: BillingCycle;
  amount_inr: number;
  currency: 'INR';
  status: 'paid' | 'refunded';
  period_start: string;
  period_end: string;
  created_at: string;
  source: 'checkout' | 'webhook' | 'seed';
}

export interface AdminDashboardKPIs {
  kpis: {
    totalMembers: number;
    activeMembers: number;
    frozenMembers: number;
    expiredMembers: number;
    pendingMembers: number;
    monthlyRevenue: number;
    revenueThisMonth: number;
    todayCheckIns: number;
    avgFillRate: number;
    retentionRate: number | null;
    totalTrainers: number;
    classesScheduled: number;
    trialsThisMonth: number;
  };
  weeklyAttendanceChart: { day: string; visits: number }[];
  hourlyPeakCurve: { hour: string; checkIns: number }[];
  tierDistribution: { name: string; tier: string; count: number; revenue: number; color: string }[];
  topClasses: { id: string; title: string; category: string; trainer?: string; booked: number; capacity: number; occupancy: number }[];
  revenueByMonth: { month: string; revenue: number }[];
  definitions: { monthlyRevenue: string; avgFillRate: string; retentionRate: string };
  generatedAt: string;
}

export interface WorkoutAnalytics {
  totalWorkouts: number;
  totalVolumeKg: number;
  avgDurationMinutes: number;
  volumeTimeline: { date: string; volumeKg: number; durationMinutes: number; title: string }[];
  // Best estimated one-rep max per exercise (Epley) over working sets.
  personalRecords: { exerciseId: string; exerciseName: string; e1rm: number; date: string; weight: number; reps: number }[];
  muscleDistribution: { category: string; count: number }[];
}

export type TimeSessionCategory = ClassCategory;

export interface TimeSession {
  id: string;
  user_id: string;
  user_name: string;
  user_email?: string;
  user_avatar?: string;
  user_tier: string;
  category: TimeSessionCategory;
  clock_in_time: string;
  clock_out_time: string | null;
  duration_minutes: number;
  status: 'active' | 'completed';
  auto_closed?: boolean;
  notes?: string;
}

/** Who is on the floor (staff only): no emails, notes or session ids. */
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
  // Only sent to staff.
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

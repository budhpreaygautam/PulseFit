// Shapes returned by the PulseFit API. docs/API.md is the source of truth.

export type UserRole = 'admin' | 'member' | 'trainer';
export type MembershipTier = 'none' | 'basic' | 'pro' | 'vip';
export type PaidTier = Exclude<MembershipTier, 'none'>;
export type MembershipStatus = 'active' | 'expired' | 'pending' | 'frozen';
export type BillingCycle = 'monthly' | 'annual';
export type ClassCategory = 'Workout & Strength' | 'Zumba & Cardio';
export type Gender = 'male' | 'female' | 'other';

export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  /** Their photo; '' or missing = none (the default picture shows, see avatarImage.ts). */
  avatar_url?: string;
  /** Sent only to the person and to admins. Missing = not given. Picks the default picture. */
  gender?: Gender;
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
  /** Only in GET /auth/me: days this week (Mon–Sun, gym time) that count for the streak. */
  active_days_this_week?: number;
  /** Only in GET /auth/me: the member's longest streak, in days. */
  longest_streak_days?: number;
  /** Two-step sign-in (authenticator app) is on. */
  mfa_enabled?: boolean;
  /** False for accounts created with Google that never set a password. */
  has_password?: boolean;
}

export interface AppConfig {
  demoMode: boolean;
  googleClientId: string | null;
  payments: { enabled: boolean; provider: PaymentProvider | null; keyId: string | null };
  /** classesPerWeek: classes on the weekly timetable (the home page's count); absent until /api/config answers. */
  gym: { name: string; timezone: string; currency: string; hours: OpeningHours; classesPerWeek?: number };
  /** The Android app the website offers for download (an APK on this server), or null when there is none. */
  androidApp: AndroidAppDownload | null;
}

export interface AndroidAppDownload {
  /** Same-origin path of the APK. */
  url: string;
  /** Version name, when the server knows it. */
  version?: string;
  /** Bytes. */
  size: number;
}

/** razorpay: card/UPI/netbanking through Razorpay. youpi: UPI straight to the gym's account (YouPI PG). */
export type PaymentProvider = 'razorpay' | 'youpi';

/** Gym-local opening hours; closedWeekdays uses 0 = Sunday. */
export interface OpeningHours {
  opensAt: string;
  closesAt: string;
  closedWeekdays: number[];
  /** When true the server refuses check-ins, clock-ins and same-day trials outside these hours. */
  enforced: boolean;
}

export interface AuthSession {
  /** Only for the Android/iOS apps; the website's session is an httpOnly cookie. */
  token?: string;
  user: User;
}

/** Sign-in answer for an account with two-step sign-in on: send a code to POST /auth/mfa/verify. */
export interface MfaChallenge {
  mfa_required: true;
  mfa_token: string;
}

export const isMfaChallenge = (result: AuthSession | MfaChallenge): result is MfaChallenge => 'mfa_required' in result;

export interface MfaSetup {
  secret: string;
  otpauth_url: string;
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
  user_email: string | null;
  user_phone?: string | null;
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

/** A coach's note as the member it is about receives it (GET /notes/my). */
export type MemberNote = Pick<TrainerNote, 'id' | 'trainer_name' | 'category' | 'note' | 'created_at'>;

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

export type EnquiryStatus = 'new' | 'contacted' | 'closed';
export interface Enquiry {
  id: string;
  name: string;
  email: string;
  phone: string;
  interest: ClassCategory | 'All-Access' | 'Not sure yet';
  contact_time: 'Any time' | 'Morning' | 'Afternoon' | 'Evening';
  message: string;
  status: EnquiryStatus;
  created_at: string;
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
  /** A member's gifts the desk can hand over now ('ready', or 'needs_size' once a size is chosen), oldest first. */
  gifts_to_collect?: GiftClaim[];
}

/** `data` of a denied check-in (403). */
export interface CheckInDenial {
  member?: CheckInMember;
  trial?: TrialPass;
  // Sent with CARD_DEACTIVATED.
  card?: Pick<IssuedIdCard, 'card_number' | 'status' | 'deactivated_at' | 'deactivation_reason'>;
}

export interface MemberDetail extends User {
  bookings_count: number;
  attendance_count: number;
  workouts_count: number;
  upcoming_bookings: number;
  recent_attendance: AttendanceLog[];
  payments: Payment[];
  // Every physical card issued to the person, newest first.
  id_cards: IssuedIdCard[];
  rewards: {
    balance: number;
    /** The 20 newest ledger lines. */
    recent_points: PointsEntry[];
    /** Newest first. */
    claims: GiftClaim[];
    referred_by: { id: string; name: string } | null;
    /** A member with no referrer who has never had a membership (paid or not): an admin may still link one. */
    can_add_referrer: boolean;
  };
}

export type IdCardStatus = 'active' | 'deactivated';
// 'replaced' is set only by the server, when a replacement card is issued.
export type IdCardDeactivationReason = 'lost' | 'stolen' | 'damaged' | 'returned' | 'replaced' | 'other';

export interface IdCardEvent {
  type: 'issued' | 'deactivated' | 'reactivated';
  at: string;
  by_id: string | null; // null for seeded or system events
  by_name: string; // the admin's name at the time
  reason?: IdCardDeactivationReason;
  note?: string;
}

/** A physical PulseFit card. Its number is also the QR code printed on it. */
export interface IssuedIdCard {
  id: string;
  user_id: string;
  card_number: string; // PFC-XXXX-XXXX
  status: IdCardStatus;
  issued_at: string;
  issued_by_id: string | null;
  issued_by_name: string;
  deactivated_at: string | null; // set while deactivated
  deactivation_reason: IdCardDeactivationReason | null;
  deactivation_note: string | null;
  replaces_card_id: string | null;
  events: IdCardEvent[]; // oldest first
}

export interface IdCardRow {
  user: Pick<User, 'id' | 'name' | 'email' | 'phone' | 'avatar_url' | 'gender' | 'role' | 'membership_tier' | 'membership_status' | 'membership_expiry' | 'created_at'>;
  // Status of the current card; 'none' when no card was ever issued.
  card_status: IdCardStatus | 'none';
  // The active card, else the most recently issued one.
  card: IssuedIdCard | null;
  cards_issued: number;
}

export interface IdCardOverview {
  // Over the people the role and search filters match, before the status filter.
  counts: { people: number; active: number; deactivated: number; none: number; cards_issued: number };
  rows: IdCardRow[];
}

/** The signed-in person's own current card, without the history or the admins' notes. */
export type MyIdCard = Pick<IssuedIdCard, 'id' | 'card_number' | 'status' | 'issued_at' | 'deactivated_at' | 'deactivation_reason'>;

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

interface PaymentOrderBase {
  orderId: string;
  amount: number; // paise
  amount_inr: number;
  currency: 'INR';
  tier: PaidTier;
  billing_cycle: BillingCycle;
  plan_name: string;
  description: string;
  // amount_inr is the list price less the discount the server applied.
  base_amount_inr: number;
  discount_inr: number;
  applied: AppliedDiscount | null;
}

/** The sale or coupon behind a price; label is ready to show ('15% off', 'WELCOME10: 10% off'). */
export type AppliedDiscount = { type: 'offer'; id: string; label: string } | { type: 'coupon'; code: string; label: string };

/** What a plan costs the signed-in member now (POST /payment/quote, GET /payment/quotes). */
export interface Quote {
  tier: PaidTier;
  billing_cycle: BillingCycle;
  base: number;
  discount: number;
  total: number;
  applied: AppliedDiscount | null;
  offer_ends_at?: string;
}

/** The guest view of sales and joining gifts (GET /promotions): no codes, ids or stock. */
export interface Promotions {
  sales: { title: string; banner_text: string; percent_off: number | null; amount_off: number | null; ends_at: string }[];
  joining_gifts: { tier: PaidTier; billing_cycle: BillingCycle; gifts: string[] }[];
}

/** A checkout the server opened: Razorpay's modal needs the key; YouPI's is a page to go to. */
export type PaymentOrder =
  | (PaymentOrderBase & { provider: 'razorpay'; keyId: string })
  | (PaymentOrderBase & { provider: 'youpi'; checkoutUrl: string });

/** What the server learned from YouPI about an order (POST /payment/youpi/confirm). */
export type YoupiOrderStatus =
  | { status: 'pending' }
  | { status: 'failed'; reason: string }
  | { status: 'paid'; user: User; payment?: Payment; message?: string; cancelled_bookings: number };

export interface Payment {
  id: string;
  invoice_number: string;
  user_id: string;
  user_name: string;
  user_email: string;
  order_id: string;
  // The gateway's payment id (Razorpay's pay_…, or YouPI's session id).
  razorpay_payment_id: string;
  provider?: PaymentProvider;
  /** UPI transaction reference, for YouPI payments when it was reported. */
  utr?: string;
  tier: PaidTier;
  plan_name: string;
  billing_cycle: BillingCycle;
  amount_inr: number;
  currency: 'INR';
  status: 'paid' | 'refunded';
  period_start: string;
  period_end: string;
  created_at: string;
  source: 'checkout' | 'webhook' | 'seed' | 'desk';
  // Online orders: the list price and the discount a sale or coupon gave (amount_inr is what was paid).
  base_amount_inr?: number;
  discount_inr?: number;
  offer_id?: string;
  coupon_code?: string;
  // Desk sales: how the member paid and who recorded it.
  desk_method?: DeskSale['method'];
  recorded_by?: { id: string; name: string };
}

/** A plan paid for at the front desk: whatever staff collected, no sale or coupon. */
export interface DeskSale {
  tier: PaidTier;
  billing_cycle: BillingCycle;
  amount_inr: number;
  method: 'cash' | 'upi' | 'card';
}

/** The desk-sale inputs as typed; amount_inr becomes a number on submit. */
export type DeskSaleForm = Omit<DeskSale, 'amount_inr'> & { amount_inr: string };

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

/** Who is on the floor (admins only): no emails, notes or session ids. */
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
  // Only sent to admins.
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

// GET /api/guide: the full fitness guide, for signed-in accounts only. Guests see a teaser.

export interface GuideExercise {
  name: string;
  sets: string;
  reps: string;
  rest: string;
  tip: string;
}

export interface GuideWorkoutPlan {
  id: string;
  name: string;
  level: string;
  goal: string;
  frequency: string;
  description: string;
  days: { name: string; exercises: GuideExercise[] }[];
}

export interface GuideMeal {
  timing: string;
  name: string;
  items: string[];
  /** kcal for this meal. */
  calories: number;
}

export interface GuideDietChart {
  id: string;
  title: string;
  type: string;
  macros: { protein_g: number; carbs_g: number; fats_g: number };
  description: string;
  meals: GuideMeal[];
}

export interface GuideSupplement {
  name: string;
  badge: string;
  /** Out of 5. */
  stars: number;
  verdict: string;
  dosage: string;
  timing: string;
  why: string;
  faqs: { question: string; answer: string }[];
}

export interface FitnessGuide {
  workout_plans: GuideWorkoutPlan[];
  diet_charts: GuideDietChart[];
  nutrition_rules: { emoji: string; title: string; text: string }[];
  supplements: GuideSupplement[];
  /** The 4-day body-part split on the strength floor page. */
  strength_split: { day: string; title: string; exercises: string[] }[];
}

// Rewards: points, gifts and their pickups (docs/API.md, Rewards).

export type GiftLevel = 'small' | 'medium' | 'big' | 'premium';
export type GiftSize = 'S' | 'M' | 'L' | 'XL' | 'XXL';

/** A catalogue gift, as admins see it. */
export interface Gift {
  id: string;
  name: string;
  description: string;
  /** An emoji, or a photo as a data URL. */
  image: string;
  level: GiftLevel;
  /** null = reward-only (milestones and joining bundles), not in the store. */
  points_cost: number | null;
  /** null = unlimited; unused when the gift has sizes. */
  stock: number | null;
  sizes?: GiftSize[];
  stock_by_size?: Partial<Record<GiftSize, number>>;
  kind: 'item' | 'service';
  active: boolean;
  created_at: string;
}

/** What admins send to create or edit a gift. */
export type GiftInput = Omit<Gift, 'id' | 'created_at'>;

/** A gift in the members' store: in or out of stock, never a count. */
export interface StoreGift {
  id: string;
  name: string;
  description: string;
  image: string;
  level: GiftLevel;
  points_cost: number;
  kind: Gift['kind'];
  sizes?: GiftSize[];
  in_stock: boolean;
  sizes_in_stock?: GiftSize[];
}

export type ClaimStatus = 'needs_size' | 'waiting' | 'ready' | 'handed_over' | 'cancelled';

/** One gift a member is owed. Names are snapshots, so a renamed or retired gift stays collectable. */
export interface GiftClaim {
  id: string;
  user_id: string;
  user_name: string;
  gift_id: string;
  gift_name: string;
  size?: GiftSize;
  source: 'store' | 'milestone' | 'joining';
  /** Milestone id, payment id, or '' for the store. */
  source_ref: string;
  points_spent: number;
  pickup_code: string;
  status: ClaimStatus;
  created_at: string;
  handed_over_at?: string;
  handed_over_by?: { id: string; name: string };
  cancel_reason?: string;
  /** On a 'needs_size' claim from the member's own list or the check-in answer: the sizes its gift comes in. */
  sizes?: GiftSize[];
}

/** One line of a member's points history. A 0-point 'bonus' line records a gift unlocked. */
export interface PointsEntry {
  id: string;
  user_id: string;
  key: string;
  points: number;
  reason: 'checkin' | 'workout' | 'referral' | 'claim' | 'refund' | 'admin_adjust' | 'bonus';
  ref?: string;
  note?: string;
  created_at: string;
}

/** GET /rewards/me: visits and streak count only days the gym confirmed (check-ins and attended classes). */
export interface MyRewards {
  balance: number;
  visits: number;
  streak: number;
  milestones: { id: string; type: 'visits' | 'streak'; threshold: number; gift_name: string; reached: boolean }[];
  earning: { checkin: number; workout: number; referral: number; referral_welcome: number };
  /** Newest first. */
  claims: GiftClaim[];
  referral_code: string;
}

export interface Milestone {
  id: string;
  type: 'visits' | 'streak';
  threshold: number;
  gift_id: string;
}

/** The gifts a paid plan and cycle gives; once_per_member gifts are given once ever, not per payment. */
export interface JoiningGift {
  tier: PaidTier;
  billing_cycle: BillingCycle;
  gift_ids: string[];
  once_per_member: boolean;
}

/** The reward rules admins edit. `launched_at` is the server's own and is never sent back. */
export interface RewardSettings {
  points_per_checkin: number;
  points_per_workout: number;
  points_per_referral: number;
  welcome_points_for_referred: number;
  milestones: Milestone[];
  joining_gifts: JoiningGift[];
  launched_at?: string;
}

/** PUT /rewards/settings: a milestone without an id is a new one. */
export type RewardSettingsInput = Omit<RewardSettings, 'launched_at' | 'milestones'> & { milestones: (Omit<Milestone, 'id'> & { id?: string })[] };

/** A sale: a percentage or an amount off (the other is null) between two instants. Empty lists mean every plan or cycle. */
export interface Offer {
  id: string;
  title: string;
  banner_text: string;
  percent_off: number | null;
  amount_off: number | null;
  tiers: PaidTier[];
  billing_cycles: BillingCycle[];
  starts_at: string;
  ends_at: string;
  active: boolean;
  created_at: string;
}

export type OfferInput = Omit<Offer, 'id' | 'created_at'>;

/** A coupon code, valid on gym dates from valid_from to valid_until inclusive. `uses` counts paid orders. */
export interface Coupon {
  code: string;
  percent_off: number | null;
  amount_off: number | null;
  tiers: PaidTier[];
  billing_cycles: BillingCycle[];
  valid_from: string;
  valid_until: string;
  max_uses: number | null;
  per_member_limit: number;
  uses: number;
  active: boolean;
  created_at: string;
}

export type CouponInput = Omit<Coupon, 'uses' | 'created_at'>;

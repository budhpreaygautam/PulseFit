import fs from 'fs';
import path from 'path';
import config from '../config.js';
import {
  User,
  Trainer,
  GymClass,
  Booking,
  AttendanceLog,
  Exercise,
  Workout,
  WorkoutSet,
  MembershipPlan,
  TimeSession,
  PaymentOrder,
  Payment,
  TrialPass,
  Enquiry,
  TrainerNote,
  PasswordReset,
  IdCard,
  Gift,
  GiftClaim,
  PointsEntry,
  RewardSettings,
  Offer,
  Coupon,
  GymContact
} from '../types/index.js';
import { defaultGifts, defaultRewardSettings, withDefaultPictures } from './rewardDefaults.js';
import { defaultGymContact } from '../lib/gymContact.js';

export interface DatabaseSchema {
  users: User[];
  trainers: Trainer[];
  classes: GymClass[];
  bookings: Booking[];
  attendance_logs: AttendanceLog[];
  exercises: Exercise[];
  workouts: Workout[];
  workout_sets: WorkoutSet[];
  membership_plans: MembershipPlan[];
  time_sessions: TimeSession[];
  payment_orders: PaymentOrder[];
  payments: Payment[];
  trial_passes: TrialPass[];
  enquiries: Enquiry[];
  trainer_notes: TrainerNote[];
  password_resets: PasswordReset[];
  id_cards: IdCard[];
  gifts: Gift[];
  gift_claims: GiftClaim[];
  points_ledger: PointsEntry[];
  reward_settings: RewardSettings;
  offers: Offer[];
  coupons: Coupon[];
  gym_contact: GymContact;
}

const emptySchema = (): DatabaseSchema => ({
  users: [],
  trainers: [],
  classes: [],
  bookings: [],
  attendance_logs: [],
  exercises: [],
  workouts: [],
  workout_sets: [],
  membership_plans: [],
  time_sessions: [],
  payment_orders: [],
  payments: [],
  trial_passes: [],
  enquiries: [],
  trainer_notes: [],
  password_resets: [],
  id_cards: [],
  // A file from before rewards gets the default catalogue and rules (load() and restore() spread this under it).
  gifts: defaultGifts(),
  gift_claims: [],
  points_ledger: [],
  reward_settings: defaultRewardSettings(),
  offers: [],
  coupons: [],
  // Likewise a file from before the contact setting: the details the website showed until then.
  gym_contact: defaultGymContact()
});

const DEFAULT_PLAN_CATEGORIES: Record<string, MembershipPlan['categories']> = {
  basic: ['Workout & Strength'],
  pro: ['Zumba & Cardio'],
  vip: []
};

// Up to v2.3 people and coaches without a photo were given a DiceBear cartoon (seeded with their
// initials), which every viewer's browser fetched from api.dicebear.com. Nobody chose those, so they
// become "no photo" and the apps show their own default picture instead. Nothing can store a new one
// (the coach form and PUT /auth/profile refuse them), so clearing them on every load loses nothing.
export const isGeneratedAvatar = (url: string | undefined) => Boolean(url?.startsWith('https://api.dicebear.com/'));

/**
 * Bring a database written by an older version up to the current shape. Idempotent, so it runs on
 * every load. v2.0 files have plans without entitlements, '' for "no expiry", stored class counters
 * and streak numbers without the day they were earned; v2.3 files have DiceBear pictures. Accounts
 * from before the gender question simply have none, which reads as "not given".
 */
export function migrate(data: DatabaseSchema): DatabaseSchema {
  return {
    ...data,
    membership_plans: data.membership_plans.map(p => (Array.isArray(p.categories) ? p : { ...p, categories: DEFAULT_PLAN_CATEGORIES[p.tier] ?? [] })),
    users: data.users.map(u => {
      const user = { ...u, membership_expiry: u.membership_expiry || null, ...(isGeneratedAvatar(u.avatar_url) ? { avatar_url: '' } : {}) };
      // "Prefer not to say" was offered briefly before release; it now reads as "not given".
      if ((user.gender as string) === 'prefer_not_to_say') delete user.gender;
      return u.last_active_date === undefined ? { ...user, streak_days: 0, last_active_date: null } : user;
    }),
    trainers: data.trainers.map(t => (isGeneratedAvatar(t.avatar_url) ? { ...t, avatar_url: '' } : t)),
    classes: data.classes.map(({ booked_count: _derived, ...c }) => (isGeneratedAvatar(c.trainer_avatar) ? { ...c, trainer_avatar: '' } : c)),
    time_sessions: data.time_sessions.map(s => (isGeneratedAvatar(s.user_avatar) ? { ...s, user_avatar: '' } : s)),
    gifts: withDefaultPictures(data.gifts)
  };
}

/**
 * A small JSON-file store. Collections are replaced wholesale through their setters
 * (`db.users = [...]`), which schedules a save. Saves write a temporary file and rename it
 * over the real one, so a crash mid-write never leaves a half-written database behind.
 */
class GymDatabase {
  private data: DatabaseSchema;
  private saveTimer: NodeJS.Timeout | null = null;
  private dirty = false;
  private dirtySince = 0;
  readonly filePath: string;

  constructor(filePath: string) {
    this.filePath = filePath;
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    this.data = this.load();
  }

  private load(): DatabaseSchema {
    if (!fs.existsSync(this.filePath)) return emptySchema();
    const raw = fs.readFileSync(this.filePath, 'utf-8');
    if (raw.trim() === '') return emptySchema();
    let parsed: Partial<DatabaseSchema>;
    try {
      parsed = JSON.parse(raw);
    } catch (err) {
      // Never silently replace a damaged file with an empty database: that would wipe every
      // member. Keep a copy and stop, so a person can decide what to do with it.
      const backup = `${this.filePath}.corrupt-${Date.now()}`;
      fs.copyFileSync(this.filePath, backup);
      throw new Error(
        `Database file ${this.filePath} is not valid JSON (a copy was saved to ${backup}). ` +
        `Fix or delete it, or run "npm run seed" to start from demo data.`
      );
    }
    return migrate({ ...emptySchema(), ...parsed });
  }

  /** True when nothing has been stored yet (first start, or a deleted file). */
  isEmpty(): boolean {
    return this.data.users.length === 0 && this.data.classes.length === 0;
  }

  /** True when the gym has no catalogue yet: no plans and no classes (plans cannot be deleted). */
  lacksCatalogue(): boolean {
    return this.data.membership_plans.length === 0 && this.data.classes.length === 0;
  }

  /** A copy of everything stored, to hand back to restore() later. */
  snapshot(): DatabaseSchema {
    return structuredClone(this.data);
  }

  /** Replace everything stored and write it at once. */
  restore(data: DatabaseSchema): void {
    this.data = migrate({ ...emptySchema(), ...structuredClone(data) });
    this.saveSync();
  }

  saveSync(): void {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    const tmp = `${this.filePath}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2), 'utf-8');
    fs.renameSync(tmp, this.filePath);
    this.dirty = false;
  }

  /**
   * Schedule a write. Writes are batched for up to 50 ms but never postponed for more than a
   * second under constant traffic. A failed write keeps the data marked dirty and is retried.
   */
  save(): void {
    const now = Date.now();
    if (!this.dirty) this.dirtySince = now;
    this.dirty = true;
    if (this.saveTimer) clearTimeout(this.saveTimer);
    const delay = now - this.dirtySince >= 1000 ? 0 : 50;
    this.saveTimer = setTimeout(() => this.writeScheduled(), delay);
  }

  private writeScheduled(): void {
    this.saveTimer = null;
    try {
      this.saveSync();
    } catch (err) {
      console.error('❌ Failed to save the database file; retrying in 2 seconds:', err);
      this.saveTimer = setTimeout(() => this.writeScheduled(), 2000);
    }
  }

  /** Write any pending change now. Called on shutdown. */
  flush(): void {
    if (this.dirty) this.saveSync();
  }

  reset(): void {
    this.data = emptySchema();
    this.saveSync();
  }

  get users() { return this.data.users; }
  set users(val: User[]) { this.data.users = val; this.save(); }

  get trainers() { return this.data.trainers; }
  set trainers(val: Trainer[]) { this.data.trainers = val; this.save(); }

  get classes() { return this.data.classes; }
  set classes(val: GymClass[]) { this.data.classes = val; this.save(); }

  get bookings() { return this.data.bookings; }
  set bookings(val: Booking[]) { this.data.bookings = val; this.save(); }

  get attendance_logs() { return this.data.attendance_logs; }
  set attendance_logs(val: AttendanceLog[]) { this.data.attendance_logs = val; this.save(); }

  get exercises() { return this.data.exercises; }
  set exercises(val: Exercise[]) { this.data.exercises = val; this.save(); }

  get workouts() { return this.data.workouts; }
  set workouts(val: Workout[]) { this.data.workouts = val; this.save(); }

  get workout_sets() { return this.data.workout_sets; }
  set workout_sets(val: WorkoutSet[]) { this.data.workout_sets = val; this.save(); }

  get membership_plans() { return this.data.membership_plans; }
  set membership_plans(val: MembershipPlan[]) { this.data.membership_plans = val; this.save(); }

  get time_sessions() { return this.data.time_sessions; }
  set time_sessions(val: TimeSession[]) { this.data.time_sessions = val; this.save(); }

  get payment_orders() { return this.data.payment_orders; }
  set payment_orders(val: PaymentOrder[]) { this.data.payment_orders = val; this.save(); }

  get payments() { return this.data.payments; }
  set payments(val: Payment[]) { this.data.payments = val; this.save(); }

  get trial_passes() { return this.data.trial_passes; }
  set trial_passes(val: TrialPass[]) { this.data.trial_passes = val; this.save(); }

  get enquiries() { return this.data.enquiries; }
  set enquiries(val: Enquiry[]) { this.data.enquiries = val; this.save(); }

  get trainer_notes() { return this.data.trainer_notes; }
  set trainer_notes(val: TrainerNote[]) { this.data.trainer_notes = val; this.save(); }

  get password_resets() { return this.data.password_resets; }
  set password_resets(val: PasswordReset[]) { this.data.password_resets = val; this.save(); }

  get id_cards() { return this.data.id_cards; }
  set id_cards(val: IdCard[]) { this.data.id_cards = val; this.save(); }

  get gifts() { return this.data.gifts; }
  set gifts(val: Gift[]) { this.data.gifts = val; this.save(); }

  get gift_claims() { return this.data.gift_claims; }
  set gift_claims(val: GiftClaim[]) { this.data.gift_claims = val; this.save(); }

  get points_ledger() { return this.data.points_ledger; }
  set points_ledger(val: PointsEntry[]) { this.data.points_ledger = val; this.save(); }

  get reward_settings() { return this.data.reward_settings; }
  set reward_settings(val: RewardSettings) { this.data.reward_settings = val; this.save(); }

  get offers() { return this.data.offers; }
  set offers(val: Offer[]) { this.data.offers = val; this.save(); }

  get coupons() { return this.data.coupons; }
  set coupons(val: Coupon[]) { this.data.coupons = val; this.save(); }

  get gym_contact() { return this.data.gym_contact; }
  set gym_contact(val: GymContact) { this.data.gym_contact = val; this.save(); }
}

export const db = new GymDatabase(config.dbPath);
export default db;

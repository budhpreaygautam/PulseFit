import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  User,
  Trainer,
  GymClass,
  Booking,
  AttendanceLog,
  Exercise,
  Workout,
  WorkoutSet,
  MembershipPlan
} from '../types/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dataDir = path.resolve(__dirname, '../../data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbFilePath = path.resolve(dataDir, 'gym-db.json');

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
}

const defaultSchema: DatabaseSchema = {
  users: [],
  trainers: [],
  classes: [],
  bookings: [],
  attendance_logs: [],
  exercises: [],
  workouts: [],
  workout_sets: [],
  membership_plans: []
};

class GymDatabase {
  private data: DatabaseSchema;
  private saveDebounceTimer: NodeJS.Timeout | null = null;

  constructor() {
    this.data = this.load();
  }

  private load(): DatabaseSchema {
    if (fs.existsSync(dbFilePath)) {
      try {
        const raw = fs.readFileSync(dbFilePath, 'utf-8');
        return { ...defaultSchema, ...JSON.parse(raw) };
      } catch (err) {
        console.error('Error reading database file, initializing default:', err);
        return { ...defaultSchema };
      }
    }
    return { ...defaultSchema };
  }

  public saveSync(): void {
    try {
      fs.writeFileSync(dbFilePath, JSON.stringify(this.data, null, 2), 'utf-8');
    } catch (err) {
      console.error('Error saving database synchronously:', err);
    }
  }

  public save(): void {
    if (this.saveDebounceTimer) {
      clearTimeout(this.saveDebounceTimer);
    }
    this.saveDebounceTimer = setTimeout(() => {
      this.saveSync();
    }, 50);
  }

  // Users
  get users() {
    return this.data.users;
  }
  set users(val: User[]) {
    this.data.users = val;
    this.save();
  }

  // Trainers
  get trainers() {
    return this.data.trainers;
  }
  set trainers(val: Trainer[]) {
    this.data.trainers = val;
    this.save();
  }

  // Classes
  get classes() {
    return this.data.classes;
  }
  set classes(val: GymClass[]) {
    this.data.classes = val;
    this.save();
  }

  // Bookings
  get bookings() {
    return this.data.bookings;
  }
  set bookings(val: Booking[]) {
    this.data.bookings = val;
    this.save();
  }

  // Attendance Logs
  get attendance_logs() {
    return this.data.attendance_logs;
  }
  set attendance_logs(val: AttendanceLog[]) {
    this.data.attendance_logs = val;
    this.save();
  }

  // Exercises
  get exercises() {
    return this.data.exercises;
  }
  set exercises(val: Exercise[]) {
    this.data.exercises = val;
    this.save();
  }

  // Workouts
  get workouts() {
    return this.data.workouts;
  }
  set workouts(val: Workout[]) {
    this.data.workouts = val;
    this.save();
  }

  // Workout Sets
  get workout_sets() {
    return this.data.workout_sets;
  }
  set workout_sets(val: WorkoutSet[]) {
    this.data.workout_sets = val;
    this.save();
  }

  // Membership Plans
  get membership_plans() {
    return this.data.membership_plans;
  }
  set membership_plans(val: MembershipPlan[]) {
    this.data.membership_plans = val;
    this.save();
  }

  public reset(): void {
    this.data = {
      users: [],
      trainers: [],
      classes: [],
      bookings: [],
      attendance_logs: [],
      exercises: [],
      workouts: [],
      workout_sets: [],
      membership_plans: []
    };
    this.saveSync();
  }
}

export const db = new GymDatabase();
export default db;

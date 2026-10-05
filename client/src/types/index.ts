export type UserRole = 'admin' | 'member' | 'trainer';
export type MembershipTier = 'none' | 'basic' | 'pro' | 'vip';
export type MembershipStatus = 'active' | 'expired' | 'pending' | 'frozen';

export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  avatar_url?: string;
  phone?: string;
  membership_tier: MembershipTier;
  membership_status: MembershipStatus;
  membership_expiry: string;
  qr_code_token: string;
  created_at: string;
  streak_days?: number;
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

export type ClassCategory = 'Workout & Strength' | 'Zumba & Cardio' | 'Strength' | 'Zumba' | 'Cardio' | 'HIIT';

export interface GymClass {
  id: string;
  title: string;
  category: ClassCategory | string;
  trainer_id: string;
  trainer_name?: string;
  trainer_avatar?: string;
  day_of_week: number;
  start_time: string;
  duration_minutes: number;
  room: string;
  capacity: number;
  booked_count: number;
  intensity: 'Low' | 'Medium' | 'High' | 'Extreme';
  description: string;
  image_url: string;
  calories_burn_est: number;
}

export interface Booking {
  id: string;
  class_id: string;
  user_id: string;
  booking_date: string;
  status: 'confirmed' | 'attended' | 'cancelled';
  created_at: string;
  class_title?: string;
  category?: string;
  start_time?: string;
  room?: string;
  trainer_name?: string;
  image_url?: string;
  duration_minutes?: number;
}

export interface AttendanceLog {
  id: string;
  user_id: string;
  user_name?: string;
  user_email?: string;
  user_tier?: string;
  check_in_time: string;
  check_in_method: 'qr' | 'manual' | 'kiosk';
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
  tier: MembershipTier;
  price_monthly: number;
  price_annual: number;
  description: string;
  features: string[];
  is_popular?: boolean;
  badge?: string;
}

export interface AdminDashboardKPIs {
  kpis: {
    totalMembers: number;
    activeMembers: number;
    monthlyRevenue: number;
    todayCheckIns: number;
    avgFillRate: number;
    retentionRate: number;
    totalTrainers: number;
    classesScheduled: number;
  };
  weeklyAttendanceChart: { day: string; visits: number }[];
  hourlyPeakCurve: { hour: string; checkIns: number }[];
  tierDistribution: { name: string; tier: string; count: number; revenue: number; color: string }[];
  topClasses: { id: string; title: string; category: string; trainer?: string; booked: number; capacity: number; occupancy: number }[];
}

export interface WorkoutAnalytics {
  totalWorkouts: number;
  totalVolumeKg: number;
  avgDurationMinutes: number;
  volumeTimeline: { date: string; volumeKg: number; durationMinutes: number; title: string }[];
  e1rmRecords: { exerciseName: string; e1rm: number; date: string; weight: number; reps: number }[];
  muscleDistribution: { category: string; count: number }[];
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
  notes?: string;
}

export interface ActiveFloorStatus {
  totalActive: number;
  workoutActive: number;
  zumbaActive: number;
  workoutUsers: TimeSession[];
  zumbaUsers: TimeSession[];
}

export interface UserTimeTrackingStats {
  activeSession: TimeSession | null;
  totalTimeMinutesThisWeek: number;
  totalTimeMinutesThisMonth: number;
  totalSessionsCompleted: number;
  recentSessions: TimeSession[];
}

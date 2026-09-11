export type UserRole = 'admin' | 'member' | 'trainer';
export type MembershipTier = 'none' | 'basic' | 'pro' | 'vip';
export type MembershipStatus = 'active' | 'expired' | 'pending' | 'frozen';

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
  specialties: string[]; // parsed from JSON
  bio: string;
  experience_years: number;
  rating: number;
  reviews_count: number;
  avatar_url: string;
  instagram: string;
}

export interface GymClass {
  id: string;
  title: string;
  category: 'HIIT' | 'Strength' | 'Yoga' | 'CrossFit' | 'Boxing' | 'Cycling' | 'Pilates';
  trainer_id: string;
  trainer_name?: string;
  trainer_avatar?: string;
  day_of_week: number; // 0 = Sunday, 1 = Monday, ... 6 = Saturday
  start_time: string; // "07:00"
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
  booking_date: string; // YYYY-MM-DD
  status: 'confirmed' | 'attended' | 'cancelled';
  created_at: string;
  class_title?: string;
  category?: string;
  start_time?: string;
  room?: string;
  trainer_name?: string;
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
  instructions: string[]; // parsed from JSON
  target_muscles: string[]; // parsed from JSON
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

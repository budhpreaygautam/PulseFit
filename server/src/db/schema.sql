-- Gym Hub & Management Database Schema (SQLite)
PRAGMA foreign_keys = ON;

-- Users Table
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    name TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('admin', 'member', 'trainer')),
    avatar_url TEXT,
    phone TEXT,
    membership_tier TEXT NOT NULL DEFAULT 'pro' CHECK(membership_tier IN ('none', 'basic', 'pro', 'vip')),
    membership_status TEXT NOT NULL DEFAULT 'active' CHECK(membership_status IN ('active', 'expired', 'pending', 'frozen')),
    membership_expiry TEXT NOT NULL,
    qr_code_token TEXT UNIQUE NOT NULL,
    streak_days INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Trainers Table
CREATE TABLE IF NOT EXISTS trainers (
    id TEXT PRIMARY KEY,
    user_id TEXT,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    phone TEXT,
    specialties TEXT NOT NULL, -- JSON Array string
    bio TEXT NOT NULL,
    experience_years INTEGER NOT NULL DEFAULT 5,
    rating REAL NOT NULL DEFAULT 4.9,
    reviews_count INTEGER NOT NULL DEFAULT 120,
    avatar_url TEXT NOT NULL,
    instagram TEXT,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE SET NULL
);

-- Classes Table
CREATE TABLE IF NOT EXISTS classes (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    category TEXT NOT NULL CHECK(category IN ('HIIT', 'Strength', 'Yoga', 'CrossFit', 'Boxing', 'Cycling', 'Pilates')),
    trainer_id TEXT NOT NULL,
    day_of_week INTEGER NOT NULL, -- 0-6 (Sun-Sat)
    start_time TEXT NOT NULL, -- e.g. '07:00'
    duration_minutes INTEGER NOT NULL DEFAULT 45,
    room TEXT NOT NULL,
    capacity INTEGER NOT NULL DEFAULT 20,
    booked_count INTEGER NOT NULL DEFAULT 0,
    intensity TEXT NOT NULL CHECK(intensity IN ('Low', 'Medium', 'High', 'Extreme')),
    calories_burn_est INTEGER DEFAULT 450,
    description TEXT NOT NULL,
    image_url TEXT,
    FOREIGN KEY(trainer_id) REFERENCES trainers(id) ON DELETE RESTRICT
);

-- Bookings Table
CREATE TABLE IF NOT EXISTS bookings (
    id TEXT PRIMARY KEY,
    class_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    booking_date TEXT NOT NULL, -- YYYY-MM-DD
    status TEXT NOT NULL DEFAULT 'confirmed' CHECK(status IN ('confirmed', 'attended', 'cancelled')),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(class_id) REFERENCES classes(id) ON DELETE CASCADE,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE(class_id, user_id, booking_date)
);

-- Attendance Logs Table
CREATE TABLE IF NOT EXISTS attendance_logs (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    check_in_time DATETIME DEFAULT CURRENT_TIMESTAMP,
    check_in_method TEXT NOT NULL DEFAULT 'qr' CHECK(check_in_method IN ('qr', 'manual', 'kiosk')),
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Exercises Table
CREATE TABLE IF NOT EXISTS exercises (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    category TEXT NOT NULL CHECK(category IN ('Chest', 'Back', 'Legs', 'Shoulders', 'Arms', 'Core', 'Cardio', 'Full Body')),
    equipment TEXT NOT NULL CHECK(equipment IN ('Barbell', 'Dumbbell', 'Machine', 'Cable', 'Bodyweight', 'Kettlebell', 'Cardio')),
    difficulty TEXT NOT NULL CHECK(difficulty IN ('Beginner', 'Intermediate', 'Advanced')),
    instructions TEXT NOT NULL, -- JSON Array string
    target_muscles TEXT NOT NULL, -- JSON Array string
    thumbnail_url TEXT
);

-- Workouts Table
CREATE TABLE IF NOT EXISTS workouts (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    title TEXT NOT NULL,
    date TEXT NOT NULL, -- YYYY-MM-DD
    duration_minutes INTEGER NOT NULL,
    notes TEXT,
    total_volume_kg REAL DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Workout Sets Table
CREATE TABLE IF NOT EXISTS workout_sets (
    id TEXT PRIMARY KEY,
    workout_id TEXT NOT NULL,
    exercise_id TEXT NOT NULL,
    set_number INTEGER NOT NULL,
    weight_kg REAL NOT NULL,
    reps INTEGER NOT NULL,
    rpe REAL,
    is_warmup INTEGER DEFAULT 0,
    FOREIGN KEY(workout_id) REFERENCES workouts(id) ON DELETE CASCADE,
    FOREIGN KEY(exercise_id) REFERENCES exercises(id) ON DELETE RESTRICT
);

-- Membership Plans Table
CREATE TABLE IF NOT EXISTS membership_plans (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    tier TEXT NOT NULL UNIQUE CHECK(tier IN ('basic', 'pro', 'vip')),
    price_monthly REAL NOT NULL,
    price_annual REAL NOT NULL,
    description TEXT NOT NULL,
    features TEXT NOT NULL, -- JSON Array
    is_popular INTEGER DEFAULT 0,
    badge TEXT
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_qr ON users(qr_code_token);
CREATE INDEX IF NOT EXISTS idx_classes_day ON classes(day_of_week);
CREATE INDEX IF NOT EXISTS idx_classes_cat ON classes(category);
CREATE INDEX IF NOT EXISTS idx_bookings_user ON bookings(user_id);
CREATE INDEX IF NOT EXISTS idx_attendance_user ON attendance_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_attendance_time ON attendance_logs(check_in_time);
CREATE INDEX IF NOT EXISTS idx_workouts_user ON workouts(user_id, date);

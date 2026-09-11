import {
  User,
  Trainer,
  GymClass,
  Booking,
  AttendanceLog,
  Exercise,
  Workout,
  MembershipPlan,
  AdminDashboardKPIs,
  WorkoutAnalytics
} from '../types/index.js';

const API_BASE = '/api';

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const token = localStorage.getItem('pulsefit_token');
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...(options.headers || {})
  };

  if (token) {
    (headers as Record<string, string>)['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers
  });

  const data = await response.json();

  if (!response.ok || data.success === false) {
    throw new Error(data.error || 'Network request failed');
  }

  return data.data as T;
}

export const api = {
  // --- Auth ---
  login: (credentials: { email: string; password: string }) =>
    request<{ token: string; user: User }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify(credentials)
    }),

  register: (payload: { name: string; email: string; password: string; phone?: string; tier?: string }) =>
    request<{ token: string; user: User }>('/auth/register', {
      method: 'POST',
      body: JSON.stringify(payload)
    }),

  firebaseSync: (payload: { uid: string; email: string; displayName?: string; photoURL?: string; tier?: string; phone?: string }) =>
    request<{ token: string; user: User }>('/auth/firebase-sync', {
      method: 'POST',
      body: JSON.stringify(payload)
    }),

  demoLogin: (role: 'member' | 'admin' | 'trainer' | 'vip') =>
    request<{ token: string; user: User }>('/auth/demo-login', {
      method: 'POST',
      body: JSON.stringify({ role })
    }),

  getMe: () => request<User>('/auth/me'),

  updateProfile: (profile: Partial<User> & { currentPassword?: string; newPassword?: string }) =>
    request<User>('/auth/profile', {
      method: 'PUT',
      body: JSON.stringify(profile)
    }),

  getPlans: () => request<MembershipPlan[]>('/plans'),

  // --- Payments (Razorpay) ---
  createPaymentOrder: (payload: { amount: number; currency?: string; notes?: Record<string, unknown> }) =>
    request<{ id: string; amount: number; currency: string; receipt: string }>('/payment/create-order', {
      method: 'POST',
      body: JSON.stringify(payload)
    }),

  verifyPayment: (payload: {
    razorpay_order_id: string;
    razorpay_payment_id: string;
    razorpay_signature: string;
    tier: string;
    billing_cycle: 'monthly' | 'annual';
  }) =>
    request<{
      message: string;
      membership: { tier: string; status: string; expiry: string };
      user: User;
      token: string;
    }>('/payment/verify', {
      method: 'POST',
      body: JSON.stringify(payload)
    }),

  // --- Classes ---
  getClasses: (params: { day?: number; category?: string; trainerId?: string; intensity?: string; search?: string } = {}) => {
    const query = new URLSearchParams();
    if (params.day !== undefined) query.set('day', params.day.toString());
    if (params.category) query.set('category', params.category);
    if (params.trainerId) query.set('trainerId', params.trainerId);
    if (params.intensity) query.set('intensity', params.intensity);
    if (params.search) query.set('search', params.search);
    const qs = query.toString() ? `?${query.toString()}` : '';
    return request<GymClass[]>(`/classes${qs}`);
  },

  getClassById: (id: string) => request<GymClass & { trainer?: Trainer }>(`/classes/${id}`),

  createClass: (payload: Partial<GymClass>) =>
    request<GymClass>('/classes', {
      method: 'POST',
      body: JSON.stringify(payload)
    }),

  updateClass: (id: string, payload: Partial<GymClass>) =>
    request<GymClass>(`/classes/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payload)
    }),

  deleteClass: (id: string) =>
    request<{ message: string }>(`/classes/${id}`, {
      method: 'DELETE'
    }),

  // --- Bookings ---
  getMyBookings: () => request<Booking[]>('/bookings/my'),

  createBooking: (payload: { class_id: string; booking_date: string }) =>
    request<Booking>('/bookings', {
      method: 'POST',
      body: JSON.stringify(payload)
    }),

  cancelBooking: (id: string) =>
    request<{ message: string }>(`/bookings/${id}`, {
      method: 'DELETE'
    }),

  getClassRoster: (classId: string) =>
    request<Array<{ booking_id: string; user_id: string; booking_date: string; user_name: string; user_email: string; user_tier: string; user_avatar?: string }>>(`/bookings/class/${classId}/roster`),

  // --- Workouts & Exercises ---
  getExercises: (params: { category?: string; equipment?: string; difficulty?: string; search?: string } = {}) => {
    const query = new URLSearchParams();
    if (params.category) query.set('category', params.category);
    if (params.equipment) query.set('equipment', params.equipment);
    if (params.difficulty) query.set('difficulty', params.difficulty);
    if (params.search) query.set('search', params.search);
    const qs = query.toString() ? `?${query.toString()}` : '';
    return request<Exercise[]>(`/exercises${qs}`);
  },

  getExerciseById: (id: string) => request<Exercise>(`/exercises/${id}`),

  getWorkouts: () => request<Workout[]>('/workouts'),

  getWorkoutById: (id: string) => request<Workout>(`/workouts/${id}`),

  createWorkout: (payload: Partial<Workout>) =>
    request<Workout>('/workouts', {
      method: 'POST',
      body: JSON.stringify(payload)
    }),

  deleteWorkout: (id: string) =>
    request<{ message: string }>(`/workouts/${id}`, {
      method: 'DELETE'
    }),

  getWorkoutAnalytics: () => request<WorkoutAnalytics>('/workouts/analytics'),

  // --- Trainers ---
  getTrainers: () => request<Trainer[]>('/trainers'),

  getTrainerById: (id: string) => request<Trainer & { classes?: GymClass[] }>(`/trainers/${id}`),

  createTrainer: (payload: Partial<Trainer>) =>
    request<Trainer>('/trainers', {
      method: 'POST',
      body: JSON.stringify(payload)
    }),

  updateTrainer: (id: string, payload: Partial<Trainer>) =>
    request<Trainer>(`/trainers/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payload)
    }),

  deleteTrainer: (id: string) =>
    request<{ message: string }>(`/trainers/${id}`, {
      method: 'DELETE'
    }),

  // --- Members & Attendance ---
  getMembers: (params: { search?: string; tier?: string; status?: string; role?: string } = {}) => {
    const query = new URLSearchParams();
    if (params.search) query.set('search', params.search);
    if (params.tier) query.set('tier', params.tier);
    if (params.status) query.set('status', params.status);
    if (params.role) query.set('role', params.role);
    const qs = query.toString() ? `?${query.toString()}` : '';
    return request<User[]>(`/members${qs}`);
  },

  getMemberById: (id: string) =>
    request<User & { bookings_count: number; attendance_count: number; workouts_count: number }>(`/members/${id}`),

  createMember: (payload: any) =>
    request<{ data: User; tempPassword?: string }>('/members', {
      method: 'POST',
      body: JSON.stringify(payload)
    }),

  updateMember: (id: string, payload: Partial<User>) =>
    request<User>(`/members/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payload)
    }),

  deleteMember: (id: string) =>
    request<{ message: string }>(`/members/${id}`, {
      method: 'DELETE'
    }),

  checkInMember: (tokenOrId: string, method: string = 'qr') =>
    request<{ message: string; data: { log: AttendanceLog; user: Partial<User> } }>('/attendance/check-in', {
      method: 'POST',
      body: JSON.stringify({ tokenOrId, method })
    }),

  getAttendanceLogs: () => request<AttendanceLog[]>('/attendance/logs'),

  // --- Admin Analytics ---
  getDashboardKPIs: () => request<AdminDashboardKPIs>('/analytics/dashboard')
};

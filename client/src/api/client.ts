import {
  AdminDashboardKPIs,
  ActiveFloorStatus,
  AppConfig,
  AttendanceLog,
  AuthSession,
  BillingCycle,
  Booking,
  CheckInResult,
  ClassCategory,
  ClassOccurrence,
  ClassRoster,
  Exercise,
  GymClass,
  MemberDetail,
  MembershipPlan,
  MembershipStatus,
  MembershipTier,
  MyBooking,
  NewWorkout,
  Paginated,
  PaidTier,
  Payment,
  PaymentOrder,
  TimeSession,
  Trainer,
  TrainerClient,
  TrainerDashboard,
  TrainerNote,
  TrainerNoteCategory,
  TrialPass,
  User,
  UserRole,
  UserTimeTrackingStats,
  Workout,
  WorkoutAnalytics
} from '../types/index.js';
import { storage, TOKEN_KEY } from '../lib/storage.js';

const API_BASE = '/api';

/** Fired when the API rejects our token; AuthContext signs the user out. */
export const UNAUTHORIZED_EVENT = 'pulsefit:unauthorized';

/**
 * Every failed request becomes an ApiError. `message` is safe to show to the user;
 * branch on `code` (see docs/API.md) and read extra context from `data`.
 */
export class ApiError<D = unknown> extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string,
    public data?: D
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export const isApiError = (err: unknown): err is ApiError => err instanceof ApiError;

/** A user-facing message for anything thrown by an API call. */
export function errorMessage(err: unknown, fallback = 'Something went wrong. Please try again.'): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}

const STATUS_MESSAGES: Record<number, string> = {
  400: 'That request was not valid.',
  401: 'Your session has expired. Please sign in again.',
  403: 'You do not have permission to do that.',
  404: 'We could not find what you were looking for.',
  409: 'That conflicts with the current state. Refresh and try again.',
  413: 'That is too large to upload.',
  429: 'Too many attempts. Please wait a few minutes and try again.',
  503: 'This feature is not available right now.'
};

interface Envelope<T> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
  code?: string;
}

async function send<T>(endpoint: string, options: RequestInit = {}): Promise<{ data: T; message?: string }> {
  const token = storage.get(TOKEN_KEY);
  const headers: Record<string, string> = { ...(options.headers as Record<string, string>) };
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;

  let response: Response;
  try {
    response = await fetch(`${API_BASE}${endpoint}`, { ...options, headers });
  } catch {
    throw new ApiError('Cannot reach the PulseFit server. Check your connection and try again.', 0, 'NETWORK_ERROR');
  }

  // Proxies and crashed servers answer with HTML or nothing; never surface "Unexpected token <".
  let body: Envelope<T> | null = null;
  const text = await response.text();
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = null;
    }
  }

  if (!response.ok || !body || body.success === false) {
    const status = response.status;
    if (status === 401 && token) window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
    const message = body?.error || STATUS_MESSAGES[status] || `The server returned an error (${status}). Please try again.`;
    throw new ApiError(message, status, body?.code, body?.data);
  }

  return { data: body.data as T, message: body.message };
}

const get = <T>(endpoint: string) => send<T>(endpoint).then(r => r.data);
const post = <T>(endpoint: string, body: unknown = {}) =>
  send<T>(endpoint, { method: 'POST', body: JSON.stringify(body) }).then(r => r.data);
const put = <T>(endpoint: string, body: unknown) =>
  send<T>(endpoint, { method: 'PUT', body: JSON.stringify(body) }).then(r => r.data);
const patch = <T>(endpoint: string, body: unknown) =>
  send<T>(endpoint, { method: 'PATCH', body: JSON.stringify(body) }).then(r => r.data);
const del = <T>(endpoint: string) => send<T>(endpoint, { method: 'DELETE' }).then(r => r.data);

function qs(params: Record<string, string | number | boolean | undefined | null>): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') query.set(key, String(value));
  }
  const s = query.toString();
  return s ? `?${s}` : '';
}

export const api = {
  // --- Runtime config ---
  getConfig: () => get<AppConfig>('/config'),

  // --- Auth & account ---
  login: (credentials: { email: string; password: string }) => post<AuthSession>('/auth/login', credentials),
  register: (payload: { name: string; email: string; password: string; phone?: string }) =>
    post<AuthSession>('/auth/register', payload),
  googleSignIn: (credential: string) => post<AuthSession & { created: boolean }>('/auth/google', { credential }),
  /** Like googleSignIn, but keeps the server's message (it explains when a password account was linked). */
  googleSignInWithMessage: (credential: string) =>
    send<AuthSession & { created: boolean }>('/auth/google', { method: 'POST', body: JSON.stringify({ credential }) }).then(r => ({
      ...r.data,
      message: r.message
    })),
  demoLogin: (role: 'member' | 'vip' | 'trainer' | 'admin') => post<AuthSession>('/auth/demo-login', { role }),
  getMe: () => get<User>('/auth/me'),
  updateProfile: (profile: { name?: string; phone?: string; avatar_url?: string }) => put<User>('/auth/profile', profile),
  changePassword: (payload: { currentPassword?: string; newPassword: string }) => put<AuthSession>('/auth/password', payload),
  forgotPassword: (email: string) => post<{ message: string; resetUrl?: string }>('/auth/forgot-password', { email }),
  resetPassword: (payload: { token: string; newPassword: string }) => post<AuthSession>('/auth/reset-password', payload),

  // --- Plans, payments & membership ---
  getPlans: () => get<MembershipPlan[]>('/plans'),
  updatePlan: (id: string, payload: Partial<Omit<MembershipPlan, 'id' | 'tier'>>) => put<MembershipPlan>(`/plans/${id}`, payload),
  createPaymentOrder: (payload: { tier: PaidTier; billing_cycle: BillingCycle }) => post<PaymentOrder>('/payment/create-order', payload),
  verifyPayment: (payload: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) =>
    post<AuthSession & { payment: Payment; message: string }>('/payment/verify', payload),
  getMyPayments: () => get<Payment[]>('/payments/my'),
  getPayments: (params: { user_id?: string } = {}) => get<Payment[]>(`/payments${qs(params)}`),
  freezeMembership: () => post<User>('/membership/freeze'),
  unfreezeMembership: () => post<User>('/membership/unfreeze'),

  // --- Classes & bookings ---
  getClasses: (params: { day?: number; category?: string; trainerId?: string; intensity?: string; search?: string; week_start?: string } = {}) =>
    get<ClassOccurrence[]>(`/classes${qs(params)}`),
  getClassById: (id: string, date?: string) => get<ClassOccurrence & { trainer?: Trainer }>(`/classes/${id}${qs({ date })}`),
  createClass: (payload: Omit<GymClass, 'id' | 'trainer_name' | 'trainer_avatar'>) => post<GymClass>('/classes', payload),
  updateClass: (id: string, payload: Partial<Omit<GymClass, 'id'>>) => put<GymClass>(`/classes/${id}`, payload),
  deleteClass: (id: string) => del<{ cancelled_bookings: number }>(`/classes/${id}`),

  getMyBookings: (scope: 'upcoming' | 'past' | 'all' = 'upcoming') => get<MyBooking[]>(`/bookings/my${qs({ scope })}`),
  createBooking: (payload: { class_id: string; booking_date: string }) => post<Booking>('/bookings', payload),
  cancelBooking: (id: string) => del<Booking>(`/bookings/${id}`),
  markAttendance: (bookingId: string, status: 'attended' | 'no_show' | 'confirmed') =>
    patch<Booking>(`/bookings/${bookingId}/attendance`, { status }),
  getClassRoster: (classId: string, date?: string) => get<ClassRoster>(`/bookings/class/${classId}/roster${qs({ date })}`),

  // --- Trainers & trainer portal ---
  getTrainers: () => get<Trainer[]>('/trainers'),
  getTrainerById: (id: string) => get<Trainer & { classes: ClassOccurrence[] }>(`/trainers/${id}`),
  createTrainer: (payload: Partial<Trainer>) => post<Trainer>('/trainers', payload),
  updateTrainer: (id: string, payload: Partial<Trainer>) => put<Trainer>(`/trainers/${id}`, payload),
  deleteTrainer: (id: string, reassignTo?: string) =>
    del<{ deleted: true; reassigned_classes: number }>(`/trainers/${id}${qs({ reassign_to: reassignTo })}`),

  getTrainerDashboard: (trainerId?: string) => get<TrainerDashboard>(`/trainer/me${qs({ trainer_id: trainerId })}`),
  getTrainerClients: (trainerId?: string) => get<TrainerClient[]>(`/trainer/clients${qs({ trainer_id: trainerId })}`),
  getTrainerNotes: (memberId?: string) => get<TrainerNote[]>(`/trainer/notes${qs({ member_id: memberId })}`),
  createTrainerNote: (payload: { member_id: string; category: TrainerNoteCategory; note: string; visible_to_member: boolean }) =>
    post<TrainerNote>('/trainer/notes', payload),
  deleteTrainerNote: (id: string) => del<{ deleted: true }>(`/trainer/notes/${id}`),
  getMyNotes: () => get<TrainerNote[]>('/notes/my'),

  // --- Members, check-in, attendance & trials ---
  getMembers: (params: { search?: string; tier?: string; status?: string; role?: UserRole | 'all' } = {}) =>
    get<User[]>(`/members${qs(params)}`),
  getMemberById: (id: string) => get<MemberDetail>(`/members/${id}`),
  createMember: (payload: { name: string; email: string; phone?: string; role?: UserRole; membership_tier?: MembershipTier; expiry_months?: number }) =>
    post<{ member: User; tempPassword: string }>('/members', payload),
  updateMember: (
    id: string,
    payload: Partial<{ name: string; phone: string; role: UserRole; membership_tier: MembershipTier; membership_status: MembershipStatus; membership_expiry: string | null }>
  ) => put<User>(`/members/${id}`, payload),
  deleteMember: (id: string) => del<{ deleted: true }>(`/members/${id}`),
  resetMemberPassword: (id: string) => post<{ tempPassword: string }>(`/members/${id}/reset-password`),

  checkIn: (code: string, method: 'qr' | 'manual' | 'kiosk' | 'camera' = 'manual') =>
    post<CheckInResult>('/attendance/check-in', { code, method }),
  getAttendanceLogs: (params: { date?: string; user_id?: string; limit?: number; offset?: number } = {}) =>
    get<Paginated<AttendanceLog>>(`/attendance/logs${qs(params)}`),
  attendanceCsvUrl: (params: { date?: string; user_id?: string } = {}) => `${API_BASE}/attendance/logs${qs({ ...params, format: 'csv' })}`,
  getMyAttendance: () => get<AttendanceLog[]>('/attendance/my'),

  claimTrial: (payload: { name: string; email: string; phone: string; interest: ClassCategory; preferred_date: string }) =>
    post<TrialPass>('/trials', payload),
  getTrials: () => get<TrialPass[]>('/trials'),

  // --- Workouts & exercises ---
  getExercises: (params: { category?: string; equipment?: string; difficulty?: string; search?: string } = {}) =>
    get<Exercise[]>(`/exercises${qs(params)}`),
  getExerciseById: (id: string) => get<Exercise>(`/exercises/${id}`),
  getWorkouts: () => get<Workout[]>('/workouts'),
  getWorkoutById: (id: string) => get<Workout>(`/workouts/${id}`),
  createWorkout: (payload: NewWorkout) => post<Workout>('/workouts', payload),
  deleteWorkout: (id: string) => del<{ deleted: true }>(`/workouts/${id}`),
  getWorkoutAnalytics: () => get<WorkoutAnalytics>('/workouts/analytics'),

  // --- Floor time tracking ---
  clockIn: (category: ClassCategory, notes?: string) => post<TimeSession>('/time-tracking/clock-in', { category, notes }),
  clockOut: (notes?: string) => post<TimeSession>('/time-tracking/clock-out', notes ? { notes } : {}),
  getActiveFloorStatus: () => get<ActiveFloorStatus>('/time-tracking/active-floor'),
  getMyTimeTrackingStats: () => get<UserTimeTrackingStats>('/time-tracking/my-stats'),

  // --- Admin analytics ---
  getDashboardKPIs: () => get<AdminDashboardKPIs>('/analytics/dashboard')
};

/** Download an authenticated file (e.g. the attendance CSV) without exposing the token in a URL. */
export async function downloadFile(url: string, filename: string): Promise<void> {
  const token = storage.get(TOKEN_KEY);
  const response = await fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  if (!response.ok) throw new ApiError(STATUS_MESSAGES[response.status] || 'Download failed.', response.status);
  const blob = await response.blob();
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
}

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
  Coupon,
  CouponInput,
  DeskSale,
  ClassOccurrence,
  ClassRoster,
  Enquiry,
  EnquiryStatus,
  ClaimStatus,
  Exercise,
  FitnessGuide,
  Gender,
  Gift,
  GiftClaim,
  GiftInput,
  GiftSize,
  GymClass,
  GymContact,
  IdCardDeactivationReason,
  IdCardOverview,
  IdCardStatus,
  IssuedIdCard,
  MemberDetail,
  MemberNote,
  MembershipPlan,
  MembershipStatus,
  MembershipTier,
  MfaChallenge,
  MfaSetup,
  MyBooking,
  MyIdCard,
  MyRewards,
  NewWorkout,
  Offer,
  OfferInput,
  Paginated,
  PaidTier,
  Payment,
  PaymentOrder,
  PointsEntry,
  Promotions,
  Quote,
  RewardSettings,
  RewardSettingsInput,
  StoreGift,
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
  WorkoutAnalytics,
  YoupiOrderStatus
} from '../types/index.js';
import { getAuthToken, hasSavedSession } from '../lib/authToken.js';
import { saveFile } from '../lib/native.js';

// Empty for the website (same origin, or Vite's proxy). The Android/iOS build sets the server's
// full address, e.g. http://192.168.1.20:5004 or https://gym.example.com.
export const API_BASE = `${String(import.meta.env.VITE_API_URL ?? '').replace(/\/+$/, '')}/api`;

/**
 * Headers for every API request: the app's bearer token, if any, and the header the server's CSRF
 * guard requires on cookie-authenticated writes.
 */
export function authHeaders(): Record<string, string> {
  const token = getAuthToken();
  return { 'X-Requested-With': 'PulseFit', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

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

/** Data plus the server's own message, for actions whose side effects the user must be told about. */
export interface WithMessage<T> {
  data: T;
  message?: string;
}

async function send<T>(endpoint: string, options: RequestInit = {}): Promise<WithMessage<T>> {
  const headers: Record<string, string> = { ...(options.headers as Record<string, string>), ...authHeaders() };
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';

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
    if (status === 401 && hasSavedSession()) window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
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
// Keep the message: these actions can cancel bookings, and the message says how many.
const postWithMessage = <T>(endpoint: string, body: unknown = {}) =>
  send<T>(endpoint, { method: 'POST', body: JSON.stringify(body) });
const putWithMessage = <T>(endpoint: string, body: unknown) => send<T>(endpoint, { method: 'PUT', body: JSON.stringify(body) });

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
  login: (credentials: { email: string; password: string }) => post<AuthSession | MfaChallenge>('/auth/login', credentials),
  register: (payload: { name: string; gender: Gender; email: string; password: string; phone?: string; referral_code?: string }) =>
    post<AuthSession>('/auth/register', payload),
  /** `message` is set when an existing password account was linked (its password was removed). A referral code counts only when this creates the account. */
  googleSignIn: (credential: string, referral_code?: string) =>
    send<(AuthSession | MfaChallenge) & { created: boolean }>('/auth/google', { method: 'POST', body: JSON.stringify({ credential, referral_code }) }).then(r => ({
      ...r.data,
      message: r.message
    })),
  demoLogin: (role: 'member' | 'vip' | 'trainer' | 'admin') => post<AuthSession>('/auth/demo-login', { role }),
  getMe: () => get<User>('/auth/me'),
  // avatar_url: '' removes the photo (the default picture shows again).
  updateProfile: (profile: { name?: string; phone?: string; gender?: Gender; avatar_url?: string }) => put<User>('/auth/profile', profile),
  changePassword: (payload: { currentPassword?: string; newPassword: string }) => put<AuthSession>('/auth/password', payload),
  forgotPassword: (email: string) => post<{ message: string; resetUrl?: string }>('/auth/forgot-password', { email }),
  resetPassword: (payload: { token: string; newPassword: string }) => post<AuthSession | MfaChallenge>('/auth/reset-password', payload),
  logout: () => post<{ signedOut: true }>('/auth/logout'),

  // --- Two-step sign-in (MFA) ---
  verifyMfa: (payload: { mfa_token: string; code: string }) => send<AuthSession>('/auth/mfa/verify', { method: 'POST', body: JSON.stringify(payload) }),
  getMfaStatus: () => get<{ enabled: boolean; recovery_codes_left: number }>('/auth/mfa'),
  setupMfa: (password?: string) => post<MfaSetup>('/auth/mfa/setup', password ? { password } : {}),
  enableMfa: (code: string) => send<AuthSession & { recovery_codes: string[] }>('/auth/mfa/enable', { method: 'POST', body: JSON.stringify({ code }) }),
  disableMfa: (payload: { code: string; password?: string }) => send<User>('/auth/mfa/disable', { method: 'POST', body: JSON.stringify(payload) }),
  regenerateRecoveryCodes: (code: string) => post<{ recovery_codes: string[] }>('/auth/mfa/recovery-codes', { code }),
  adminResetMfa: (userId: string) => postWithMessage<User>(`/members/${userId}/mfa/reset`),

  // --- Plans, payments & membership ---
  getPlans: () => get<MembershipPlan[]>('/plans'),
  updatePlan: (id: string, payload: Partial<Omit<MembershipPlan, 'id' | 'tier'>>) =>
    putWithMessage<MembershipPlan>(`/plans/${id}`, payload),
  // The server prices every order and quote; a coupon that does not work is a 400 COUPON_*.
  createPaymentOrder: (payload: { tier: PaidTier; billing_cycle: BillingCycle; coupon_code?: string }) => post<PaymentOrder>('/payment/create-order', payload),
  getPaymentQuote: (payload: { tier: PaidTier; billing_cycle: BillingCycle; coupon_code?: string }) => post<Quote>('/payment/quote', payload),
  getPaymentQuotes: () => get<Quote[]>('/payment/quotes'),
  getPromotions: () => get<Promotions>('/promotions'),
  verifyPayment: (payload: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) =>
    post<{ user: User; payment: Payment; message: string }>('/payment/verify', payload),
  confirmYoupiPayment: (orderId: string) => post<YoupiOrderStatus>('/payment/youpi/confirm', { order_id: orderId }),
  getMyPayments: () => get<Payment[]>('/payments/my'),
  getPayments: (params: { user_id?: string } = {}) => get<Payment[]>(`/payments${qs(params)}`),
  freezeMembership: () => postWithMessage<User>('/membership/freeze'),
  unfreezeMembership: () => postWithMessage<User>('/membership/unfreeze'),

  // --- Classes & bookings ---
  getClasses: (params: { day?: number; category?: string; trainerId?: string; intensity?: string; search?: string; week_start?: string } = {}) =>
    get<ClassOccurrence[]>(`/classes${qs(params)}`),
  getClassById: (id: string, date?: string) => get<ClassOccurrence & { trainer?: Trainer }>(`/classes/${id}${qs({ date })}`),
  // The server defaults intensity, description, image_url and calories_burn_est.
  createClass: (
    payload: Omit<GymClass, 'id' | 'trainer_name' | 'trainer_avatar' | 'intensity' | 'description' | 'image_url' | 'calories_burn_est'> &
      Partial<Pick<GymClass, 'intensity' | 'description' | 'image_url' | 'calories_burn_est'>>
  ) => post<GymClass>('/classes', payload),
  updateClass: (id: string, payload: Partial<Omit<GymClass, 'id'>>) => putWithMessage<GymClass>(`/classes/${id}`, payload),
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
  // user_id: null unlinks the trainer's login account.
  updateTrainer: (id: string, payload: Partial<Omit<Trainer, 'user_id'>> & { user_id?: string | null }) =>
    put<Trainer>(`/trainers/${id}`, payload),
  deleteTrainer: (id: string, reassignTo?: string) =>
    del<{ deleted: true; reassigned_classes: number }>(`/trainers/${id}${qs({ reassign_to: reassignTo })}`),

  getTrainerDashboard: (trainerId?: string) => get<TrainerDashboard>(`/trainer/me${qs({ trainer_id: trainerId })}`),
  getTrainerClients: (trainerId?: string) => get<TrainerClient[]>(`/trainer/clients${qs({ trainer_id: trainerId })}`),
  getTrainerNotes: (memberId?: string, trainerId?: string) =>
    get<TrainerNote[]>(`/trainer/notes${qs({ member_id: memberId, trainer_id: trainerId })}`),
  createTrainerNote: (payload: { member_id: string; category: TrainerNoteCategory; note: string; visible_to_member: boolean }) =>
    post<TrainerNote>('/trainer/notes', payload),
  deleteTrainerNote: (id: string) => del<{ deleted: true }>(`/trainer/notes/${id}`),
  getMyNotes: () => get<MemberNote[]>('/notes/my'),

  // --- Members, check-in, attendance & trials ---
  getMembers: (params: { search?: string; tier?: string; status?: string; role?: UserRole | 'all' } = {}) =>
    get<User[]>(`/members${qs(params)}`),
  getMemberById: (id: string) => get<MemberDetail>(`/members/${id}`),
  // With desk_sale, membership_tier is the plan sold (or 'none') and expiry_months 0: the sale sets the membership.
  createMember: (payload: {
    name: string;
    email: string;
    phone?: string;
    gender?: Gender;
    role?: UserRole;
    membership_tier?: MembershipTier;
    expiry_months?: number;
    desk_sale?: DeskSale;
    referral_code?: string;
  }) => post<{ member: User; tempPassword: string; payment?: Payment; gifts?: GiftClaim[] }>('/members', payload),
  // The message names the joining gifts, and any bookings a plan change cancelled.
  recordDeskSale: (userId: string, sale: DeskSale) => postWithMessage<{ user: User; payment: Payment; gifts: GiftClaim[] }>(`/members/${userId}/desk-sale`, sale),
  adjustPoints: (userId: string, payload: { points: number; note: string }) =>
    postWithMessage<{ balance: number; entry: PointsEntry }>(`/members/${userId}/points`, payload),
  attachReferrer: (userId: string, referral_code: string) => post<{ referred_by: { id: string; name: string } }>(`/members/${userId}/referrer`, { referral_code }),
  updateMember: (
    id: string,
    // gender: null clears it back to "not given".
    payload: Partial<{ name: string; phone: string; gender: Gender | null; role: UserRole; membership_tier: MembershipTier; membership_status: MembershipStatus; membership_expiry: string | null }>
  ) => putWithMessage<User>(`/members/${id}`, payload),
  deleteMember: (id: string) => del<{ deleted: true }>(`/members/${id}`),
  resetMemberPassword: (id: string) => post<{ tempPassword: string }>(`/members/${id}/reset-password`),

  // --- Physical ID cards ---
  getIdCards: (params: { status?: IdCardStatus | 'none' | 'all'; role?: UserRole | 'all'; search?: string } = {}) =>
    get<IdCardOverview>(`/id-cards${qs(params)}`),
  // The writes keep the server's message: it names the card, and says when an old card stopped working.
  issueIdCard: (userId: string, payload: { replace?: boolean; replaces_card_id?: string; note?: string } = {}) =>
    postWithMessage<{ card: IssuedIdCard; replaced: IssuedIdCard | null }>(`/members/${userId}/id-cards`, payload),
  // 'replaced' is the server's own reason, for a card a replacement took over.
  deactivateIdCard: (cardId: string, payload: { reason: Exclude<IdCardDeactivationReason, 'replaced'>; note?: string }) =>
    postWithMessage<{ card: IssuedIdCard }>(`/id-cards/${cardId}/deactivate`, payload),
  reactivateIdCard: (cardId: string, payload: { note?: string } = {}) => postWithMessage<{ card: IssuedIdCard }>(`/id-cards/${cardId}/reactivate`, payload),
  getMyIdCard: () => get<{ card: MyIdCard | null }>('/id-cards/mine'),

  checkIn: (code: string, method: 'qr' | 'manual' | 'kiosk' | 'camera' = 'manual') =>
    post<CheckInResult>('/attendance/check-in', { code, method }),
  getAttendanceLogs: (params: { date?: string; user_id?: string; limit?: number; offset?: number } = {}) =>
    get<Paginated<AttendanceLog>>(`/attendance/logs${qs(params)}`),
  attendanceCsvUrl: (params: { date?: string; user_id?: string } = {}) => `${API_BASE}/attendance/logs${qs({ ...params, format: 'csv' })}`,
  getMyAttendance: () => get<AttendanceLog[]>('/attendance/my'),

  claimTrial: (payload: { name: string; email: string; phone: string; interest: ClassCategory; preferred_date: string }) =>
    post<TrialPass>('/trials', payload),
  getTrials: () => get<TrialPass[]>('/trials'),
  sendEnquiry: (
    payload: Pick<Enquiry, 'name' | 'email' | 'phone' | 'interest' | 'contact_time' | 'message'> & { consent: true; website: string }
  ) => post<null>('/enquiries', payload),
  getEnquiries: () => get<Enquiry[]>('/enquiries'),
  updateEnquiryStatus: (id: string, status: EnquiryStatus) => patch<Enquiry>(`/enquiries/${id}`, { status }),

  // --- Workouts & exercises ---
  getExercises: (params: { category?: string; equipment?: string; difficulty?: string; search?: string } = {}) =>
    get<Exercise[]>(`/exercises${qs(params)}`),
  getExerciseById: (id: string) => get<Exercise>(`/exercises/${id}`),
  getWorkouts: () => get<Workout[]>('/workouts'),
  getWorkoutById: (id: string) => get<Workout>(`/workouts/${id}`),
  createWorkout: (payload: NewWorkout) => post<Workout>('/workouts', payload),
  deleteWorkout: (id: string) => del<{ deleted: true }>(`/workouts/${id}`),
  getWorkoutAnalytics: () => get<WorkoutAnalytics>('/workouts/analytics'),
  // Staff and members with a plan. A member without one (none chosen yet, or ended) gets 403
  // PLAN_REQUIRED and none of the guide: null here, and the pages show their teaser instead.
  getGuide: () =>
    get<FitnessGuide>('/guide').catch((err: unknown): null => {
      if (isApiError(err) && err.code === 'PLAN_REQUIRED') return null;
      throw err;
    }),

  // --- Floor time tracking ---
  clockIn: (category: ClassCategory, notes?: string) => post<TimeSession>('/time-tracking/clock-in', { category, notes }),
  clockOut: (notes?: string) => post<TimeSession>('/time-tracking/clock-out', notes ? { notes } : {}),
  getActiveFloorStatus: () => get<ActiveFloorStatus>('/time-tracking/active-floor'),
  getMyTimeTrackingStats: () => get<UserTimeTrackingStats>('/time-tracking/my-stats'),

  // --- Rewards: points, gifts and pickups ---
  getMyRewards: () => get<MyRewards>('/rewards/me'),
  getPointsLedger: (params: { limit?: number; offset?: number } = {}) => get<Paginated<PointsEntry> & { balance: number }>(`/rewards/ledger${qs(params)}`),
  getStoreGifts: () => get<StoreGift[]>('/rewards/gifts'),
  claimGift: (payload: { gift_id: string; size?: GiftSize }) => post<GiftClaim>('/rewards/claims', payload),
  updateClaim: (id: string, payload: { status?: 'cancelled' | 'handed_over'; size?: GiftSize; reason?: string }) =>
    patch<GiftClaim>(`/rewards/claims/${id}`, payload),
  // Admin: the same address as the store, answered with the whole catalogue and its stock.
  getGiftCatalogue: () => get<Gift[]>('/rewards/gifts'),
  createGift: (payload: GiftInput) => post<Gift>('/rewards/gifts', payload),
  // The message names waiting claims the added stock made ready. New stock goes with expected_stock, the
  // counts it replaces (409 STOCK_CHANGED when a claim moved them).
  updateGift: (id: string, payload: Partial<GiftInput> & { expected_stock?: Pick<Gift, 'stock' | 'stock_by_size'> }) => putWithMessage<Gift>(`/rewards/gifts/${id}`, payload),
  deleteGift: (id: string) => del<{ deleted: true }>(`/rewards/gifts/${id}`),
  getClaims: (params: { status?: ClaimStatus; user_id?: string; search?: string } = {}) => get<GiftClaim[]>(`/rewards/claims${qs(params)}`),
  getRewardSettings: () => get<RewardSettings>('/rewards/settings'),
  updateRewardSettings: (payload: RewardSettingsInput) => putWithMessage<RewardSettings>('/rewards/settings', payload),

  // --- Gym contact details (admin); everyone reads them from getConfig ---
  getGymContact: () => get<GymContact>('/gym/contact'),
  updateGymContact: (payload: GymContact) => putWithMessage<GymContact>('/gym/contact', payload),

  // --- Sales and coupon codes (admin) ---
  getOffers: () => get<Offer[]>('/offers'),
  createOffer: (payload: OfferInput) => post<Offer>('/offers', payload),
  updateOffer: (id: string, payload: Partial<OfferInput>) => putWithMessage<Offer>(`/offers/${id}`, payload),
  getCoupons: () => get<Coupon[]>('/coupons'),
  createCoupon: (payload: CouponInput) => post<Coupon>('/coupons', payload),
  // The code and the use count are fixed; everything else can change.
  updateCoupon: (code: string, payload: Partial<Omit<CouponInput, 'code'>>) => putWithMessage<Coupon>(`/coupons/${encodeURIComponent(code)}`, payload),

  // --- Admin analytics ---
  getDashboardKPIs: () => get<AdminDashboardKPIs>('/analytics/dashboard')
};

/** Download an authenticated file (e.g. the attendance CSV) without exposing the token in a URL. */
export async function downloadFile(url: string, filename: string): Promise<void> {
  const response = await fetch(url, { headers: authHeaders() });
  if (!response.ok) throw new ApiError(STATUS_MESSAGES[response.status] || 'Download failed.', response.status);
  await saveFile(await response.blob(), filename);
}

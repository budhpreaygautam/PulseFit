import { UserRole } from './types/index.js';

// Every page has a stable URL. Pages still navigate by tab id (setCurrentTab('schedule') /
// navigate('schedule')); the navigation context keeps the address bar, back/forward and
// refresh in step with it.

export type Access = 'public' | 'auth' | UserRole[];

export interface RouteDef {
  tab: string;
  path: string;
  title: string;
  access: Access;
}

export const ROUTES: RouteDef[] = [
  { tab: 'home', path: '/', title: 'Strength & Zumba gym in Gurugram', access: 'public' },
  { tab: 'workout', path: '/strength', title: 'Strength floor', access: 'public' },
  { tab: 'zumba', path: '/zumba', title: 'Zumba & Cardio studio', access: 'public' },
  { tab: 'guide', path: '/guide', title: 'Training plans & diets', access: 'public' },
  { tab: 'schedule', path: '/schedule', title: 'Class timetable', access: 'public' },
  { tab: 'pricing', path: '/pricing', title: 'Memberships', access: 'public' },
  { tab: 'trainers', path: '/coaches', title: 'Coaches', access: 'public' },
  { tab: 'exercise-library', path: '/exercises', title: 'Exercise library', access: 'public' },
  { tab: 'reset-password', path: '/reset-password', title: 'Reset your password', access: 'public' },
  { tab: 'privacy', path: '/privacy', title: 'Privacy policy', access: 'public' },
  { tab: 'terms', path: '/terms', title: 'Terms of service', access: 'public' },
  { tab: 'refunds', path: '/refund-policy', title: 'Refund & cancellation policy', access: 'public' },

  { tab: 'member-dashboard', path: '/dashboard', title: 'My dashboard', access: ['member'] },
  { tab: 'my-bookings', path: '/bookings', title: 'My bookings', access: ['member'] },
  { tab: 'workout-logger', path: '/log-workout', title: 'Log a workout', access: 'auth' },
  { tab: 'profile', path: '/profile', title: 'My account', access: 'auth' },

  // Admins open a coach's dashboard (?trainer=<id>) to take attendance for coaches without a login.
  { tab: 'trainer-dashboard', path: '/trainer', title: 'Coach dashboard', access: ['trainer', 'admin'] },

  { tab: 'admin-dashboard', path: '/admin', title: 'Admin dashboard', access: ['admin'] },
  { tab: 'admin-members', path: '/admin/members', title: 'Members', access: ['admin'] },
  { tab: 'admin-scanner', path: '/admin/check-in', title: 'Front-desk check-in', access: ['admin', 'trainer'] },
  { tab: 'admin-classes', path: '/admin/classes', title: 'Classes & coaches', access: ['admin'] },
  { tab: 'admin-plans', path: '/admin/plans', title: 'Plans & pricing', access: ['admin'] },
  { tab: 'admin-trials', path: '/admin/trials', title: 'Free-trial leads', access: ['admin'] }
];

export const NOT_FOUND_TAB = 'not-found';

// Old tab ids still used by some pages.
const ALIASES: Record<string, string> = { dashboard: 'member-dashboard' };

export function routeForTab(tab: string): RouteDef | undefined {
  const id = ALIASES[tab] || tab;
  return ROUTES.find(r => r.tab === id);
}

export function tabForPath(pathname: string): string {
  const clean = pathname.replace(/\/+$/, '') || '/';
  return ROUTES.find(r => r.path === clean)?.tab ?? NOT_FOUND_TAB;
}

export function canAccess(route: RouteDef, role: UserRole | null): boolean {
  if (route.access === 'public') return true;
  if (!role) return false;
  if (route.access === 'auth') return true;
  return route.access.includes(role);
}

/** Where each role lands after signing in. */
export function homeTabFor(role: UserRole): string {
  if (role === 'admin') return 'admin-dashboard';
  if (role === 'trainer') return 'trainer-dashboard';
  return 'member-dashboard';
}

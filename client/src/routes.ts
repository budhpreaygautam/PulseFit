import { UserRole } from './types/index.js';

// Every page has a stable URL. Pages still navigate by tab id (setCurrentTab('schedule') /
// navigate('schedule')); the navigation context keeps the address bar, back/forward and
// refresh in step with it.

export type Access = 'public' | 'auth' | UserRole[];

export interface RouteDef {
  tab: string;
  path: string;
  /** The page's name: announced to screen readers and used in "Sign in to open …". */
  title: string;
  /**
   * The browser tab and search-result title, when it should say more than `title` (where the gym
   * is, what the page offers). " · PulseFit Athletics" is added after it: keep it to 39 characters
   * so the whole title stays within 60.
   */
  searchTitle?: string;
  /** Search-result snippet and link preview text: plain text, 110–160 characters. */
  description: string;
  /** Whether search engines may index the page (and list it in the sitemap). */
  indexable: boolean;
  access: Access;
  /** A page of the Android/iOS app only: on the website its address is the missing page, as the server serves it. */
  appOnly?: boolean;
}

export const ROUTES: RouteDef[] = [
  {
    tab: 'home',
    path: '/',
    title: 'Strength & Zumba gym in Gurugram',
    description:
      'PulseFit Athletics in Sector 29, Gurugram: a Workout & Strength floor and a Zumba & Cardio studio, with coach-led classes you book in the app.',
    indexable: true,
    access: 'public'
  },
  // The six service pages need an account: a guest following a link to one is asked to sign in
  // instead (navigate in context/NavigationContext.tsx), and the API trims or refuses their data.
  {
    tab: 'workout',
    path: '/strength',
    title: 'Strength floor',
    searchTitle: 'Strength training gym in Gurugram',
    description:
      'Racks, barbells and free weights near Cyber Hub, Gurugram. Sign in for the weekly strength classes and the floor; members with a plan get a 4-day split.',
    indexable: false,
    access: 'auth'
  },
  {
    tab: 'zumba',
    path: '/zumba',
    title: 'Zumba & Cardio studio',
    searchTitle: 'Zumba & cardio classes in Gurugram',
    description:
      'High-energy Zumba and dance cardio in our own studio in Sector 29, Gurugram. See the weekly classes, what a class is like, and book a spot in the app.',
    indexable: false,
    access: 'auth'
  },
  {
    tab: 'guide',
    path: '/guide',
    title: 'Training plans & diets',
    searchTitle: 'Workout plans & Indian diet charts',
    description:
      'Workout splits, high-protein Indian diet charts and a supplements guide from PulseFit Athletics, Gurugram, included with every membership plan.',
    indexable: false,
    access: 'auth'
  },
  {
    tab: 'schedule',
    path: '/schedule',
    title: 'Class timetable',
    searchTitle: 'Gym class timetable & booking',
    description:
      'Workout & Strength and Zumba & Cardio classes at PulseFit, Gurugram, Monday to Saturday, with spots left for each date. Members book 14 days ahead.',
    indexable: false,
    access: 'auth'
  },
  {
    tab: 'pricing',
    path: '/pricing',
    title: 'Memberships',
    searchTitle: 'Gym membership plans in Gurugram',
    description:
      'Compare the three PulseFit Athletics membership plans in Gurugram, priced in rupees with no sign-up fee. Pay monthly, or once for a full year.',
    indexable: false,
    access: 'auth'
  },
  {
    tab: 'trainers',
    path: '/coaches',
    title: 'Coaches',
    searchTitle: 'Strength & Zumba coaches',
    description:
      'Meet the coaches who run every Workout & Strength and Zumba & Cardio class on the PulseFit Athletics timetable in Sector 29, Gurugram.',
    indexable: false,
    access: 'auth'
  },
  {
    tab: 'exercise-library',
    path: '/exercises',
    title: 'Exercise library',
    description:
      'How to perform each movement on the PulseFit floor and which muscles it works. Search, or filter the exercises by muscle group, equipment and level.',
    indexable: true,
    access: 'public'
  },
  {
    tab: 'contact',
    path: '/contact',
    title: 'Contact us',
    searchTitle: 'Contact & membership enquiries',
    description:
      'Ask PulseFit Athletics in Sector 29, Gurugram about memberships, classes or a free trial. Leave your number and our front desk will call you back.',
    indexable: true,
    access: 'public'
  },
  {
    tab: 'reset-password',
    path: '/reset-password',
    title: 'Reset your password',
    description:
      'Choose a new password for your PulseFit Athletics account from the reset link we emailed you, then sign in again on the website or in the app.',
    indexable: false,
    access: 'public'
  },
  // Public, so a YouPI payment started in the app and finished in the phone's browser lands somewhere useful.
  {
    tab: 'payment-status',
    path: '/payment-status',
    title: 'Payment status',
    description:
      'Whether your PulseFit Athletics membership payment went through, and what to do next if it is still pending or did not complete.',
    indexable: false,
    access: 'public'
  },
  {
    tab: 'privacy',
    path: '/privacy',
    title: 'Privacy policy',
    description:
      'What personal data PulseFit Athletics collects and why, who can see it, how long we keep it, how we protect it, and the rights you have over it.',
    indexable: true,
    access: 'public'
  },
  {
    tab: 'terms',
    path: '/terms',
    title: 'Terms of service',
    description:
      'The rules for using the PulseFit Athletics gym in Gurugram, the website and your membership: accounts, class bookings, free trials and conduct.',
    indexable: true,
    access: 'public'
  },
  {
    tab: 'refunds',
    path: '/refund-policy',
    title: 'Refund & cancellation policy',
    description:
      'How online payments, cancellations, membership freezes and refunds work at PulseFit Athletics, Gurugram, and how refunds are paid back to you.',
    indexable: true,
    access: 'public'
  },
  // The app's own pages, opened from its menu drawer; the website has none and shows its 404.
  {
    tab: 'offers',
    path: '/offers',
    title: 'Offers & gifts',
    description:
      'The PulseFit Athletics sales running now and their time left, the welcome gifts that come with each plan, and how points and milestone gifts work.',
    indexable: false,
    access: 'public',
    appOnly: true
  },
  {
    tab: 'visit',
    path: '/visit',
    title: 'Visit us',
    description:
      'Where PulseFit Athletics is in Sector 29, Gurugram, with directions, phone and email, and the opening hours: Monday to Saturday, closed on Sundays.',
    indexable: false,
    access: 'public',
    appOnly: true
  },
  {
    tab: 'policies',
    path: '/policies',
    title: 'Policies & terms',
    description:
      'The PulseFit Athletics privacy policy, terms of service and refund policy on one page, how to delete your account and data, and who to contact.',
    indexable: false,
    access: 'public',
    appOnly: true
  },

  {
    tab: 'member-dashboard',
    path: '/dashboard',
    title: 'My dashboard',
    description:
      'Your PulseFit Athletics member dashboard: your membership, upcoming class bookings, notes from your coach and your recent check-ins at the gym.',
    indexable: false,
    access: ['member']
  },
  {
    tab: 'my-bookings',
    path: '/bookings',
    title: 'My bookings',
    description:
      'The PulseFit Athletics classes you have booked, upcoming and past, with the option to cancel a booking you can no longer make it to.',
    indexable: false,
    access: ['member']
  },
  {
    tab: 'workout-logger',
    path: '/log-workout',
    title: 'Log a workout',
    description:
      'Record the exercises, sets, reps and weights of a training session at PulseFit Athletics, with a rest timer and your saved workout history.',
    indexable: false,
    access: 'auth'
  },
  {
    tab: 'rewards',
    path: '/rewards',
    title: 'Rewards',
    description:
      'Your PulseFit Athletics points from check-ins and workouts, gifts for milestones, the gift store with pickup codes, and your code to refer a friend.',
    indexable: false,
    access: ['member']
  },
  // The app's Pass tab (pages/member/PassPage.tsx); the website has no pass page and shows its 404.
  {
    tab: 'pass',
    path: '/pass',
    title: 'My pass',
    description:
      'Your PulseFit Athletics entry pass: the QR code the front desk scans to check you in, with your member ID, your plan and its status.',
    indexable: false,
    access: ['member'],
    appOnly: true
  },
  {
    tab: 'profile',
    path: '/profile',
    title: 'My account',
    description:
      'Your PulseFit Athletics account: personal details, membership pass, invoices and billing, and changing your password.',
    indexable: false,
    access: 'auth'
  },

  // Admins open a coach's dashboard (?trainer=<id>) to take attendance for coaches without a login.
  {
    tab: 'trainer-dashboard',
    path: '/trainer',
    title: 'Coach dashboard',
    description:
      'The PulseFit Athletics coach dashboard: classes for the next 7 days, attendance for the last 14 days, and notes for the members you coach.',
    indexable: false,
    access: ['trainer', 'admin']
  },

  {
    tab: 'admin-dashboard',
    path: '/admin',
    title: 'Admin dashboard',
    description:
      'PulseFit Athletics gym overview for staff: active members, revenue, check-ins today, class fill rate, retention and free trials this month.',
    indexable: false,
    access: ['admin']
  },
  {
    tab: 'admin-members',
    path: '/admin/members',
    title: 'Members',
    description:
      "PulseFit Athletics member accounts for staff: search by name, email, phone or pass code, and manage each member's plan, access and account.",
    indexable: false,
    access: ['admin']
  },
  {
    tab: 'admin-id-cards',
    path: '/admin/id-cards',
    title: 'ID cards',
    description:
      'The physical PulseFit Athletics ID cards handed out at the front desk: find a card by name, email, phone or number, issue one or deactivate it.',
    indexable: false,
    access: ['admin']
  },
  {
    tab: 'admin-scanner',
    path: '/admin/check-in',
    title: 'Front-desk check-in',
    description:
      'Check members in at the PulseFit Athletics front desk: scan a QR pass or ID card, or type a pass code, card number, email or free-trial code.',
    indexable: false,
    access: ['admin', 'trainer']
  },
  {
    tab: 'admin-classes',
    path: '/admin/classes',
    title: 'Classes & coaches',
    description:
      "The PulseFit Athletics weekly class timetable and coaching team, managed by staff, with booking counts for each class's next session.",
    indexable: false,
    access: ['admin']
  },
  {
    tab: 'admin-plans',
    path: '/admin/plans',
    title: 'Plans & rewards',
    description:
      'The PulseFit Athletics membership plans, gift catalogue and gift pickups, managed by staff, behind checkout, the member Rewards page and the front desk.',
    indexable: false,
    access: ['admin']
  },
  {
    tab: 'admin-trials',
    path: '/admin/trials',
    title: 'Leads',
    description:
      'New enquiries from the contact page and free-trial claims at PulseFit Athletics, newest first. Staff mark each enquiry contacted or closed.',
    indexable: false,
    access: ['admin']
  }
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

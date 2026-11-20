import type React from 'react';
import { Activity, BarChart3, CalendarCheck, CalendarDays, ClipboardList, House, KeyRound, Mail, QrCode, ScanLine, UserRound, Users } from 'lucide-react';
import type { User, UserRole } from '../../types/index.js';

// The app's bottom tabs. No React components here, so the navigation context can import it.

type TabIcon = React.ComponentType<{ className?: string }>;

/** A tab opens a page; an action tab (the guests' Sign in) is a button that opens a dialog. */
export type AppTab = { tab: string; label: string; icon: TabIcon } | { action: 'sign-in'; label: string; icon: TabIcon };

export const MEMBER_TABS: AppTab[] = [
  { tab: 'home', label: 'Home', icon: House },
  { tab: 'schedule', label: 'Classes', icon: CalendarDays },
  { tab: 'pass', label: 'Pass', icon: QrCode },
  { tab: 'profile', label: 'Me', icon: UserRound }
];

// Classes and Pass need an account, so guests get Contact and Sign in instead.
export const GUEST_TABS: AppTab[] = [
  { tab: 'home', label: 'Home', icon: House },
  { tab: 'contact', label: 'Contact', icon: Mail },
  { action: 'sign-in', label: 'Sign in', icon: KeyRound }
];

const STAFF_TABS: Record<Exclude<UserRole, 'member'>, AppTab[]> = {
  trainer: [
    { tab: 'trainer-dashboard', label: 'Today', icon: Activity },
    { tab: 'admin-scanner', label: 'Check-in', icon: ScanLine },
    { tab: 'schedule', label: 'Classes', icon: CalendarDays },
    { tab: 'profile', label: 'Me', icon: UserRound }
  ],
  // The admin is the gym owner: check-in is the front desk's job, so it stays in their drawer.
  admin: [
    { tab: 'admin-dashboard', label: 'Dashboard', icon: BarChart3 },
    { tab: 'admin-members', label: 'Members', icon: Users },
    { tab: 'admin-trials', label: 'Leads', icon: ClipboardList },
    { tab: 'admin-classes', label: 'Classes', icon: CalendarCheck }
  ]
};

/** The account's tabs; none while the session is restoring. */
export function tabsFor(user: User | null, isInitializing: boolean): AppTab[] {
  if (isInitializing) return [];
  if (!user) return GUEST_TABS;
  return user.role === 'member' ? MEMBER_TABS : STAFF_TABS[user.role];
}

/** The first tab's page: where the app bar's Back goes with no earlier page, and where staff start the app. */
export function firstTab(tabs: AppTab[]): string {
  const first = tabs[0];
  return first && 'tab' in first ? first.tab : 'home';
}

// A tab's own in-page query (Me's sections, the Members status filter) keeps it open.
const SECTION_QUERY: Record<string, string> = { profile: 'tab', 'admin-members': 'status' };

/** True on a tab's own page: without a query, or with only its section query (Me's ?tab=billing). */
export function isTabOpen(tabs: AppTab[], tab: string, params: URLSearchParams): boolean {
  return tabs.some(t => 'tab' in t && t.tab === tab) && [...params.keys()].every(key => key === SECTION_QUERY[tab]);
}

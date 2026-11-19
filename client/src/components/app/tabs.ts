import type React from 'react';
import { Calendar, Dumbbell, House, KeyRound, MessageCircle, QrCode, User } from 'lucide-react';

// The app's bottom tabs. No React components here, so the navigation context can import it.

type TabIcon = React.ComponentType<{ className?: string }>;

/** A tab opens a page; an action tab (the guests' Sign in) is a button that opens a dialog. */
export type AppTab = { tab: string; label: string; icon: TabIcon } | { action: 'sign-in'; label: string; icon: TabIcon };

export const MEMBER_TABS: AppTab[] = [
  { tab: 'member-dashboard', label: 'Home', icon: House },
  { tab: 'schedule', label: 'Classes', icon: Calendar },
  { tab: 'pass', label: 'Pass', icon: QrCode },
  { tab: 'workout-logger', label: 'Train', icon: Dumbbell },
  { tab: 'profile', label: 'Me', icon: User }
];

/** A signed-out app once the guest chose Explore first (or opened Contact us) on the welcome panel. */
export const GUEST_TABS: AppTab[] = [
  { tab: 'home', label: 'Explore', icon: House },
  { tab: 'contact', label: 'Contact', icon: MessageCircle },
  { action: 'sign-in', label: 'Sign in', icon: KeyRound }
];

/**
 * True on a tab's own screen, which gets no title bar. A query makes it a sub-screen (a deep link,
 * a section of Me), except on Me where only an open section (?tab=) does.
 */
export function isTabRoot(tabs: AppTab[], tab: string, params: URLSearchParams): boolean {
  if (!tabs.some(t => 'tab' in t && t.tab === tab)) return false;
  return tab === 'profile' ? !params.has('tab') : params.toString() === '';
}

/** How the app animates opening a page: a tab's own screen cross-fades, anything else slides in. */
export function navKindFor(tab: string, params: URLSearchParams): 'tab' | 'push' {
  return isTabRoot(MEMBER_TABS, tab, params) || isTabRoot(GUEST_TABS, tab, params) ? 'tab' : 'push';
}

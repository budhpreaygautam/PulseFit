import React from 'react';
import { BadgeIndianRupee, BookOpen, Dumbbell, Medal, Music2, Salad } from 'lucide-react';
import { useNavigation } from '../../context/NavigationContext.js';
import { TabLink } from '../public/TabLink.js';

/** A gym service as the app shows it: the page it opens, its icon and label, and a line about it. */
export interface Service {
  tab: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  description: string;
}

/** The gym's services, with Me's Explore icons and labels and words from the landing and service pages. */
export const SERVICES: Service[] = [
  { tab: 'workout', label: 'Strength floor', icon: Dumbbell, description: 'Racks, barbells and free weights, with coach-led strength classes.' },
  { tab: 'zumba', label: 'Zumba studio', icon: Music2, description: 'High-energy dance cardio in our own studio. No dance experience needed.' },
  { tab: 'trainers', label: 'Coaches', icon: Medal, description: 'The people who run every Workout & Strength and Zumba & Cardio class.' },
  { tab: 'guide', label: 'Plans & diets', icon: Salad, description: 'Workout splits, high-protein Indian diet charts and a supplements guide.' },
  { tab: 'exercise-library', label: 'Exercises', icon: BookOpen, description: 'How to perform each movement on our floor, and which muscles it works.' },
  { tab: 'pricing', label: 'Memberships', icon: BadgeIndianRupee, description: 'Pay monthly, or once for a full year. No sign-up fee.' }
];

/**
 * The services as a 3×2 grid of icon tiles (the welcome screen, member Home). Each opens its page;
 * a guest tapping one that needs an account gets the sign-in dialog, then the page.
 */
export const ServiceTiles: React.FC = () => {
  const { navigate } = useNavigation();
  return (
    <ul className="grid grid-cols-3 gap-2.5">
      {SERVICES.map(({ tab, label, icon: Icon }) => (
        <li key={tab}>
          {/* overflow-wrap:anywhere lets a one-word label wrap inside its tile with large system text. */}
          <TabLink
            tab={tab}
            navigate={navigate}
            className="app-press app-glass h-full min-h-[72px] rounded-[18px] px-1 py-3 flex flex-col items-center justify-center gap-1.5 text-center text-[11px] font-bold leading-tight [overflow-wrap:anywhere] text-[color:var(--app-tx2)]"
          >
            <Icon className="w-[18px] h-[18px] text-[color:var(--app-lime)]" aria-hidden="true" />
            {label}
          </TabLink>
        </li>
      ))}
    </ul>
  );
};

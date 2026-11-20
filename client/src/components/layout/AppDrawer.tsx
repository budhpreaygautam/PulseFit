import React, { useRef } from 'react';
import { Dumbbell, LogOut, Moon, Sun, X } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.js';
import { useTheme } from '../../context/ThemeContext.js';
import { tierLabel } from '../../lib/format.js';
import { prefersReducedMotion } from '../../lib/appMotion.js';
import { useModalFocus } from '../common/Modal.js';
import { MembershipStatusBadge } from '../member/MembershipStatusBadge.js';
import { avatarOf } from '../member/avatarImage.js';
import { TabLink } from '../public/TabLink.js';
import { VisitUs, footerLinks } from './Footer.js';
import type { NavItem } from './Navbar.js';

interface AppDrawerProps {
  currentTab: string;
  /** Opens a page. The drawer is removed at once (Navbar's go), before a page slide captures the screen. */
  navigate: (tab: string) => void;
  /** Removes the drawer once it has slid away (scrim, swipe, Escape, Android Back). */
  onClose: () => void;
  /** The website menu's own lists, as Navbar shows them. */
  menuLinks: NavItem[];
  roleLinks: NavItem[];
  roleLabel?: string;
  onSignIn: () => void;
  onJoin: () => void;
  onLogout: () => void;
}

interface Drag {
  x: number;
  y: number;
  /** How far left the panel has been pulled (0 or less). */
  dx: number;
  /** When it last moved, and how fast (px/ms; negative is leftwards). */
  time: number;
  speed: number;
  horizontal?: boolean;
}

const STAFF_ROLE: Record<string, string> = { trainer: 'Coach', admin: 'Admin' };
const SECTION = 'text-[10px] font-mono uppercase tracking-wider text-slate-500 px-4 pt-3 pb-1 font-bold';
const FOCUS = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-lime-500';
// Material's navigation-drawer rows: a full-width pill, tinted lime behind the open page.
const rowClass = (active: boolean) =>
  `w-full h-12 px-4 rounded-full flex items-center gap-3.5 text-sm font-bold text-left transition-colors ${FOCUS} ${
    active ? 'bg-lime-500/20 text-lime-400' : 'text-slate-200'
  }`;

/**
 * The app's menu: a drawer from the left over a dimmed page, instead of the website's menu panel, with
 * the footer's links too (the app has no footer). A modal dialog: focus moves in and stays in, and
 * Escape (Android Back sends it), the scrim or a swipe left closes it.
 */
export const AppDrawer: React.FC<AppDrawerProps> = ({ currentTab, navigate, onClose, menuLinks, roleLinks, roleLabel, onSignIn, onJoin, onLogout }) => {
  const { user, isInitializing } = useAuth();
  const { isDark, toggleTheme } = useTheme();
  const panelRef = useRef<HTMLDivElement>(null);
  const scrimRef = useRef<HTMLDivElement>(null);
  const closing = useRef(false);
  const drag = useRef<Drag | null>(null);

  // Slides away from wherever it is (mid-swipe too), then is removed.
  const close = () => {
    const panel = panelRef.current;
    const scrim = scrimRef.current;
    if (closing.current || !panel || !scrim) return;
    closing.current = true;
    if (prefersReducedMotion()) return onClose();
    const timing: KeyframeAnimationOptions = { duration: 200, easing: 'cubic-bezier(0.4, 0, 1, 1)', fill: 'forwards' };
    scrim.animate({ opacity: 0 }, timing);
    panel.animate({ transform: 'translateX(-100%)' }, timing).finished.then(onClose, () => undefined);
  };
  useModalFocus(panelRef, true, close);

  const springBack = () => {
    const panel = panelRef.current!;
    const scrim = scrimRef.current!;
    const timing = { duration: prefersReducedMotion() ? 0 : 200, easing: 'cubic-bezier(0, 0, 0.2, 1)' };
    panel.animate([{ transform: panel.style.transform }, { transform: 'none' }], timing);
    scrim.animate([{ opacity: scrim.style.opacity }, { opacity: 1 }], timing);
    panel.style.transform = scrim.style.opacity = '';
  };

  // Dragged left it follows the finger; let go past 30% of its width, or flung, it closes, else it springs back.
  const onTouchStart = (e: React.TouchEvent) => {
    // A second finger mid-swipe ends that swipe: the drawer goes back in place rather than stay half out.
    if (drag.current?.horizontal && !closing.current) springBack();
    const touch = e.touches[0];
    drag.current = e.touches.length === 1 ? { x: touch.clientX, y: touch.clientY, dx: 0, time: e.timeStamp, speed: 0 } : null;
  };
  const onTouchMove = (e: React.TouchEvent) => {
    const d = drag.current;
    const panel = panelRef.current;
    const scrim = scrimRef.current;
    if (!d || !panel || !scrim || closing.current) return;
    const moveX = e.touches[0].clientX - d.x;
    const moveY = e.touches[0].clientY - d.y;
    if (d.horizontal === undefined) {
      if (Math.max(Math.abs(moveX), Math.abs(moveY)) < 10) return;
      // An up-or-down start is the drawer's own scrolling.
      d.horizontal = Math.abs(moveX) > Math.abs(moveY);
    }
    if (!d.horizontal) return;
    const dx = Math.min(0, moveX);
    d.speed = (dx - d.dx) / Math.max(1, e.timeStamp - d.time);
    d.dx = dx;
    d.time = e.timeStamp;
    panel.style.transform = `translateX(${dx}px)`;
    scrim.style.opacity = String(Math.max(0, 1 + dx / panel.offsetWidth));
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    const d = drag.current;
    drag.current = null;
    if (!d?.horizontal || closing.current) return;
    const flung = d.speed < -0.5 && e.timeStamp - d.time < 100;
    if (flung || -d.dx > panelRef.current!.offsetWidth * 0.3) close();
    else springBack();
  };

  const menuLink = (link: NavItem) => {
    const active = currentTab === link.tab;
    return (
      <TabLink key={link.tab} tab={link.tab} navigate={navigate} isCurrent={active} className={rowClass(active)}>
        <link.icon className={`w-[18px] h-[18px] shrink-0 ${active ? 'text-lime-400' : 'text-slate-400'}`} aria-hidden="true" />
        {link.label}
      </TabLink>
    );
  };
  const shown = new Set([...menuLinks, ...roleLinks].map(link => link.tab));
  // The footer's links that are nowhere above, each once (Set.add returns the set, so it is kept).
  const moreLinks = footerLinks(user).filter(link => !shown.has(link.tab) && shown.add(link.tab));
  const signedIn = user && !isInitializing ? user : null;

  return (
    <div className="fixed inset-0 z-50">
      <div ref={scrimRef} className="app-drawer-scrim absolute inset-0 bg-black/50" aria-hidden="true" onClick={close} />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Menu"
        tabIndex={-1}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onTouchCancel={onTouchEnd}
        className="app-drawer absolute inset-y-0 left-0 w-[calc(min(85vw,320px)_+_env(safe-area-inset-left))] overflow-y-auto overscroll-contain touch-pan-y bg-gym-950 rounded-r-3xl shadow-[12px_0_30px_rgba(0,0,0,0.3)] outline-none pt-[calc(env(safe-area-inset-top)_+_1rem)] pb-[calc(env(safe-area-inset-bottom)_+_1rem)] pl-[calc(env(safe-area-inset-left)_+_0.625rem)] pr-2.5"
      >
        <div className="neu-flat rounded-2xl p-3 flex items-start gap-3">
          {signedIn ? (
            <>
              <img
                src={avatarOf(signedIn)}
                alt=""
                width={48}
                height={48}
                decoding="async"
                className="w-12 h-12 rounded-2xl object-cover bg-slate-800 border-2 border-lime-500/50 shrink-0"
              />
              <div className="min-w-0 flex-1 space-y-1">
                <p className="font-black text-slate-100 font-heading break-words leading-tight">{signedIn.name}</p>
                {signedIn.role === 'member' ? (
                  <>
                    <p className="text-xs text-slate-400 leading-snug">{tierLabel(signedIn.membership_tier)}</p>
                    <MembershipStatusBadge status={signedIn.membership_status} />
                  </>
                ) : (
                  <p className="text-xs text-slate-400">{STAFF_ROLE[signedIn.role]}</p>
                )}
              </div>
            </>
          ) : (
            <div className="min-w-0 flex-1 flex items-center gap-2.5 self-center">
              <span className="w-10 h-10 rounded-2xl flex items-center justify-center neu-btn-lime shrink-0">
                <Dumbbell className="w-5 h-5 stroke-[2.5]" aria-hidden="true" />
              </span>
              <span className="text-lg font-black tracking-tight text-slate-100 font-heading">
                PULSE<span className="text-lime-400">FIT</span>
              </span>
            </div>
          )}
          <button type="button" onClick={close} aria-label="Close menu" className="neu-icon-btn p-2 text-slate-300 shrink-0">
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>

        {!user && !isInitializing && (
          <div className="mt-3 grid grid-cols-2 gap-2 px-1">
            <button type="button" onClick={onSignIn} className="neu-btn h-11 rounded-xl text-sm font-bold text-slate-200">
              Sign in
            </button>
            <button type="button" onClick={onJoin} className="neu-btn-lime h-11 rounded-xl text-sm font-black">
              Join
            </button>
          </div>
        )}

        <nav aria-label="Main" className="mt-2">
          <div className={SECTION}>Explore PulseFit</div>
          {menuLinks.map(menuLink)}
        </nav>

        {roleLabel && (
          <nav aria-label={roleLabel}>
            <div className={SECTION}>{roleLabel}</div>
            {roleLinks.map(menuLink)}
          </nav>
        )}

        <div className={SECTION}>Settings</div>
        <button type="button" onClick={toggleTheme} className={rowClass(false)}>
          {isDark ? <Sun className="w-[18px] h-[18px] text-amber-400" aria-hidden="true" /> : <Moon className="w-[18px] h-[18px] text-slate-400" aria-hidden="true" />}
          {isDark ? 'Switch to light theme' : 'Switch to dark theme'}
        </button>
        {signedIn && (
          <button type="button" onClick={onLogout} className={rowClass(false)}>
            <LogOut className="w-[18px] h-[18px] text-rose-400" aria-hidden="true" />
            Sign out
          </button>
        )}

        <div className="mt-3 mx-4 pt-3 border-t border-slate-800/80 space-y-4">
          {moreLinks.length > 0 && (
            <nav aria-label="More" className="flex flex-wrap gap-x-4 text-xs">
              {moreLinks.map(link => (
                <TabLink
                  key={link.tab}
                  tab={link.tab}
                  navigate={navigate}
                  isCurrent={currentTab === link.tab}
                  className={`py-1.5 rounded font-semibold ${FOCUS} ${currentTab === link.tab ? 'text-lime-400' : 'text-slate-400'}`}
                >
                  {link.label}
                </TabLink>
              ))}
            </nav>
          )}
          <VisitUs />
        </div>
      </div>
    </div>
  );
};

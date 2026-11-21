// The app's cartoons: the contract between the app and the art. The art itself lives in the private,
// git-ignored client/app-art/ folder (module `@app-art`); without it a stand-in module is used.
import ids from './app-art-ids.json';

export type MomentKind =
  | 'booked' | 'cancelled' | 'checkedIn' | 'clockedIn' | 'clockedOut' | 'workoutLogged' | 'saved'
  | 'paid' | 'giftClaimed' | 'giftCollected' | 'milestone' | 'shared' | 'deleted' | 'signedIn'
  | 'signedUp' | 'signedOut' | 'frozen' | 'failed' | 'info';
export type StateName = 'loading' | 'empty1' | 'empty2' | 'empty3' | 'error' | 'offline' | 'launch' | 'notFound';
export type SceneId = `page.${string}` | `moment.${MomentKind}` | `state.${StateName}`;

/** An svg scene's still frame is its CSS paused at 0 s. */
export type Scene = { kind: 'svg'; svg: string; css: string } | { kind: 'lottie'; data: object; stillFrame: number };

export interface ArtCredit {
  ids: SceneId[];
  title: string;
  creator: string;
  source: string;
  licence: 'Storyset free licence' | 'Lottie Simple License' | 'AI Horde + FLUX.1 [schnell] (Apache-2.0)';
}

export const PAGE_TABS: readonly string[] = ids.pages;
export const ALL_SCENE_IDS: readonly SceneId[] = [
  ...ids.pages.map(p => `page.${p}` as SceneId),
  ...ids.moments.map(m => `moment.${m}` as SceneId),
  ...ids.states.map(s => `state.${s}` as SceneId)
];

/** One of the three empty-state scenes, always the same one for the same key. */
export function emptyScene(key: string): SceneId {
  let h = 0;
  for (const c of key) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return `state.empty${(h % 3) + 1}` as SceneId;
}

export function momentFor(type: 'success' | 'error' | 'info' | 'warning', kind?: MomentKind): MomentKind {
  return kind ?? (type === 'error' ? 'failed' : type === 'success' ? 'saved' : 'info');
}

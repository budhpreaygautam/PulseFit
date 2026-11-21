// Stand-in for the private client/app-art/ folder: a plain circle for every scene. Debug builds and
// the e2e build use it; the release build refuses it (scripts/android-release.mjs).
import { ALL_SCENE_IDS, type ArtCredit, type Scene, type SceneId } from '../lib/appArt';

export const marker: 'pulsefit-app-art' | 'pulsefit-app-art-stub' = 'pulsefit-app-art-stub';

const STAND_IN = '<svg viewBox="0 0 10 10" data-stand-in><circle cx="5" cy="5" r="4"/></svg>';

export async function loadScene(id: SceneId): Promise<Scene | null> {
  if (import.meta.env.MODE === 'e2e' && (window as unknown as { __appArtFail?: boolean }).__appArtFail) {
    throw new Error('app art failed (test switch)');
  }
  return ALL_SCENE_IDS.includes(id) ? { kind: 'svg', svg: STAND_IN, css: '' } : null;
}

export async function loadLottie(): Promise<{
  loadAnimation(params: object): {
    goToAndStop(f: number, isFrame: boolean): void;
    play(): void;
    pause(): void;
    destroy(): void;
  };
}> {
  throw new Error('no animations in the stand-in art');
}

export const credits: ArtCredit[] = [
  { ids: [], title: 'Stand-in', creator: 'PulseFit', source: 'none', licence: 'Storyset free licence' },
  { ids: [], title: 'Stand-in', creator: 'PulseFit', source: 'none', licence: 'Lottie Simple License' },
  { ids: [], title: 'Stand-in mascot', creator: 'PulseFit', source: 'https://example.com/mascot', licence: 'AI Horde + FLUX.1 [schnell] (Apache-2.0)' }
];

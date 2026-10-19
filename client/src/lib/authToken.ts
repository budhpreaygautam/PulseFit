import { SecureStorage } from '@aparajita/capacitor-secure-storage';
import { isNativeApp } from './native.js';
import { storage } from './storage.js';

// Where the session lives:
// - Website: an httpOnly cookie set by the API. Page scripts never see the token; localStorage only
//   keeps a "signed in" marker so the app knows whether to restore a session on load.
// - Android/iOS app: a bearer token, kept in memory and in the Android Keystore / iOS Keychain.

const SECURE_KEY = 'pulsefit_session';
const SIGNED_IN_KEY = 'pulsefit_signed_in';
const LEGACY_TOKEN_KEY = 'pulsefit_token';

let token: string | null = null;

// Never return a Capacitor plugin from an async function or a promise: awaiting it calls the
// plugin's (missing) native `then` method.

/** Load the app's saved token before the first render (no-op on the website). */
export async function loadAuthToken(): Promise<void> {
  // Tokens from older versions were kept in localStorage: never leave one there.
  storage.remove(LEGACY_TOKEN_KEY);
  if (!isNativeApp) return;
  try {
    token = await SecureStorage.getItem(SECURE_KEY);
  } catch {
    token = null;
  }
}

/** The bearer token to send (the apps only; null on the website). */
export const getAuthToken = (): string | null => token;

/** Whether a session may exist and is worth restoring on load. */
export const hasSavedSession = (): boolean => (isNativeApp ? token !== null : storage.get(SIGNED_IN_KEY) === '1');

export function rememberSession(newToken: string | undefined): void {
  if (!isNativeApp) {
    storage.set(SIGNED_IN_KEY, '1');
    return;
  }
  if (!newToken) return;
  token = newToken;
  SecureStorage.setItem(SECURE_KEY, newToken).catch(() => undefined);
}

export function forgetSession(): void {
  storage.remove(SIGNED_IN_KEY);
  if (!isNativeApp) return;
  token = null;
  SecureStorage.removeItem(SECURE_KEY).catch(() => undefined);
}

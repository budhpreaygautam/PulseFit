import { isNativeApp } from './native.js';
import { storage } from './storage.js';

/**
 * True inside the Android/iOS app, where members get the app shell (tab bar, no website header or
 * footer). In a browser only an e2e build (vite build --mode e2e) honours the test switch: production
 * builds fold the MODE check to false, so the switch and its key never reach them.
 */
export const isAppMode: boolean = isNativeApp || (import.meta.env.MODE === 'e2e' && storage.get('pulsefit_test_app_mode') === '1');

/**
 * True on the app's first launch only (the welcome slides show once): the flag is kept on the phone
 * the moment the app starts, whatever happens next. Always false on the website.
 */
export const isFirstLaunch: boolean = isAppMode && storage.get('pulsefit_welcome_seen') !== '1';
if (isAppMode) storage.set('pulsefit_welcome_seen', '1');

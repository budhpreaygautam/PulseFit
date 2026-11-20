import { isNativeApp } from './native.js';
import { storage } from './storage.js';

/**
 * True inside the Android/iOS app, which shows the website with page animations and no "Get the app"
 * offers. In a browser only an e2e build (vite build --mode e2e) honours the test switch: production
 * builds fold the MODE check to false, so the switch and its key never reach them.
 */
export const isAppMode: boolean = isNativeApp || (import.meta.env.MODE === 'e2e' && storage.get('pulsefit_test_app_mode') === '1');

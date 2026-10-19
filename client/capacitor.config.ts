import fs from 'node:fs';
import type { CapacitorConfig } from '@capacitor/cli';

// The API address the app bundle was built against: set by scripts/mobile-sync.mjs, and remembered
// in .mobile-api-url so a later plain `npx cap sync/copy/run` keeps the same native settings.
// The Capacitor CLI runs from client/ (where this file is), so the relative path resolves there.
const rememberedApiUrl = (() => {
  try {
    return fs.readFileSync('.mobile-api-url', 'utf8').trim();
  } catch {
    return '';
  }
})();
const apiUrl = process.env.VITE_API_URL || rememberedApiUrl;
// Plain http is only for testing against this PC (http://localhost over adb reverse, or --lan); a
// release build uses https.
const plainHttpApi = apiUrl.startsWith('http://');

const config: CapacitorConfig = {
  appId: 'com.pulsefit.app',
  appName: 'PulseFit',
  webDir: 'dist-mobile',
  server: {
    androidScheme: 'https',
    cleartext: plainHttpApi
  },
  android: {
    allowMixedContent: plainHttpApi
  },
  plugins: {
    SystemBars: {
      // 'native' keeps env(safe-area-inset-*) correct; 'css' also injects variables the app does not
      // use, and logs errors when it runs before the page exists.
      insetsHandling: 'native',
      initialViewportFitValueHint: 'cover'
    }
  }
};

export default config;

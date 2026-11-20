import React, { useEffect, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { API_BASE } from '../../api/client.js';
import { useAuth } from '../../context/AuthContext.js';
import { useAppConfig } from '../../context/ConfigContext.js';
import { isAppMode } from '../../lib/appMode.js';
import { storage } from '../../lib/storage.js';
import { ConfirmDialog } from '../common/ConfirmDialog.js';

// The Android app comes from the website, not a store, so nothing else tells people a new one is out.
// When GET /api/config offers a higher versionCode (pulsefit.json on the server) than the installed
// app's, the app asks once per start. Update now opens the APK in the phone's browser (Capacitor hands
// links to other sites to it), and Android installs it over this app, keeping the sign-in.

/** The installed app's versionCode, or null where there is nothing to update (the website, iOS). */
async function installedVersionCode(): Promise<number | null> {
  // An e2e build stands in for the installed app with a test switch; production builds fold this away.
  if (import.meta.env.MODE === 'e2e') return (isAppMode && Number(storage.get('pulsefit_test_app_build'))) || null;
  if (Capacitor.getPlatform() !== 'android') return null;
  const { App } = await import('@capacitor/app');
  return Number((await App.getInfo()).build) || null;
}

export const AppUpdatePrompt: React.FC = () => {
  const offered = useAppConfig().config.androidApp;
  const { user } = useAuth();
  const [installed, setInstalled] = useState<number | null>(null);
  const [later, setLater] = useState(false);

  useEffect(() => {
    installedVersionCode().then(setInstalled, () => setInstalled(null));
  }, []);

  if (!offered?.versionCode || !installed || offered.versionCode <= installed) return null;
  // Absolute: inside the app the page's own origin is not the server's.
  const url = new URL(offered.url, new URL(API_BASE, window.location.href)).href;
  return (
    <ConfirmDialog
      isOpen={!later}
      title="Update available"
      message={
        <>
          {offered.version ? `PulseFit ${offered.version}` : 'A new version of PulseFit'} is ready. Download it, then open the
          file: your phone installs it over this app{user ? ', and you stay signed in' : ''}.
        </>
      }
      confirmLabel="Update now"
      cancelLabel="Later"
      onConfirm={() => window.location.assign(url)}
      onClose={() => setLater(true)}
    />
  );
};

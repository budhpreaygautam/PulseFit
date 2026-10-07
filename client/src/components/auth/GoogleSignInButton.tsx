import React, { useEffect, useRef, useState } from 'react';
import { useAppConfig } from '../../context/ConfigContext.js';
import { useTheme } from '../../context/ThemeContext.js';

// "Continue with Google" via Google Identity Services. Google renders the button and hands
// back an ID token (credential) that the API verifies. Renders nothing when the server has
// no GOOGLE_CLIENT_ID configured.

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (options: { client_id: string; callback: (response: { credential: string }) => void; ux_mode?: 'popup' }) => void;
          renderButton: (element: HTMLElement, options: Record<string, unknown>) => void;
        };
      };
    };
  }
}

const GSI_SRC = 'https://accounts.google.com/gsi/client';
let gsiPromise: Promise<void> | null = null;

function loadGsi(): Promise<void> {
  if (window.google?.accounts?.id) return Promise.resolve();
  gsiPromise ??= new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = GSI_SRC;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      gsiPromise = null;
      reject(new Error('Could not load Google sign-in.'));
    };
    document.head.appendChild(script);
  });
  return gsiPromise;
}

interface GoogleSignInButtonProps {
  onCredential: (credential: string) => void;
  onError?: (message: string) => void;
}

export const GoogleSignInButton: React.FC<GoogleSignInButtonProps> = ({ onCredential, onError }) => {
  const { config } = useAppConfig();
  const { isDark } = useTheme();
  const containerRef = useRef<HTMLDivElement>(null);
  const callbackRef = useRef(onCredential);
  callbackRef.current = onCredential;
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const clientId = config.googleClientId;
    if (!clientId) return;
    let cancelled = false;
    loadGsi()
      .then(() => {
        if (cancelled || !containerRef.current || !window.google) return;
        window.google.accounts.id.initialize({ client_id: clientId, callback: r => callbackRef.current(r.credential), ux_mode: 'popup' });
        window.google.accounts.id.renderButton(containerRef.current, {
          theme: isDark ? 'filled_black' : 'outline',
          size: 'large',
          text: 'continue_with',
          shape: 'pill',
          width: Math.min(containerRef.current.offsetWidth || 320, 400)
        });
      })
      .catch(err => {
        setFailed(true);
        onError?.(err.message);
      });
    return () => {
      cancelled = true;
    };
  }, [config.googleClientId, isDark, onError]);

  if (!config.googleClientId || failed) return null;
  return <div ref={containerRef} className="w-full flex justify-center min-h-[44px]" />;
};

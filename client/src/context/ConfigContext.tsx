import React, { createContext, useContext, useEffect, useState } from 'react';
import { AppConfig } from '../types/index.js';
import { abortableGet } from '../lib/abortableGet.js';

// What this deployment offers (demo personas, Google sign-in, online payments), read from
// GET /api/config. Until it arrives, everything optional is treated as off. A request that fails,
// or hangs for 8 s (it is then called off), is retried with a growing delay, and straight away when
// the browser comes back online or regains focus, so one network hiccup at page load does not
// switch those features off for the whole visit.

const DEFAULT_CONFIG: AppConfig = {
  demoMode: false,
  googleClientId: null,
  payments: { enabled: false, keyId: null },
  gym: {
    name: 'PulseFit Athletics',
    timezone: 'Asia/Kolkata',
    currency: 'INR',
    hours: { opensAt: '06:00', closesAt: '22:00', closedWeekdays: [0], enforced: true }
  }
};

interface ConfigContextType {
  config: AppConfig;
  /** False until /api/config has answered; the defaults above apply meanwhile. */
  isConfigLoaded: boolean;
}

/** Delay before each retry while /api/config cannot be read. */
const RETRY_MS = [1_000, 2_000, 5_000, 10_000, 30_000];
/** A try still unanswered after this long is called off and counts as a failure. */
const TIMEOUT_MS = 8_000;
/** Coming back online or to the window replaces a try that has been waiting this long. */
const STALE_TRY_MS = 3_000;

const ConfigContext = createContext<ConfigContextType>({ config: DEFAULT_CONFIG, isConfigLoaded: false });

export const ConfigProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, setState] = useState<ConfigContextType>({ config: DEFAULT_CONFIG, isConfigLoaded: false });

  useEffect(() => {
    let done = false;
    let failures = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    // The try in flight, if any: one at a time.
    let current: { controller: AbortController; startedAt: number } | null = null;

    const detach = () => {
      clearTimeout(timer);
      window.removeEventListener('online', retry);
      window.removeEventListener('focus', retry);
    };

    async function load() {
      if (done) return;
      if (current) {
        if (Date.now() - current.startedAt < STALE_TRY_MS) return;
        current.controller.abort();
      }
      clearTimeout(timer);
      const attempt = { controller: new AbortController(), startedAt: Date.now() };
      current = attempt;
      const timeout = setTimeout(() => attempt.controller.abort(), TIMEOUT_MS);
      try {
        const config = await abortableGet<AppConfig>('/config', attempt.controller.signal);
        if (done) return;
        done = true;
        detach();
        setState({ config, isConfigLoaded: true });
      } catch {
        // A try replaced by a newer one is not a failure of its own.
        if (done || current !== attempt) return;
        failures += 1;
        timer = setTimeout(load, RETRY_MS[Math.min(failures, RETRY_MS.length) - 1]);
      } finally {
        clearTimeout(timeout);
        if (current === attempt) current = null;
      }
    }
    function retry() {
      void load();
    }

    window.addEventListener('online', retry);
    window.addEventListener('focus', retry);
    void load();
    return () => {
      done = true;
      detach();
      current?.controller.abort();
    };
  }, []);

  return <ConfigContext.Provider value={state}>{children}</ConfigContext.Provider>;
};

export const useAppConfig = () => useContext(ConfigContext);

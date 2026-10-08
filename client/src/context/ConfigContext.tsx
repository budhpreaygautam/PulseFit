import React, { createContext, useContext, useEffect, useState } from 'react';
import { api } from '../api/client.js';
import { AppConfig } from '../types/index.js';

// What this deployment offers (demo personas, Google sign-in, online payments), read from
// GET /api/config. Until it arrives, everything optional is treated as off.

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
  isConfigLoaded: boolean;
}

const ConfigContext = createContext<ConfigContextType>({ config: DEFAULT_CONFIG, isConfigLoaded: false });

export const ConfigProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, setState] = useState<ConfigContextType>({ config: DEFAULT_CONFIG, isConfigLoaded: false });

  useEffect(() => {
    let cancelled = false;
    api
      .getConfig()
      .then(config => !cancelled && setState({ config, isConfigLoaded: true }))
      .catch(() => !cancelled && setState({ config: DEFAULT_CONFIG, isConfigLoaded: true }));
    return () => {
      cancelled = true;
    };
  }, []);

  return <ConfigContext.Provider value={state}>{children}</ConfigContext.Provider>;
};

export const useAppConfig = () => useContext(ConfigContext);

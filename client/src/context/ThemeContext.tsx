import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { storage } from '../lib/storage.js';

type Theme = 'dark' | 'light';

interface ThemeContextType {
  theme: Theme;
  isDark: boolean;
  toggleTheme: () => void;
  setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

const THEME_KEY = 'pulsefit_theme';

const getInitialTheme = (): Theme => {
  const stored = storage.get(THEME_KEY);
  if (stored === 'dark' || stored === 'light') {
    return stored;
  }
  // Fall back to the system preference
  if (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches) {
    return 'light';
  }
  return 'dark';
};

const applyThemeClass = (theme: Theme) => {
  const root = document.documentElement;
  if (theme === 'dark') {
    root.classList.add('dark');
    root.classList.remove('light');
  } else {
    root.classList.add('light');
    root.classList.remove('dark');
  }
};

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [theme, setThemeState] = useState<Theme>(getInitialTheme);

  useEffect(() => {
    applyThemeClass(theme);
  }, [theme]);

  // Follow the OS setting until the visitor picks a theme themselves.
  useEffect(() => {
    if (storage.get(THEME_KEY) || !window.matchMedia) return;
    const query = window.matchMedia('(prefers-color-scheme: light)');
    const onChange = () => {
      if (!storage.get(THEME_KEY)) setThemeState(query.matches ? 'light' : 'dark');
    };
    query.addEventListener?.('change', onChange);
    return () => query.removeEventListener?.('change', onChange);
  }, []);

  useEffect(() => {
    document.documentElement.style.colorScheme = theme;
  }, [theme]);

  // An explicit choice is remembered; the OS preference is not saved.
  const setTheme = useCallback((next: Theme) => {
    storage.set(THEME_KEY, next);
    setThemeState(next);
  }, []);

  const toggleTheme = useCallback(() => {
    setThemeState(prev => {
      const next = prev === 'dark' ? 'light' : 'dark';
      storage.set(THEME_KEY, next);
      return next;
    });
  }, []);

  return (
    <ThemeContext.Provider
      value={{
        theme,
        isDark: theme === 'dark',
        toggleTheme,
        setTheme,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};
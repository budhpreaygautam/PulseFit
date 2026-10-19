import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { storage } from '../lib/storage.js';
import { matchSystemBarsToTheme } from '../lib/native.js';

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
  // Light unless the visitor picked dark with the toggle (the system setting is not followed).
  return stored === 'dark' ? 'dark' : 'light';
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

  useEffect(() => {
    document.documentElement.style.colorScheme = theme;
    matchSystemBarsToTheme(theme);
    // The browser's address bar follows the theme (colours from index.css; index.html starts light).
    document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]').forEach(tag => {
      tag.content = theme === 'dark' ? '#0f141d' : '#e6ebf2';
    });
  }, [theme]);

  // An explicit choice is remembered.
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

  // Changes only with the theme, so the components using it re-render only then.
  const value = useMemo(() => ({ theme, isDark: theme === 'dark', toggleTheme, setTheme }), [theme, toggleTheme, setTheme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};
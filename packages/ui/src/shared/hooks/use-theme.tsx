/**
 * Theme Hook — single source of truth for light/dark mode + font size
 *
 * Usage:
 *   const { isDark, toggle, setTheme, fontSize, setFontSize } = useTheme();
 *
 * Wrap app with <ThemeProvider> in index.tsx.
 */

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';

type Theme = 'light' | 'dark' | 'system';
type FontSize = 'small' | 'default' | 'large';

interface ThemeContextValue {
  theme: Theme;
  isDark: boolean;
  setTheme: (theme: Theme) => void;
  toggle: () => void;
  fontSize: FontSize;
  setFontSize: (size: FontSize) => void;
  increaseFontSize: () => void;
  decreaseFontSize: () => void;
}

const FONT_SIZE_LABELS: Record<FontSize, string> = {
  small: 'A-',
  default: 'A',
  large: 'A+',
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

function getSystemPrefersDark(): boolean {
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function resolveIsDark(theme: Theme): boolean {
  if (theme === 'system') return getSystemPrefersDark();
  return theme === 'dark';
}

function applyTheme(isDark: boolean) {
  if (isDark) {
    document.documentElement.classList.add('dark');
  } else {
    document.documentElement.classList.remove('dark');
  }
}

const FONT_PX: Record<FontSize, number> = {
  small: 11,
  default: 13,
  large: 15,
};

function applyFontSize(size: FontSize) {
  document.body.style.fontSize = `${FONT_PX[size]}px`;
  const el = document.documentElement;
  el.classList.remove('font-small', 'font-large');
  if (size === 'small') el.classList.add('font-small');
  if (size === 'large') el.classList.add('font-large');
}

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [theme, setThemeState] = useState<Theme>(() => {
    const saved = localStorage.getItem('theme');
    if (saved === 'light' || saved === 'dark' || saved === 'system') return saved;
    return 'dark';
  });

  const [fontSize, setFontSizeState] = useState<FontSize>(() => {
    const saved = localStorage.getItem('ice-font-size');
    if (saved === 'small' || saved === 'large') return saved;
    return 'default';
  });

  const isDark = resolveIsDark(theme);

  useEffect(() => {
    applyTheme(isDark);
  }, [isDark]);

  useEffect(() => {
    applyFontSize(fontSize);
  }, [fontSize]);

  useEffect(() => {
    if (theme !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = () => applyTheme(getSystemPrefersDark());
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [theme]);

  const setTheme = useCallback((t: Theme) => {
    setThemeState(t);
    localStorage.setItem('theme', t);
  }, []);

  const toggle = useCallback(() => {
    setTheme(isDark ? 'light' : 'dark');
  }, [isDark, setTheme]);

  const setFontSize = useCallback((size: FontSize) => {
    setFontSizeState(size);
    localStorage.setItem('ice-font-size', size);
  }, []);

  const increaseFontSize = useCallback(() => {
    if (fontSize === 'small') setFontSize('default');
    else if (fontSize === 'default') setFontSize('large');
  }, [fontSize, setFontSize]);

  const decreaseFontSize = useCallback(() => {
    if (fontSize === 'large') setFontSize('default');
    else if (fontSize === 'default') setFontSize('small');
  }, [fontSize, setFontSize]);

  return (
    <ThemeContext.Provider value={{ theme, isDark, setTheme, toggle, fontSize, setFontSize, increaseFontSize, decreaseFontSize }}>
      {children}
    </ThemeContext.Provider>
  );
};

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within <ThemeProvider>');
  return ctx;
}

export { FONT_SIZE_LABELS };
export type { FontSize };

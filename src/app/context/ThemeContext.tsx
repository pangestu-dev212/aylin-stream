'use client';

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';

export type ThemeId =
  | 'theme-neon-purple'
  | 'theme-neon-green'
  | 'theme-cyberpunk-orange'
  | 'theme-crimson-red'
  | 'theme-ocean-blue'
  | 'theme-light-mode';

export interface ThemeOption {
  id: ThemeId;
  label: string;
  emoji: string;
  swatch1: string;
  swatch2: string;
  isLight?: boolean;
}

export const THEMES: ThemeOption[] = [
  {
    id: 'theme-neon-purple',
    label: 'Neon Purple',
    emoji: '💜',
    swatch1: '#8b5cf6',
    swatch2: '#d946ef',
  },
  {
    id: 'theme-neon-green',
    label: 'Neon Green',
    emoji: '💚',
    swatch1: '#10b981',
    swatch2: '#14b8a6',
  },
  {
    id: 'theme-cyberpunk-orange',
    label: 'Cyberpunk',
    emoji: '🔶',
    swatch1: '#f97316',
    swatch2: '#f59e0b',
  },
  {
    id: 'theme-crimson-red',
    label: 'Crimson Red',
    emoji: '❤️',
    swatch1: '#f43f5e',
    swatch2: '#ef4444',
  },
  {
    id: 'theme-ocean-blue',
    label: 'Ocean Blue',
    emoji: '🌊',
    swatch1: '#0ea5e9',
    swatch2: '#06b6d4',
  },
  {
    id: 'theme-light-mode',
    label: 'Light Mode',
    emoji: '☀️',
    swatch1: '#7c3aed',
    swatch2: '#c026d3',
    isLight: true,
  },
];

interface ThemeContextValue {
  theme: ThemeId;
  setTheme: (id: ThemeId, profile?: string) => void;
  themes: ThemeOption[];
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: 'theme-neon-purple',
  setTheme: () => {},
  themes: THEMES,
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<ThemeId>('theme-neon-purple');

  // Apply theme class to <html> element
  const applyTheme = useCallback((id: ThemeId) => {
    const html = document.documentElement;
    THEMES.forEach((t) => html.classList.remove(t.id));
    html.classList.add(id);
    setThemeState(id);
  }, []);

  // Load saved theme from localStorage on mount
  useEffect(() => {
    try {
      const profile = localStorage.getItem('aylin_active_profile') || 'Utama';
      const storageKey = profile === 'Utama'
        ? 'aylin_theme'
        : `aylin_theme_profile_${profile.replace(/\s+/g, '_')}`;
      const saved = localStorage.getItem(storageKey) as ThemeId | null;
      if (saved && THEMES.find((t) => t.id === saved)) {
        applyTheme(saved);
      }
    } catch {
      // SSR / localStorage not available
    }
  }, [applyTheme]);

  const setTheme = useCallback(
    (id: ThemeId, profile?: string) => {
      applyTheme(id);
      try {
        const activeProfile = profile || localStorage.getItem('aylin_active_profile') || 'Utama';
        const storageKey = activeProfile === 'Utama'
          ? 'aylin_theme'
          : `aylin_theme_profile_${activeProfile.replace(/\s+/g, '_')}`;
        localStorage.setItem(storageKey, id);
      } catch { /* noop */ }
    },
    [applyTheme]
  );

  return (
    <ThemeContext.Provider value={{ theme, setTheme, themes: THEMES }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}

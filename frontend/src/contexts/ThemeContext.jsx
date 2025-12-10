import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

const ThemeContext = createContext(null);

export const THEMES = {
  LIGHT: 'light',
  DARK: 'dark',
  SYSTEM: 'system'
};

const STORAGE_KEY = 'aicos-theme-preference';

export function ThemeProvider({ children }) {
  // Initialize from localStorage or default to system
  const [themePreference, setThemePreference] = useState(() => {
    if (typeof window === 'undefined') return THEMES.SYSTEM;
    return localStorage.getItem(STORAGE_KEY) || THEMES.SYSTEM;
  });

  // Actual resolved theme (light or dark)
  const [resolvedTheme, setResolvedTheme] = useState(() => {
    if (typeof window === 'undefined') return THEMES.DARK;
    if (themePreference === THEMES.SYSTEM) {
      return window.matchMedia('(prefers-color-scheme: light)').matches
        ? THEMES.LIGHT
        : THEMES.DARK;
    }
    return themePreference;
  });

  // Listen for system preference changes
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: light)');

    const handleChange = (e) => {
      if (themePreference === THEMES.SYSTEM) {
        setResolvedTheme(e.matches ? THEMES.LIGHT : THEMES.DARK);
      }
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, [themePreference]);

  // Update resolved theme when preference changes
  useEffect(() => {
    if (themePreference === THEMES.SYSTEM) {
      const isLight = window.matchMedia('(prefers-color-scheme: light)').matches;
      setResolvedTheme(isLight ? THEMES.LIGHT : THEMES.DARK);
    } else {
      setResolvedTheme(themePreference);
    }
  }, [themePreference]);

  // Apply theme to document
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', resolvedTheme);
    // Also set color-scheme for native elements (scrollbars, inputs, etc.)
    document.documentElement.style.colorScheme = resolvedTheme;
  }, [resolvedTheme]);

  // Save preference to localStorage
  const setTheme = useCallback((theme) => {
    setThemePreference(theme);
    localStorage.setItem(STORAGE_KEY, theme);
  }, []);

  // Toggle between light and dark (ignores system)
  const toggleTheme = useCallback(() => {
    const newTheme = resolvedTheme === THEMES.DARK ? THEMES.LIGHT : THEMES.DARK;
    setTheme(newTheme);
  }, [resolvedTheme, setTheme]);

  const value = {
    theme: resolvedTheme,
    themePreference,
    setTheme,
    toggleTheme,
    isDark: resolvedTheme === THEMES.DARK,
    isLight: resolvedTheme === THEMES.LIGHT,
    isSystem: themePreference === THEMES.SYSTEM
  };

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}

export default ThemeContext;

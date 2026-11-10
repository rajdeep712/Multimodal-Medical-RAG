/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from 'react';

type ThemeMode = 'light' | 'dark';

let currentTheme: ThemeMode = (localStorage.getItem('medilens_theme') as ThemeMode) || 'light';
const listeners = new Set<(theme: ThemeMode) => void>();

export function useThemeStore() {
  const [theme, setThemeState] = useState<ThemeMode>(currentTheme);

  useEffect(() => {
    const handleThemeChange = (newTheme: ThemeMode) => {
      setThemeState(newTheme);
    };
    listeners.add(handleThemeChange);
    return () => {
      listeners.delete(handleThemeChange);
    };
  }, []);

  const setTheme = (newTheme: ThemeMode) => {
    currentTheme = newTheme;
    localStorage.setItem('medilens_theme', newTheme);
    if (newTheme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    listeners.forEach((listener) => listener(newTheme));
  };

  const toggleTheme = () => {
    setTheme(currentTheme === 'light' ? 'dark' : 'light');
  };

  return {
    theme,
    setTheme,
    toggleTheme,
  };
}

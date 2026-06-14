import { createContext, useContext, useEffect, useState, ReactNode } from 'react';

type Theme = 'light' | 'dark' | 'system';

interface DarkModeContextValue {
  theme:       Theme;
  isDark:      boolean;
  setTheme:    (t: Theme) => void;
  toggle:      () => void;
}

const DarkModeContext = createContext<DarkModeContextValue | undefined>(undefined);

function getInitialTheme(): Theme {
  if (typeof window === 'undefined') return 'system';
  const saved = localStorage.getItem('bonustrack-theme');
  if (saved === 'light' || saved === 'dark' || saved === 'system') return saved;
  return 'system';
}

function applyTheme(theme: Theme): boolean {
  const root = document.documentElement;
  const isDark = theme === 'dark'
    || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  root.classList.toggle('dark', isDark);
  return isDark;
}

export function DarkModeProvider({ children }: { children: ReactNode }) {
  const [theme,  setThemeState] = useState<Theme>(getInitialTheme);
  const [isDark, setIsDark]     = useState<boolean>(() => applyTheme(getInitialTheme()));

  useEffect(() => {
    setIsDark(applyTheme(theme));
    localStorage.setItem('bonustrack-theme', theme);
  }, [theme]);

  useEffect(() => {
    if (theme !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = () => setIsDark(applyTheme('system'));
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [theme]);

  const value: DarkModeContextValue = {
    theme,
    isDark,
    setTheme: setThemeState,
    toggle:   () => setThemeState(isDark ? 'light' : 'dark'),
  };

  return <DarkModeContext.Provider value={value}>{children}</DarkModeContext.Provider>;
}

export function useDarkMode() {
  const ctx = useContext(DarkModeContext);
  if (!ctx) throw new Error('useDarkMode must be used within DarkModeProvider');
  return ctx;
}

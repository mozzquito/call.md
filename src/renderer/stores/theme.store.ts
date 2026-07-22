import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { ThemeSource } from '../../shared/types/ipc.types';

export type Theme = ThemeSource;
export type ResolvedTheme = Exclude<ThemeSource, 'system'>;

interface ThemeState {
  theme: Theme;
  setTheme: (theme: Theme) => void;
}

export const resolveTheme = (theme: Theme, prefersDark: boolean): ResolvedTheme =>
  theme === 'system' ? (prefersDark ? 'dark' : 'light') : theme;

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      theme: 'system',
      setTheme: (theme) => set({ theme }),
    }),
    { name: 'call-md-theme' }
  )
);

export function initializeTheme() {
  const media = window.matchMedia('(prefers-color-scheme: dark)');

  const applyTheme = () => {
    const source = useThemeStore.getState().theme;
    const theme = resolveTheme(source, media.matches);
    document.documentElement.classList.toggle('dark', theme === 'dark');
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    void window.electronAPI?.app.setThemeSource(source);
  };

  applyTheme();
  const unsubscribe = useThemeStore.subscribe(applyTheme);
  media.addEventListener('change', applyTheme);

  return () => {
    unsubscribe();
    media.removeEventListener('change', applyTheme);
  };
}

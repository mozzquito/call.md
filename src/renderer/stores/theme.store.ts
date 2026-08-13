import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { resolveTheme, type ThemeSource } from '../../shared/theme';

interface ThemeState {
  theme: ThemeSource;
  setTheme: (theme: ThemeSource) => void;
}

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

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { AUTO_LANGUAGE } from '../../shared/constants/languages';

interface ConfigState {
  accessToken: string | null;
  userName: string | null;
  apiKey: string | null;
  apiUrl: string | null;
  transcriptionLanguage: string;
  onboardingComplete: boolean;

  setAuth: (accessToken: string, userName: string, apiKey: string) => void;
  setConfig: (config: Partial<ConfigState>) => void;
  hydrateFromMain: () => Promise<void>;
  clearAuth: () => void;
  isAuthenticated: () => boolean;
  completeOnboarding: () => void;
}

export const useConfigStore = create<ConfigState>()(
  persist(
    (set, get) => ({
      accessToken: null,
      userName: null,
      apiKey: null,
      apiUrl: null,
      transcriptionLanguage: AUTO_LANGUAGE,
      onboardingComplete: false,

      setAuth: (accessToken, userName, apiKey) => {
        set({ accessToken, userName, apiKey });
        // The main process owns credentials across restarts (encrypted at rest).
        void window.electronAPI?.app
          ?.saveSettings({ accessToken, userName, apiKey })
          .catch(() => undefined);
      },

      setConfig: (config) => {
        set(config);
      },

      /**
       * Loads settings the renderer does not persist itself - the API key lives
       * only in the main process - and the saved transcription language.
       */
      hydrateFromMain: async () => {
        try {
          const settings = await window.electronAPI?.app?.getSettings();
          if (!settings) return;

          set((state) => ({
            apiKey: settings.apiKey ?? state.apiKey,
            apiUrl: settings.apiUrl ?? state.apiUrl,
            userName: state.userName ?? settings.userName ?? null,
            accessToken: state.accessToken ?? settings.accessToken ?? null,
            transcriptionLanguage: settings.transcriptionLanguage || AUTO_LANGUAGE,
          }));
        } catch {
          // Settings are optional; the app still works without them.
        }
      },

      clearAuth: () => {
        set({
          accessToken: null,
          userName: null,
          apiKey: null,
          onboardingComplete: false,
        });
      },

      isAuthenticated: () => {
        return !!get().accessToken;
      },

      completeOnboarding: () => {
        set({ onboardingComplete: true });
      },
    }),
    {
      name: 'call-md-config',
      // The API key is deliberately absent: localStorage is plaintext on disk
      // and any renderer script can read it. The main process holds the key
      // (encrypted via the OS keyring) and rehydrates it through `get-settings`
      // on startup.
      partialize: (state) => ({
        accessToken: state.accessToken,
        userName: state.userName,
        onboardingComplete: state.onboardingComplete,
      }),
    }
  )
);

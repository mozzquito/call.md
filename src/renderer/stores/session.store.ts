import { create } from 'zustand';

export type SessionStatus = 'idle' | 'starting' | 'recording' | 'stopping' | 'processing';

interface StreamState {
  microphone: boolean;
  systemAudio: boolean;
  screen: boolean;
}

interface SessionTokenOwner {
  accessToken: string;
  apiKey: string | null;
}

interface SessionState {
  status: SessionStatus;
  sessionId: string | null;
  recordingId: number | null; // Database recording ID for navigation after stop
  sessionToken: string | null;
  sessionTokenOwner: SessionTokenOwner | null;
  tokenExpiresAt: number | null;
  startTime: number | null;
  elapsedTime: number;
  accumulatedTime: number; // Time accumulated before current recording segment (excludes paused time)
  lastResumeTime: number | null; // When the current recording segment started
  streams: StreamState;
  isPaused: boolean;
  error: string | null;
  screenWsConnectionId: string | null; // For visual indexing

  // Actions
  setStatus: (status: SessionStatus) => void;
  setRecordingId: (id: number | null) => void;
  startSession: (
    sessionId: string,
    sessionToken: string,
    expiresAt: number,
    owner: SessionTokenOwner,
    screenWsConnectionId?: string
  ) => void;
  stopSession: () => void;
  setSessionToken: (token: string, expiresAt: number, owner: SessionTokenOwner) => void;
  setElapsedTime: (time: number) => void;
  toggleStream: (stream: keyof StreamState) => void;
  setStreams: (streams: Partial<StreamState>) => void;
  pauseTimer: () => void;
  resumeTimer: () => void;
  setError: (error: string | null) => void;
  setScreenWsConnectionId: (id: string | null) => void;
  reset: () => void;
  isTokenExpired: (owner: SessionTokenOwner) => boolean;
}

const initialStreams: StreamState = {
  microphone: true,
  systemAudio: true,
  screen: true,
};

export const useSessionStore = create<SessionState>((set, get) => ({
  status: 'idle',
  sessionId: null,
  recordingId: null,
  sessionToken: null,
  sessionTokenOwner: null,
  tokenExpiresAt: null,
  startTime: null,
  elapsedTime: 0,
  accumulatedTime: 0,
  lastResumeTime: null,
  streams: initialStreams,
  isPaused: false,
  error: null,
  screenWsConnectionId: null,

  setStatus: (status) => set({ status }),

  setRecordingId: (id) => set({ recordingId: id }),

  startSession: (sessionId, sessionToken, expiresAt, owner, screenWsConnectionId) => {
    const now = Date.now();
    set({
      status: 'recording',
      sessionId,
      sessionToken,
      sessionTokenOwner: owner,
      tokenExpiresAt: expiresAt,
      startTime: now,
      elapsedTime: 0,
      accumulatedTime: 0,
      lastResumeTime: now,
      isPaused: false,
      error: null,
      screenWsConnectionId: screenWsConnectionId || null,
    });
  },

  stopSession: () => {
    set({
      status: 'idle',
      sessionId: null,
      startTime: null,
      elapsedTime: 0,
      accumulatedTime: 0,
      lastResumeTime: null,
      isPaused: false,
      screenWsConnectionId: null,
    });
  },

  setSessionToken: (token, expiresAt, owner) => {
    set({
      sessionToken: token,
      sessionTokenOwner: owner,
      tokenExpiresAt: expiresAt,
    });
  },

  setElapsedTime: (time) => set({ elapsedTime: time }),

  toggleStream: (stream) => {
    const currentStreams = get().streams;
    set({
      streams: {
        ...currentStreams,
        [stream]: !currentStreams[stream],
      },
    });
  },

  setStreams: (streams) => {
    set({
      streams: {
        ...get().streams,
        ...streams,
      },
    });
  },

  pauseTimer: () => {
    const { lastResumeTime, accumulatedTime } = get();
    if (lastResumeTime) {
      const segmentTime = Math.floor((Date.now() - lastResumeTime) / 1000);
      set({
        isPaused: true,
        accumulatedTime: accumulatedTime + segmentTime,
        lastResumeTime: null,
      });
    } else {
      set({ isPaused: true });
    }
  },

  resumeTimer: () => {
    set({
      isPaused: false,
      lastResumeTime: Date.now(),
    });
  },

  setError: (error) => set({ error }),

  setScreenWsConnectionId: (id) => set({ screenWsConnectionId: id }),

  reset: () => {
    set({
      status: 'idle',
      sessionId: null,
      recordingId: null,
      startTime: null,
      elapsedTime: 0,
      accumulatedTime: 0,
      lastResumeTime: null,
      streams: initialStreams,
      isPaused: false,
      error: null,
    });
  },

  isTokenExpired: (owner) => {
    const { sessionToken, sessionTokenOwner, tokenExpiresAt } = get();
    if (
      !sessionToken ||
      !sessionTokenOwner ||
      sessionTokenOwner.accessToken !== owner.accessToken ||
      sessionTokenOwner.apiKey !== owner.apiKey ||
      !tokenExpiresAt
    ) {
      return true;
    }
    // Consider expired if less than 5 minutes remaining
    const bufferSeconds = 5 * 60;
    return Date.now() / 1000 > tokenExpiresAt - bufferSeconds;
  },
}));

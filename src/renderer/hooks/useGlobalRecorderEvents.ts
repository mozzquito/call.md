import { useEffect, useRef } from 'react';
import { useSessionStore } from '../stores/session.store';
import { useTranscriptionStore } from '../stores/transcription.store';
import { useVisualIndexStore } from '../stores/visual-index.store';
import { useCopilotStore } from '../stores/copilot.store';
import { useConfigStore } from '../stores/config.store';
import { getElectronAPI } from '../api/ipc';
import { formatDurationLabel } from '../../shared/constants/recording';
import type {
  RecorderEvent,
  TranscriptEvent,
  VisualIndexEvent,
  RecordingLimitWarningEvent,
  RecordingLimitReachedEvent,
} from '../../shared/types/ipc.types';

interface GlobalRecorderEventOptions {
  /**
   * Called when the recording hits the maximum length. Should run the normal
   * stop flow so the recording is finalised and the summary generated.
   */
  onRecordingLimitReached?: () => void | Promise<void>;
}

/**
 * Global hook to listen for recorder events from the main process.
 * This should be called ONCE at the App level to ensure transcript events
 * are captured even when navigating between pages.
 */
export function useGlobalRecorderEvents(options: GlobalRecorderEventOptions = {}) {
  const sessionStore = useSessionStore();
  const transcriptionStore = useTranscriptionStore();
  const visualIndexStore = useVisualIndexStore();

  // Use refs to avoid re-subscribing when stores change
  const sessionStoreRef = useRef(sessionStore);
  const transcriptionStoreRef = useRef(transcriptionStore);
  const visualIndexStoreRef = useRef(visualIndexStore);
  const optionsRef = useRef(options);

  useEffect(() => {
    optionsRef.current = options;
  }, [options]);

  // Keep refs updated
  useEffect(() => {
    sessionStoreRef.current = sessionStore;
  }, [sessionStore]);

  useEffect(() => {
    transcriptionStoreRef.current = transcriptionStore;
  }, [transcriptionStore]);

  useEffect(() => {
    visualIndexStoreRef.current = visualIndexStore;
  }, [visualIndexStore]);

  useEffect(() => {
    const api = getElectronAPI();
    if (!api) return;

    const unsubscribe = api.on.recorderEvent((event: RecorderEvent) => {
      const session = sessionStoreRef.current;
      const transcription = transcriptionStoreRef.current;
      const visualIndex = visualIndexStoreRef.current;

      switch (event.event) {
        case 'recording:started':
          session.setStatus('recording');
          break;

        case 'recording:stopped':
          session.setStatus('processing');
          break;

        case 'recording:error':
          session.setError(String(event.data));
          session.setStatus('idle');
          break;

        case 'recording:limit-warning': {
          // A two-hour meeting usually means the app is in the tray, so warn
          // through the OS rather than with an in-app toast nobody will see.
          const warning = event.data as RecordingLimitWarningEvent;
          const remaining = formatDurationLabel(warning.msRemaining);
          const limit = formatDurationLabel(warning.limitMs);

          getElectronAPI()?.app.showNotification(
            'Recording ends soon',
            `This recording reaches the ${limit} limit in ${remaining} and will stop automatically.`
          );
          break;
        }

        case 'recording:limit-reached': {
          const reached = event.data as RecordingLimitReachedEvent;
          const limit = formatDurationLabel(reached.limitMs);

          getElectronAPI()?.app.showNotification(
            'Recording stopped',
            `The ${limit} recording limit was reached. Your recording is being saved.`
          );

          // Run the same stop path as the Stop button so the recording is
          // finalised, the summary is generated and the stores are reset.
          void optionsRef.current.onRecordingLimitReached?.();
          break;
        }

        case 'transcript':
          if (event.data && transcription.enabled) {
            const transcript = event.data as TranscriptEvent;
            let finalizedItem: ReturnType<typeof transcription.finalizePending> | null = null;
            if (transcript.isFinal) {
              finalizedItem = transcription.finalizePending(transcript.source, transcript.text);
            } else {
              transcription.updatePending(transcript.source, transcript.text);
            }

            // Forward transcript to copilot backend (for final segments only)
            const currentApi = getElectronAPI();
            if (transcript.isFinal && currentApi) {
              const channel: 'me' | 'them' = transcript.source === 'mic' ? 'me' : 'them';

              // Forward to copilot if active
              if (useCopilotStore.getState().isCallActive) {
                currentApi.copilot.sendTranscript(channel, {
                  text: transcript.text,
                  is_final: true,
                  start: transcript.start,
                  end: transcript.end,
                }).catch((err: Error) => {
                  console.warn('[GlobalRecorderEvents] Error forwarding transcript to copilot:', err);
                });
              }

              // Forward to live assist service for real-time analysis
              currentApi.liveAssist.addTranscript(transcript.text, transcript.source).catch((err: Error) => {
                console.warn('[GlobalRecorderEvents] Error forwarding transcript to live assist:', err);
              });

              // Live Thai translation overlay (opt-in, see Settings -> Transcription)
              if (finalizedItem && useConfigStore.getState().translationEnabled) {
                const { recordingId, sessionId } = useSessionStore.getState();
                if (recordingId && sessionId) {
                  const itemId = finalizedItem.id;
                  currentApi.translation
                    .translateSegment({ recordingId, sessionId, channel, text: transcript.text })
                    .then((result) => {
                      // The meeting may have already ended by the time this
                      // resolves (translation calls can lag behind a fast
                      // recording-stop). Applying it to a new session's store
                      // would misattribute a stale translation to the wrong
                      // transcript item.
                      if (useSessionStore.getState().sessionId !== sessionId) return;
                      if (result.success && result.translatedText) {
                        transcription.setTranslation(itemId, result.translatedText);
                      }
                    })
                    .catch((err: Error) => {
                      console.warn('[GlobalRecorderEvents] Error translating segment:', err);
                    });
                }
              }
            }
          }
          break;

        case 'visual_index':
          if (event.data) {
            const visualData = event.data as VisualIndexEvent;
            visualIndex.addItem({
              text: visualData.text,
              start: visualData.start,
              end: visualData.end,
              rtstreamId: visualData.rtstreamId,
              rtstreamName: visualData.rtstreamName,
            });

            // Forward to live assist for real-time analysis
            const currentApi = getElectronAPI();
            if (currentApi) {
              currentApi.liveAssist.addVisualIndex(visualData.text).catch((err: Error) => {
                console.warn('[GlobalRecorderEvents] Error forwarding visual index to live assist:', err);
              });
            }

            // Save to database for durable storage
            const currentSession = useSessionStore.getState();
            if (currentSession.recordingId && currentSession.sessionId && currentApi) {
              // Convert epoch ms timestamps to seconds from call start
              const callStartSec = currentSession.startTime ? currentSession.startTime / 1000 : visualData.start;
              currentApi.visualIndex.saveItem({
                recordingId: currentSession.recordingId,
                sessionId: currentSession.sessionId,
                text: visualData.text,
                startTime: Math.max(0, visualData.start - callStartSec),
                endTime: Math.max(0, visualData.end - callStartSec),
                rtstreamId: visualData.rtstreamId,
                rtstreamName: visualData.rtstreamName,
              }).catch((err: Error) => {
                console.warn('[GlobalRecorderEvents] Error saving visual index item:', err);
              });
            }
          }
          break;

        case 'upload:progress':
          console.log('[GlobalRecorderEvents] Upload progress:', event.data);
          break;

        case 'upload:complete':
          // Don't reset session here - let stopRecording() handle the transition
          // after copilot summary generation completes
          console.log('[GlobalRecorderEvents] Upload complete (stopRecording will handle state transition)');
          break;

        case 'error':
          console.error('[GlobalRecorderEvents] Error:', event.data);
          session.setError(String(event.data));
          break;
      }
    });

    // Only unsubscribe when the entire app unmounts (which shouldn't happen during normal use)
    return () => {
      console.log('[Global] Cleaning up recorder event listener');
      unsubscribe();
    };
  }, []); // Empty deps - only run once on mount
}

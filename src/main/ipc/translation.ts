/**
 * Translation IPC Handlers
 *
 * Request/response translation of a single finalized transcript segment.
 * Deliberately not a push-event channel: the renderer already knows which
 * local transcript-store item a given call belongs to (it made the call),
 * so there's no cross-call ordering to get wrong.
 */

import { ipcMain } from 'electron';
import { createChildLogger } from '../lib/logger';
import { translateSegment } from '../services/copilot/translation.service';
import { updateTranscriptSegmentTranslationByText } from '../db';
import { getTranscriptBuffer } from '../services/copilot/transcript-buffer.service';

const logger = createChildLogger('translation-ipc');

// A live transcript segment is a spoken sentence or two - this is a generous
// bound to reject pathological/malicious input, not a realistic ceiling.
const MAX_SEGMENT_LENGTH = 2000;

export function setupTranslationHandlers(): void {
  logger.info('Setting up Translation IPC handlers');

  ipcMain.handle(
    'translation:translate-segment',
    async (
      _event,
      params: unknown
    ): Promise<{ success: boolean; translatedText?: string; error?: string }> => {
      const { recordingId, sessionId, channel, text } = (params ?? {}) as Record<string, unknown>;

      if (typeof sessionId !== 'string' || !sessionId) {
        return { success: false, error: 'sessionId is required' };
      }
      if (typeof text !== 'string' || !text.trim()) {
        return { success: false, error: 'text is required' };
      }
      if (text.length > MAX_SEGMENT_LENGTH) {
        return { success: false, error: 'text exceeds maximum segment length' };
      }
      if (channel !== 'me' && channel !== 'them') {
        return { success: false, error: 'channel must be "me" or "them"' };
      }
      if (recordingId !== undefined && (typeof recordingId !== 'number' || !Number.isInteger(recordingId) || recordingId <= 0)) {
        return { success: false, error: 'recordingId must be a positive integer' };
      }

      try {
        // Snapshot context now, before the concurrency-limited queue runs this
        // task - by the time it executes, the buffer may have moved on.
        const priorContext = getTranscriptBuffer().getRecentContext(sessionId, 2);
        const translatedText = await translateSegment(sessionId, text, priorContext);
        if (!translatedText) {
          return { success: false, error: 'Translation unavailable' };
        }

        if (recordingId) {
          try {
            const result = updateTranscriptSegmentTranslationByText(recordingId, channel, text, translatedText);
            if (result.changes === 0) {
              logger.warn(
                { recordingId, channel },
                'Segment translation computed but no matching transcript_segments row found to persist - the Thai line will not survive reopening this recording'
              );
            }
          } catch (dbError) {
            // Live translation already succeeded; a failed persist just means
            // this segment's Thai line won't survive reopening past history.
            logger.warn({ error: dbError, recordingId }, 'Failed to persist segment translation');
          }
        }

        return { success: true, translatedText };
      } catch (error) {
        logger.error({ error }, 'Failed to translate segment');
        return { success: false, error: (error as Error).message };
      }
    }
  );

  logger.info('Translation IPC handlers registered');
}

export function removeTranslationHandlers(): void {
  ipcMain.removeHandler('translation:translate-segment');
  logger.info('Translation IPC handlers removed');
}

/**
 * Import Service
 *
 * Turns an uploaded local file into a fully-processed recording: upload to
 * VideoDB, batch-transcribe (supports languages the live streaming engine
 * doesn't, e.g. Thai), chunk the plain transcript into timed segments, then
 * run the existing SummaryGeneratorService unmodified - it only needs a
 * recordingId, it doesn't know or care whether the recording was live or
 * imported.
 *
 * Runs fire-and-forget from the IPC handler (see ipc/import.ts) - the
 * `recordings` row's `status` column is the only progress signal, picked up
 * by the History view's existing 10s poll (same UX as a live recording
 * going through 'processing' -> 'available').
 */

import path from 'path';
import { createChildLogger } from '../../lib/logger';
import { createVideoDBService } from '../videodb.service';
import { getSummaryGenerator } from './summary-generator.service';
import { createTranscriptSegment, updateRecording } from '../../db';
import { v4 as uuid } from 'uuid';

const logger = createChildLogger('import-service');

// Approximate segment size, in characters rather than words - Thai (the
// whole reason this feature exists) doesn't delimit words with spaces, so a
// whitespace-split word count would treat an entire Thai transcript as one
// giant "word" and collapse it into a single segment. Timestamps are
// estimated by proportional character offset over the total duration
// (VideoDB's word-level timestamp shape isn't guaranteed identical between
// Video and Audio assets), not real per-word timing - good enough for the
// transcript view and for feeding the summary generator, not frame-accurate.
const CHARS_PER_CHUNK = 200;

export interface TranscriptChunk {
  text: string;
  startTime: number;
  endTime: number;
}

export function chunkTranscriptText(
  fullText: string,
  totalDurationSeconds: number,
  charsPerChunk: number = CHARS_PER_CHUNK
): TranscriptChunk[] {
  const text = fullText.trim();
  const totalLength = text.length;
  if (totalLength === 0) return [];

  const chunks: TranscriptChunk[] = [];
  let pos = 0;

  while (pos < totalLength) {
    let end = Math.min(pos + charsPerChunk, totalLength);

    // For space-delimited languages, prefer breaking at a nearby space
    // rather than mid-word. No effect on scripts without spaces (Thai) -
    // lastIndexOf just won't find one, and the hard cut at `end` is fine.
    if (end < totalLength) {
      const spaceBreak = text.lastIndexOf(' ', end);
      if (spaceBreak > pos + charsPerChunk * 0.5) {
        end = spaceBreak;
      }
    }

    const chunkText = text.slice(pos, end).trim();
    if (chunkText) {
      chunks.push({
        text: chunkText,
        startTime: totalDurationSeconds > 0 ? (pos / totalLength) * totalDurationSeconds : 0,
        endTime: totalDurationSeconds > 0 ? (end / totalLength) * totalDurationSeconds : 0,
      });
    }

    pos = end;
    while (pos < totalLength && /\s/.test(text[pos])) pos++;
  }

  return chunks;
}

/**
 * Runs the full import pipeline for a recording row that was already
 * created (synchronously, before this function is called) with
 * status: 'processing'. Always resolves - failures are caught and turn the
 * recording into status: 'failed' rather than throwing to the caller, since
 * this runs unawaited from the IPC handler.
 */
export async function processImportedRecording(
  recordingId: number,
  sessionId: string,
  filePath: string,
  apiKey: string,
  apiUrl: string | undefined,
  collectionId: string,
  languageCode?: string
): Promise<void> {
  const fileName = path.basename(filePath);

  try {
    logger.info({ recordingId, fileName, languageCode }, 'Starting import processing');

    const videoDBService = createVideoDBService(apiKey, apiUrl, collectionId);
    const result = await videoDBService.uploadAndTranscribeFile(filePath, languageCode);

    logger.info(
      { recordingId, assetId: result.assetId, durationSeconds: result.durationSeconds },
      'Transcript generated, chunking and persisting segments'
    );

    const chunks = chunkTranscriptText(result.fullText, result.durationSeconds);

    for (const chunk of chunks) {
      createTranscriptSegment({
        id: uuid(),
        recordingId,
        sessionId,
        // No speaker diarization on a plain batch transcript - everything
        // lands under one channel. Known limitation, see design doc.
        channel: 'them',
        text: chunk.text,
        startTime: chunk.startTime,
        endTime: chunk.endTime,
        isFinal: true,
        processedByAgent: false,
      });
    }

    // The transcript itself is the valuable, hard-won part (uploaded and
    // paid-for on VideoDB's side). Mark the recording available as soon as
    // it's persisted, BEFORE attempting the summary - a summary failure
    // below must not discard an already-successful transcript. insightsStatus
    // exists precisely to decouple these two outcomes.
    updateRecording(recordingId, {
      videoId: result.assetId,
      collectionId,
      streamUrl: result.streamUrl,
      playerUrl: result.playerUrl,
      duration: Math.round(result.durationSeconds),
      status: 'available',
      insightsStatus: 'processing',
    });

    logger.info({ recordingId, segmentCount: chunks.length }, 'Segments persisted, generating summary');

    try {
      const summary = await getSummaryGenerator().generate(recordingId, {});
      updateRecording(recordingId, {
        insightsStatus: 'ready',
        shortOverview: summary.shortOverview,
        keyPoints: JSON.stringify(summary.keyPoints),
        postMeetingChecklist: JSON.stringify(summary.postMeetingChecklist),
      });
      logger.info({ recordingId }, 'Import completed successfully');
    } catch (summaryError) {
      logger.error({ recordingId, error: summaryError }, 'Summary generation failed for imported recording');
      updateRecording(recordingId, { insightsStatus: 'failed' });
    }
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    logger.error({ recordingId, fileName, error: errMsg }, 'Import processing failed');

    try {
      updateRecording(recordingId, { status: 'failed' });
    } catch (dbError) {
      logger.error({ recordingId, error: dbError }, 'Failed to mark import as failed in database');
    }
  }
}

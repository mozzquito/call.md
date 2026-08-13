/**
 * RTStream Transcript Service
 *
 * Starts real-time transcription on an RTStream, optionally pinned to a
 * language.
 *
 * The JS SDK's `RTStream.startTranscript(socketId, engine)` posts only
 * `{action, engine, ws_connection_id}` — there is no way to pass a language
 * through it (checked in videodb 0.2.5 and 0.3.0). So when the user has picked
 * a language we make the same request ourselves and add `language_code`.
 *
 * See https://github.com/video-db/call.md/issues/25.
 */

import type { RTStream } from 'videodb';
import { createChildLogger } from '../lib/logger';

const logger = createChildLogger('rtstream-transcript');

const DEFAULT_API_URL = 'https://api.videodb.io';
const DEFAULT_ENGINE = 'assemblyai';
const REQUEST_TIMEOUT_MS = 15000;

export interface StartTranscriptOptions {
  /** VideoDB API key, sent as `x-access-token`. */
  apiKey: string;
  /** Overrides the API base URL (self-hosted / staging). */
  apiUrl?: string;
  /** WebSocket connection that receives transcript events. */
  wsConnectionId?: string;
  /** BCP-47 code, or undefined to let the engine decide. */
  languageCode?: string;
  /** Transcription engine; defaults to the SDK's own default. */
  engine?: string;
}

/**
 * Starts transcription, adding `language_code` when one is configured.
 *
 * Falls back to the SDK call if the direct request fails, so a rejected or
 * unrecognised language degrades to English rather than to no transcript.
 */
export async function startRtstreamTranscript(
  stream: RTStream,
  options: StartTranscriptOptions
): Promise<void> {
  const { apiKey, apiUrl, wsConnectionId, languageCode, engine = DEFAULT_ENGINE } = options;

  if (!languageCode) {
    await stream.startTranscript(wsConnectionId);
    return;
  }

  try {
    await postTranscriptStart(stream.id, { apiKey, apiUrl, wsConnectionId, languageCode, engine });
    logger.info({ rtstreamId: stream.id, languageCode }, 'Started transcript with language');
  } catch (error) {
    logger.warn(
      { rtstreamId: stream.id, languageCode, error: (error as Error).message },
      'Language-specific transcript start failed; falling back to the default engine language'
    );
    await stream.startTranscript(wsConnectionId);
  }
}

/**
 * POST /rtstream/{id}/transcription — the request the SDK makes, plus
 * `language_code`. Body keys are snake_case, matching the VideoDB API.
 */
async function postTranscriptStart(
  rtstreamId: string,
  options: Required<Pick<StartTranscriptOptions, 'apiKey' | 'engine' | 'languageCode'>> &
    Pick<StartTranscriptOptions, 'apiUrl' | 'wsConnectionId'>
): Promise<void> {
  const baseUrl = (options.apiUrl || DEFAULT_API_URL).replace(/\/+$/, '');
  const url = `${baseUrl}/rtstream/${encodeURIComponent(rtstreamId)}/transcription`;

  const body: Record<string, unknown> = {
    action: 'start',
    engine: options.engine,
    language_code: options.languageCode,
  };

  if (options.wsConnectionId) {
    body.ws_connection_id = options.wsConnectionId;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-access-token': options.apiKey,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new Error(`HTTP ${response.status} ${response.statusText}${detail ? `: ${detail}` : ''}`);
    }
  } finally {
    clearTimeout(timeout);
  }
}

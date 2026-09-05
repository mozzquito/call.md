/**
 * Second-Opinion Summary Service (Feature 3)
 *
 * Runs the meeting transcript through zcode (GLM) and agy (Gemini/Sonnet) -
 * separate, already-authenticated CLI agents on this machine - to produce
 * supplementary summaries alongside the primary OpenAI-generated one.
 * Solo/personal-fork feature: only works on this machine, which is fine.
 *
 * Security notes (from design review - both zcode and agy independently
 * flagged the same issues against a naive shell-out):
 * - `spawn` with an explicit argument array, never a shell string - a
 *   transcript is attacker-shaped input even though it's just meeting text.
 * - The transcript goes into a temp file, never argv - multi-KB text as a
 *   command-line argument leaks into `ps` output and can hit ARG_MAX.
 * - Absolute paths only - a GUI Electron app launched from Finder/Dock does
 *   not inherit the shell's PATH/aliases, so a bare `zcode`/`agy` lookup
 *   fails with ENOENT. zcode is a Node script - run it via Electron's own
 *   bundled Node (`process.execPath` + `ELECTRON_RUN_AS_NODE=1`) rather than
 *   depending on which `node` (if any) happens to be on the user's PATH or
 *   which nvm version is currently selected.
 * - Spawned detached so the child is its own process group leader; on
 *   timeout the whole group is killed, not just the direct child - zcode/agy
 *   are agent loops that can spawn their own subprocesses (shells, tools),
 *   and `child.kill()` alone would orphan those instead of stopping them.
 * - Hard 3-minute timeout + SIGKILL.
 */

import { spawn } from 'child_process';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { v4 as uuid } from 'uuid';
import { createChildLogger } from '../../lib/logger';
import { getTranscriptSegmentsByRecording, createSecondOpinionSummary } from '../../db';

const logger = createChildLogger('second-opinion-service');

const ZCODE_CJS_PATH = '/Applications/ZCode.app/Contents/Resources/glm/zcode.cjs';
const AGY_BIN_PATH = path.join(os.homedir(), '.local', 'bin', 'agy');
const TIMEOUT_MS = 3 * 60 * 1000;
const MAX_OUTPUT_BYTES = 1 * 1024 * 1024; // 1MB - guards against a runaway process flooding memory

export type SecondOpinionProvider = 'zcode' | 'agy';

export interface SecondOpinionResult {
  success: boolean;
  content?: string;
  error?: string;
}

function formatTranscript(segments: { channel: string; text: string; startTime: number }[]): string {
  return segments
    .map((s) => {
      const speaker = s.channel === 'me' ? 'You' : 'Them';
      const mins = Math.floor(s.startTime / 60);
      const secs = Math.floor(s.startTime % 60);
      return `[${mins}:${secs.toString().padStart(2, '0')}] ${speaker}: ${s.text}`;
    })
    .join('\n');
}

interface RunResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  timedOut: boolean;
}

function runProcess(command: string, args: string[], env: NodeJS.ProcessEnv): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    // `detached: true` makes the child its own process-group leader (on
    // POSIX) so a timeout can kill the whole group - zcode/agy are agent
    // loops that may spawn their own subprocesses, and killing only the
    // direct child would leave those running.
    const child = spawn(command, args, { env, stdio: ['ignore', 'pipe', 'pipe'], detached: true });

    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    let timedOut = false;
    let settled = false;
    let outputBytes = 0;

    const killGroup = (signal: NodeJS.Signals) => {
      if (child.pid === undefined) return;
      try {
        process.kill(-child.pid, signal);
      } catch {
        child.kill(signal);
      }
    };

    const timer = setTimeout(() => {
      timedOut = true;
      killGroup('SIGKILL');
    }, TIMEOUT_MS);

    const collect = (chunks: Buffer[]) => (chunk: Buffer) => {
      outputBytes += chunk.length;
      if (outputBytes > MAX_OUTPUT_BYTES) {
        if (!timedOut) killGroup('SIGKILL');
        return;
      }
      chunks.push(chunk);
    };

    child.stdout.on('data', collect(stdoutChunks));
    child.stderr.on('data', collect(stderrChunks));

    child.on('error', (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(err);
    });

    child.on('close', (exitCode) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({
        // Decoded once from the accumulated buffers, not per-chunk - a
        // multi-byte UTF-8 character (Thai summaries included) can span a
        // chunk boundary and get mangled if decoded incrementally.
        stdout: Buffer.concat(stdoutChunks).toString('utf-8'),
        stderr: Buffer.concat(stderrChunks).toString('utf-8'),
        exitCode,
        timedOut,
      });
    });
  });
}

// Coalesces concurrent requests for the same recording+provider into one
// in-flight run, so navigating away and back (or a fast double-click)
// doesn't spawn a second zcode/agy process for the same summarization.
const inFlight = new Map<string, Promise<SecondOpinionResult>>();

export function generateSecondOpinion(
  recordingId: number,
  provider: SecondOpinionProvider
): Promise<SecondOpinionResult> {
  const key = `${recordingId}:${provider}`;
  const existing = inFlight.get(key);
  if (existing) return existing;

  const promise = runGeneration(recordingId, provider).finally(() => {
    inFlight.delete(key);
  });
  inFlight.set(key, promise);
  return promise;
}

/**
 * Generates one provider's second opinion and persists the result (success
 * or failure) to the second_opinion_summaries table. Always resolves - never
 * throws - since callers render each provider's card independently as it
 * arrives and a thrown error would need the same handling anyway.
 */
async function runGeneration(
  recordingId: number,
  provider: SecondOpinionProvider
): Promise<SecondOpinionResult> {
  const tempDir = path.join(os.tmpdir(), `call-md-second-opinion-${uuid()}`);
  const transcriptPath = path.join(tempDir, 'transcript.txt');

  try {
    const segments = getTranscriptSegmentsByRecording(recordingId);
    if (!segments || segments.length === 0) {
      const result: SecondOpinionResult = { success: false, error: 'No transcript available for this recording' };
      persistResult(recordingId, provider, result);
      return result;
    }

    const transcript = formatTranscript(segments);

    await fs.mkdir(tempDir, { recursive: true, mode: 0o700 });
    await fs.writeFile(transcriptPath, transcript, 'utf-8');

    const prompt =
      'Summarize this meeting transcript: a short overview paragraph, key discussion points by topic, ' +
      'and concrete action items. Respond with the summary only, no preamble.';

    const run = provider === 'zcode'
      ? await runProcess(
          process.execPath,
          [ZCODE_CJS_PATH, '-p', `${prompt}\n\nTranscript file: ${transcriptPath}`, '--cwd', tempDir, '--disallowedTools', 'Edit Write Bash(git*)'],
          { ...process.env, ELECTRON_RUN_AS_NODE: '1' }
        )
      : await runProcess(
          AGY_BIN_PATH,
          [`--add-dir`, tempDir, '-p', `${prompt}\n\nTranscript file: ${transcriptPath}`, '--mode', 'plan'],
          process.env
        );

    if (run.timedOut) {
      const result: SecondOpinionResult = { success: false, error: `${provider} timed out after ${TIMEOUT_MS / 1000}s` };
      persistResult(recordingId, provider, result);
      return result;
    }

    if (run.exitCode !== 0 || !run.stdout.trim()) {
      logger.warn({ recordingId, provider, exitCode: run.exitCode, stderr: run.stderr.slice(0, 2000) }, 'Second-opinion CLI exited without usable output');
      const result: SecondOpinionResult = {
        success: false,
        error: run.stderr.trim().slice(0, 500) || `${provider} exited with code ${run.exitCode}`,
      };
      persistResult(recordingId, provider, result);
      return result;
    }

    const result: SecondOpinionResult = { success: true, content: run.stdout.trim() };
    persistResult(recordingId, provider, result);
    return result;
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    logger.error({ recordingId, provider, error: errMsg }, 'Second-opinion generation threw');
    const result: SecondOpinionResult = { success: false, error: errMsg };
    persistResult(recordingId, provider, result);
    return result;
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true }).catch((error) => {
      logger.warn({ tempDir, error }, 'Failed to clean up second-opinion temp directory');
    });
  }
}

function persistResult(recordingId: number, provider: SecondOpinionProvider, result: SecondOpinionResult): void {
  try {
    createSecondOpinionSummary({
      recordingId,
      provider,
      content: result.content ?? null,
      status: result.success ? 'ready' : 'failed',
      error: result.error ?? null,
    });
  } catch (dbError) {
    logger.error({ recordingId, provider, error: dbError }, 'Failed to persist second-opinion result');
  }
}

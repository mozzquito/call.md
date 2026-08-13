/**
 * Recording Limit Service
 *
 * Enforces the maximum recording length. Counts recording time only: pausing
 * banks the elapsed total and stops the clock, so the cutoff matches the timer
 * the user sees rather than wall-clock time.
 *
 * Lives in the main process so the deadline survives a hidden window, where
 * Chromium throttles renderer timers.
 */

import { createChildLogger } from '../lib/logger';
import {
  MAX_RECORDING_DURATION_MS,
  RECORDING_LIMIT_WARNING_MS,
} from '../../shared/constants/recording';

const logger = createChildLogger('recording-limit');

export interface RecordingLimitCallbacks {
  /** Called once, `RECORDING_LIMIT_WARNING_MS` before the cutoff. */
  onWarning: (msRemaining: number) => void;
  /** Called when the limit is reached. */
  onLimitReached: () => void;
}

interface LimitState {
  callbacks: RecordingLimitCallbacks;
  /** Recording time banked from segments that have already ended. */
  accumulatedMs: number;
  /** When the current segment started, or null while paused. */
  segmentStartedAt: number | null;
  warningTimer: NodeJS.Timeout | null;
  cutoffTimer: NodeJS.Timeout | null;
  warningFired: boolean;
}

let state: LimitState | null = null;

/** Recording time counted so far, in ms. */
function getElapsedMs(current: LimitState): number {
  // null means paused - compare explicitly, a timestamp of 0 is falsy.
  const openSegment =
    current.segmentStartedAt !== null ? Date.now() - current.segmentStartedAt : 0;
  return current.accumulatedMs + openSegment;
}

function clearTimers(current: LimitState): void {
  if (current.warningTimer) clearTimeout(current.warningTimer);
  if (current.cutoffTimer) clearTimeout(current.cutoffTimer);
  current.warningTimer = null;
  current.cutoffTimer = null;
}

/**
 * (Re)arms the warning and cutoff timers from the time recorded so far.
 *
 * Timers do not advance while the machine is asleep, so the cutoff re-checks
 * the real elapsed time when it fires and re-arms if it woke up early.
 */
function armTimers(current: LimitState): void {
  clearTimers(current);

  const remainingMs = MAX_RECORDING_DURATION_MS - getElapsedMs(current);

  if (remainingMs <= 0) {
    fireLimit(current);
    return;
  }

  const warningDelay = remainingMs - RECORDING_LIMIT_WARNING_MS;
  if (!current.warningFired && warningDelay > 0) {
    current.warningTimer = setTimeout(() => {
      if (state !== current) return;
      current.warningFired = true;
      current.warningTimer = null;

      const msRemaining = MAX_RECORDING_DURATION_MS - getElapsedMs(current);
      logger.info({ msRemaining }, 'Recording approaching the maximum length');
      current.callbacks.onWarning(msRemaining);
    }, warningDelay);
  }

  current.cutoffTimer = setTimeout(() => {
    if (state !== current) return;
    current.cutoffTimer = null;

    // The machine may have slept; only stop once the time is genuinely used up.
    const stillRemaining = MAX_RECORDING_DURATION_MS - getElapsedMs(current);
    if (stillRemaining > 0) {
      logger.debug({ stillRemaining }, 'Cutoff timer fired early, re-arming');
      armTimers(current);
      return;
    }

    fireLimit(current);
  }, remainingMs);
}

function fireLimit(current: LimitState): void {
  clearTimers(current);
  logger.info(
    { elapsedMs: getElapsedMs(current), limitMs: MAX_RECORDING_DURATION_MS },
    'Recording reached the maximum length, stopping'
  );
  current.callbacks.onLimitReached();
}

/**
 * Starts tracking a new recording. Replaces any previous tracker.
 */
export function startRecordingLimit(callbacks: RecordingLimitCallbacks): void {
  clearRecordingLimit();

  const current: LimitState = {
    callbacks,
    accumulatedMs: 0,
    segmentStartedAt: Date.now(),
    warningTimer: null,
    cutoffTimer: null,
    warningFired: false,
  };

  state = current;
  armTimers(current);

  logger.info({ limitMs: MAX_RECORDING_DURATION_MS }, 'Recording limit armed');
}

/** Stops the clock while the recording is paused. */
export function pauseRecordingLimit(): void {
  const current = state;
  if (!current || current.segmentStartedAt === null) return;

  current.accumulatedMs = getElapsedMs(current);
  current.segmentStartedAt = null;
  clearTimers(current);

  logger.info({ elapsedMs: current.accumulatedMs }, 'Recording limit paused');
}

/** Restarts the clock after a pause. */
export function resumeRecordingLimit(): void {
  const current = state;
  if (!current || current.segmentStartedAt !== null) return;

  current.segmentStartedAt = Date.now();
  armTimers(current);

  logger.info(
    { remainingMs: MAX_RECORDING_DURATION_MS - getElapsedMs(current) },
    'Recording limit resumed'
  );
}

/** Clears the tracker. Safe to call when nothing is being tracked. */
export function clearRecordingLimit(): void {
  if (!state) return;

  clearTimers(state);
  state = null;
  logger.debug('Recording limit cleared');
}

/** Recording time left before the cutoff, or null when nothing is tracked. */
export function getRecordingTimeRemainingMs(): number | null {
  if (!state) return null;
  return Math.max(0, MAX_RECORDING_DURATION_MS - getElapsedMs(state));
}

/** Whether a recording is currently being tracked. */
export function isRecordingLimitActive(): boolean {
  return state !== null;
}

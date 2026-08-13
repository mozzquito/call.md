/**
 * Recording Limits
 *
 * A recording stops itself once it reaches `MAX_RECORDING_DURATION_MS` of
 * actual recording time. Paused time does not count, so the cutoff lines up
 * with the elapsed timer shown during the meeting.
 *
 * The main process owns the deadline (see `recording-limit.service`) because
 * Chromium throttles timers in hidden windows, and a two-hour meeting usually
 * means the app has been in the tray for most of it.
 */

/** Recordings are cut off after this much recording time. */
export const MAX_RECORDING_DURATION_MS = 2 * 60 * 60 * 1000; // 2 hours

/** How long before the cutoff the user is warned. */
export const RECORDING_LIMIT_WARNING_MS = 5 * 60 * 1000; // 5 minutes

/**
 * If the renderer does not complete the stop within this window - its window
 * may be gone - the main process stops the capture itself.
 */
export const RECORDING_LIMIT_STOP_GRACE_MS = 20 * 1000;

/**
 * Renders a duration as a short phrase for notifications, e.g. "2 hours",
 * "5 minutes", "1 hour 30 minutes".
 */
export function formatDurationLabel(ms: number): string {
  const totalMinutes = Math.max(0, Math.round(ms / 60000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  const parts: string[] = [];
  if (hours > 0) parts.push(`${hours} hour${hours === 1 ? '' : 's'}`);
  if (minutes > 0) parts.push(`${minutes} minute${minutes === 1 ? '' : 's'}`);

  return parts.length > 0 ? parts.join(' ') : 'less than a minute';
}

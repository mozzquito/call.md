/**
 * Tests for the recording-length cutoff.
 *
 * Uses node:test mock timers so a two-hour limit runs instantly. Electron is
 * stubbed through the require cache because the service pulls in the logger.
 *
 * Run with: npm test
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import Module from 'node:module';
import { EventEmitter } from 'node:events';

const powerMonitor = new EventEmitter();

const electronPath = require.resolve('electron');
require.cache[electronPath] = Object.assign(new Module(electronPath), {
  id: electronPath,
  filename: electronPath,
  loaded: true,
  exports: {
    app: { getPath: () => os.tmpdir(), isPackaged: true },
    safeStorage: { isEncryptionAvailable: () => false },
    powerMonitor,
  },
});

// eslint-disable-next-line @typescript-eslint/no-var-requires
const limit = require('../src/main/services/recording-limit.service') as typeof import('../src/main/services/recording-limit.service');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const constants = require('../src/shared/constants/recording') as typeof import('../src/shared/constants/recording');

const {
  startRecordingLimit,
  pauseRecordingLimit,
  resumeRecordingLimit,
  clearRecordingLimit,
  getRecordingTimeRemainingMs,
  isRecordingLimitActive,
} = limit;

const { MAX_RECORDING_DURATION_MS, RECORDING_LIMIT_WARNING_MS, formatDurationLabel } = constants;

const MINUTE = 60 * 1000;

/** Records callback invocations so tests can assert on ordering and counts. */
function spyCallbacks() {
  const calls = { warnings: [] as number[], stops: 0 };
  return {
    calls,
    onWarning: (msRemaining: number) => calls.warnings.push(msRemaining),
    onLimitReached: () => {
      calls.stops += 1;
    },
  };
}

test('the limit is two hours', () => {
  assert.equal(MAX_RECORDING_DURATION_MS, 2 * 60 * 60 * 1000);
});

test('stops the recording once the limit is reached', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  t.after(() => clearRecordingLimit());

  const spy = spyCallbacks();
  startRecordingLimit(spy);

  t.mock.timers.tick(MAX_RECORDING_DURATION_MS - 1);
  assert.equal(spy.calls.stops, 0, 'must not stop before the limit');

  t.mock.timers.tick(1);
  assert.equal(spy.calls.stops, 1, 'stops exactly at the limit');
});

test('warns five minutes before the cutoff', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  t.after(() => clearRecordingLimit());

  const spy = spyCallbacks();
  startRecordingLimit(spy);

  t.mock.timers.tick(MAX_RECORDING_DURATION_MS - RECORDING_LIMIT_WARNING_MS - 1);
  assert.equal(spy.calls.warnings.length, 0);

  t.mock.timers.tick(1);
  assert.equal(spy.calls.warnings.length, 1, 'warns once');
  assert.equal(spy.calls.warnings[0], RECORDING_LIMIT_WARNING_MS);
  assert.equal(spy.calls.stops, 0, 'warning is not a stop');

  t.mock.timers.tick(RECORDING_LIMIT_WARNING_MS);
  assert.equal(spy.calls.stops, 1);
  assert.equal(spy.calls.warnings.length, 1, 'still only one warning');
});

test('paused time does not count toward the limit', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  t.after(() => clearRecordingLimit());

  const spy = spyCallbacks();
  startRecordingLimit(spy);

  t.mock.timers.tick(30 * MINUTE); // 30 min recorded
  pauseRecordingLimit();

  t.mock.timers.tick(5 * 60 * MINUTE); // paused for five hours
  assert.equal(spy.calls.stops, 0, 'a pause must never trigger the cutoff');
  assert.equal(getRecordingTimeRemainingMs(), MAX_RECORDING_DURATION_MS - 30 * MINUTE);

  resumeRecordingLimit();

  t.mock.timers.tick(MAX_RECORDING_DURATION_MS - 30 * MINUTE - 1);
  assert.equal(spy.calls.stops, 0);

  t.mock.timers.tick(1);
  assert.equal(spy.calls.stops, 1, 'stops after two hours of recording, not wall-clock');
});

test('time spent in system sleep does not count toward the limit', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  t.after(() => clearRecordingLimit());

  const spy = spyCallbacks();
  startRecordingLimit(spy);

  t.mock.timers.tick(30 * MINUTE);
  powerMonitor.emit('suspend');
  t.mock.timers.tick(8 * 60 * MINUTE);

  assert.equal(spy.calls.stops, 0);
  assert.equal(getRecordingTimeRemainingMs(), MAX_RECORDING_DURATION_MS - 30 * MINUTE);

  powerMonitor.emit('resume');
  t.mock.timers.tick(MAX_RECORDING_DURATION_MS - 30 * MINUTE);
  assert.equal(spy.calls.stops, 1);
});

test('system resume does not undo an explicit user pause', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  t.after(() => clearRecordingLimit());

  const spy = spyCallbacks();
  startRecordingLimit(spy);
  pauseRecordingLimit();
  powerMonitor.emit('suspend');
  powerMonitor.emit('resume');

  t.mock.timers.tick(MAX_RECORDING_DURATION_MS * 2);
  assert.equal(spy.calls.stops, 0);
  assert.equal(getRecordingTimeRemainingMs(), MAX_RECORDING_DURATION_MS);

  resumeRecordingLimit();
  t.mock.timers.tick(MAX_RECORDING_DURATION_MS);
  assert.equal(spy.calls.stops, 1);
});

test('a warning already due still fires after a pause', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  t.after(() => clearRecordingLimit());

  const spy = spyCallbacks();
  startRecordingLimit(spy);

  // Pause with less than the warning lead time left.
  t.mock.timers.tick(MAX_RECORDING_DURATION_MS - 2 * MINUTE);
  assert.equal(spy.calls.warnings.length, 1, 'warning already fired before the pause');

  pauseRecordingLimit();
  t.mock.timers.tick(60 * MINUTE);
  resumeRecordingLimit();

  t.mock.timers.tick(2 * MINUTE);
  assert.equal(spy.calls.stops, 1);
  assert.equal(spy.calls.warnings.length, 1, 'the warning is not repeated on resume');
});

test('stopping the recording disarms the cutoff', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });

  const spy = spyCallbacks();
  startRecordingLimit(spy);
  assert.equal(isRecordingLimitActive(), true);

  clearRecordingLimit();
  assert.equal(isRecordingLimitActive(), false);
  assert.equal(getRecordingTimeRemainingMs(), null);

  t.mock.timers.tick(MAX_RECORDING_DURATION_MS * 2);
  assert.equal(spy.calls.stops, 0, 'a stopped recording must never be re-stopped');
  assert.equal(spy.calls.warnings.length, 0);
});

test('a new recording gets a full budget and the old one is dropped', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  t.after(() => clearRecordingLimit());

  const first = spyCallbacks();
  startRecordingLimit(first);
  t.mock.timers.tick(90 * MINUTE);

  const second = spyCallbacks();
  startRecordingLimit(second);
  assert.equal(getRecordingTimeRemainingMs(), MAX_RECORDING_DURATION_MS);

  t.mock.timers.tick(MAX_RECORDING_DURATION_MS);
  assert.equal(second.calls.stops, 1);
  assert.equal(first.calls.stops, 0, 'the replaced tracker must not fire');
});

test('reports the time remaining as recording progresses', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  t.after(() => clearRecordingLimit());

  assert.equal(getRecordingTimeRemainingMs(), null, 'null when idle');

  startRecordingLimit(spyCallbacks());
  assert.equal(getRecordingTimeRemainingMs(), MAX_RECORDING_DURATION_MS);

  t.mock.timers.tick(45 * MINUTE);
  assert.equal(getRecordingTimeRemainingMs(), MAX_RECORDING_DURATION_MS - 45 * MINUTE);

  t.mock.timers.tick(MAX_RECORDING_DURATION_MS);
  assert.equal(getRecordingTimeRemainingMs(), 0, 'never goes negative');
});

test('pause and resume are safe to call out of order', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  t.after(() => clearRecordingLimit());

  // No active recording - these must not throw.
  pauseRecordingLimit();
  resumeRecordingLimit();

  const spy = spyCallbacks();
  startRecordingLimit(spy);

  resumeRecordingLimit(); // already running
  t.mock.timers.tick(30 * MINUTE);

  pauseRecordingLimit();
  pauseRecordingLimit(); // double pause must not bank the time twice
  assert.equal(getRecordingTimeRemainingMs(), MAX_RECORDING_DURATION_MS - 30 * MINUTE);

  resumeRecordingLimit();
  t.mock.timers.tick(MAX_RECORDING_DURATION_MS - 30 * MINUTE);
  assert.equal(spy.calls.stops, 1);
});

test('formats durations for notifications', () => {
  assert.equal(formatDurationLabel(MAX_RECORDING_DURATION_MS), '2 hours');
  assert.equal(formatDurationLabel(RECORDING_LIMIT_WARNING_MS), '5 minutes');
  assert.equal(formatDurationLabel(60 * MINUTE), '1 hour');
  assert.equal(formatDurationLabel(90 * MINUTE), '1 hour 30 minutes');
  assert.equal(formatDurationLabel(0), 'less than a minute');
});

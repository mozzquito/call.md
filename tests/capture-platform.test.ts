import test from 'node:test';
import assert from 'node:assert/strict';
import { getRecordingPlatformSupport } from '../src/main/lib/capture-platform';

test('supports every target shipped by videodb/capture', () => {
  assert.equal(getRecordingPlatformSupport('darwin', 'arm64').supported, true);
  assert.equal(getRecordingPlatformSupport('darwin', 'x64').supported, true);
  assert.equal(getRecordingPlatformSupport('win32', 'x64').supported, true);
});

test('rejects targets without a capture binary', () => {
  const linux = getRecordingPlatformSupport('linux', 'x64');
  assert.equal(linux.supported, false);
  assert.match(linux.reason ?? '', /linux-x64/);

  assert.equal(getRecordingPlatformSupport('win32', 'arm64').supported, false);
});

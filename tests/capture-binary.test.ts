import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { getCaptureBinarySource, isCaptureCommand } from '../src/main/lib/capture-binary';

test('resolves the packaged macOS Capture bundle binary', () => {
  assert.deepEqual(getCaptureBinarySource('/app/videodb/bin', 'darwin'), {
    sourceDirectory: path.join(
      '/app/videodb/bin',
      'VideoDBCapture.app',
      'Contents',
      'MacOS'
    ),
    binaryName: 'capture',
  });
});

test('resolves the packaged Windows capture.exe binary', () => {
  assert.deepEqual(getCaptureBinarySource('C:\\app\\videodb\\bin', 'win32'), {
    sourceDirectory: 'C:\\app\\videodb\\bin',
    binaryName: 'capture.exe',
  });
});

test('refuses platforms without an SDK capture target', () => {
  assert.throws(
    () => getCaptureBinarySource('/app/videodb/bin', 'linux'),
    /unsupported/
  );
});

test('redirects only the exact SDK capture executable on both platforms', () => {
  assert.equal(isCaptureCommand('/bundle/bin/capture', 'capture'), true);
  assert.equal(isCaptureCommand('C:\\bundle\\bin\\capture.exe', 'capture.exe'), true);
  assert.equal(isCaptureCommand('/tmp/capture-helper', 'capture'), false);
  assert.equal(isCaptureCommand('/tmp/notcapture.exe', 'capture.exe'), false);
});

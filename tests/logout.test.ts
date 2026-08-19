import test from 'node:test';
import assert from 'node:assert/strict';
import { logoutAndClearLocalAuth } from '../src/renderer/lib/logout';

test('logout clears persisted credentials before renderer auth', async () => {
  const calls: string[] = [];

  await logoutAndClearLocalAuth(
    { logout: async () => { calls.push('main'); } },
    () => { calls.push('renderer'); }
  );

  assert.deepEqual(calls, ['main', 'renderer']);
});

test('logout keeps renderer state when persisted credential deletion fails', async () => {
  let localCleared = false;

  await assert.rejects(
    logoutAndClearLocalAuth(
      { logout: async () => { throw new Error('disk failure'); } },
      () => { localCleared = true; }
    ),
    /disk failure/
  );

  assert.equal(localCleared, false);
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { useSessionStore } from './session.store';

test('expires a cached session token when the account changes', () => {
  const expiresAt = Date.now() / 1000 + 60 * 60;

  useSessionStore.getState().setSessionToken('session-a', expiresAt, 'account-a');

  assert.equal(useSessionStore.getState().isTokenExpired('account-a'), false);
  assert.equal(useSessionStore.getState().isTokenExpired('account-b'), true);
});

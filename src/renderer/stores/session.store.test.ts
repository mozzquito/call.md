import assert from 'node:assert/strict';
import test from 'node:test';
import { useSessionStore } from './session.store';

test('expires a cached session token when its credentials change', () => {
  const expiresAt = Date.now() / 1000 + 60 * 60;
  const owner = { accessToken: 'account-a', apiKey: 'key-a' };

  useSessionStore.getState().setSessionToken('session-a', expiresAt, owner);

  assert.equal(useSessionStore.getState().isTokenExpired({ ...owner }), false);
  assert.equal(
    useSessionStore.getState().isTokenExpired({ ...owner, accessToken: 'account-b' }),
    true
  );
  assert.equal(
    useSessionStore.getState().isTokenExpired({ ...owner, apiKey: 'key-b' }),
    true
  );
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { commitAccountMutation } from '../src/main/lib/account-transaction';

test('account mutation persists after applying the local update', () => {
  const calls: string[] = [];
  commitAccountMutation(
    () => calls.push('apply'),
    () => calls.push('rollback'),
    () => calls.push('persist')
  );
  assert.deepEqual(calls, ['apply', 'persist']);
});

test('account mutation rolls the database back when persistence fails', () => {
  const calls: string[] = [];
  assert.throws(
    () => commitAccountMutation(
      () => calls.push('apply'),
      () => calls.push('rollback'),
      () => {
        calls.push('persist');
        throw new Error('disk full');
      }
    ),
    /disk full/
  );
  assert.deepEqual(calls, ['apply', 'persist', 'rollback']);
});

test('account mutation reports both persistence and rollback failures', () => {
  assert.throws(
    () => commitAccountMutation(
      () => undefined,
      () => { throw new Error('rollback failed'); },
      () => { throw new Error('persist failed'); }
    ),
    AggregateError
  );
});

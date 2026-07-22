import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveTheme } from './theme.store';

test('explicit themes ignore the system preference', () => {
  assert.equal(resolveTheme('light', true), 'light');
  assert.equal(resolveTheme('dark', false), 'dark');
});

test('system theme follows the system preference', () => {
  assert.equal(resolveTheme('system', false), 'light');
  assert.equal(resolveTheme('system', true), 'dark');
});

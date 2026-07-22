import assert from 'node:assert/strict';
import test from 'node:test';
import { isThemeSource, resolveTheme } from './theme';

test('validates theme sources', () => {
  assert.equal(isThemeSource('system'), true);
  assert.equal(isThemeSource('light'), true);
  assert.equal(isThemeSource('dark'), true);
  assert.equal(isThemeSource('sepia'), false);
});

test('explicit themes ignore the system preference', () => {
  assert.equal(resolveTheme('light', true), 'light');
  assert.equal(resolveTheme('dark', false), 'dark');
});

test('system theme follows the system preference', () => {
  assert.equal(resolveTheme('system', false), 'light');
  assert.equal(resolveTheme('system', true), 'dark');
});

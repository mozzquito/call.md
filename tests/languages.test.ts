/**
 * Tests for transcription language handling (issue #25).
 *
 * Run with: npm test
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AUTO_LANGUAGE,
  TRANSCRIPTION_LANGUAGES,
  isSupportedLanguage,
  toLanguageCode,
  getLanguageLabel,
} from '../src/shared/constants/languages';

test('auto means "send no language_code"', () => {
  assert.equal(toLanguageCode(AUTO_LANGUAGE), undefined);
  assert.equal(toLanguageCode(undefined), undefined);
  assert.equal(toLanguageCode(''), undefined);
});

test('supported languages pass through unchanged', () => {
  assert.equal(toLanguageCode('ja'), 'ja');
  assert.equal(toLanguageCode('es'), 'es');
  assert.equal(toLanguageCode('en'), 'en');
});

test('unknown codes fall back to auto rather than being sent', () => {
  assert.equal(toLanguageCode('klingon'), undefined);
  assert.equal(toLanguageCode('xx-YY'), undefined);
});

test('the language list is well formed', () => {
  const codes = TRANSCRIPTION_LANGUAGES.map((language) => language.code);

  assert.equal(codes[0], AUTO_LANGUAGE, 'auto should be listed first');
  assert.equal(new Set(codes).size, codes.length, 'codes must be unique');

  for (const language of TRANSCRIPTION_LANGUAGES) {
    assert.ok(language.label.length > 0, `${language.code} needs a label`);
    assert.ok(language.nativeLabel.length > 0, `${language.code} needs a native label`);
  }
});

test('Japanese is selectable — the case from issue #25', () => {
  assert.equal(isSupportedLanguage('ja'), true);
  assert.equal(getLanguageLabel('ja'), 'Japanese');
});

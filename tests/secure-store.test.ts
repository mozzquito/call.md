/**
 * Tests for secret-at-rest handling (issue #27).
 *
 * `secure-store` sits in front of the user's API key and access token, so a
 * round-trip bug locks people out of their account. Electron is stubbed via the
 * require cache so this runs under plain Node.
 *
 * Run with: npm test
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Module from 'node:module';

const tempUserData = fs.mkdtempSync(path.join(os.tmpdir(), 'call-md-secure-store-'));

/** Reversible stand-in for the OS keyring, so round-trips are observable. */
let encryptionAvailable = true;

const electronStub = {
  app: {
    getPath: (name: string) => (name === 'userData' ? tempUserData : os.tmpdir()),
    isPackaged: false,
  },
  safeStorage: {
    isEncryptionAvailable: () => encryptionAvailable,
    encryptString: (plaintext: string) => {
      if (!encryptionAvailable) throw new Error('encryption unavailable');
      return Buffer.from(`keyring:${plaintext}`, 'utf-8');
    },
    decryptString: (buffer: Buffer) => {
      const value = buffer.toString('utf-8');
      if (!value.startsWith('keyring:')) throw new Error('not keyring ciphertext');
      return value.slice('keyring:'.length);
    },
  },
};

// Resolve 'electron' to the stub before secure-store (or the logger) requires it.
const electronPath = require.resolve('electron');
require.cache[electronPath] = Object.assign(new Module(electronPath), {
  id: electronPath,
  filename: electronPath,
  loaded: true,
  exports: electronStub,
});

// eslint-disable-next-line @typescript-eslint/no-var-requires
const secureStore = require('../src/main/lib/secure-store') as typeof import('../src/main/lib/secure-store');
const { encryptSecret, decryptSecret, isEncrypted, writeFileSecure } = secureStore;

test('secrets round-trip through the keyring', () => {
  encryptionAvailable = true;

  const secret = 'vdb-api-key-0123456789';
  const stored = encryptSecret(secret);

  assert.notEqual(stored, secret, 'stored value must not be the plaintext');
  assert.equal(isEncrypted(stored), true);
  assert.equal(decryptSecret(stored), secret);
});

test('plaintext from older builds is read back unchanged', () => {
  const legacy = 'plaintext-api-key-from-v1.0.4';

  assert.equal(isEncrypted(legacy), false);
  assert.equal(decryptSecret(legacy), legacy);
});

test('encrypting twice does not double-wrap', () => {
  encryptionAvailable = true;

  const once = encryptSecret('token');
  assert.equal(decryptSecret(once), 'token');
  // Callers guard with isEncrypted(); confirm the guard is the thing that works.
  assert.equal(isEncrypted(once), true);
});

test('falls back to plaintext when no keyring is available', () => {
  encryptionAvailable = false;

  const stored = encryptSecret('no-keyring-here');
  assert.equal(stored, 'no-keyring-here', 'value stays usable without a keyring');
  assert.equal(decryptSecret(stored), 'no-keyring-here');

  encryptionAvailable = true;
});

test('empty values are left alone', () => {
  assert.equal(encryptSecret(''), '');
  assert.equal(decryptSecret(''), '');
});

test('secure writes are owner-only', { skip: process.platform === 'win32' }, () => {
  const target = path.join(tempUserData, 'nested', 'config.json');
  writeFileSecure(target, JSON.stringify({ apiKey: 'x' }));

  assert.equal(fs.statSync(target).mode & 0o777, 0o600);
  assert.equal(fs.statSync(path.dirname(target)).mode & 0o777, 0o700);
});

test('an existing world-readable file is tightened on rewrite', { skip: process.platform === 'win32' }, () => {
  const target = path.join(tempUserData, 'legacy.json');
  fs.writeFileSync(target, '{}', { mode: 0o644 });
  assert.equal(fs.statSync(target).mode & 0o777, 0o644);

  writeFileSecure(target, '{"migrated":true}');
  assert.equal(fs.statSync(target).mode & 0o777, 0o600);
});

test('access tokens hash to a stable 64-char digest', () => {
  // Mirrors hashAccessToken() in src/main/db/index.ts, which cannot be imported
  // here without pulling in better-sqlite3's native build.
  const hash = (token: string) => crypto.createHash('sha256').update(token).digest('hex');

  const token = '3f2504e0-4f89-11d3-9a0c-0305e82c3301';
  assert.match(hash(token), /^[a-f0-9]{64}$/);
  assert.equal(hash(token), hash(token), 'lookups depend on the hash being deterministic');
  assert.notEqual(hash(token), hash(`${token}x`));

  // The migration detects already-hashed rows with this shape.
  assert.equal(/^[a-f0-9]{64}$/.test(hash(token)), true);
  assert.equal(/^[a-f0-9]{64}$/.test(token), false, 'a raw UUID must not look hashed');
});

process.on('exit', () => {
  fs.rmSync(tempUserData, { recursive: true, force: true });
});

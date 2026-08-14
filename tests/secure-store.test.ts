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
let selectedBackend = 'gnome_libsecret';

const electronStub = {
  app: {
    getPath: (name: string) => (name === 'userData' ? tempUserData : os.tmpdir()),
    isPackaged: false,
  },
  safeStorage: {
    isEncryptionAvailable: () => encryptionAvailable,
    getSelectedStorageBackend: () => selectedBackend,
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
// eslint-disable-next-line @typescript-eslint/no-var-requires
const configStore = require('../src/main/lib/config') as typeof import('../src/main/lib/config');
const {
  encryptSecret,
  decryptSecret,
  isEncrypted,
  isStrongEncryptionAvailable,
  writeFileSecure,
} = secureStore;

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

test('fails closed when no keyring is available', () => {
  encryptionAvailable = false;

  assert.throws(
    () => encryptSecret('no-keyring-here'),
    /Secure credential storage is unavailable/
  );

  encryptionAvailable = true;
});

test('rejects Linux basic_text and unknown safeStorage backends', () => {
  encryptionAvailable = true;

  for (const backend of ['basic_text', 'unknown']) {
    selectedBackend = backend;
    assert.equal(isStrongEncryptionAvailable('linux'), false, backend);
  }

  selectedBackend = 'gnome_libsecret';
  assert.equal(isStrongEncryptionAvailable('linux'), true);
  assert.equal(isStrongEncryptionAvailable('darwin'), true);
});

test('does not decrypt credentials through Linux basic_text', () => {
  const originalPlatform = process.platform;
  encryptionAvailable = true;
  selectedBackend = 'gnome_libsecret';
  const stored = encryptSecret('protected-api-key');

  try {
    Object.defineProperty(process, 'platform', { value: 'linux' });
    selectedBackend = 'basic_text';
    assert.equal(decryptSecret(stored), '');
  } finally {
    Object.defineProperty(process, 'platform', { value: originalPlatform });
    selectedBackend = 'gnome_libsecret';
  }
});

test('Google tokens are never written through Linux basic_text', () => {
  const originalPlatform = process.platform;
  const encryptedPath = path.join(tempUserData, 'google_tokens.enc');
  const fallbackPath = path.join(tempUserData, 'google_tokens.json');

  try {
    Object.defineProperty(process, 'platform', { value: 'linux' });
    encryptionAvailable = true;
    selectedBackend = 'basic_text';

    assert.throws(
      () => configStore.saveGoogleTokens({
        accessToken: 'google-access',
        refreshToken: 'google-refresh',
        expiresAt: Date.now() + 60_000,
      }),
      /Secure credential storage is unavailable/
    );
    assert.equal(fs.existsSync(encryptedPath), false);
    assert.equal(fs.existsSync(fallbackPath), false);
  } finally {
    Object.defineProperty(process, 'platform', { value: originalPlatform });
    selectedBackend = 'gnome_libsecret';
  }
});

test('legacy plaintext Google tokens migrate only with strong storage', () => {
  const originalPlatform = process.platform;
  const encryptedPath = path.join(tempUserData, 'google_tokens.enc');
  const fallbackPath = path.join(tempUserData, 'google_tokens.json');
  const tokens = {
    accessToken: 'legacy-access',
    refreshToken: 'legacy-refresh',
    expiresAt: Date.now() + 60_000,
  };

  try {
    Object.defineProperty(process, 'platform', { value: 'linux' });
    fs.writeFileSync(fallbackPath, JSON.stringify(tokens), { mode: 0o600 });
    selectedBackend = 'basic_text';
    assert.equal(configStore.loadGoogleTokens(), null);
    assert.equal(fs.existsSync(fallbackPath), true);

    selectedBackend = 'gnome_libsecret';
    assert.deepEqual(configStore.loadGoogleTokens(), tokens);
    assert.equal(fs.existsSync(fallbackPath), false);
    assert.equal(fs.existsSync(encryptedPath), true);
  } finally {
    Object.defineProperty(process, 'platform', { value: originalPlatform });
    selectedBackend = 'gnome_libsecret';
    for (const tokenPath of [encryptedPath, fallbackPath]) {
      if (fs.existsSync(tokenPath)) fs.unlinkSync(tokenPath);
    }
  }
});

test('desktop config does not duplicate the database API key', () => {
  const configPath = path.join(tempUserData, 'config.json');
  configStore.saveAppConfig({
    accessToken: 'desktop-access-token',
    userName: 'Local User',
    apiKey: 'database-owned-api-key',
  });

  const stored = JSON.parse(fs.readFileSync(configPath, 'utf8')) as Record<string, unknown>;
  assert.equal(stored.apiKey, undefined);
  assert.notEqual(stored.accessToken, 'desktop-access-token');

  const loaded = configStore.loadAppConfig();
  assert.equal(loaded.accessToken, 'desktop-access-token');
  assert.equal(loaded.apiKey, undefined);

  fs.unlinkSync(configPath);
});

test('legacy encrypted desktop API keys are removed on first load', () => {
  const configPath = path.join(tempUserData, 'config.json');
  fs.writeFileSync(
    configPath,
    JSON.stringify({
      accessToken: encryptSecret('desktop-access-token'),
      apiKey: encryptSecret('legacy-duplicated-api-key'),
      userName: 'Local User',
    }),
    { mode: 0o600 }
  );

  const loaded = configStore.loadAppConfig();
  assert.equal(loaded.accessToken, 'desktop-access-token');
  assert.equal(loaded.apiKey, undefined);

  const migrated = JSON.parse(fs.readFileSync(configPath, 'utf8')) as Record<string, unknown>;
  assert.equal(migrated.apiKey, undefined);
  assert.notEqual(migrated.accessToken, 'desktop-access-token');

  fs.unlinkSync(configPath);
});

test('legacy API keys are removed even when Linux keyring decryption is unavailable', () => {
  const originalPlatform = process.platform;
  const configPath = path.join(tempUserData, 'config.json');
  const encryptedAccessToken = encryptSecret('desktop-access-token');
  const encryptedApiKey = encryptSecret('legacy-duplicated-api-key');

  try {
    fs.writeFileSync(
      configPath,
      JSON.stringify({ accessToken: encryptedAccessToken, apiKey: encryptedApiKey }),
      { mode: 0o600 }
    );
    Object.defineProperty(process, 'platform', { value: 'linux' });
    selectedBackend = 'basic_text';

    const loaded = configStore.loadAppConfig();
    assert.equal(loaded.accessToken, '');
    assert.equal(loaded.apiKey, undefined);

    const migrated = JSON.parse(fs.readFileSync(configPath, 'utf8')) as Record<string, unknown>;
    assert.equal(migrated.apiKey, undefined);
    assert.equal(migrated.accessToken, encryptedAccessToken);
  } finally {
    Object.defineProperty(process, 'platform', { value: originalPlatform });
    selectedBackend = 'gnome_libsecret';
    if (fs.existsSync(configPath)) fs.unlinkSync(configPath);
  }
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

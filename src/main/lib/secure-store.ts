/**
 * Secure Store
 *
 * Small helpers for keeping secrets out of plaintext on disk.
 *
 * Two layers, in order of preference:
 *
 * 1. `safeStorage` — Electron's OS-backed encryption (Keychain on macOS, DPAPI
 *    on Windows, libsecret on Linux). The key never touches our disk.
 * If the OS keyring is unavailable, writes fail closed. Persisting a fallback
 * key beside its ciphertext would not protect the secret from a local reader.
 *
 * Values are tagged with a version prefix so plaintext written by older builds
 * can be recognised and migrated in place on first read.
 */

import { safeStorage } from 'electron';
import fs from 'fs';
import path from 'path';
import { createChildLogger } from './logger';

const logger = createChildLogger('secure-store');

/** Marks a value encrypted with `safeStorage`, base64-encoded. */
const SAFE_STORAGE_PREFIX = 'enc:v1:';

/** Owner-only file and directory modes. */
export const FILE_MODE = 0o600;
export const DIR_MODE = 0o700;

export function isEncrypted(value: string): boolean {
  return value.startsWith(SAFE_STORAGE_PREFIX);
}

/**
 * Returns whether Electron is backed by a real OS credential store.
 * Linux's `basic_text` backend uses a hard-coded password and must not be
 * treated as encryption for API keys or OAuth tokens.
 */
export function isStrongEncryptionAvailable(platform: NodeJS.Platform = process.platform): boolean {
  try {
    if (!safeStorage.isEncryptionAvailable()) return false;
    if (platform !== 'linux') return true;

    const backend = safeStorage.getSelectedStorageBackend();
    return backend !== 'basic_text' && backend !== 'unknown';
  } catch (error) {
    logger.error({ error }, 'Failed to inspect safeStorage backend');
    return false;
  }
}

/**
 * Encrypts a secret for storage on disk.
 *
 * Throws when no OS keyring is available. A secret must never be silently
 * written as plaintext merely to keep the caller working.
 */
export function encryptSecret(plaintext: string): string {
  if (!plaintext) return plaintext;

  try {
    if (isStrongEncryptionAvailable()) {
      return SAFE_STORAGE_PREFIX + safeStorage.encryptString(plaintext).toString('base64');
    }
  } catch (error) {
    logger.error({ error }, 'safeStorage encryption failed');
    throw new Error('Secure credential storage is unavailable');
  }

  throw new Error('Secure credential storage is unavailable');
}

/**
 * Decrypts a value written by `encryptSecret`. Values without the version
 * prefix are assumed to be plaintext from an older build and returned as-is.
 */
export function decryptSecret(value: string): string {
  if (!value || !isEncrypted(value)) return value;

  try {
    if (!isStrongEncryptionAvailable()) {
      throw new Error('Secure credential storage is unavailable');
    }
    const payload = Buffer.from(value.slice(SAFE_STORAGE_PREFIX.length), 'base64');
    return safeStorage.decryptString(payload);
  } catch (error) {
    logger.error({ error }, 'Failed to decrypt secret');
    return '';
  }
}

/**
 * Writes a file readable only by the current user.
 *
 * `fs.writeFileSync`'s mode is ignored when the file already exists, so an
 * explicit chmod follows the write to fix up files created by older builds.
 */
export function writeFileSecure(filePath: string, data: string | Buffer): void {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true, mode: DIR_MODE });
  }

  const temporaryPath = `${filePath}.${process.pid}.tmp`;

  try {
    fs.writeFileSync(temporaryPath, data, { mode: FILE_MODE });
    fs.chmodSync(temporaryPath, FILE_MODE);
    fs.renameSync(temporaryPath, filePath);
  } catch (error) {
    try {
      if (fs.existsSync(temporaryPath)) fs.unlinkSync(temporaryPath);
    } catch {
      // Preserve the original write error.
    }
    throw error;
  }

  try {
    fs.chmodSync(filePath, FILE_MODE);
  } catch (error) {
    logger.warn({ error, filePath }, 'Failed to restrict file permissions');
  }
}

/**
 * Tightens permissions on a file or directory that already exists.
 * Best-effort: Windows ACLs do not map onto POSIX modes.
 */
export function restrictPermissions(targetPath: string, mode: number = FILE_MODE): void {
  try {
    if (fs.existsSync(targetPath)) {
      fs.chmodSync(targetPath, mode);
    }
  } catch (error) {
    logger.warn({ error, targetPath }, 'Failed to restrict permissions');
  }
}

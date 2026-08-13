import { app, safeStorage } from 'electron';
import path from 'path';
import fs from 'fs';
import type { AppConfig, RuntimeConfig } from '../../shared/schemas/config.schema';
import type { GoogleTokens, GoogleOAuthConfig } from '../../shared/types/calendar.types';
import { logger } from './logger';
import {
  encryptSecret,
  decryptSecret,
  isEncrypted,
  writeFileSecure,
  restrictPermissions,
  FILE_MODE,
  DIR_MODE,
} from './secure-store';

const CONFIG_FILENAME = 'config.json';
const RUNTIME_FILENAME = 'runtime.json';
const AUTH_CONFIG_FILENAME = 'auth_config.json';
const GOOGLE_OAUTH_FILENAME = 'google_oauth.json';
const GOOGLE_TOKENS_FILENAME = 'google_tokens.enc';
const GOOGLE_TOKENS_FALLBACK_FILENAME = 'google_tokens.json';
const ENCRYPTION_KEY_FILENAME = '.mcp-encryption-key';

export function getConfigPath(): string {
  return path.join(app.getPath('userData'), CONFIG_FILENAME);
}

/**
 * Tightens permissions on the app data directory and the files inside it that
 * hold recordings metadata, transcripts and tokens.
 *
 * Electron creates userData as 0755, which leaves everything readable by other
 * local accounts. Run once at startup, before any of it is opened.
 */
export function secureUserDataDir(): void {
  const userDataPath = app.getPath('userData');

  restrictPermissions(userDataPath, DIR_MODE);

  const sensitivePaths = [
    path.join(userDataPath, CONFIG_FILENAME),
    path.join(userDataPath, GOOGLE_TOKENS_FILENAME),
    path.join(userDataPath, GOOGLE_TOKENS_FALLBACK_FILENAME),
    path.join(userDataPath, ENCRYPTION_KEY_FILENAME),
  ];

  for (const sensitivePath of sensitivePaths) {
    restrictPermissions(sensitivePath, FILE_MODE);
  }

  for (const dirName of ['data', 'logs']) {
    const dirPath = path.join(userDataPath, dirName);
    restrictPermissions(dirPath, DIR_MODE);

    try {
      if (fs.existsSync(dirPath)) {
        for (const entry of fs.readdirSync(dirPath)) {
          restrictPermissions(path.join(dirPath, entry), FILE_MODE);
        }
      }
    } catch (error) {
      logger.warn({ error, dirPath }, 'Failed to restrict permissions on app data directory');
    }
  }
}

export function getRuntimeConfigPath(): string {
  // Runtime config is in the app directory (for development) or resources (for production)
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'resources', RUNTIME_FILENAME);
  }
  return path.join(app.getAppPath(), RUNTIME_FILENAME);
}

export function getAuthConfigPath(): string {
  // Auth config is in the app directory (for auto-registration on startup)
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'resources', AUTH_CONFIG_FILENAME);
  }
  return path.join(app.getAppPath(), AUTH_CONFIG_FILENAME);
}

/**
 * Fields in config.json that hold secrets and are encrypted at rest.
 */
const SECRET_CONFIG_KEYS = ['accessToken', 'apiKey'] as const;

function decryptConfigSecrets(config: AppConfig): { config: AppConfig; hadPlaintext: boolean } {
  let hadPlaintext = false;

  for (const key of SECRET_CONFIG_KEYS) {
    const value = config[key];
    if (typeof value !== 'string' || !value) continue;

    if (isEncrypted(value)) {
      config[key] = decryptSecret(value);
    } else {
      // Written by a build that stored secrets in the clear.
      hadPlaintext = true;
    }
  }

  return { config, hadPlaintext };
}

function encryptConfigSecrets(config: AppConfig): AppConfig {
  const encrypted: AppConfig = { ...config };

  for (const key of SECRET_CONFIG_KEYS) {
    const value = encrypted[key];
    if (typeof value === 'string' && value && !isEncrypted(value)) {
      encrypted[key] = encryptSecret(value);
    }
  }

  return encrypted;
}

export function loadAppConfig(): AppConfig {
  const configPath = getConfigPath();
  try {
    if (fs.existsSync(configPath)) {
      const data = fs.readFileSync(configPath, 'utf-8');
      const { config, hadPlaintext } = decryptConfigSecrets(JSON.parse(data) as AppConfig);

      // Upgrade legacy plaintext configs the first time they are read.
      if (hadPlaintext) {
        logger.info({ configPath }, 'Migrating plaintext app config to encrypted storage');
        saveAppConfig(config);
      }

      return config;
    }
  } catch (error) {
    logger.error({ error, configPath }, 'Failed to load app config');
  }
  return {};
}

export function saveAppConfig(config: AppConfig): void {
  const configPath = getConfigPath();
  try {
    writeFileSecure(configPath, JSON.stringify(encryptConfigSecrets(config), null, 2));
    logger.info({ configPath }, 'App config saved');
  } catch (error) {
    logger.error({ error, configPath }, 'Failed to save app config');
    throw error;
  }
}

export function loadRuntimeConfig(): RuntimeConfig {
  const configPath = getRuntimeConfigPath();
  try {
    if (fs.existsSync(configPath)) {
      const data = fs.readFileSync(configPath, 'utf-8');
      return JSON.parse(data) as RuntimeConfig;
    }
  } catch (error) {
    logger.warn({ error, configPath }, 'Failed to load runtime config, using defaults');
  }
  return {
    apiPort: 51731,
  };
}

export function loadAuthConfig(): { apiKey: string; name: string } | null {
  const configPath = getAuthConfigPath();
  try {
    if (fs.existsSync(configPath)) {
      const data = fs.readFileSync(configPath, 'utf-8');
      const config = JSON.parse(data);
      if (config.apiKey && config.name) {
        return config;
      }
    }
  } catch (error) {
    logger.warn({ error, configPath }, 'Failed to load auth config');
  }
  return null;
}

export function deleteAuthConfig(): void {
  const configPath = getAuthConfigPath();
  try {
    if (fs.existsSync(configPath)) {
      fs.unlinkSync(configPath);
      logger.info({ configPath }, 'Auth config deleted');
    }
  } catch (error) {
    logger.warn({ error, configPath }, 'Failed to delete auth config');
  }
}

export function clearAppConfig(): void {
  const configPath = getConfigPath();
  try {
    if (fs.existsSync(configPath)) {
      fs.unlinkSync(configPath);
      logger.info({ configPath }, 'App config cleared');
    }
  } catch (error) {
    logger.error({ error, configPath }, 'Failed to clear app config');
  }
}

// ============================================================================
// Google OAuth Configuration
// ============================================================================

export function getGoogleOAuthConfigPath(): string {
  // Google OAuth config is bundled with the app in resources/
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'resources', GOOGLE_OAUTH_FILENAME);
  }
  return path.join(app.getAppPath(), 'resources', GOOGLE_OAUTH_FILENAME);
}

export function loadGoogleOAuthConfig(): GoogleOAuthConfig | null {
  const configPath = getGoogleOAuthConfigPath();
  try {
    if (fs.existsSync(configPath)) {
      const data = fs.readFileSync(configPath, 'utf-8');
      return JSON.parse(data) as GoogleOAuthConfig;
    }
    logger.warn({ configPath }, 'Google OAuth config not found');
  } catch (error) {
    logger.error({ error, configPath }, 'Failed to load Google OAuth config');
  }
  return null;
}

// ============================================================================
// Google Token Storage (using safeStorage for encryption)
// ============================================================================

function getGoogleTokensPath(): string {
  return path.join(app.getPath('userData'), GOOGLE_TOKENS_FILENAME);
}

function getGoogleTokensFallbackPath(): string {
  return path.join(app.getPath('userData'), GOOGLE_TOKENS_FALLBACK_FILENAME);
}

export function saveGoogleTokens(tokens: GoogleTokens): void {
  const tokenPath = getGoogleTokensPath();
  const fallbackPath = getGoogleTokensFallbackPath();

  try {
    const json = JSON.stringify(tokens);

    if (safeStorage.isEncryptionAvailable()) {
      const encrypted = safeStorage.encryptString(json);
      writeFileSecure(tokenPath, encrypted);
      // Clean up fallback if it exists
      if (fs.existsSync(fallbackPath)) {
        fs.unlinkSync(fallbackPath);
      }
      logger.info('Google tokens saved (encrypted)');
    } else {
      // Fallback to plain JSON (Linux without keyring) - owner-readable only
      writeFileSecure(fallbackPath, json);
      logger.warn('Google tokens saved (unencrypted - no keyring available)');
    }
  } catch (error) {
    logger.error({ error }, 'Failed to save Google tokens');
    throw error;
  }
}

export function loadGoogleTokens(): GoogleTokens | null {
  const tokenPath = getGoogleTokensPath();
  const fallbackPath = getGoogleTokensFallbackPath();

  try {
    // Try encrypted storage first
    if (safeStorage.isEncryptionAvailable() && fs.existsSync(tokenPath)) {
      const encrypted = fs.readFileSync(tokenPath);
      const json = safeStorage.decryptString(encrypted);
      return JSON.parse(json) as GoogleTokens;
    }

    // Fallback to plain JSON
    if (fs.existsSync(fallbackPath)) {
      const json = fs.readFileSync(fallbackPath, 'utf-8');
      return JSON.parse(json) as GoogleTokens;
    }
  } catch (error) {
    logger.error({ error }, 'Failed to load Google tokens');
  }

  return null;
}

export function clearGoogleTokens(): void {
  const tokenPath = getGoogleTokensPath();
  const fallbackPath = getGoogleTokensFallbackPath();

  try {
    if (fs.existsSync(tokenPath)) {
      fs.unlinkSync(tokenPath);
    }
    if (fs.existsSync(fallbackPath)) {
      fs.unlinkSync(fallbackPath);
    }
    logger.info('Google tokens cleared');
  } catch (error) {
    logger.error({ error }, 'Failed to clear Google tokens');
  }
}

export function hasGoogleTokens(): boolean {
  const tokenPath = getGoogleTokensPath();
  const fallbackPath = getGoogleTokensFallbackPath();
  return fs.existsSync(tokenPath) || fs.existsSync(fallbackPath);
}

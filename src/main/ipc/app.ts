import { ipcMain, shell, Notification, BrowserWindow } from 'electron';
import { loadAppConfig, loadRuntimeConfig, saveAppConfig } from '../lib/config';
import { logoutAccount, rotateApiKey } from '../services/account.service';
import { getUserByAccessToken } from '../db';
import { getServerStatus } from '../server';
import { createChildLogger } from '../lib/logger';
import { SaveSettingsInputSchema } from '../../shared/schemas/config.schema';
import { AUTO_LANGUAGE, isSupportedLanguage } from '../../shared/constants/languages';
import os from 'os';
import path from 'path';

const logger = createChildLogger('ipc-app');

export function setupAppHandlers(): void {
  ipcMain.handle(
    'get-settings',
    async (): Promise<{
      accessToken?: string;
      userName?: string;
      apiKey?: string;
      apiUrl?: string;
      transcriptionLanguage: string;
      translationEnabled: boolean;
    }> => {
      const appConfig = loadAppConfig();
      const runtimeConfig = loadRuntimeConfig();
      const user = appConfig.accessToken
        ? getUserByAccessToken(appConfig.accessToken)
        : undefined;

      return {
        accessToken: appConfig.accessToken,
        userName: appConfig.userName,
        apiKey: user?.apiKey,
        apiUrl: runtimeConfig.apiUrl,
        transcriptionLanguage: appConfig.transcriptionLanguage || AUTO_LANGUAGE,
        translationEnabled: appConfig.translationEnabled ?? false,
      };
    }
  );

  /**
   * Persists settings to the encrypted app config.
   *
   * This is where credentials live: the renderer keeps them in memory only, so
   * the main process is the source of truth across restarts.
   */
  ipcMain.handle(
    'save-settings',
    async (_event, settings: unknown): Promise<{ success: boolean; error?: string }> => {
      const parsed = SaveSettingsInputSchema.safeParse(settings);
      if (!parsed.success) {
        logger.warn({ error: parsed.error.message }, 'Rejected invalid settings payload');
        return { success: false, error: 'Invalid settings' };
      }

      const { transcriptionLanguage } = parsed.data;
      if (transcriptionLanguage !== undefined && !isSupportedLanguage(transcriptionLanguage)) {
        return { success: false, error: `Unsupported language "${transcriptionLanguage}"` };
      }

      try {
        const currentConfig = loadAppConfig();
        if (
          parsed.data.apiKey &&
          currentConfig.accessToken &&
          currentConfig.apiKey &&
          parsed.data.apiKey !== currentConfig.apiKey
        ) {
          return { success: false, error: 'Use the account API-key change flow' };
        }

        // Merge so a partial update never clears the other fields.
        saveAppConfig({ ...currentConfig, ...parsed.data });
        return { success: true };
      } catch (error) {
        const err = error as Error;
        logger.error({ error: err.message }, 'Failed to save settings');
        return { success: false, error: err.message };
      }
    }
  );

  ipcMain.handle(
    'change-api-key',
    async (_event, apiKey: unknown): Promise<{ success: boolean; error?: string }> => {
      if (typeof apiKey !== 'string' || !apiKey.trim()) {
        return { success: false, error: 'API key is required' };
      }

      try {
        await rotateApiKey(apiKey);
        return { success: true };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to change API key';
        logger.error({ error: message }, 'Failed to change API key');
        return { success: false, error: message };
      }
    }
  );

  ipcMain.handle('get-server-port', async (): Promise<number> => {
    const status = getServerStatus();
    return status.port || 51731; // fallback to default
  });

  ipcMain.handle('logout', async (): Promise<void> => {
    logger.info('User logging out');
    await logoutAccount();
  });

  ipcMain.handle('open-external-link', async (_event, url: string): Promise<void> => {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      await shell.openExternal(url);
    }
  });

  ipcMain.handle('open-call-md-folder', async (_event, folderPath: string): Promise<void> => {
    // Expand ~ to home directory
    const expandedPath = folderPath.replace(/^~/, os.homedir());
    const absolutePath = path.resolve(expandedPath);

    // Security check: only allow paths under ~/.call_md
    const callMdRoot = path.join(os.homedir(), '.call_md');
    if (!absolutePath.startsWith(callMdRoot)) {
      logger.warn({ path: absolutePath }, 'Attempted to open folder outside .call_md');
      return;
    }

    try {
      await shell.openPath(absolutePath);
    } catch (error) {
      logger.error({ error, path: absolutePath }, 'Failed to open call_md folder');
    }
  });

  ipcMain.handle(
    'show-notification',
    async (_event, title: string, body: string): Promise<void> => {
      if (Notification.isSupported()) {
        const notification = new Notification({
          title,
          body,
        });
        notification.show();
      }
    }
  );

  ipcMain.handle('open-player-window', async (_event, url: string): Promise<void> => {
    // Only ever used for VideoDB player URLs; refuse anything that could load
    // local files or a custom scheme into a privileged window.
    if (!/^https?:\/\//i.test(url)) {
      logger.warn({ url }, 'Refused to open player window for non-HTTP URL');
      return;
    }

    const playerWindow = new BrowserWindow({
      width: 1024,
      height: 768,
      title: 'Call.md - Player',
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
      },
    });

    await playerWindow.loadURL(url);
  });
}

/**
 * Import IPC Handlers
 *
 * The file picker runs entirely in the Main process - the renderer never
 * supplies a filesystem path. A sandboxed renderer that could pass arbitrary
 * local paths to an upload-to-cloud call would be a real exfiltration
 * surface if it were ever compromised; this closes that off structurally
 * rather than trusting renderer input.
 */

import { ipcMain, dialog } from 'electron';
import fs from 'fs';
import path from 'path';
import { v4 as uuid } from 'uuid';
import { createChildLogger } from '../lib/logger';
import { loadAppConfig, loadRuntimeConfig } from '../lib/config';
import { getUserByAccessToken, createRecording, getRecordingByImportedFileHash } from '../db';
import { createVideoDBService } from '../services/videodb.service';
import { processImportedRecording, hashFile } from '../services/copilot/import.service';
import { getMainWindow } from './capture';

const logger = createChildLogger('import-ipc');

const ALLOWED_EXTENSIONS = ['.mp4', '.mov', '.m4v', '.mkv', '.webm', '.mp3', '.m4a', '.wav', '.aac'];
const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024 * 1024; // 5GB - generous ceiling against pathological uploads, not a real limit
const MAX_LANGUAGE_CODE_LENGTH = 10;

export function setupImportHandlers(): void {
  logger.info('Setting up Import IPC handlers');

  ipcMain.handle(
    'import:select-and-upload',
    async (
      _event,
      params: unknown
    ): Promise<{ success: boolean; recordingId?: number; cancelled?: boolean; error?: string }> => {
      const { languageCode } = (params ?? {}) as Record<string, unknown>;

      if (languageCode !== undefined && (typeof languageCode !== 'string' || languageCode.length > MAX_LANGUAGE_CODE_LENGTH || !/^[a-zA-Z-]*$/.test(languageCode))) {
        return { success: false, error: 'Invalid language code' };
      }

      const mainWindow = getMainWindow();
      const dialogOptions: Electron.OpenDialogOptions = {
        properties: ['openFile'],
        filters: [
          { name: 'Video and audio files', extensions: ALLOWED_EXTENSIONS.map((ext) => ext.slice(1)) },
        ],
      };

      const result = mainWindow
        ? await dialog.showOpenDialog(mainWindow, dialogOptions)
        : await dialog.showOpenDialog(dialogOptions);

      if (result.canceled || result.filePaths.length === 0) {
        return { success: true, cancelled: true };
      }

      const filePath = result.filePaths[0];

      // Re-validate server-side even though the dialog filter already
      // restricts extensions - some OS file pickers allow bypassing filters.
      const ext = path.extname(filePath).toLowerCase();
      if (!ALLOWED_EXTENSIONS.includes(ext)) {
        return { success: false, error: `Unsupported file type "${ext}"` };
      }

      let stat: fs.Stats;
      try {
        stat = fs.statSync(filePath);
      } catch {
        return { success: false, error: 'Could not read the selected file' };
      }
      if (!stat.isFile()) {
        return { success: false, error: 'Selected path is not a file' };
      }
      if (stat.size > MAX_FILE_SIZE_BYTES) {
        return { success: false, error: 'File is too large' };
      }

      // Cheap preflight checks first, so a user who isn't signed in (or has
      // a broken config) gets that error immediately rather than after
      // answering a duplicate-file prompt for nothing.
      const appConfig = loadAppConfig();
      const user = appConfig.accessToken ? getUserByAccessToken(appConfig.accessToken) : undefined;
      if (!user?.apiKey) {
        return { success: false, error: 'Not signed in' };
      }

      const runtimeConfig = loadRuntimeConfig();
      let collectionId = user.collectionId || undefined;
      if (!collectionId) {
        try {
          collectionId = await createVideoDBService(user.apiKey, runtimeConfig.apiUrl).findOrCreateCallMdCollection();
        } catch (error) {
          logger.error({ error }, 'Failed to resolve VideoDB collection for import');
          return { success: false, error: 'Could not resolve VideoDB collection' };
        }
      }

      // Duplicate-import detection: hash the file and check for a prior
      // import of the same content before spending an upload+transcribe
      // cycle on it again. Streams the whole file, so this can take a few
      // seconds on a large file - accepted tradeoff for a personal-use tool,
      // no progress UI for this step. Failure aborts the import rather than
      // silently proceeding without a hash: we've already committed to
      // reading the whole file at this point, a read failure here likely
      // means the file itself is unreadable, and proceeding would also
      // permanently leave that file undetectable as a duplicate later.
      let fileHash: string;
      try {
        fileHash = await hashFile(filePath);
      } catch (error) {
        logger.error({ error, filePath }, 'Failed to hash file for duplicate check');
        return { success: false, error: 'Could not read the selected file' };
      }

      const existing = getRecordingByImportedFileHash(fileHash);
      if (existing) {
        const statusNote = existing.status === 'processing' ? ' (still processing)' : '';
        // SQLite's datetime('now') stores UTC without a timezone marker, so
        // `new Date(...)` alone would parse it as local time - append 'Z'
        // to interpret it correctly, matching the renderer's formatDate().
        const importedAt = new Date(existing.createdAt.replace(' ', 'T') + 'Z').toLocaleString();
        const messageBoxOptions: Electron.MessageBoxOptions = {
          type: 'question',
          buttons: ['Cancel', 'Import Anyway'],
          defaultId: 0,
          cancelId: 0,
          title: 'Duplicate file detected',
          message: `This file matches an existing recording: "${existing.meetingName || existing.importedFileName || 'Untitled'}"${statusNote}`,
          detail: `Imported on ${importedAt}. Import this file again anyway?`,
        };
        const activeWindow = mainWindow && !mainWindow.isDestroyed() ? mainWindow : undefined;
        const choice = activeWindow
          ? await dialog.showMessageBox(activeWindow, messageBoxOptions)
          : await dialog.showMessageBox(messageBoxOptions);

        if (choice.response === 0) {
          return { success: true, cancelled: true };
        }
      }

      const recording = createRecording({
        sessionId: `import-${uuid()}`,
        status: 'processing',
        source: 'imported',
        importedFileName: path.basename(filePath),
        importedFileHash: fileHash,
      });

      logger.info({ recordingId: recording.id, fileName: path.basename(filePath) }, 'Import started');

      // Fire-and-forget: the IPC call returns immediately with the created
      // recording; the History view's existing 10s poll picks up the status
      // change once processing finishes (or fails).
      void processImportedRecording(
        recording.id,
        recording.sessionId,
        filePath,
        user.apiKey,
        runtimeConfig.apiUrl,
        collectionId,
        typeof languageCode === 'string' && languageCode ? languageCode : undefined
      );

      return { success: true, recordingId: recording.id };
    }
  );

  logger.info('Import IPC handlers registered');
}

export function removeImportHandlers(): void {
  ipcMain.removeHandler('import:select-and-upload');
  logger.info('Import IPC handlers removed');
}

/**
 * Second-Opinion IPC Handlers (Feature 3)
 */

import { ipcMain } from 'electron';
import { createChildLogger } from '../lib/logger';
import { generateSecondOpinion, type SecondOpinionProvider } from '../services/copilot/second-opinion.service';
import { getSecondOpinionSummariesByRecording, getRecordingById } from '../db';

const logger = createChildLogger('second-opinion-ipc');

function isValidProvider(value: unknown): value is SecondOpinionProvider {
  return value === 'zcode' || value === 'agy';
}

export function setupSecondOpinionHandlers(): void {
  logger.info('Setting up Second-Opinion IPC handlers');

  ipcMain.handle(
    'second-opinion:generate',
    async (
      _event,
      params: unknown
    ): Promise<{ success: boolean; content?: string; error?: string }> => {
      const { recordingId, provider } = (params ?? {}) as Record<string, unknown>;

      if (typeof recordingId !== 'number' || !Number.isInteger(recordingId) || recordingId <= 0) {
        return { success: false, error: 'recordingId must be a positive integer' };
      }
      if (!isValidProvider(provider)) {
        return { success: false, error: 'provider must be "zcode" or "agy"' };
      }
      if (!getRecordingById(recordingId)) {
        return { success: false, error: 'Recording not found' };
      }

      logger.info({ recordingId, provider }, 'Generating second opinion');
      return generateSecondOpinion(recordingId, provider);
    }
  );

  ipcMain.handle(
    'second-opinion:list',
    async (_event, params: unknown): Promise<{
      success: boolean;
      results?: Array<{ provider: string; content: string | null; status: string; error: string | null; generatedAt: string }>;
      error?: string;
    }> => {
      const { recordingId } = (params ?? {}) as Record<string, unknown>;

      if (typeof recordingId !== 'number' || !Number.isInteger(recordingId) || recordingId <= 0) {
        return { success: false, error: 'recordingId must be a positive integer' };
      }

      const rows = getSecondOpinionSummariesByRecording(recordingId);
      return {
        success: true,
        results: rows.map((r) => ({
          provider: r.provider,
          content: r.content,
          status: r.status,
          error: r.error,
          generatedAt: r.generatedAt,
        })),
      };
    }
  );

  logger.info('Second-Opinion IPC handlers registered');
}

export function removeSecondOpinionHandlers(): void {
  ipcMain.removeHandler('second-opinion:generate');
  ipcMain.removeHandler('second-opinion:list');
  logger.info('Second-Opinion IPC handlers removed');
}

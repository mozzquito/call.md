import { v4 as uuidv4 } from 'uuid';
import { getUserByAccessToken, updateUser } from '../db';
import {
  clearAppConfig,
  loadAppConfig,
  loadRuntimeConfig,
} from '../lib/config';
import { commitAccountMutation } from '../lib/account-transaction';
import { isRecordingActive, shutdownCaptureClient } from '../ipc/capture';
import { getCalendarPoller } from './calendar-poller.service';
import { getMeetingCopilot } from './copilot';
import { signOut as signOutGoogle } from './google-auth.service';
import { createVideoDBService, VideoDBService } from './videodb.service';

let accountMutationQueue: Promise<void> = Promise.resolve();

function serializeAccountMutation(operation: () => Promise<void>): Promise<void> {
  const result = accountMutationQueue.then(operation, operation);
  accountMutationQueue = result.catch(() => undefined);
  return result;
}

/** Validates and atomically moves the local account to a new VideoDB key. */
async function rotateApiKeyInternal(apiKey: string): Promise<void> {
  const nextApiKey = apiKey.trim();
  if (!nextApiKey) throw new Error('API key is required');

  const previousConfig = loadAppConfig();
  if (!previousConfig.accessToken) throw new Error('No authenticated account');

  const user = getUserByAccessToken(previousConfig.accessToken);
  if (!user) throw new Error('Authenticated account was not found');
  if (user.apiKey === nextApiKey) return;

  const copilot = getMeetingCopilot();
  if (isRecordingActive() || copilot.isCallActive()) {
    throw new Error('End the active meeting before changing the API key');
  }

  const runtimeConfig = loadRuntimeConfig();
  const nextVideoDB = createVideoDBService(nextApiKey, runtimeConfig.apiUrl);
  if (!(await nextVideoDB.verifyApiKey())) {
    VideoDBService.clearCache();
    throw new Error('Invalid API key');
  }

  const nextCollectionId = await nextVideoDB.findOrCreateCallMdCollection();

  // An idle CaptureClient may still carry a session token from the old key.
  await shutdownCaptureClient();

  // The database is the sole API-key authority. Desktop config stores only
  // the access-token lookup key, eliminating the cross-store crash window.
  updateUser(user.id, { apiKey: nextApiKey, collectionId: nextCollectionId });

  VideoDBService.clearCache();
  copilot.resetCredentials();
}

export function rotateApiKey(apiKey: string): Promise<void> {
  return serializeAccountMutation(() => rotateApiKeyInternal(apiKey));
}

/** Ends account-bound activity and invalidates the local authenticated session. */
async function logoutAccountInternal(): Promise<void> {
  const config = loadAppConfig();
  const user = config.accessToken ? getUserByAccessToken(config.accessToken) : undefined;

  await shutdownCaptureClient();
  getMeetingCopilot().resetCredentials();
  getCalendarPoller().stopPolling();
  signOutGoogle();
  VideoDBService.clearCache();

  if (!user || !config.accessToken) {
    clearAppConfig();
    return;
  }

  const invalidatedToken = uuidv4();
  commitAccountMutation(
    () => {
      updateUser(user.id, { accessToken: invalidatedToken });
    },
    () => {
      updateUser(user.id, { accessToken: config.accessToken });
    },
    clearAppConfig
  );
}

export function logoutAccount(): Promise<void> {
  return serializeAccountMutation(logoutAccountInternal);
}

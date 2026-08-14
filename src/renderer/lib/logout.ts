import type { IpcApi } from '../../shared/types/ipc.types';

type LogoutApi = Pick<IpcApi['app'], 'logout'>;

/** Clears persisted main-process credentials before updating renderer state. */
export async function logoutAndClearLocalAuth(
  appApi: LogoutApi | null,
  clearLocalAuth: () => void
): Promise<void> {
  if (!appApi) {
    throw new Error('Desktop API is unavailable');
  }

  await appApi.logout();
  clearLocalAuth();
}

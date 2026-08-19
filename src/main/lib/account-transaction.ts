/**
 * Commits a local account mutation and rolls it back when persistence fails.
 * The persistent write itself is atomic (temporary file + rename), so callers
 * never intentionally leave the database and desktop config on different
 * credentials.
 */
export function commitAccountMutation(
  apply: () => void,
  rollback: () => void,
  persist: () => void
): void {
  apply();

  try {
    persist();
  } catch (error) {
    try {
      rollback();
    } catch (rollbackError) {
      throw new AggregateError(
        [error, rollbackError],
        'Account update failed and the database rollback also failed'
      );
    }
    throw error;
  }
}

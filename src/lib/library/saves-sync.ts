/**
 * In-memory fan-out for catalog Heart saves.
 *
 * Keyed by practiceId. Stores the last published state and listeners.
 * This is not a global app store and not entitlement/membership.
 */

type LibrarySaveListener = (isSaved: boolean) => void;

const listenersByPracticeId = new Map<string, Set<LibrarySaveListener>>();
const lastStateByPracticeId = new Map<string, boolean>();

function normalizePracticeId(practiceId: string): string {
  return practiceId.trim();
}

export function peekLibrarySave(practiceId: string): boolean | null {
  const key = normalizePracticeId(practiceId);

  if (!key) {
    return null;
  }

  return lastStateByPracticeId.has(key)
    ? (lastStateByPracticeId.get(key) ?? null)
    : null;
}

export function publishLibrarySave(practiceId: string, isSaved: boolean): void {
  const key = normalizePracticeId(practiceId);

  if (!key) {
    return;
  }

  lastStateByPracticeId.set(key, isSaved);

  const listeners = listenersByPracticeId.get(key);

  if (!listeners) {
    return;
  }

  for (const listener of listeners) {
    listener(isSaved);
  }
}

export function subscribeLibrarySave(
  practiceId: string,
  listener: LibrarySaveListener,
): () => void {
  const key = normalizePracticeId(practiceId);

  if (!key) {
    return () => {};
  }

  let listeners = listenersByPracticeId.get(key);

  if (!listeners) {
    listeners = new Set();
    listenersByPracticeId.set(key, listeners);
  }

  listeners.add(listener);

  return () => {
    listeners?.delete(listener);

    if (listeners && listeners.size === 0) {
      listenersByPracticeId.delete(key);
    }
  };
}

export function resetLibrarySaveSyncForTests(): void {
  listenersByPracticeId.clear();
  lastStateByPracticeId.clear();
}

export function resolveCatalogLibrarySaveState(
  syncState: boolean | null,
  productIsSaved: boolean,
): boolean {
  return syncState ?? productIsSaved;
}

import {
  buildAuthorOnboardingStorageKey,
  parseAuthorOnboardingUiPreference,
  serializeAuthorOnboardingUiPreference,
  type AuthorOnboardingUiPreference,
} from "@/lib/author-dashboard/onboarding-checklist";

const DEFAULT_PREFERENCE: AuthorOnboardingUiPreference = {
  collapsed: false,
  dismissed: false,
};

const listeners = new Map<string, Set<() => void>>();
const snapshotCache = new Map<string, AuthorOnboardingUiPreference>();

function samePreference(
  left: AuthorOnboardingUiPreference,
  right: AuthorOnboardingUiPreference,
): boolean {
  return left.collapsed === right.collapsed && left.dismissed === right.dismissed;
}

function notify(authorId: string) {
  const set = listeners.get(authorId);

  if (!set) {
    return;
  }

  for (const listener of set) {
    listener();
  }
}

export function getAuthorOnboardingUiPreference(
  authorId: string,
): AuthorOnboardingUiPreference {
  if (typeof window === "undefined") {
    return DEFAULT_PREFERENCE;
  }

  let next = DEFAULT_PREFERENCE;

  try {
    next = parseAuthorOnboardingUiPreference(
      window.localStorage.getItem(buildAuthorOnboardingStorageKey(authorId)),
    );
  } catch {
    next = DEFAULT_PREFERENCE;
  }

  const cached = snapshotCache.get(authorId);

  if (cached && samePreference(cached, next)) {
    return cached;
  }

  snapshotCache.set(authorId, next);
  return next;
}

export function getAuthorOnboardingUiPreferenceServerSnapshot(): AuthorOnboardingUiPreference {
  return DEFAULT_PREFERENCE;
}

export function subscribeAuthorOnboardingUiPreference(
  authorId: string,
  onStoreChange: () => void,
): () => void {
  let set = listeners.get(authorId);

  if (!set) {
    set = new Set();
    listeners.set(authorId, set);
  }

  set.add(onStoreChange);

  const onStorage = (event: StorageEvent) => {
    if (event.key === buildAuthorOnboardingStorageKey(authorId)) {
      snapshotCache.delete(authorId);
      onStoreChange();
    }
  };

  window.addEventListener("storage", onStorage);

  return () => {
    set?.delete(onStoreChange);
    window.removeEventListener("storage", onStorage);
  };
}

export function writeAuthorOnboardingUiPreference(
  authorId: string,
  preference: AuthorOnboardingUiPreference,
): void {
  if (typeof window === "undefined") {
    return;
  }

  const next = {
    collapsed: preference.collapsed === true,
    dismissed: preference.dismissed === true,
  };

  try {
    window.localStorage.setItem(
      buildAuthorOnboardingStorageKey(authorId),
      serializeAuthorOnboardingUiPreference(next),
    );
  } catch {
    // Ignore quota / private mode failures.
  }

  snapshotCache.set(authorId, next);
  notify(authorId);
}

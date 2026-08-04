import type { PracticeLibraryAction } from "@/lib/products/practice-access-ui";

export type LibraryMembershipAction = Exclude<PracticeLibraryAction, "hidden">;

type LibraryMembershipListener = (action: LibraryMembershipAction) => void;

const listenersByKey = new Map<string, Set<LibraryMembershipListener>>();

/** Prefer stable practice UUID; fall back to product slug. */
export function resolveLibraryMembershipKey(input: {
  practiceId?: string;
  practiceSlug: string;
}): string | null {
  const practiceId = input.practiceId?.trim();

  if (practiceId) {
    return `id:${practiceId}`;
  }

  const practiceSlug = input.practiceSlug.trim();

  if (!practiceSlug) {
    return null;
  }

  return `slug:${practiceSlug}`;
}

export function publishLibraryMembership(
  key: string,
  action: LibraryMembershipAction,
): void {
  const membershipKey = key.trim();

  if (!membershipKey) {
    return;
  }

  const localListeners = listenersByKey.get(membershipKey);

  if (!localListeners) {
    return;
  }

  for (const listener of localListeners) {
    listener(action);
  }
}

export function subscribeLibraryMembership(
  key: string,
  listener: LibraryMembershipListener,
): () => void {
  const membershipKey = key.trim();

  if (!membershipKey) {
    return () => {};
  }

  let localSet = listenersByKey.get(membershipKey);

  if (!localSet) {
    localSet = new Set();
    listenersByKey.set(membershipKey, localSet);
  }

  localSet.add(listener);

  return () => {
    localSet?.delete(listener);

    if (localSet && localSet.size === 0) {
      listenersByKey.delete(membershipKey);
    }
  };
}

/**
 * Playback engine snapshot for UI that lives outside the keyed engine.
 *
 * Desktop catalog / home / Audioteka / playlist grids scroll inside
 * `.listener-app-shell__center-scroll`, which is part of the app tree.
 * Mobile listing scroll is `window`, so an engine remount already left that
 * position alone. The engine still remounts on a new session key; this bridge
 * publishes the fresh engine without remounting the listing that owns scroll.
 */
export type PlayerEngineBridge<T> = {
  getSnapshot: () => T | null;
  subscribe: (listener: () => void) => () => void;
  claim: () => number;
  publish: (next: T, ownerId: number) => void;
  release: (ownerId: number) => void;
};

export function createPlayerEngineBridge<T>(): PlayerEngineBridge<T> {
  let snapshot: T | null = null;
  let owner = 0;
  const listeners = new Set<() => void>();

  const notify = () => {
    for (const listener of [...listeners]) {
      listener();
    }
  };

  return {
    getSnapshot() {
      return snapshot;
    },

    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },

    claim() {
      owner += 1;
      return owner;
    },

    publish(next, ownerId) {
      if (ownerId !== owner) {
        return;
      }

      if (Object.is(snapshot, next)) {
        return;
      }

      snapshot = next;
      notify();
    },

    release(ownerId) {
      if (ownerId !== owner || snapshot == null) {
        return;
      }

      snapshot = null;
      notify();
    },
  };
}

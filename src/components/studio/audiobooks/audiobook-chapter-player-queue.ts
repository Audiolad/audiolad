export type AudiobookPlaybackFragment = {
  id: string;
  position: number;
  status: "uploading" | "active";
};

export function activeAudiobookFragmentQueue<T extends AudiobookPlaybackFragment>(
  fragments: readonly T[],
) {
  return fragments
    .filter((fragment) => fragment.status === "active")
    .slice()
    .sort((left, right) => left.position - right.position || left.id.localeCompare(right.id));
}

export function nextAudiobookFragmentIndex(
  queue: readonly AudiobookPlaybackFragment[],
  currentIndex: number,
) {
  const next = currentIndex + 1;
  return next < queue.length ? next : null;
}

export type AudiobookQueueTransition = {
  currentIndex: number;
  shouldReset: boolean;
};

export function reconcileAudiobookFragmentQueue(
  previousQueue: readonly AudiobookPlaybackFragment[],
  previousIndex: number,
  nextQueue: readonly AudiobookPlaybackFragment[],
): AudiobookQueueTransition {
  const currentFragment = previousQueue[previousIndex];
  const nextIndex = currentFragment
    ? nextQueue.findIndex((fragment) => fragment.id === currentFragment.id)
    : -1;

  return nextIndex === -1
    ? { currentIndex: 0, shouldReset: true }
    : { currentIndex: nextIndex, shouldReset: false };
}

export function audiobookFragmentEndedTransition(
  queue: readonly AudiobookPlaybackFragment[],
  currentIndex: number,
): AudiobookQueueTransition {
  const nextIndex = nextAudiobookFragmentIndex(queue, currentIndex);

  return nextIndex === null
    ? { currentIndex: 0, shouldReset: true }
    : { currentIndex: nextIndex, shouldReset: false };
}

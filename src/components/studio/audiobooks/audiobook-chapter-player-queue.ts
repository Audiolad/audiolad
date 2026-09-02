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

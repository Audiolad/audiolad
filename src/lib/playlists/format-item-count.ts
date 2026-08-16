/**
 * User-facing playlist item-count label.
 * Invariable «аудио» — no Russian declension.
 */
export function formatPlaylistItemCount(count: number): string {
  return `${count} аудио`;
}

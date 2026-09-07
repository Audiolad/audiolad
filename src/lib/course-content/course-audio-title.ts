/**
 * Presentation-only fallback. Must never be written back to audio_items.title.
 * Canonical persisted title is audio_items.title.
 */
export function fallbackCourseAudioTitle(index: number): string {
  const safeIndex = Number.isInteger(index) && index > 0 ? index : 1;
  return `Аудио ${safeIndex}`;
}

export function presentCourseAudioTitle(
  title: string | null | undefined,
  fallbackIndex: number,
): string {
  const trimmed = title?.trim() ?? "";
  return trimmed || fallbackCourseAudioTitle(fallbackIndex);
}

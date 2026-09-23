/**
 * Music-wizard track title guidance: at least one Cyrillic letter.
 * Latin-only titles (e.g. from filename autofill) are allowed in drafts
 * but block Save & Continue / Preview / Publish for the music wizard.
 */

export const MUSIC_TRACK_TITLE_CYRILLIC_ERROR =
  "Укажите название аудио на русском языке. Оригинальное название можно оставить в скобках после русского.";

const CYRILLIC_LETTER = /\p{Script=Cyrillic}/u;

export function musicTrackTitleHasCyrillic(
  title: string | null | undefined,
): boolean {
  if (typeof title !== "string") {
    return false;
  }
  return CYRILLIC_LETTER.test(title);
}

export function validateMusicTrackTitleCyrillic(
  title: string | null | undefined,
): string | null {
  if (musicTrackTitleHasCyrillic(title)) {
    return null;
  }
  return MUSIC_TRACK_TITLE_CYRILLIC_ERROR;
}

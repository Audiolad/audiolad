export const AUTHOR_DEFAULT_BANNER_PATH = "/brand/author-default-banner.svg";

export const AUTHOR_DEFAULT_AVATAR_PATH = "/brand/author-default-avatar.svg";

export const DEFAULT_AUTHOR_SHORT_POSITIONING =
  "Автор аудиопрактик и программ на платформе АудиоЛад";

export function resolveAuthorPositioningText(
  shortPositioning: string | null | undefined,
): string {
  const trimmed =
    typeof shortPositioning === "string" ? shortPositioning.trim() : "";

  return trimmed || DEFAULT_AUTHOR_SHORT_POSITIONING;
}

import { isAuthorCommercialActiveAccess } from "@/lib/authors/access";

/** Source author may appear in public Studio inventory / NEW acquisition. */
export function isStudioSourceAuthorCommercial(
  accessStatus: string | null | undefined,
): boolean {
  return isAuthorCommercialActiveAccess(accessStatus);
}

export const STUDIO_MUSIC_COMMERCIAL_REQUIRED = "studio_music_commercial_required" as const;

export const STUDIO_MUSIC_COMMERCIAL_REQUIRED_MESSAGE =
  "Музыку можно добавить в Студию после получения коммерческого статуса.";

import { AuthorAccessError } from "@/lib/author-products/auth";
import { isBusinessOnlyPractice } from "@/lib/products/business-only";

/**
 * 39a7ef48: covers and gallery images live in the PUBLIC practice-covers bucket.
 * Until a private covers storage exists, business-only («только Бизнес») albums
 * must not upload any image there (album cover, track cover, gallery slide).
 * Removing an existing image stays allowed. The database repeats this check
 * (trigger in 20270311120000_business_track_passports.sql).
 */
export const BUSINESS_ONLY_COVER_UPLOAD_BLOCKED = "business_only_cover_upload_blocked";

export const BUSINESS_ONLY_COVER_UPLOAD_BLOCKED_MESSAGE =
  "Обложки и изображения для закрытых альбомов Бизнеса пока не загружаются – приватное хранилище обложек ещё не готово.";

export function assertBusinessOnlyCoverUploadAllowed(
  practice: { business_only?: boolean | null } | null | undefined,
): void {
  if (isBusinessOnlyPractice(practice)) {
    throw new AuthorAccessError(BUSINESS_ONLY_COVER_UPLOAD_BLOCKED, 409);
  }
}

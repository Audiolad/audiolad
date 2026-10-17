/**
 * Client-safe decision which author-terms notice a cabinet surface shows (no I/O, no legal text).
 *
 * Sergey 17.10.2026: an author on 1.2 keeps the 1.2 commercial features with no end date after 2.0
 * becomes current. Such an author must never see a "you must accept / features will be blocked"
 * warning — only an invitation to accept 2.0 (needed for AudioLad Business only).
 */
import type { AuthorTermsStatusView } from "@/lib/author-terms/types";

export type AuthorTermsNotice = "none" | "invite" | "required";

export function resolveAuthorTermsNotice(
  status: Pick<AuthorTermsStatusView, "currentVersion" | "acceptedCurrent" | "previousEditionActive" | "reacceptInvited"> | null | undefined,
): AuthorTermsNotice {
  if (!status?.currentVersion || status.acceptedCurrent) return "none";
  if (status.previousEditionActive === true) {
    return status.reacceptInvited === true ? "invite" : "none";
  }
  return "required";
}

export const PREVIOUS_EDITION_ACTIVE_STATUS_LABEL =
  "Действует ранее принятая редакция (без ограничения срока)";
